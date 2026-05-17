#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import deploymentSettings from '../settings/settings.mjs';

const repoRoot = path.resolve(process.cwd());

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateSettings(settings) {
  const allowedHosts = new Set(['github.io', 'netlify', 'render.com']);
  const allowedTypes = new Set(['web-service', 'static']);
  const allowedServiceTypes = new Set(['node', 'rust', 'go', 'python']);
  const allowedPythonFrameworks = new Set(['flask', 'falcon', 'bottle']);

  assert(allowedHosts.has(settings.host), `Unsupported host: ${settings.host}`);
  assert(allowedTypes.has(settings.type), `Unsupported deployment type: ${settings.type}`);

  if (settings.host === 'github.io' || settings.host === 'netlify') {
    assert(
      settings.type === 'static',
      `${settings.host} only supports static deployment type in this project.`
    );
  }

  const nameSet = new Set();
  for (const service of settings.services ?? []) {
    assert(service && typeof service === 'object', 'Each service entry must be an object.');
    assert(typeof service.name === 'string' && service.name.length > 0, 'Service name is required.');
    assert(!nameSet.has(service.name), `Duplicate service name: ${service.name}`);
    nameSet.add(service.name);
    assert(allowedServiceTypes.has(service.type), `Unsupported service type for ${service.name}.`);
    assert(
      typeof service.routePrefix === 'string' && service.routePrefix.startsWith('/'),
      `Service routePrefix must start with '/': ${service.name}`
    );
    if (service.localPort !== undefined) {
      assert(Number.isInteger(service.localPort) && service.localPort > 0, `Invalid localPort for ${service.name}.`);
    }

    if (service.type === 'python') {
      assert(
        typeof service.pythonFramework === 'string' && allowedPythonFrameworks.has(service.pythonFramework),
        `Python service ${service.name} requires pythonFramework: flask | falcon | bottle.`
      );
    } else {
      assert(
        service.pythonFramework === undefined,
        `pythonFramework is only valid for python services: ${service.name}`
      );
    }
  }

  if (
    settings.host === 'github.io' &&
    settings.type === 'static' &&
    settings.static?.githubPages
  ) {
    const gp = settings.static.githubPages;
    if (gp.deployBranch !== undefined) {
      assert(
        typeof gp.deployBranch === 'string' && gp.deployBranch.length > 0,
        'static.githubPages.deployBranch must be a non-empty string when set.'
      );
    }
    if (gp.environmentName !== undefined) {
      assert(
        typeof gp.environmentName === 'string' && gp.environmentName.length > 0,
        'static.githubPages.environmentName must be a non-empty string when set.'
      );
    }
  }
}

async function ensureDir(absPath) {
  await fs.mkdir(absPath, { recursive: true });
}

async function fileExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function writeFile(absPath, content) {
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, content, 'utf8');
}

async function scaffoldService(service) {
  const serviceRoot = path.join(repoRoot, 'src', 'server', service.name);
  await ensureDir(serviceRoot);

  const readmePath = path.join(serviceRoot, 'README.md');
  if (!(await fileExists(readmePath))) {
    await writeFile(
      readmePath,
      `# ${service.name}\n\nRuntime: ${service.type}\nRoute prefix: ${service.routePrefix}\n\nThis folder is scaffolded from deployment settings.\n`
    );
  }

  if (service.type === 'node') {
    const entry = path.join(serviceRoot, 'index.ts');
    if (!(await fileExists(entry))) {
      await writeFile(
        entry,
        `export function healthcheck() {\n  return { ok: true, service: '${service.name}' };\n}\n`
      );
    }
  }

  if (service.type === 'rust') {
    const cargo = path.join(serviceRoot, 'Cargo.toml');
    const srcMain = path.join(serviceRoot, 'src', 'main.rs');
    if (!(await fileExists(cargo))) {
      await writeFile(
        cargo,
        `[package]\nname = "${service.name}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`
      );
    }
    if (!(await fileExists(srcMain))) {
      await writeFile(srcMain, 'fn main() {\n    println!("service starting");\n}\n');
    }
  }

  if (service.type === 'go') {
    const goMod = path.join(serviceRoot, 'go.mod');
    const mainGo = path.join(serviceRoot, 'main.go');
    if (!(await fileExists(goMod))) {
      await writeFile(goMod, `module ${service.name}\n\ngo 1.22\n`);
    }
    if (!(await fileExists(mainGo))) {
      await writeFile(mainGo, 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("service starting")\n}\n');
    }
  }

  if (service.type === 'python') {
    const requirementsPath = path.join(serviceRoot, 'requirements.txt');
    const appPath = path.join(serviceRoot, 'app.py');
    const framework = service.pythonFramework;

    if (!(await fileExists(requirementsPath))) {
      await writeFile(requirementsPath, `${framework}\n`);
    }

    if (!(await fileExists(appPath))) {
      if (framework === 'flask') {
        await writeFile(
          appPath,
          `from flask import Flask\n\napp = Flask(__name__)\n\n@app.get('/health')\ndef health():\n    return {'ok': True, 'service': '${service.name}'}\n`
        );
      }

      if (framework === 'falcon') {
        await writeFile(
          appPath,
          `import falcon\n\nclass HealthResource:\n    def on_get(self, req, resp):\n        resp.media = {'ok': True, 'service': '${service.name}'}\n\napp = falcon.App()\napp.add_route('/health', HealthResource())\n`
        );
      }

      if (framework === 'bottle') {
        await writeFile(
          appPath,
          `from bottle import Bottle\n\napp = Bottle()\n\n@app.get('/health')\ndef health():\n    return {'ok': True, 'service': '${service.name}'}\n`
        );
      }
    }
  }
}

