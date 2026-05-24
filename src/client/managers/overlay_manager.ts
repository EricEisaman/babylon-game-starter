// ============================================================================
// OVERLAY MANAGER — full-screen DOM overlays (simulation-driven strength)
// ============================================================================

import { CONFIG } from '../config/game_config';
import { isSimulationActive } from '../simulation/simulation_bootstrap';
import { SIMULATION_CONFIG } from '../simulation/simulation_config';
import { StateSimulationManager } from '../simulation/state_simulation_manager';

import type {
  EnvironmentOverlayBinding,
  OverlayDriverBinding,
  OverlaySnippetEntry,
  OverlaySnippetKind
} from '../types/effects';

const VIGNETTE_ELEMENT_ID = 'bgs-overlay-vignette';
const STRENGTH_LERP_PER_SECOND = 4;

export interface OverlayInstance {
  readonly catalogName: string;
  readonly kind: OverlaySnippetKind;
  setStrength(strength: number): void;
  dispose(): void;
}

interface ActiveOverlay {
  readonly instance: OverlayInstance;
  readonly binding: EnvironmentOverlayBinding;
  currentStrength: number;
  targetStrength: number;
}

class DomOverlayInstance implements OverlayInstance {
  public readonly catalogName: string;
  public readonly kind: OverlaySnippetKind = 'dom';
  private readonly element: HTMLDivElement;

  public constructor(catalogName: string, element: HTMLDivElement) {
    this.catalogName = catalogName;
    this.element = element;
  }

  public setStrength(strength: number): void {
    const clamped = Math.max(0, Math.min(1, strength));
    this.element.style.opacity = String(clamped);
    this.element.style.pointerEvents = 'none';
    this.element.style.display = clamped > 0.001 ? 'block' : 'none';
  }

  public dispose(): void {
    this.element.remove();
  }
}

