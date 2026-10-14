// Iron Man lab-inspired sound system using Web Audio API

// Simple Sound Configuration - Easy to customize!
interface SoundConfig {
    // Option 1: Use custom audio file
    audioFile?: string;

    // Option 2: Use generated tone (fallback if audioFile fails or not provided)
    frequency?: number;
    duration?: number;
    type?: OscillatorType;
    volume?: number;
}

// Customize your sounds here - Use audioFile for custom sounds, or tone settings for generated sounds!
const SOUND_CONFIGS: { [key: string]: SoundConfig } = {
    // UI Sounds - Mix of custom files and generated tones
    swipeUP: {
        audioFile: '/sounds/ui/Futuristic_Swipe.wav',  // Try custom file first
        frequency: 800, duration: 200, type: 'sine', volume: 0.3  // Fallback to generated tone
    },
    swipe: {
        audioFile: '/sounds/ui/Air_Swipe.wav',  // Try custom file first
        frequency: 800, duration: 200, type: 'sine', volume: 0.3  // Fallback to generated tone
    },
    swipeDOWN: {
        audioFile: '/sounds/ui/SwipeDown.wav',  // Try custom file first
        frequency: 800, duration: 200, type: 'sine', volume: 0.3  // Fallback to generated tone
    },
    select: {
        audioFile: '/sounds/ui/select.wav',
        frequency: 1200, duration: 150, type: 'triangle', volume: 0.4
    },
    activate: {
        audioFile: '/sounds/ui/activate.mp3',
        frequency: 600, duration: 300, type: 'sawtooth', volume: 0.5
    },
    hover: {
        frequency: 400, duration: 100, type: 'sine', volume: 0.2  // Only generated tone
    },

    // Video Control Sounds - Customize with your own files!
    play: {
        audioFile: '/sounds/video-controls/pause.wav',  // Put your custom play sound here
        frequency: 880, duration: 250, type: 'triangle', volume: 0.4
    },
    pause: {
        audioFile: '/sounds/video-controls/pause.wav',  // Put your custom pause sound here
        frequency: 660, duration: 200, type: 'square', volume: 0.35
    },
    stop: {
        audioFile: '/sounds/video-controls/stop.mp3',  // Put your custom stop sound here
        frequency: 440, duration: 300, type: 'sawtooth', volume: 0.45
    },
    mute: {
        audioFile: '/sounds/video-controls/mute.wav',
        frequency: 330, duration: 150, type: 'sine', volume: 0.3
    },
    unmute: {
        audioFile: '/sounds/video-controls/unmute.wav',
        frequency: 1100, duration: 200, type: 'triangle', volume: 0.35
    },
    fullscreen: {
        audioFile: '/sounds/video-controls/fullscreen.mp3',
        frequency: 1320, duration: 350, type: 'sawtooth', volume: 0.4
    },
    seek: {
        audioFile: '/sounds/video-controls/seek.wav',
        frequency: 990, duration: 100, type: 'sine', volume: 0.25
    },
    close: {
        audioFile: '/sounds/ui/SwipeDown.wav',
        frequency: 550, duration: 250, type: 'triangle', volume: 0.3
    }
};

export class IronManSoundSystem {
    private static instance: IronManSoundSystem;
    private isEnabled: boolean = true;
    private audioContext: AudioContext | null = null;
    private audioCache: Map<string, AudioBuffer> = new Map();

    private constructor() {
        this.initializeAudioContext();
    }

    public static getInstance(): IronManSoundSystem {
        if (!IronManSoundSystem.instance) {
            IronManSoundSystem.instance = new IronManSoundSystem();
        }
        return IronManSoundSystem.instance;
    }

