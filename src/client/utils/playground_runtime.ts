// ============================================================================
// PLAYGROUND RUNTIME DETECTION
// ============================================================================

/** True when running inside https://playground.babylonjs.com/ (exported snippet). */
export function isPlaygroundRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.location.hostname.includes('playground.babylonjs.com');
}
