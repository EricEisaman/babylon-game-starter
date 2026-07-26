/**
 * Device detection for mobile / iPad / iPad+keyboard hybrid UX.
 *
 * Hybrid (iPad with keyboard) starts touch-first, then becomes true when sync
 * heuristics match or the first real keydown latches proof. Listeners only
 * attach on iPad to avoid playground desktop noise.
 */

const VIEWPORT_KEYBOARD_RATIO = 0.8;

const PHYSICAL_NAV_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  ' ',
  'Space',
  'Shift',
  'ShiftLeft',
  'ShiftRight'
]);

type HybridListener = (isIPadWithKeyboard: boolean) => void;

export class DeviceDetector {
  private static keyboardLatched = false;
  private static lastHybrid = false;
  private static listeners = new Set<HybridListener>();
  private static monitoringStarted = false;
  private static keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private static resizeRafId: number | null = null;

  /**
   * Detects if the current device is a mobile / touch-primary device.
   */
  public static isMobileDevice(): boolean {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }

  /**
   * Detects if the current device is an iPad (including iPadOS desktop UA).
   */
  public static isIPad(): boolean {
    return (
      /iPad/i.test(navigator.userAgent) ||
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- iPad heuristic; see STYLE.md
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0)
    );
  }

  /**
   * Live hybrid read: iPad + (latched key proof or sync dock/landscape heuristics).
   * Touch-first until evidence; call sites should not snapshot once forever.
   */
  public static isIPadWithKeyboard(): boolean {
    this.ensureMonitoring();
    return this.computeHybrid();
  }

  /**
   * Subscribe to hybrid flag changes. Invokes immediately with the current value.
   * @returns Unsubscribe function
   */
  public static subscribeIPadWithKeyboard(listener: HybridListener): () => void {
    this.ensureMonitoring();
    this.listeners.add(listener);
    listener(this.computeHybrid());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static computeHybrid(): boolean {
    if (!this.isIPad()) {
      return false;
    }
    if (this.keyboardLatched) {
      return true;
    }
    return this.syncKeyboardLikely();
  }

  /** Landscape or viewport-vs-screen shrink (Magic Keyboard docked / software keyboard). */
  private static syncKeyboardLikely(): boolean {
    const isLandscape = window.innerHeight < window.innerWidth;
    const viewportShrunk = window.innerHeight < window.screen.height * VIEWPORT_KEYBOARD_RATIO;
    return isLandscape || viewportShrunk;
  }

  private static ensureMonitoring(): void {
    if (this.monitoringStarted || typeof window === 'undefined') {
      return;
    }
    this.monitoringStarted = true;
    this.lastHybrid = this.computeHybrid();

    if (!this.isIPad()) {
      return;
    }

    this.keydownHandler = (event: KeyboardEvent) => {
      if (this.keyboardLatched) {
        return;
      }
      if (!this.isPhysicalKeyboardEvidence(event)) {
        return;
      }
      this.keyboardLatched = true;
      this.detachKeydown();
      this.publishIfChanged();
    };
    document.addEventListener('keydown', this.keydownHandler, { passive: true });

    const scheduleRecompute = (): void => {
      if (this.resizeRafId !== null) {
        return;
      }
      this.resizeRafId = window.requestAnimationFrame(() => {
        this.resizeRafId = null;
        this.publishIfChanged();
      });
    };
    window.addEventListener('resize', scheduleRecompute, { passive: true });
    window.addEventListener('orientationchange', scheduleRecompute, { passive: true });
  }

  private static isPhysicalKeyboardEvidence(event: KeyboardEvent): boolean {
    const key = event.key;
    if (typeof key !== 'string' || key.length === 0) {
      return false;
    }
    if (key.length === 1) {
      return true;
    }
    return PHYSICAL_NAV_KEYS.has(key);
  }

  private static detachKeydown(): void {
    if (!this.keydownHandler) {
      return;
    }
    document.removeEventListener('keydown', this.keydownHandler);
    this.keydownHandler = null;
  }

  private static publishIfChanged(): void {
    const next = this.computeHybrid();
    if (next === this.lastHybrid) {
      return;
    }
    this.lastHybrid = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}
