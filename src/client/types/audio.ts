/**
 * Volume ramp options aligned with Babylon.js Audio V2
 * {@link BABYLON.AbstractSound.setVolume} second parameter.
 *
 * Declared here instead of importing from `@babylonjs/core/AudioV2/audioParameter`
 * so exports work in the official Playground (its resolver often mismatches deep
 * subpath typings for `IAudioParameterRampOptions`).
 *
 * Babylon's `Nullable<T>` is not imported from `@babylonjs/core/types` here because
 * the official Playground does not expose that as a named export on the `types`
 * entry; use `| null` in public signatures instead.
 */
export interface AudioVolumeRampOptions {
  duration: number;
  shape: 'linear' | 'exponential' | 'logarithmic' | 'none';
}

export interface ManagedAudioSound {
  play(): void;
  stop(): void;
  dispose(): void;
  setVolume(volume: number, ramp?: Partial<AudioVolumeRampOptions> | null): void;
  getVolume(): number;
  isActive(): boolean;
}

type AbstractSoundVolumeRamp = Parameters<BABYLON.AbstractSound['setVolume']>[1];

function toEngineVolumeRamp(
  ramp: Partial<AudioVolumeRampOptions> | null | undefined
): AbstractSoundVolumeRamp {
  return ramp as AbstractSoundVolumeRamp;
}

/** Minimal AudioV2 surface (avoids dual-module StaticSound vs global AbstractSound mismatch). */
interface AudioV2SoundLike {
  play: () => void;
  stop: () => void;
  dispose: () => void;
  setVolume: (volume: number, ramp?: AbstractSoundVolumeRamp) => void;
  volume: number;
  activeInstancesCount: number;
}

export function fromAbstractSound(sound: AudioV2SoundLike): ManagedAudioSound {
  return {
    play: () => {
      sound.play();
    },
    stop: () => {
      sound.stop();
    },
    dispose: () => {
      sound.dispose();
    },
    setVolume: (volume: number, ramp?: Partial<AudioVolumeRampOptions> | null) => {
      sound.setVolume(volume, toEngineVolumeRamp(ramp ?? null));
    },
    getVolume: () => sound.volume,
    isActive: () => sound.activeInstancesCount > 0
  };
}
