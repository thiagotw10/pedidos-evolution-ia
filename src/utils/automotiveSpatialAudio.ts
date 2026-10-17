/** Scroll controls the throttle; the recording supplies the actual exhaust timbre. */
export type ExhaustAudioStatus = 'locked' | 'loading' | 'ready' | 'muted' | 'paused' | 'error';
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (start: number, end: number, value: number) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};
const approach = (value: number, target: number, seconds: number, dt: number) => target + (value - target) * Math.exp(-dt / seconds);

/** Kept independent of Web Audio to verify timing at different refresh rates. */
export class ExhaustScrollDynamics {
  progress = 0;
  throttle = 0;
  private lastMovement = -Infinity;
  private lastSample: number | null = null;
  private lastTick: number | null = null;
  private demand = 0;

  update(progress: number, now: number, movement = true): void {
    if (!Number.isFinite(progress) || !Number.isFinite(now)) return;
    const next = clamp(progress);
    const delta = Math.abs(next - this.progress);
    this.progress = next;
    if (this.lastSample === null || !movement) {
      this.lastSample = now;
      this.lastMovement = -Infinity;
      this.demand = 0;
      return;
    }
    // Stationary RAF / ResizeObserver callbacks never keep the accelerator pressed.
    if (delta < .000001) return;
    const dt = clamp((now - this.lastSample) / 1000, 1 / 120, 1 / 20);
    this.demand = .12 + .88 * Math.sqrt(clamp(delta / dt / .55));
    this.lastMovement = now;
    this.lastSample = now;
  }
  reset(): void {
    this.throttle = 0;
    this.demand = 0;
    this.lastMovement = -Infinity;
    this.lastSample = null;
    this.lastTick = null;
  }
  step(now: number) {
    const dt = this.lastTick === null ? 0 : clamp((now - this.lastTick) / 1000, 0, .25);
    this.lastTick = now;
    const age = Math.max(0, now - this.lastMovement) / 1000;
    const target = this.demand * Math.exp(-Math.max(0, age - .055) / .085);
    this.throttle = approach(this.throttle, target, target > this.throttle ? .095 : .27, dt);
    const p = this.progress;
    const envelope = smooth(.145, .185, p) * (1 - smooth(.68, .835, p));
    const inside = clamp((p - .18) / .5);
    const opening = smooth(.68, .81, p);
    const throttle = this.throttle;
    return {
      throttle, envelope,
      gain: envelope * (.22 + throttle * .23),
      idleRate: .88 + throttle * .14,
      revRate: .91 + throttle * .24,
      revMix: smooth(.06, .85, throttle),
      cutoff: 1550 - Math.sin(inside * Math.PI) * 350 + throttle * 3000 + opening * 4200,
      pan: Math.sin(inside * Math.PI * 2) * .22 * (1 - opening),
      resonance: 1150 + inside * 450,
    };
  }
}

