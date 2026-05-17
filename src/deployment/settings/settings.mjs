/** @type {import('../types/settings').DeploymentSettings<'github.io'>} */
const deploymentSettings = {
  host: 'github.io',
  type: 'static',
  services: [
    {
      name: 'multiplayer',
      type: 'go',
      routePrefix: '/api/multiplayer',
      localPort: 5000
    }
  ],
  static: {
    basePath: '/babylon-game-starter/',
    githubPages: {
      deployBranch: 'gh-deploy',
      environmentName: 'github-pages'
    }
  }
};

export default deploymentSettings;
