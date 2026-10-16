/**
 * Automotive 3D Spatial Audio Engine (Web Audio API)
 * --------------------------------------------------
 * Simula a acústica visceral de um escapamento esportivo de titânio:
 * - Fase 0 (Presença): Marcha lenta grave e compassada (idle rumble)
 * - Fase 1 (Fluxo): Ressonância metálica dentro do tubo de titânio (pipe acoustics + gás em alta pressão)
 * - Fase 2 (Assinatura): Aceleração potente, abertura de agudos e estalos esportivos (pops & bangs)
 * 
 * 100% procedural via Web Audio API: Zero dependência externa, latência zero, funciona offline.
 */

export interface SpatialAudioState {
  isActive: boolean;
  isSupported: boolean;
  currentPhase: number;
}

class AutomotiveSpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private isMuted: boolean = false;

  // Audio Nodes
  private masterGain: GainNode | null = null;
  private panner: PannerNode | StereoPannerNode | null = null;

  // Engine Oscillators (Boxer-6 / V8 Harminic Layers)
  private subOsc: OscillatorNode | null = null;
  private midOsc: OscillatorNode | null = null;
  private harmonicOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  // Exhaust Pipe Chamber Filter (Resonância Metálica de Titânio)
  private pipeFilter: BiquadFilterNode | null = null;
  private metallicResonance: BiquadFilterNode | null = null;

  // Gas Flow Noise (Turbulência)
  private noiseNode: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;

  // State Tracking
  private currentProgress: number = 0;
  private lastScrollTime: number = 0;
  private scrollVelocity: number = 0;
  private popsCooldown: number = 0;

  constructor() {
    // Lazy init on first user interaction
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  public async start(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.buildAudioGraph();
      this.isRunning = true;
      this.isMuted = false;

      // Suave Fade-In
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.masterGain.gain.linearRampToValueAtTime(0.75, this.ctx.currentTime + 0.6);
      }

      return true;
    } catch (e) {
      console.warn('[Spatial Audio] Falha ao inicializar Web Audio:', e);
      return false;
    }
  }

  public stop(): void {
    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.4);

      setTimeout(() => {
        this.teardownNodes();
        this.isRunning = false;
      }, 450);
    } catch (e) {
      this.teardownNodes();
      this.isRunning = false;
    }
  }

  public toggle(): Promise<boolean> {
    if (this.isRunning) {
      this.stop();
      return Promise.resolve(false);
    } else {
      return this.start();
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Constrói o grafo de nós de áudio em tempo real
   */
  private buildAudioGraph(): void {
    if (!this.ctx) return;
    this.teardownNodes();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Master Output
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.75, now);

    // 2. Stereo Panner
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.masterGain.connect(this.panner);
      this.panner.connect(ctx.destination);
    } else {
      this.masterGain.connect(ctx.destination);
    }

    // 3. Exhaust Pipe Resonance Filter (O coração acústico do titânio)
    this.pipeFilter = ctx.createBiquadFilter();
    this.pipeFilter.type = 'lowpass';
    this.pipeFilter.frequency.setValueAtTime(1400, now);
    this.pipeFilter.Q.setValueAtTime(2.2, now);

    this.metallicResonance = ctx.createBiquadFilter();
    this.metallicResonance.type = 'peaking';
    this.metallicResonance.frequency.setValueAtTime(1150, now);
    this.metallicResonance.Q.setValueAtTime(3.8, now);
    this.metallicResonance.gain.setValueAtTime(4.0, now);

    this.pipeFilter.connect(this.metallicResonance);
    this.metallicResonance.connect(this.masterGain);

    // 4. Engine Tone Generators (Boxer-6 / V8 Harminics)
    this.engineGain = ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.65, now);
    this.engineGain.connect(this.pipeFilter);

    // Sub-Bass fundamental (38Hz idle)
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sawtooth';
    this.subOsc.frequency.setValueAtTime(42, now);

    // Octave mid (84Hz)
    this.midOsc = ctx.createOscillator();
    this.midOsc.type = 'triangle';
    this.midOsc.frequency.setValueAtTime(84, now);

    // High harmonic grit (126Hz)
    this.harmonicOsc = ctx.createOscillator();
    this.harmonicOsc.type = 'sawtooth';
    this.harmonicOsc.frequency.setValueAtTime(126, now);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.8;
    this.subOsc.connect(subGain);
    subGain.connect(this.engineGain);

    const midGain = ctx.createGain();
    midGain.gain.value = 0.55;
    this.midOsc.connect(midGain);
    midGain.connect(this.engineGain);

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.28;
    this.harmonicOsc.connect(harmGain);
    harmGain.connect(this.engineGain);

    this.subOsc.start(now);
    this.midOsc.start(now);
    this.harmonicOsc.start(now);

    // 5. Gas Flow Noise Generator (Turbulência dos gases em alta pressão)
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.setValueAtTime(0.18, now);

    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.setValueAtTime(800, now);
    this.noiseFilter.Q.setValueAtTime(1.5, now);

    this.noiseGain.connect(this.noiseFilter);
    this.noiseFilter.connect(this.pipeFilter);

    this.startNoiseBuffer();
  }

  private startNoiseBuffer(): void {
    if (!this.ctx || !this.noiseGain) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 segundos de ruído rosa
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;
    this.noiseNode.connect(this.noiseGain);
    this.noiseNode.start();
  }

  /**
   * Modula a acústica com base no progresso do Scroll (0.0 a 1.0)
   */
  public updateProgress(progress: number): void {
    if (!this.isRunning || !this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = Math.max(0, Math.min(1, progress));
    const dt = Math.max(0.016, now - this.lastScrollTime);
    const delta = Math.abs(p - this.currentProgress);
    this.scrollVelocity = delta / dt;
    this.lastScrollTime = now;
    this.currentProgress = p;

    // Modulação de RPM conforme rolagem
    const revBoost = Math.min(2.5, this.scrollVelocity * 0.85);

    // -------------------------------------------------------------
    // FASE 0: PRESENÇA (0.0 a 0.22) - Marcha lenta na saída do escape
    // -------------------------------------------------------------
    if (p <= 0.22) {
      const baseFreq = 42 + revBoost * 14;
      this.subOsc?.frequency.setTargetAtTime(baseFreq, now, 0.08);
      this.midOsc?.frequency.setTargetAtTime(baseFreq * 2, now, 0.08);
      this.harmonicOsc?.frequency.setTargetAtTime(baseFreq * 3, now, 0.08);

      // Som externo com graves limpos e agudos controlados
      this.pipeFilter?.frequency.setTargetAtTime(1400 + revBoost * 400, now, 0.1);
      this.pipeFilter?.Q.setTargetAtTime(1.8, now, 0.1);

      this.metallicResonance?.gain.setTargetAtTime(2.0, now, 0.1);
      this.noiseGain?.gain.setTargetAtTime(0.12 + revBoost * 0.1, now, 0.1);

      if (this.panner && 'pan' in this.panner) {
        this.panner.pan.setTargetAtTime(-0.15, now, 0.1);
      }
    }
    // -------------------------------------------------------------
    // FASE 1: FLUXO (0.22 a 0.68) - Dentro da tubulação de titânio
    // -------------------------------------------------------------
    else if (p > 0.22 && p <= 0.68) {
      const tubeProg = (p - 0.22) / (0.68 - 0.22);
      const baseFreq = 48 + tubeProg * 28 + revBoost * 22;

      this.subOsc?.frequency.setTargetAtTime(baseFreq, now, 0.06);
      this.midOsc?.frequency.setTargetAtTime(baseFreq * 2, now, 0.06);
      this.harmonicOsc?.frequency.setTargetAtTime(baseFreq * 3, now, 0.06);

      // Ressonância metálica interna: filtro passa-banda e pico de frequência de titânio (1.2kHz - 2.4kHz)
      const resonantFreq = 950 + Math.sin(tubeProg * Math.PI) * 750 + revBoost * 300;
      this.pipeFilter?.frequency.setTargetAtTime(2800, now, 0.08);
      this.pipeFilter?.Q.setTargetAtTime(3.5, now, 0.08);

      this.metallicResonance?.frequency.setTargetAtTime(resonantFreq, now, 0.08);
      this.metallicResonance?.gain.setTargetAtTime(8.5, now, 0.08); // Ganho metálico intenso dentro do cano!

      // Turbulência de gás aumentada
      this.noiseGain?.gain.setTargetAtTime(0.26 + revBoost * 0.18, now, 0.08);
      this.noiseFilter?.frequency.setTargetAtTime(1200 + tubeProg * 800, now, 0.08);

      // Stereo sweep seguindo a curva da tubulação
      if (this.panner && 'pan' in this.panner) {
        const panSweep = Math.sin(tubeProg * Math.PI * 2) * 0.45;
        this.panner.pan.setTargetAtTime(panSweep, now, 0.08);
      }
    }
    // -------------------------------------------------------------
    // FASE 2: ASSINATURA (0.68 a 1.0) - Saída do estúdio / Acelerada
    // -------------------------------------------------------------
    else {
      const emergeProg = (p - 0.68) / (1.0 - 0.68);
      const baseFreq = 62 + emergeProg * 35 + revBoost * 30;

      this.subOsc?.frequency.setTargetAtTime(baseFreq, now, 0.06);
      this.midOsc?.frequency.setTargetAtTime(baseFreq * 2, now, 0.06);
      this.harmonicOsc?.frequency.setTargetAtTime(baseFreq * 3, now, 0.06);

      // Abertura total de brilho e ar livre
      this.pipeFilter?.frequency.setTargetAtTime(5500 + emergeProg * 3000, now, 0.08);
      this.pipeFilter?.Q.setTargetAtTime(1.2, now, 0.08);

      this.metallicResonance?.gain.setTargetAtTime(3.0, now, 0.08);
      this.noiseGain?.gain.setTargetAtTime(0.15, now, 0.08);

      if (this.panner && 'pan' in this.panner) {
        this.panner.pan.setTargetAtTime(0.0, now, 0.1);
      }

      // Disparo de estalos esportivos (Pops & Bangs) na transição para o estúdio!
      if (p > 0.72 && p < 0.88 && now > this.popsCooldown) {
        this.triggerExhaustPop();
        this.popsCooldown = now + 0.35;
      }
    }
  }

  /**
   * Estalos esportivos de escapamento (Pops & Bangs / Overrun crackles)
   */
  private triggerExhaustPop(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    const popFilter = ctx.createBiquadFilter();

    popOsc.type = 'sawtooth';
    popOsc.frequency.setValueAtTime(120 + Math.random() * 60, now);
    popOsc.frequency.exponentialRampToValueAtTime(30, now + 0.07);

    popFilter.type = 'lowpass';
    popFilter.frequency.setValueAtTime(1600, now);

    popGain.gain.setValueAtTime(0.45, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    popOsc.connect(popFilter);
    popFilter.connect(popGain);
    popGain.connect(this.masterGain);

    popOsc.start(now);
    popOsc.stop(now + 0.1);
  }

  /**
   * Pausa o áudio quando a seção sai do campo de visão (economiza CPU)
   */
  public setVisible(visible: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (visible && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(0.75, now, 0.15);
    } else {
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.15);
    }
  }

  private teardownNodes(): void {
    try {
      this.subOsc?.stop();
      this.midOsc?.stop();
      this.harmonicOsc?.stop();
      this.noiseNode?.stop();
    } catch (e) {}

    this.subOsc = null;
    this.midOsc = null;
    this.harmonicOsc = null;
    this.noiseNode = null;
    this.pipeFilter = null;
    this.metallicResonance = null;
    this.noiseGain = null;
    this.noiseFilter = null;
    this.engineGain = null;
    this.masterGain = null;
    this.panner = null;
  }
}

// Singleton global exportado para a aplicação
export const spatialAudio = new AutomotiveSpatialAudioEngine();
