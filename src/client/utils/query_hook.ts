// utils/query-hook.ts// ============================================================================
// QUERY PARAMETER HOOK UTILITY
// ============================================================================
// Provides functionality to check for query parameters in window.location.href
// and execute callbacks when specified variables are present
// ============================================================================

const TRUTHY_QUERY_VALUES = new Set(['1', 'true', 'yes']);

/**
 * Returns a single query parameter value from the current URL, or null if absent.
 */
export function getQueryParam(name: string): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

/**
 * True when `?name=1`, `?name=true`, or `?name=yes` (case-insensitive).
 */
export function isQueryFlagEnabled(name: string): boolean {
  const value = getQueryParam(name);
  if (value === null) {
    return false;
  }
  return TRUTHY_QUERY_VALUES.has(value.trim().toLowerCase());
}

/**
 * Checks window.location.href for specified query variables and executes callback if all are present
 * @param variables - Array of query variable names to check for
 * @param callback - Callback function that receives a Map of variable names to their values
 */
export function queryHook(
  variables: readonly string[],
  callback: (values: Map<string, string>) => void
): void {
  if (variables.length === 0) {
    return;
  }

  // Parse query parameters from window.location.href
  const url = new URL(window.location.href);
  const searchParams = url.searchParams;

  // Check if all specified variables are present
  const values = new Map<string, string>();
  let allPresent = true;

  for (const variable of variables) {
    const value = searchParams.get(variable);
    if (value !== null) {
      values.set(variable, value);
    } else {
      allPresent = false;
      break;
    }
  }

  // If all variables are present, call the callback with the values
  if (allPresent) {
    callback(values);
  }
}