class DomOverlayAdapter {
  public static load(scene: BABYLON.Scene, entry: OverlaySnippetEntry): DomOverlayInstance | null {
    const canvas = scene.getEngine().getRenderingCanvas();
    if (!canvas?.parentElement) {
      return null;
    }

    const parent = canvas.parentElement;
    const existing = parent.querySelector(`#${VIGNETTE_ELEMENT_ID}`);
    if (existing instanceof HTMLDivElement) {
      existing.remove();
    }

    const element = document.createElement('div');
    element.id = VIGNETTE_ELEMENT_ID;
    element.setAttribute('data-overlay-catalog', entry.name);
    element.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 50;
      opacity: 0;
      display: none;
      background: radial-gradient(
        ellipse at center,
        rgba(0, 0, 0, 0) 35%,
        rgba(120, 0, 0, 0.55) 70%,
        rgba(80, 0, 0, 0.92) 100%
      );
    `;

    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    parent.appendChild(element);
    return new DomOverlayInstance(entry.name, element);
  }
}

const unsupportedKindWarned = new Set<OverlaySnippetKind>();

function warnUnsupportedKind(kind: OverlaySnippetKind, catalogName: string): void {
  if (unsupportedKindWarned.has(kind)) {
    return;
  }
  unsupportedKindWarned.add(kind);
  console.warn(
    `[OverlayManager] Overlay kind "${kind}" is not implemented for "${catalogName}". Use kind "dom" or a future camera post-process adapter.`
  );
}

export class OverlayManager {
  private static scene: BABYLON.Scene | null = null;
  private static updateObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
  private static readonly activeOverlays = new Map<string, ActiveOverlay>();
  private static queryCatalogName: string | null = null;

  public static initialize(scene: BABYLON.Scene): void {
    this.scene = scene;
    this.registerUpdateObserver();
  }

  public static dispose(): void {
    this.clearAllOverlays();
    if (this.scene && this.updateObserver) {
      this.scene.onBeforeRenderObservable.remove(this.updateObserver);
    }
    this.updateObserver = null;
    this.scene = null;
    this.queryCatalogName = null;
    unsupportedKindWarned.clear();
  }

  public static setQueryCatalogName(catalogName: string | null): void {
    const trimmed = catalogName?.trim();
    this.queryCatalogName = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  public static clearAllOverlays(): void {
    for (const active of this.activeOverlays.values()) {
      active.instance.dispose();
    }
    this.activeOverlays.clear();
  }

  public static applyEnvironmentOverlays(
    environmentName: string,
    bindings: readonly EnvironmentOverlayBinding[]
  ): void {
    if (!this.scene) {
      return;
    }

    const merged = this.mergeBindings(bindings);
    for (const binding of merged) {
      if (binding.enabled === false) {
        continue;
      }

      const entry = CONFIG.EFFECTS.OVERLAY_SNIPPETS.find(
        (snippet) => snippet.name === binding.catalogName
      );
      if (!entry) {
        console.warn(
          `[OverlayManager] Unknown overlay catalog "${binding.catalogName}" for env "${environmentName}".`
        );
        continue;
      }

      const instance = this.loadOverlayInstance(entry);
      if (!instance) {
        continue;
      }

      this.activeOverlays.set(binding.catalogName, {
        instance,
        binding,
        currentStrength: 0,
        targetStrength: 0
      });
      instance.setStrength(0);
    }
  }

  public static update(): void {
    if (!this.scene || this.activeOverlays.size === 0) {
      return;
    }

    const dtSeconds = this.scene.getEngine().getDeltaTime() / 1000;
    const maxStep = STRENGTH_LERP_PER_SECOND * dtSeconds;

    for (const active of this.activeOverlays.values()) {
      active.targetStrength = this.computeTargetStrength(active.binding);
      const delta = active.targetStrength - active.currentStrength;
      if (Math.abs(delta) <= maxStep) {
        active.currentStrength = active.targetStrength;
      } else {
        active.currentStrength += Math.sign(delta) * maxStep;
      }
      active.instance.setStrength(active.currentStrength);
    }
  }

  private static mergeBindings(
    bindings: readonly EnvironmentOverlayBinding[]
  ): EnvironmentOverlayBinding[] {
    const merged = [...bindings];
    if (this.queryCatalogName) {
      const alreadyBound = merged.some((b) => b.catalogName === this.queryCatalogName);
      if (!alreadyBound) {
        merged.push({ catalogName: this.queryCatalogName });
      }
    }
    return merged;
  }

  private static loadOverlayInstance(entry: OverlaySnippetEntry): OverlayInstance | null {
    if (!this.scene) {
      return null;
    }

    if (entry.kind === 'dom') {
      return DomOverlayAdapter.load(this.scene, entry);
    }

    warnUnsupportedKind(entry.kind, entry.name);
    return null;
  }

  private static computeTargetStrength(binding: EnvironmentOverlayBinding): number {
    const driver = binding.driver;
    if (!driver || driver.type !== 'simulation') {
      return 0;
    }

    if (!isSimulationActive()) {
      return 0;
    }

    if (!StateSimulationManager.isInitialized()) {
      return 0;
    }

    return this.computeSimulationDriverStrength(driver);
  }

  private static computeSimulationDriverStrength(driver: OverlayDriverBinding): number {
    const snap = StateSimulationManager.getSnapshot();
    const { REGULATION } = SIMULATION_CONFIG;

    if (driver.input === 'drugHunger') {
      const hungerHigh = snap.drugHunger > driver.threshold;
      if (driver.alsoRequiresLowAcc === true) {
        const lowAcc = snap.accAwareness < REGULATION.lowAccThreshold;
        return hungerHigh && lowAcc ? 1 : 0;
      }
      return hungerHigh ? 1 : 0;
    }

    if (driver.input === 'accAwareness') {
      return snap.accAwareness < driver.threshold ? 1 : 0;
    }

    return 0;
  }

  private static registerUpdateObserver(): void {
    if (!this.scene || this.updateObserver) {
      return;
    }
    this.updateObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }
}
