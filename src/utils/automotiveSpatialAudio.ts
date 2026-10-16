/**
 * Automotive 3D Spatial Audio Engine (Web Audio API com Áudio Real de Escapamento)
 * ---------------------------------------------------------------------------------
 * Utiliza gravações REAIS de escapamentos esportivos da Flow Garage (Porsche 911 / Corvette Titanium)
 * combinadas com filtros espaciais interativos modulados pelo scroll:
 * 
 * - Fase 0 (Presença): Ronco real gravado em marcha lenta e aceleração externa encorpada
 * - Fase 1 (Fluxo): O áudio real entra na tubulação de titânio (filtro de cavidade metálica + ressonância interna)
 * - Fase 2 (Assinatura): Saída para o estúdio com válvulas abertas e agudos cristalinos
 */

class AutomotiveSpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private audioBuffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private isLoadingAudio: boolean = false;

  // Audio Processing Nodes
  private masterGain: GainNode | null = null;
  private panner: StereoPannerNode | PannerNode | null = null;
  private pipeFilter: BiquadFilterNode | null = null;
  private metallicResonance: BiquadFilterNode | null = null;
  private subBoost: BiquadFilterNode | null = null;

  // Trackers
  private currentProgress: number = 0;
  private lastScrollTime: number = 0;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  private async loadRealExhaustBuffer(): Promise<AudioBuffer | null> {
    if (this.audioBuffer) return this.audioBuffer;
    if (!this.ctx) return null;

    try {
      this.isLoadingAudio = true;
      // Tenta primeiro o áudio do Corvette Titanium (24s completo) ou Porsche (9s)
      const audioUrls = [
        '/audio/corvette_ronco_real.mp3',
        '/audio/porsche_ronco_real.mp3'
      ];

      for (const url of audioUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.isLoadingAudio = false;
            return this.audioBuffer;
          }
        } catch (err) {
          // Tenta o próximo
        }
      }
    } catch (e) {
      console.warn('[Spatial Audio] Erro ao carregar áudio real do escapamento:', e);
    }

    this.isLoadingAudio = false;
    return null;
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

      // Carrega o áudio real do escapamento gravado
      await this.loadRealExhaustBuffer();

      this.buildAudioGraph();
      this.isRunning = true;

      // Suave Fade-In
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(0.9, this.ctx.currentTime + 0.4);
      }

      return true;
    } catch (e) {
      console.warn('[Spatial Audio] Falha ao iniciar:', e);
      return false;
    }
  }

  public stop(): void {
    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    try {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);

      setTimeout(() => {
        this.teardownNodes();
        this.isRunning = false;
      }, 400);
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

  private buildAudioGraph(): void {
    if (!this.ctx) return;
    this.teardownNodes();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Master Gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, now);

    // 2. Stereo Panner (efeito surround)
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.masterGain.connect(this.panner);
      this.panner.connect(ctx.destination);
    } else {
      this.masterGain.connect(ctx.destination);
    }

    // 3. Sub-Bass Boost para impacto nos graves do ronco
    this.subBoost = ctx.createBiquadFilter();
    this.subBoost.type = 'lowshelf';
    this.subBoost.frequency.setValueAtTime(90, now);
    this.subBoost.gain.setValueAtTime(4.5, now);

    // 4. Pipe Chamber Filter (Simula a acústica metálica interna da tubulação)
    this.pipeFilter = ctx.createBiquadFilter();
    this.pipeFilter.type = 'lowpass';
    this.pipeFilter.frequency.setValueAtTime(8000, now);
    this.pipeFilter.Q.setValueAtTime(1.2, now);

    // 5. Metallic Resonance (Filtro característico de titânio aquecido)
    this.metallicResonance = ctx.createBiquadFilter();
    this.metallicResonance.type = 'peaking';
    this.metallicResonance.frequency.setValueAtTime(1200, now);
    this.metallicResonance.Q.setValueAtTime(2.2, now);
    this.metallicResonance.gain.setValueAtTime(0, now);

    // Cadeia de processamento:
    // BufferSource -> subBoost -> pipeFilter -> metallicResonance -> masterGain -> panner -> destination
    this.subBoost.connect(this.pipeFilter);
    this.pipeFilter.connect(this.metallicResonance);
    this.metallicResonance.connect(this.masterGain);

    // Inicia a reprodução do ronco real em loop
    if (this.audioBuffer) {
      this.bufferSource = ctx.createBufferSource();
      this.bufferSource.buffer = this.audioBuffer;
      this.bufferSource.loop = true;
      this.bufferSource.playbackRate.setValueAtTime(1.0, now);
      this.bufferSource.connect(this.subBoost);
      this.bufferSource.start(now);
    }
  }

  /**
   * Modula o som real de acordo com a posição da câmera 3D no scroll
   */
  public updateProgress(progress: number): void {
    if (!this.isRunning || !this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = Math.max(0, Math.min(1, progress));
    const dt = Math.max(0.016, now - this.lastScrollTime);
    const delta = Math.abs(p - this.currentProgress);
    const scrollVelocity = Math.min(2.0, delta / dt);
    this.lastScrollTime = now;
    this.currentProgress = p;

    // Aceleração sutil do motor conforme a velocidade de rolagem (rev up ao rolar rápido)
    const pitchMod = 1.0 + Math.min(0.25, scrollVelocity * 0.12);
    if (this.bufferSource && 'playbackRate' in this.bufferSource) {
      this.bufferSource.playbackRate.setTargetAtTime(pitchMod, now, 0.08);
    }

    // -------------------------------------------------------------
    // FASE 0: PRESENÇA (0.0 a 0.22) - Som real na saída do escapamento
    // -------------------------------------------------------------
    if (p <= 0.22) {
      // Ronco direto e nítido
      this.pipeFilter?.frequency.setTargetAtTime(9500, now, 0.1);
      this.pipeFilter?.Q.setTargetAtTime(1.0, now, 0.1);
      this.metallicResonance?.gain.setTargetAtTime(0.0, now, 0.1);
      this.subBoost?.gain.setTargetAtTime(5.0, now, 0.1);

      if (this.panner && 'pan' in this.panner) {
        this.panner.pan.setTargetAtTime(-0.1, now, 0.1);
      }
    }
    // -------------------------------------------------------------
    // FASE 1: FLUXO (0.22 a 0.68) - Dentro da tubulação de titânio
    // -------------------------------------------------------------
    else if (p > 0.22 && p <= 0.68) {
      const tubeProg = (p - 0.22) / (0.68 - 0.22);

      // Simula a física dentro do tubo: abafa os agudos difusos e ressoa o metal
      const tubeCutoff = 2200 - Math.sin(tubeProg * Math.PI) * 800;
      this.pipeFilter?.frequency.setTargetAtTime(tubeCutoff, now, 0.08);
      this.pipeFilter?.Q.setTargetAtTime(3.2, now, 0.08);

      // Ganho de ressonância metálica de titânio
      this.metallicResonance?.frequency.setTargetAtTime(1100 + tubeProg * 600, now, 0.08);
      this.metallicResonance?.gain.setTargetAtTime(7.0, now, 0.08);
      this.subBoost?.gain.setTargetAtTime(7.5, now, 0.08); // Graves mais densos dentro do cano

      // Stereo sweep acompanhando as curvas do tubo 3D
      if (this.panner && 'pan' in this.panner) {
        const panSweep = Math.sin(tubeProg * Math.PI * 2) * 0.35;
        this.panner.pan.setTargetAtTime(panSweep, now, 0.08);
      }
    }
    // -------------------------------------------------------------
    // FASE 2: ASSINATURA (0.68 a 1.0) - Saída para o estúdio com válvulas abertas
    // -------------------------------------------------------------
    else {
      const emergeProg = (p - 0.68) / (1.0 - 0.68);

      // Abertura total de ar livre e agudos nítidos
      this.pipeFilter?.frequency.setTargetAtTime(14000, now, 0.08);
      this.pipeFilter?.Q.setTargetAtTime(0.8, now, 0.08);
      this.metallicResonance?.gain.setTargetAtTime(1.5, now, 0.08);
      this.subBoost?.gain.setTargetAtTime(6.0, now, 0.08);

      if (this.panner && 'pan' in this.panner) {
        this.panner.pan.setTargetAtTime(0.0, now, 0.1);
      }
    }
  }

  public setVisible(visible: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (visible && this.isRunning) {
      this.masterGain.gain.setTargetAtTime(0.9, now, 0.2);
    } else {
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.2);
    }
  }

  private teardownNodes(): void {
    try {
      this.bufferSource?.stop();
      this.bufferSource?.disconnect();
    } catch (e) {}

    this.bufferSource = null;
    this.pipeFilter = null;
    this.metallicResonance = null;
    this.subBoost = null;
    this.masterGain = null;
    this.panner = null;
  }
}

export const spatialAudio = new AutomotiveSpatialAudioEngine();