function createRenderYaml(settings) {
  if (settings.type === 'static') {
    return `services:\n  - type: static_site\n    name: babylon-game-starter\n    buildCommand: npm ci && npm run build\n    staticPublishPath: ./dist\n    pullRequestPreviewsEnabled: false\n    envVars:\n      - key: NODE_VERSION\n        value: 22\n`;
  }

  return `services:\n  - type: web\n    name: babylon-game-starter\n    env: docker\n    plan: free\n    region: oregon\n    dockerfilePath: ./Dockerfile\n    dockerContext: .\n    healthCheckPath: /\n    autoDeploy: true\n    envVars:\n      - key: NODE_ENV\n        value: production\n      - key: PORT\n        value: 10000\n`;
}

function createNetlifyToml() {
  return `[build]\ncommand = "npm ci && npm run build"\npublish = "dist"\n\n[build.environment]\nNODE_VERSION = "22"\nNODE_OPTIONS = "--max-old-space-size=4096"\n\n[[redirects]]\nfrom = "/*"\nto = "/index.html"\nstatus = 200\n`;
}

function createGithubPagesWorkflow(settings) {
  const deployBranch = settings.static?.githubPages?.deployBranch ?? 'gh-deploy';
  const environmentName = settings.static?.githubPages?.environmentName ?? 'github-pages';
  const branchesYaml = JSON.stringify(deployBranch);
  const environmentYaml = JSON.stringify(environmentName);
  return `name: Deploy GitHub Pages\n\non:\n  push:\n    branches: [${branchesYaml}]\n  # Push to ${deployBranch}, or workflow_dispatch with Use workflow from = ${deployBranch}.\n  workflow_dispatch:\n\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\nconcurrency:\n  group: "pages"\n  cancel-in-progress: true\n\njobs:\n  assert_deploy_branch:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Only deploy branch may reach the github-pages environment\n        run: |\n          if [ "\${GITHUB_REF}" != "refs/heads/${deployBranch}" ]; then\n            echo "::error::Pages deploy must use ref refs/heads/${deployBranch} (push to that branch, or Run workflow with Use workflow from = ${deployBranch}). Current: \${GITHUB_REF}"\n            exit 1\n          fi\n\n  build:\n    runs-on: ubuntu-latest\n    needs: assert_deploy_branch\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm run build\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: dist\n\n  deploy:\n    if: \${{ github.ref == 'refs/heads/${deployBranch}' }}\n    environment:\n      name: ${environmentYaml}\n      url: \${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    needs: build\n    steps:\n      - id: deployment\n        uses: actions/deploy-pages@v4\n`;
}

async function writeHostArtifacts(settings) {
  if (settings.host === 'render.com') {
    await writeFile(path.join(repoRoot, 'render.yaml'), createRenderYaml(settings));
  }

  if (settings.host === 'netlify' && settings.type === 'static') {
    await writeFile(path.join(repoRoot, 'netlify.toml'), createNetlifyToml());
  }

  if (settings.host === 'github.io' && settings.type === 'static') {
    await writeFile(
      path.join(repoRoot, '.github', 'workflows', 'deploy-github-pages.yml'),
      createGithubPagesWorkflow(settings)
    );
  }
}

async function main() {
  validateSettings(deploymentSettings);

  for (const service of deploymentSettings.services ?? []) {
    await scaffoldService(service);
  }

  await writeHostArtifacts(deploymentSettings);

  console.log(`Prepared deployment for host=${deploymentSettings.host} type=${deploymentSettings.type}`);
  console.log(`Services: ${(deploymentSettings.services ?? []).map((s) => s.name).join(', ') || '(none)'}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