    private initializeAudioContext() {
        if (typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioContext = new AudioContextClass();
                console.log('Audio context created:', this.audioContext.state);
            } else {
                console.warn('Web Audio API not supported');
            }
        }
    }

    public async initializeAudio() {
        if (!this.audioContext) {
            this.initializeAudioContext();
        }

        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('Audio context resumed successfully');
            } catch (error) {
                console.error('Failed to resume audio context:', error);
            }
        }
    }

    // Load custom audio file and cache it
    public async loadAudioFile(soundName: string, audioUrl: string): Promise<boolean> {
        if (!this.audioContext) {
            console.warn('Audio context not available');
            return false;
        }

        try {
            console.log(`Loading audio file: ${soundName} from ${audioUrl}`);
            const response = await fetch(audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.audioCache.set(soundName, audioBuffer);
            console.log(`Audio file loaded successfully: ${soundName}`);
            return true;
        } catch (error) {
            console.error(`Failed to load audio file ${soundName}:`, error);
            return false;
        }
    }

    // Play custom audio file from cache
    private playAudioFile(soundName: string, volume: number = 0.5): boolean {
        if (!this.audioContext || !this.audioCache.has(soundName)) {
            return false;
        }

        try {
            const audioBuffer = this.audioCache.get(soundName)!;
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();

            source.buffer = audioBuffer;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            source.start(0);

            console.log(`Playing audio file: ${soundName}`);
            return true;
        } catch (error) {
            console.error(`Failed to play audio file ${soundName}:`, error);
            return false;
        }
    }

    private createTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
        if (!this.audioContext || !this.isEnabled) {
            console.log('Audio context not available or sound disabled');
            return;
        }

        try {
            // Resume audio context if suspended (required by some browsers)
            if (this.audioContext.state === 'suspended') {
                console.log('Resuming audio context...');
                this.audioContext.resume();
            }

            console.log(`Creating tone: ${frequency}Hz, ${duration}ms, ${type}, volume: ${volume}`);

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            const filterNode = this.audioContext.createBiquadFilter();

            // Connect nodes: oscillator -> filter -> gain -> destination
            oscillator.connect(filterNode);
            filterNode.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // Configure oscillator
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;

            // Configure filter for Iron Man-like sound
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(frequency * 2, this.audioContext.currentTime);
            filterNode.Q.setValueAtTime(1, this.audioContext.currentTime);

            // Configure envelope (attack, decay, sustain, release)
            const now = this.audioContext.currentTime;
            const attackTime = 0.05;
            const decayTime = 0.1;
            const sustainLevel = volume * 0.7;
            const releaseTime = duration / 1000 - attackTime - decayTime;

            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(volume, now + attackTime);
            gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attackTime + decayTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration / 1000);

            // Start and stop oscillator
            oscillator.start(now);
            oscillator.stop(now + duration / 1000);

            console.log('Sound playing successfully');

            // Clean up
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
                filterNode.disconnect();
            };
        } catch (error) {
            console.warn('Audio playback failed:', error);
        }
    }

    public async play(soundName: string) {
        if (!this.isEnabled) {
            console.log('Sound system disabled');
            return;
        }

        console.log(`Playing sound: ${soundName}`);

        const config = SOUND_CONFIGS[soundName as keyof typeof SOUND_CONFIGS];
        if (!config) {
            console.warn(`No sound config found for: ${soundName}`);
            return;
        }

        // Try to use custom audio file if specified
        if (config.audioFile) {
            // Check if already loaded
            if (this.hasAudioFile(soundName)) {
                console.log(`Using cached custom audio file for ${soundName}`);
                this.playAudioFile(soundName, config.volume || 0.5);
                return;
            }

            // Try to load and play custom audio file
            try {
                console.log(`Loading custom audio file for ${soundName}: ${config.audioFile}`);
                const loaded = await this.loadAudioFile(soundName, config.audioFile);
                if (loaded) {
                    console.log(`Successfully loaded and playing custom audio for ${soundName}`);
                    this.playAudioFile(soundName, config.volume || 0.5);
                    return;
                }
            } catch (error) {
                console.warn(`Failed to load custom audio for ${soundName}, falling back to generated tone:`, error);
            }
        }

        // Fallback to generated tone
        if (config.frequency && config.duration && config.type) {
            console.log(`Using generated tone for ${soundName}:`, config);
            this.createTone(config.frequency, config.duration, config.type, config.volume || 0.3);
        } else {
            console.warn(`No valid audio configuration for ${soundName}`);
        }
    }

    public playTone(frequency: number, duration: number = 200, volume: number = 0.3) {
        this.createTone(frequency, duration, 'sine', volume);
    }

    // Load multiple audio files at once
    public async loadAudioFiles(audioFiles: { [soundName: string]: string }): Promise<{
        [soundName: string]: boolean
    }> {
        const results: { [soundName: string]: boolean } = {};

        for (const [soundName, audioUrl] of Object.entries(audioFiles)) {
            results[soundName] = await this.loadAudioFile(soundName, audioUrl);
        }

        return results;
    }

    // Check if a custom audio file is loaded
    public hasAudioFile(soundName: string): boolean {
        return this.audioCache.has(soundName);
    }

    // Remove a custom audio file from cache
    public removeAudioFile(soundName: string): boolean {
        return this.audioCache.delete(soundName);
    }

    // Clear all custom audio files
    public clearAudioFiles(): void {
        this.audioCache.clear();
        console.log('All custom audio files cleared');
    }

    // Get list of loaded custom audio files
    public getLoadedAudioFiles(): string[] {
        return Array.from(this.audioCache.keys());
    }

    // Play custom audio file with specific volume
    public playCustomAudio(soundName: string, volume: number = 0.5): boolean {
        return this.playAudioFile(soundName, volume);
    }

    public setEnabled(enabled: boolean) {
        this.isEnabled = enabled;
    }

    public isAudioEnabled(): boolean {
        return this.isEnabled;
    }

    public async enableAudio() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                console.log('Audio context resumed');
            } catch (error) {
                console.warn('Failed to resume audio context:', error);
            }
        }
    }
}

export const soundSystem = IronManSoundSystem.getInstance();
