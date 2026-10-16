/**
 * Automotive 3D Spatial Audio Engine (Web Audio API com Áudio Real de Escapamento)
 * ---------------------------------------------------------------------------------
 * Utiliza gravações REAIS de escapamentos esportivos da Flow Garage (Porsche 911 / Corvette Titanium).
 * 
 * Comportamento inteligente de interação com o Scroll:
 * - Zona 0 (p < 0.16) - Idle: Câmera na visão externa, som silencioso.
 * - Zona 1 (0.16 <= p < 0.26) - Entrada: Ao embicar na boca do escape, o som desperta automaticamente
 *   com um fade-in exponencial e reforço dos sub-graves.
 * - Zona 2 (0.26 <= p <= 0.68) - Interior: O som "vai roncando" confinado dentro do tubo de titânio
 *   com ressonância metálica e rotação dinâmica vinculada à velocidade do scroll.
 * - Zona 3 (0.68 < p <= 0.84) - Saída: "Encerra com maestria" — abertura total de válvulas seguida
 *   de decaimento acústico sublime até silenciar no estúdio.
 * - Respeito ao Mudo: O usuário pode mutar a qualquer momento se desejar.
 */

export type AudioZone = 'idle' | 'entering' | 'inside' | 'exiting' | 'ended';

export interface SpatialAudioState {
  isPlaying: boolean;
  userMuted: boolean;
  zone: AudioZone;
  volume: number;
}

type StateListener = (state: SpatialAudioState) => void;

class AutomotiveSpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private userMuted: boolean = false;
  private isVisible: boolean = true;
  private audioBuffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private isLoadingAudio: boolean = false;
  private listeners = new Set<StateListener>();

  // Audio Processing Nodes
  private masterGain: GainNode | null = null;
  private panner: StereoPannerNode | PannerNode | null = null;
  private pipeFilter: BiquadFilterNode | null = null;
  private metallicResonance: BiquadFilterNode | null = null;
  private subBoost: BiquadFilterNode | null = null;

  // Trackers
  private currentProgress: number = 0;
  private lastScrollTime: number = 0;
  private currentZone: AudioZone = 'idle';

  public isSupported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public getState(): SpatialAudioState {
    const isActuallyPlaying = this.isRunning && !this.userMuted && (this.currentZone === 'entering' || this.currentZone === 'inside' || this.currentZone === 'exiting');
    return {
      isPlaying: isActuallyPlaying,
      userMuted: this.userMuted,
      zone: this.currentZone,
      volume: this.masterGain?.gain.value || 0
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  /**
   * Pre-aquece o AudioContext na primeira interação do usuário (touch, scroll, click)
   * para contornar a política de autoplay dos navegadores.
   */
  public async prepareContext(): Promise<void> {
    if (!this.isSupported()) return;

    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      if (!this.audioBuffer && !this.isLoadingAudio) {
        void this.loadRealExhaustBuffer();
      }
    } catch (e) {
      // Ignora restrições transitórias
    }
  }

  private async loadRealExhaustBuffer(): Promise<AudioBuffer | null> {
    if (this.audioBuffer) return this.audioBuffer;
    if (!this.ctx) return null;

    try {
      this.isLoadingAudio = true;
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
        } catch {
          // Continua para o próximo
        }
      }
    } catch (e) {
      console.warn('[Spatial Audio] Erro ao carregar áudio real:', e);
    }

    this.isLoadingAudio = false;
    return null;
  }

  public async start(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      await this.prepareContext();
      if (!this.audioBuffer) {
        await this.loadRealExhaustBuffer();
      }

      if (!this.isRunning) {
        this.buildAudioGraph();
        this.isRunning = true;
      }

      this.notify();
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
      this.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.25);

      setTimeout(() => {
        this.teardownNodes();
        this.isRunning = false;
        this.notify();
      }, 300);
    } catch {
      this.teardownNodes();
      this.isRunning = false;
      this.notify();
    }
  }

  public toggleMute(): boolean {
    this.userMuted = !this.userMuted;
    if (this.userMuted) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      }
    } else {
      // Re-avalia imediatamente com a posição atual de scroll
      this.updateProgress(this.currentProgress);
    }
    this.notify();
    return !this.userMuted;
  }

  public isMuted(): boolean {
    return this.userMuted;
  }

  private buildAudioGraph(): void {
    if (!this.ctx) return;
    this.teardownNodes();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Master Gain (inicia silencioso para permitir fade-in via scroll)
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, now);

    // 2. Stereo Panner (efeito surround na curva do tubo)
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.masterGain.connect(this.panner);
      this.panner.connect(ctx.destination);
    } else {
      this.masterGain.connect(ctx.destination);
    }

    // 3. Sub-Bass Boost para impacto nos graves do ronco real
    this.subBoost = ctx.createBiquadFilter();
    this.subBoost.type = 'lowshelf';
    this.subBoost.frequency.setValueAtTime(90, now);
    this.subBoost.gain.setValueAtTime(5.0, now);

    // 4. Pipe Chamber Filter (Simula a acústica metálica interna da tubulação)
    this.pipeFilter = ctx.createBiquadFilter();
    this.pipeFilter.type = 'lowpass';
    this.pipeFilter.frequency.setValueAtTime(8000, now);
    this.pipeFilter.Q.setValueAtTime(1.2, now);

    // 5. Metallic Resonance (Filtro característico de titânio aquecido)
    this.metallicResonance = ctx.createBiquadFilter();
    this.metallicResonance.type = 'peaking';
    this.metallicResonance.frequency.setValueAtTime(1250, now);
    this.metallicResonance.Q.setValueAtTime(2.6, now);
    this.metallicResonance.gain.setValueAtTime(0, now);

    // Cadeia: BufferSource -> subBoost -> pipeFilter -> metallicResonance -> masterGain -> panner -> destination
    this.subBoost.connect(this.pipeFilter);
    this.pipeFilter.connect(this.metallicResonance);
    this.metallicResonance.connect(this.masterGain);

    // Inicia a reprodução contínua do ronco real em loop
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
   * Modula o som real de acordo com a posição da câmera 3D no scroll.
   * Ativa automaticamente quando a câmera começa a entrar e encerra com maestria na saída.
   */
  public updateProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    this.currentProgress = p;

    // Se mutado expressamente pelo usuário ou invisível, mantém em silêncio
    if (this.userMuted || !this.isVisible) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      }
      this.notify();
      return;
    }

    // Auto-início quando entra na faixa ativa (entre 0.15 e 0.84)
    if (!this.isRunning && p >= 0.15 && p <= 0.84) {
      void this.start().then(() => {
        this.updateProgress(p);
      });
      return;
    }

    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dt = Math.max(0.016, now - this.lastScrollTime);
    const delta = Math.abs(p - this.currentProgress);
    const scrollVelocity = Math.min(2.5, delta / dt);
    this.lastScrollTime = now;

    let targetGain = 0.0001;
    let nextZone: AudioZone = 'idle';

    // -------------------------------------------------------------
    // ZONA 0: IDLE (p < 0.16) - Vista Externa Antes de Entrar
    // -------------------------------------------------------------
    if (p < 0.16) {
      nextZone = 'idle';
      targetGain = 0.0001;
      this.pipeFilter?.frequency.setTargetAtTime(9000, now, 0.1);
      this.metallicResonance?.gain.setTargetAtTime(0, now, 0.1);
      this.subBoost?.gain.setTargetAtTime(4.0, now, 0.1);
    }
    // -------------------------------------------------------------
    // ZONA 1: ENTRANDO NO ESCAPE (0.16 <= p < 0.26) - Despertar do Ronco
    // -------------------------------------------------------------
    else if (p >= 0.16 && p < 0.26) {
      nextZone = 'entering';
      const enterT = (p - 0.16) / (0.26 - 0.16);
      // Fade-in progressivo conforme a câmera engole a ponteira de titânio
      targetGain = 0.05 + enterT * 0.88;

      // O ar externo fecha e o grave toma conta
      this.pipeFilter?.frequency.setTargetAtTime(9000 - enterT * 5500, now, 0.08);
      this.pipeFilter?.Q.setTargetAtTime(1.2 + enterT * 1.5, now, 0.08);
      this.metallicResonance?.gain.setTargetAtTime(enterT * 5.0, now, 0.08);
      this.subBoost?.gain.setTargetAtTime(4.5 + enterT * 3.0, now, 0.08);

      // Dinâmica suave de rotação
      const pitchMod = 1.0 + Math.min(0.2, scrollVelocity * 0.08);
      if (this.bufferSource && 'playbackRate' in this.bufferSource) {
        this.bufferSource.playbackRate.setTargetAtTime(pitchMod, now, 0.08);
      }
    }
    // -------------------------------------------------------------
    // ZONA 2: DENTRO DO CANO DE TITÂNIO (0.26 <= p <= 0.68) - "Vai Roncando"
    // -------------------------------------------------------------
    else if (p >= 0.26 && p <= 0.68) {
      nextZone = 'inside';
      targetGain = 0.94;
      const tubeProg = (p - 0.26) / (0.68 - 0.26);

      // Acústica interna de câmara metálica: agudos contidos, ressonância em 1.2kHz
      const tubeCutoff = 2200 - Math.sin(tubeProg * Math.PI) * 700;
      this.pipeFilter?.frequency.setTargetAtTime(tubeCutoff, now, 0.08);
      this.pipeFilter?.Q.setTargetAtTime(3.4, now, 0.08);

      // Ressonância metálica do titânio e pressão nos graves
      this.metallicResonance?.frequency.setTargetAtTime(1150 + tubeProg * 500, now, 0.08);
      this.metallicResonance?.gain.setTargetAtTime(8.0, now, 0.08);
      this.subBoost?.gain.setTargetAtTime(8.0, now, 0.08);

      // Reação orgânica ao scroll: se rola rápido, o motor sobe rotação (rev up)!
      const revMod = 1.0 + Math.min(0.28, scrollVelocity * 0.14);
      if (this.bufferSource && 'playbackRate' in this.bufferSource) {
        this.bufferSource.playbackRate.setTargetAtTime(revMod, now, 0.08);
      }

      // Stereo sweep acompanhando as curvas do duto 3D
      if (this.panner && 'pan' in this.panner) {
        const panSweep = Math.sin(tubeProg * Math.PI * 2) * 0.35;
        this.panner.pan.setTargetAtTime(panSweep, now, 0.08);
      }
    }
    // -------------------------------------------------------------
    // ZONA 3: SAÍDA E ENCERRAMENTO COM MAESTRIA (0.68 < p <= 0.84)
    // -------------------------------------------------------------
    else if (p > 0.68 && p <= 0.84) {
      nextZone = 'exiting';

      // Subfase A (0.68 < p <= 0.74): Válvulas abrem no estúdio com clímax glorioso
      if (p <= 0.74) {
        targetGain = 0.95;
        this.pipeFilter?.frequency.setTargetAtTime(15500, now, 0.06);
        this.pipeFilter?.Q.setTargetAtTime(0.8, now, 0.06);
        this.metallicResonance?.gain.setTargetAtTime(1.5, now, 0.06);
        this.subBoost?.gain.setTargetAtTime(6.0, now, 0.06);
      }
      // Subfase B (0.74 < p <= 0.84): Decaimento maestroso até o silêncio do estúdio
      else {
        const fadeOutProg = (p - 0.74) / (0.84 - 0.74);
        // Decaimento suave com curva acústica
        targetGain = 0.95 * Math.pow(1 - fadeOutProg, 2.2);

        this.pipeFilter?.frequency.setTargetAtTime(12000 - fadeOutProg * 6000, now, 0.08);
        this.subBoost?.gain.setTargetAtTime(5.0 * (1 - fadeOutProg), now, 0.08);
      }

      if (this.panner && 'pan' in this.panner) {
        this.panner.pan.setTargetAtTime(0.0, now, 0.1);
      }
      if (this.bufferSource && 'playbackRate' in this.bufferSource) {
        this.bufferSource.playbackRate.setTargetAtTime(1.0, now, 0.1);
      }
    }
    // -------------------------------------------------------------
    // ZONA 4: SILÊNCIO NO ESTÚDIO (p > 0.84)
    // -------------------------------------------------------------
    else {
      nextZone = 'ended';
      targetGain = 0.0001;
    }

    // Aplica o ganho calculado de forma ultra-suave
    this.masterGain.gain.setTargetAtTime(targetGain, now, 0.05);

    if (nextZone !== this.currentZone) {
      this.currentZone = nextZone;
      this.notify();
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (!visible) {
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.15);
    } else if (!this.userMuted) {
      this.updateProgress(this.currentProgress);
    }
    this.notify();
  }

  private teardownNodes(): void {
    try {
      this.bufferSource?.stop();
      this.bufferSource?.disconnect();
    } catch {}

    this.bufferSource = null;
    this.pipeFilter = null;
    this.metallicResonance = null;
    this.subBoost = null;
    this.masterGain = null;
    this.panner = null;
  }
}

export const spatialAudio = new AutomotiveSpatialAudioEngine();
