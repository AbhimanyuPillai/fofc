/**
 * 100% Offline Web Audio API Synthesizer
 * Provides instant sound feedback for finger pinches, gestures, and air-piano
 */
export class EdgeAudioSynth {
  constructor() {
    this.ctx = null;
    this.enabled = false; // Strictly disabled per silent policy - audio routes exclusively through Jarvis
    this.lastTriggerTime = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPinchSound(freq = 660) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this.lastTriggerTime < 0.08) return; // Debounce
    this.lastTriggerTime = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  playNote(frequency, duration = 0.2, type = 'triangle', volume = 0.15) {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playGestureCue() {
    if (!this.enabled) return;
    this.playNote(523.25, 0.08, 'sine', 0.08); // C5
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

export const audioSynth = new EdgeAudioSynth();
