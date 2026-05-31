import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveChatProxy } from './resolve.mjs';

/**
 * @param {string} repoRoot
 * @param {import('../types/settings.js').DeploymentSettings} settings
 */
export async function validateChatProxyConfig(repoRoot, settings) {
  const resolved = resolveChatProxy(settings);
  const configPath = path.join(repoRoot, 'src', 'client', 'public', 'chat', 'config.json');

  let rawConfig;
  try {
    rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch {
    return resolved;
  }

  const serviceUrl = typeof rawConfig.serviceUrl === 'string' ? rawConfig.serviceUrl.trim() : '';

  if (resolved.mode === 'same-origin-proxy' && serviceUrl.length > 0) {
    const normalizedService = serviceUrl.replace(/\/+$/, '');
    const normalizedPrefix = resolved.proxyPrefix.replace(/\/+$/, '');
    if (normalizedService !== normalizedPrefix) {
      throw new Error(
        `chat/config.json serviceUrl "${serviceUrl}" must match deployment chat proxyPrefix "${resolved.proxyPrefix}" when chat.mode is same-origin-proxy.`
      );
    }
  }

  return resolved;
}
