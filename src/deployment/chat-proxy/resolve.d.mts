import type { DeploymentSettings } from '../types/settings';

export interface ResolvedChatProxy {
  mode: 'same-origin-proxy' | 'direct';
  materializer: 'nginx' | 'netlify-redirect' | 'none';
  proxyPrefix: string;
  upstreamUrl: string;
  upstreamHost: string;
}

export function inferChatSettings(settings: DeploymentSettings): import('../types/settings').ChatProxySettings;
export function parseUpstreamUrl(
  raw: string,
  options?: { allowHttp?: boolean }
): { upstreamUrl: string; upstreamHost: string };
export function resolveChatProxy(
  settings: DeploymentSettings,
  env?: NodeJS.ProcessEnv
): ResolvedChatProxy;
