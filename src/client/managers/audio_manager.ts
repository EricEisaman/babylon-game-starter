/**
 * Audio Manager - Handles all audio-related operations
 */

// /// <reference path="../types/babylon.d.ts" />

import {
  CreateSoundAsync,
  CreateStreamingSoundAsync
} from '@babylonjs/core/AudioV2/abstractAudio/audioEngineV2';
import { AudioParameterRampShape } from '@babylonjs/core/AudioV2/audioParameter';
import { CreateAudioEngineAsync } from '@babylonjs/core/AudioV2/webAudio/webAudioEngine';

import { fromAbstractSound } from '../types/audio';

import type { ManagedAudioSound } from '../types/audio';
import type { AmbientSoundConfig } from '../types/environment';

type ManagedSound = ManagedAudioSound;
type ManagedStreamingSound = ManagedAudioSound;

export class AudioManager {
  private static activeSounds = new Map<string, ManagedSound>();
  private static backgroundMusic: ManagedStreamingSound | null = null;
  private static ambientSounds: ManagedSound[] = [];

  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, timeoutMs);
    });
    return (await Promise.race([promise, timeout])) as T | null;
  }

  private static getAudioEngine(): NonNullable<typeof globalThis.__babylonAudioEngine> | null {
    const g = globalThis as typeof globalThis & {
      __babylonAudioEngine?: typeof globalThis.__babylonAudioEngine;
    };

    return g.__babylonAudioEngine ?? null;
  }

  private static async ensureAudioEngine(): Promise<NonNullable<
    typeof globalThis.__babylonAudioEngine
  > | null> {
    const existing = this.getAudioEngine();
    if (existing) {
      return existing;
    }

    try {
      const audioEngine = await this.withTimeout(CreateAudioEngineAsync(), 5000);
      if (!audioEngine) {
        console.warn('Audio engine creation timed out');
        return null;
      }

      globalThis.__babylonAudioEngine = audioEngine;
      return audioEngine;
    } catch (error) {
      console.error('Failed to create audio engine:', error);
      return null;
    }
  }

  /**
   * Ensures AudioV2 is ready before scene setup (playground entry has no main.ts bootstrap).
   */
  public static async ensurePlaygroundAudioReady(): Promise<void> {
    await this.ensureAudioEngine();
  }

  /** Shared AudioV2 engine for explicit CreateSoundAsync calls outside this manager. */
  public static async getSharedAudioEngine(): Promise<NonNullable<
    typeof globalThis.__babylonAudioEngine
  > | null> {
    return this.ensureAudioEngine();
  }

  /**
   * Creates a sound and stores it for later retrieval
   * @param name The name of the sound
   * @param url The URL of the sound file (optional, can be set later)
   * @param options Additional options for the sound
   * @returns Promise that resolves when the sound is created
   */
  public static async createSound(name: string, url?: string, options?: object): Promise<void> {
    const audioEngine = await this.ensureAudioEngine();
    if (!audioEngine) {
      console.warn(`Cannot create sound "${name}": audio engine not available`);
      return;
    }

    try {
      const sound = await CreateSoundAsync(name, url ?? '', options ?? {}, audioEngine);
      const managedSound = fromAbstractSound(sound);
      this.activeSounds.set(name, managedSound);
    } catch (error) {
      console.error(`Failed to create sound "${name}":`, error);
    }
  }

  /**
   * Gets a sound by name
   * @param name The name of the sound
   * @returns The managed sound or null if not found
   */
  public static getSound(name: string): ManagedSound | null {
    return this.activeSounds.get(name) ?? null;
  }

  /**
   * Creates a streaming sound (for background music)
   * @param name The name of the sound
   * @param url The URL of the sound file
   * @param options Additional options for the sound
   * @returns Promise that resolves when the sound is created
   */
  public static async createStreamingSound(
    name: string,
    url: string,
    options?: object
  ): Promise<void> {
    const audioEngine = await this.ensureAudioEngine();
    if (!audioEngine) {
      console.warn(`Cannot create streaming sound "${name}": audio engine not available`);
      return;
    }

    try {
      const sound = await CreateStreamingSoundAsync(name, url, options ?? {}, audioEngine);
      const managedSound = fromAbstractSound(sound);
      this.activeSounds.set(name, managedSound);
    } catch (error) {
      console.error(`Failed to create streaming sound "${name}":`, error);
    }
  }

  /**
   * Crossfades to new background music
   * @param url The URL of the new background music
   * @param volume The volume for the new music
   * @param fadeTime The fade time in milliseconds
   */
  public static async crossfadeBackgroundMusic(
    url: string,
    volume: number,
    fadeTime: number
  ): Promise<void> {
    if (this.backgroundMusic || this.activeSounds.has('BackgroundMusic')) {
      await this.stopAndDisposeBackgroundMusic(fadeTime);
    }

    // Streaming BGM: do not pass volume: 0 in create options — play() applies that to
    // the stream instance gain, which stays silent. Start muted on the sound bus instead.
    await this.createStreamingSound('BackgroundMusic', url, {
      loop: true,
      autoplay: false
    });

    const newMusic = this.getSound('BackgroundMusic');
    if (newMusic) {
      this.backgroundMusic = newMusic;
      newMusic.setVolume(0);
      newMusic.play();
      if (fadeTime > 0) {
        newMusic.setVolume(volume, {
          duration: fadeTime / 1000,
          shape: AudioParameterRampShape.Linear
        });
        await new Promise<void>((resolve) => {
          setTimeout(resolve, fadeTime);
        });
      } else {
        newMusic.setVolume(volume);
      }
    }
  }

  /**
   * Stops and disposes the current background music
   * @param fadeTime The fade time in milliseconds
   */
  public static async stopAndDisposeBackgroundMusic(fadeTime: number): Promise<void> {
    const outgoing = this.backgroundMusic ?? this.activeSounds.get('BackgroundMusic') ?? null;
    if (!outgoing) {
      return;
    }

    this.backgroundMusic = null;

    if (fadeTime > 0) {
      try {
        outgoing.setVolume(0, {
          duration: fadeTime / 1000,
          shape: AudioParameterRampShape.Linear
        });
      } catch {
        outgoing.setVolume(0);
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, fadeTime);
      });
    }

    outgoing.stop();
    outgoing.dispose();
    this.activeSounds.delete('BackgroundMusic');
  }

  /**
   * Sets up ambient sounds for an environment
   * @param ambientSounds The ambient sound configurations
   */
  public static async setupAmbientSounds(
    ambientSounds: readonly AmbientSoundConfig[]
  ): Promise<void> {
    // Remove existing ambient sounds
    this.removeAmbientSounds();

    // Create new ambient sounds
    for (const [index, config] of ambientSounds.entries()) {
      const soundName = `ambient_${index}`;
      await this.createSound(soundName, config.url, {
        loop: true,
        volume: config.volume,
        autoplay: true,
        spatialSound: true,
        position: config.position,
        maxDistance: config.maxDistance ?? 40,
        rolloffFactor: config.rollOff ?? 2
      });

      const sound = this.getSound(soundName);
      if (sound) {
        this.ambientSounds.push(sound);
      }
    }
  }

  /**
   * Removes all ambient sounds
   */
  public static removeAmbientSounds(): void {
    for (const sound of this.ambientSounds) {
      sound.dispose();
    }
    this.ambientSounds = [];

    // Also remove from active sounds
    for (const [name, sound] of this.activeSounds) {
      if (this.ambientSounds.includes(sound)) {
        this.activeSounds.delete(name);
      }
    }
  }

  /**
   * Removes all sounds
   */
  public static removeAllSounds(): void {
    for (const [, sound] of this.activeSounds) {
      sound.dispose();
    }
    this.activeSounds.clear();
    this.ambientSounds = [];
    if (this.backgroundMusic) {
      this.backgroundMusic.dispose();
      this.backgroundMusic = null;
    }
  }
}
