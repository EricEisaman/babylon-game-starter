import {
  CHAT_UPSTREAM_ENV_VAR,
  DEFAULT_CHAT_PROXY_PREFIX,
  DEFAULT_CHAT_UPSTREAM_URL
} from '../chat-proxy.defaults.mjs';

/**
 * @param {import('../types/settings.js').DeploymentSettings} settings
 * @returns {import('../types/settings.js').ChatProxySettings}
 */
export function inferChatSettings(settings) {
  if (settings.chat) {
    return settings.chat;
  }

  if (settings.host === 'github.io') {
    return { mode: 'direct', materializer: 'none' };
  }

  if (settings.host === 'netlify') {
    return {
      mode: 'same-origin-proxy',
      materializer: 'netlify-redirect',
      proxyPrefix: DEFAULT_CHAT_PROXY_PREFIX
    };
  }

  if (settings.host === 'render.com' && settings.type === 'web-service') {
    return {
      mode: 'same-origin-proxy',
      materializer: 'nginx',
      proxyPrefix: DEFAULT_CHAT_PROXY_PREFIX
    };
  }

  return {
    mode: 'same-origin-proxy',
    materializer: 'netlify-redirect',
    proxyPrefix: DEFAULT_CHAT_PROXY_PREFIX
  };
}

/**
 * @param {string} raw
 * @param {{ allowHttp?: boolean }} [options]
 */
export function parseUpstreamUrl(raw, options = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid chat upstream URL: ${raw}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Chat upstream must use http or https: ${raw}`);
  }

  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';

  if (url.protocol === 'http:' && !isLocal && !options.allowHttp) {
    throw new Error(
      `Chat upstream must use https in production (got ${raw}). Set allowHttp only for local dev.`
    );
  }

  if (url.username || url.password) {
    throw new Error('Chat upstream URL must not include credentials.');
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Chat upstream URL must be an origin only (no path, query, or hash): ${raw}`);
  }

  return {
    upstreamUrl: url.origin,
    upstreamHost: url.host
  };
}

/**
 * @param {import('../types/settings.js').DeploymentSettings} settings
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveChatProxy(settings, env = process.env) {
  const chat = inferChatSettings(settings);
  const proxyPrefix = chat.proxyPrefix ?? DEFAULT_CHAT_PROXY_PREFIX;

  const upstreamRaw =
    env[CHAT_UPSTREAM_ENV_VAR] ?? chat.upstreamUrl ?? DEFAULT_CHAT_UPSTREAM_URL;
  const { upstreamUrl, upstreamHost } = parseUpstreamUrl(upstreamRaw, {
    allowHttp: env.NODE_ENV !== 'production'
  });

  return {
    mode: chat.mode,
    materializer: chat.materializer,
    proxyPrefix,
    upstreamUrl,
    upstreamHost
  };
}
