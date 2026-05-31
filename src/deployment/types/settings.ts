export type DeploymentHost = 'github.io' | 'netlify' | 'render.com';
export type DeploymentType = 'web-service' | 'static';
export type ServiceRuntime = 'node' | 'rust' | 'go' | 'python';
export type PythonFramework = 'flask' | 'falcon' | 'bottle';

interface BaseEndpointService {
  name: string;
  routePrefix: `/${string}`;
  localPort?: number;
}

export interface NodeEndpointService extends BaseEndpointService {
  type: 'node';
}

export interface RustEndpointService extends BaseEndpointService {
  type: 'rust';
}

export interface GoEndpointService extends BaseEndpointService {
  type: 'go';
}

export interface PythonEndpointService extends BaseEndpointService {
  type: 'python';
  pythonFramework: PythonFramework;
}

export type EndpointService =
  | NodeEndpointService
  | RustEndpointService
  | GoEndpointService
  | PythonEndpointService;

/** CI metadata for GitHub Pages when `host` is `github.io`. */
export interface GithubPagesDeploymentConfig {
  /** Branch that triggers a production Pages deploy on `push`. Defaults to `gh-deploy`. */
  deployBranch?: string;
  /** GitHub Actions `environment` name for the deploy job. Defaults to `github-pages`. */
  environmentName?: string;
}

export type ChatProxyMode = 'same-origin-proxy' | 'direct';
export type ChatProxyMaterializer = 'nginx' | 'netlify-redirect' | 'none';

/** Host-level chat reverse-proxy settings (infrastructure; not player-facing). */
export interface ChatProxySettings {
  /** `direct` on static hosts without a server proxy (e.g. GitHub Pages). */
  mode: ChatProxyMode;
  /** How this host materializes the proxy. Inferred from `host` when omitted. */
  materializer: ChatProxyMaterializer;
  /** Same-origin path prefix; must match `serviceUrl` in chat/config.json when proxied. */
  proxyPrefix?: `/${string}`;
  /** Upstream Chat Slayer origin. Override at build/runtime via CHAT_UPSTREAM_URL. */
  upstreamUrl?: string;
}

export interface StaticDeploymentConfig {
  basePath?: `/${string}`;
  /** Canonical public site URL for Open Graph (no trailing slash required). */
  publicUrl?: string;
  githubPages?: GithubPagesDeploymentConfig;
}

export type HostTypeCompatibility<H extends DeploymentHost> = H extends 'github.io' | 'netlify'
  ? { type: 'static' }
  : { type: DeploymentType };

export type DeploymentSettings<H extends DeploymentHost = DeploymentHost> = {
  host: H;
  services: EndpointService[];
  static?: StaticDeploymentConfig;
  /** Chat Slayer proxy/direct routing for this host. Inferred from `host` when omitted. */
  chat?: ChatProxySettings;
} & HostTypeCompatibility<H>;