// Short idle passages prevent recorded accelerations from recurring when the visitor stops.
// Longer rev excerpts retain the character of the real recordings instead of buzzing grains.
const SOURCES = {
  '/audio/corvette_ronco_real.mp3': { idle: [.1, 2.5], rev: [9, 11.5] },
  '/audio/porsche_ronco_real.mp3': { idle: [2.9, 4.4], rev: [4.5, 6.8] },
} as const;
type SourceUrl = keyof typeof SOURCES;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export class AutomotiveSpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private visible = true;
  private muted = false;
  private paused = false;
  private stopped = false;
  private loading = false;
  private failed = false;
  private generation = 0;
  private source: SourceUrl = '/audio/corvette_ronco_real.mp3';
  private buffers: { idle: AudioBuffer; rev: AudioBuffer } | null = null;
  private startPromise: Promise<boolean> | null = null;
  private resumePromise: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private animationFrameId: number | null = null;
  private visibilityAttached = false;
  private dynamics = new ExhaustScrollDynamics();
  private listeners = new Set<(isSuspended: boolean) => void>();
  private stateListeners = new Set<(status: ExhaustAudioStatus) => void>();
  private sources: AudioBufferSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;
  private idleGain: GainNode | null = null;
  private revGain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private pipeFilter: BiquadFilterNode | null = null;
  private metallicResonance: BiquadFilterNode | null = null;
  private lastNotification = '';

  isSupported(): boolean {
    return typeof window !== 'undefined' && Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  }
  isSuspended(): boolean { return !this.ctx || this.ctx.state !== 'running'; }
  isMuted(): boolean { return this.muted; }
  getStatus(): ExhaustAudioStatus {
    if (this.muted) return 'muted';
    if (this.paused || !this.visible || this.documentHidden()) return 'paused';
    if (this.failed) return 'error';
    if (this.loading) return 'loading';
    return this.unlocked && !this.isSuspended() ? 'ready' : 'locked';
  }
  subscribe(listener: (suspended: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.isSuspended());
    return () => { this.listeners.delete(listener); };
  }
  subscribeState(listener: (status: ExhaustAudioStatus) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getStatus());
    return () => { this.stateListeners.delete(listener); };
  }
  private notify(): void {
    const suspended = this.isSuspended();
    const status = this.getStatus();
    const signature = `${suspended}:${status}`;
    if (signature === this.lastNotification) return;
    this.lastNotification = signature;
    this.listeners.forEach(fn => fn(suspended));
    this.stateListeners.forEach(fn => fn(status));
  }
  configure(options: { source?: string }): void {
    if (!options.source || !(options.source in SOURCES) || this.source === options.source) return;
    this.halt();
    this.source = options.source as SourceUrl;
    this.buffers = null;
    this.failed = false;
    void this.start();
  }
  private documentHidden(): boolean { return typeof document !== 'undefined' && document.hidden; }
  private allowed(): boolean { return !this.stopped && this.visible && !this.muted && !this.paused && !this.documentHidden(); }
  private inRange(): boolean { return this.dynamics.progress >= .135 && this.dynamics.progress <= .86; }
  private onVisibility = () => {
    if (this.documentHidden()) this.halt(); else void this.start();
    this.notify();
  };
  private attachVisibility(): void {
    if (this.visibilityAttached || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.visibilityAttached = true;
  }

  /** Call only from click/pointer/touch/key gestures, never from scroll. */
  unlockOnUserGesture(): void {
    if (!this.allowed() || !this.isSupported()) return;
    this.attachVisibility();
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
        this.ctx = new Context();
        this.ctx.onstatechange = () => {
          if (this.ctx?.state !== 'running') this.halt();
          this.notify();
        };
      }
      this.unlocked = true;
      this.failed = false;
      // Invoke resume synchronously during the trusted event, as required by Safari.
      void this.resume().then(() => this.start());
    } catch {
      this.unlocked = false;
      this.notify();
    }
  }
  private resume(): Promise<void> {
    if (!this.ctx || this.ctx.state === 'running') return Promise.resolve();
    if (this.resumePromise) return this.resumePromise;
    const promise = this.ctx.resume().catch(() => { this.unlocked = false; }).finally(() => {
      if (this.resumePromise === promise) this.resumePromise = null;
      this.notify();
    });
    this.resumePromise = promise;
    return promise;
  }
  async start(): Promise<boolean> {
    if (!this.ctx || !this.unlocked || !this.allowed() || !this.inRange() || this.failed) return false;
    if (this.sources.length) return true;
    if (this.startPromise) return this.startPromise;
    const generation = this.generation;
    const pending = (async () => {
      try {
        await this.resume();
        if (generation !== this.generation || !this.allowed() || this.isSuspended()) return false;
        if (!this.buffers) {
          this.loading = true;
          this.notify();
          const controller = new AbortController();
          this.controller = controller;
          const timeout = setTimeout(() => controller.abort(), 12000);
          try {
            const response = await fetch(this.source, { signal: controller.signal });
            if (!response.ok) throw new Error('Audio unavailable');
            if (Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES) throw new Error('Audio too large');
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Audio stream unavailable');
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > MAX_AUDIO_BYTES) { await reader.cancel(); throw new Error('Audio too large'); }
              chunks.push(value);
            }
            const bytes = new Uint8Array(size);
            let offset = 0;
            chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength; });
            if (controller.signal.aborted || generation !== this.generation) return false;
            const buffer = await this.ctx!.decodeAudioData(bytes.buffer);
            // decodeAudioData cannot be aborted: ignore results from an obsolete request.
            if (controller.signal.aborted || generation !== this.generation) return false;
            const profile = SOURCES[this.source];
            this.buffers = { idle: this.makeLoop(buffer, profile.idle), rev: this.makeLoop(buffer, profile.rev) };
          } finally { clearTimeout(timeout); }
        }
        if (generation !== this.generation || !this.allowed() || !this.inRange()) return false;
        this.buildAudioGraph();
        this.startTicker();
        return true;
      } catch (error) {
        if (generation === this.generation && !(error instanceof DOMException && error.name === 'AbortError')) this.failed = true;
        // A timeout waits for an explicit retry gesture, not another request on every scroll.
        if (generation === this.generation && this.controller?.signal.aborted) this.failed = true;
        return false;
      } finally {
        if (generation === this.generation) { this.loading = false; this.controller = null; }
        if (this.startPromise === pending) this.startPromise = null;
        this.notify();
      }
    })();
    this.startPromise = pending;
    return pending;
  }

  /** Normalize with headroom and blend the tail into the head to remove loop clicks. */
  private makeLoop(input: AudioBuffer, range: readonly number[]): AudioBuffer {
    const first = Math.min(input.length - 1, Math.floor(range[0] * input.sampleRate));
    const end = Math.min(input.length, Math.floor(range[1] * input.sampleRate));
    const length = Math.max(1, end - first);
    const blend = Math.min(Math.floor(input.sampleRate * .10), Math.floor(length / 4));
    const output = this.ctx!.createBuffer(input.numberOfChannels, length - blend, input.sampleRate);
    let peak = 0, power = 0;
    for (let channel = 0; channel < input.numberOfChannels; channel++) {
      const from = input.getChannelData(channel);
      const to = output.getChannelData(channel);
      for (let i = 0; i < to.length; i++) {
        const offset = i + blend;
        const mix = offset >= length - blend ? smooth(length - blend, length - 1, offset) : 0;
        to[i] = from[first + offset] * (1 - mix) + (mix ? from[first + offset - (length - blend)] * mix : 0);
        peak = Math.max(peak, Math.abs(to[i]));
        power += to[i] * to[i];
      }
    }
    const rms = Math.sqrt(power / (output.length * output.numberOfChannels));
    const gain = Math.min(.82 / Math.max(peak, .001), .18 / Math.max(rms, .001), 2);
    for (let c = 0; c < output.numberOfChannels; c++) {
      const channel = output.getChannelData(c);
      for (let i = 0; i < channel.length; i++) channel[i] *= gain;
    }
    return output;
  }
  private buildAudioGraph(): void {
    if (!this.ctx || !this.buffers) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const track = <T extends AudioNode>(node: T): T => { this.nodes.push(node); return node; };
    const bass = track(ctx.createBiquadFilter());
    bass.type = 'lowshelf'; bass.frequency.value = 90; bass.gain.value = 1.5;
    this.pipeFilter = track(ctx.createBiquadFilter());
    this.pipeFilter.type = 'lowpass'; this.pipeFilter.frequency.value = 1800; this.pipeFilter.Q.value = .65;
    this.metallicResonance = track(ctx.createBiquadFilter());
    this.metallicResonance.type = 'peaking'; this.metallicResonance.frequency.value = 1300;
    this.metallicResonance.Q.value = 1.2; this.metallicResonance.gain.value = 1.8;
    const limiter = track(ctx.createDynamicsCompressor());
    limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12;
    limiter.attack.value = .003; limiter.release.value = .16;
    this.masterGain = track(ctx.createGain()); this.masterGain.gain.value = 0;
    bass.connect(this.pipeFilter); this.pipeFilter.connect(this.metallicResonance);
    this.metallicResonance.connect(limiter); limiter.connect(this.masterGain);
    if (ctx.createStereoPanner) {
      this.panner = track(ctx.createStereoPanner());
      this.masterGain.connect(this.panner); this.panner.connect(ctx.destination);
    } else this.masterGain.connect(ctx.destination);
    this.idleGain = track(ctx.createGain()); this.idleGain.gain.value = 1;
    this.revGain = track(ctx.createGain()); this.revGain.gain.value = 0;
    [this.buffers.idle, this.buffers.rev].forEach((buffer, i) => {
      const source = track(ctx.createBufferSource());
      source.buffer = buffer; source.loop = true; source.playbackRate.value = i ? .91 : .88;
      const gain = i ? this.revGain! : this.idleGain!;
      source.connect(gain); gain.connect(bass); source.start(now);
      this.sources.push(source);
    });
  }
  updateProgress(progress: number, movement = true): void {
    this.dynamics.update(progress, performance.now(), movement);
    if (!this.inRange()) { if (this.sources.length || this.loading) this.halt(); return; }
    if (this.allowed()) void this.start();
  }
  private startTicker(): void {
    if (this.animationFrameId !== null) return;
    const tick = (now: number) => {
      this.animationFrameId = null;
      if (!this.ctx || !this.masterGain || !this.allowed()) return;
      const state = this.dynamics.step(now);
      const time = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(state.gain, time, .045);
      this.sources[0]?.playbackRate.setTargetAtTime(state.idleRate, time, .065);
      this.sources[1]?.playbackRate.setTargetAtTime(state.revRate, time, .065);
      this.idleGain?.gain.setTargetAtTime(Math.cos(state.revMix * Math.PI / 2), time, .045);
      this.revGain?.gain.setTargetAtTime(Math.sin(state.revMix * Math.PI / 2), time, .045);
      this.pipeFilter?.frequency.setTargetAtTime(state.cutoff, time, .07);
      this.metallicResonance?.frequency.setTargetAtTime(state.resonance, time, .07);
      this.panner?.pan.setTargetAtTime(state.pan, time, .10);
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.halt(); else { this.failed = false; void this.start(); }
    this.notify();
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.halt(); else void this.start();
    this.notify();
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.stopped = false;
    this.attachVisibility();
    if (!visible) this.halt(); else void this.start();
    this.notify();
  }
  stop(): void {
    this.stopped = true;
    this.halt();
    if (this.visibilityAttached) document.removeEventListener('visibilitychange', this.onVisibility);
    this.visibilityAttached = false;
    this.notify();
  }
  private halt(): void {
    this.generation++;
    this.controller?.abort(); this.controller = null;
    this.startPromise = null; this.loading = false;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    const sources = this.sources;
    const nodes = this.nodes;
    const gain = this.masterGain;
    this.sources = []; this.nodes = [];
    this.masterGain = this.idleGain = this.revGain = null;
    this.pipeFilter = this.metallicResonance = null; this.panner = null;
    const now = this.ctx?.currentTime || 0;
    if (gain && this.ctx?.state === 'running') {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, .012);
    }
    for (const source of sources) { try { source.stop(now + .06); } catch { /* already stopped */ } }
    const disconnect = () => nodes.forEach(node => { try { node.disconnect(); } catch { /* already detached */ } });
    if (nodes.length) setTimeout(disconnect, 80);
    this.dynamics.reset();
    this.notify();
  }
}

export const spatialAudio = new AutomotiveSpatialAudioEngine();
