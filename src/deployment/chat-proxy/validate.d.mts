import type { DeploymentSettings } from '../types/settings';

import type { ResolvedChatProxy } from './resolve.d.mts';

export function validateChatProxyConfig(
  repoRoot: string,
  settings: DeploymentSettings
): Promise<ResolvedChatProxy>;
