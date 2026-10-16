/**
 * Automotive 3D Spatial Audio Engine (Real Flow Garage Exhaust Acoustics)
 * ---------------------------------------------------------------------------------
 * Comportamento 100% automático guiado pelo scroll:
 * 
 * 1. Desbloqueio transparente no primeiro toque ou movimento do usuário (Autoplay policy).
 * 2. Fora do escapamento (p < 0.16 ou p > 0.84): Silêncio absoluto.
 * 3. Entrada na boca do escape (0.16 <= p < 0.18): O motor desperta suavemente.
 * 4. Por dentro do duto de titânio (0.18 <= p <= 0.68):
 *    - ROLANDO O SCROLL: O motor ACELERA com giro alto, volume forte e ressonância metálica ("vai roncando").
 *    - PAROU DE ROLAR: O motor cai imediatamente para MARCHA LENTA (idle grave, cadenciado e calmo no fundo do cano).
 *    - VOLTOU A ROLAR: Acelera novamente no mesmo instante!
 * 5. Saída do duto (0.68 < p <= 0.84): "Encerra com maestria" — abertura de válvulas e decaimento acústico sublime até silenciar no estúdio.
 */

class AutomotiveSpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private unlocked: boolean = false;
  private isVisible: boolean = true;
  private audioBuffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private isLoadingAudio: boolean = false;

  // Audio Processing Nodes
  private masterGain: GainNode | null = null;
  private panner: StereoPannerNode | PannerNode | null = null;
  private pipeFilter: BiquadFilterNode | null = null;
  private metallicResonance: BiquadFilterNode | null = null;
  private subBoost: BiquadFilterNode | null = null;

  // Real-time Throttle / Scroll Dynamics
  private currentProgress: number = 0;
  private lastScrollTimestamp: number = 0;
  private scrollVelocity: number = 0;
  private accelAmount: number = 0; // 0.0 = marcha lenta (idle), 1.0 = aceleração plena
  private animationFrameId: number | null = null;

  private listeners = new Set<(isSuspended: boolean) => void>();

  public isSupported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  public isSuspended(): boolean {
    if (!this.ctx) return true;
    return this.ctx.state === 'suspended';
  }

  public subscribe(listener: (isSuspended: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.isSuspended());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const suspended = this.isSuspended();
    this.listeners.forEach(fn => fn(suspended));
  }

  /**
   * Chamado no primeiríssimo gesto do usuário (touch, pointer, click, keydown).
   * Desbloqueia o AudioContext permanentemente no iOS Safari e Chrome macOS/Android.
   */
  public unlockOnUserGesture(): void {
    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioContextClass();
      }

      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().then(() => {
          this.notify();
        });
      }

      void this.start().then(() => {
        this.notify();
      });
    } catch (e) {
      console.warn('[Spatial Audio] Erro ao desbloquear:', e);
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
      console.warn('[Spatial Audio] Erro ao carregar áudio:', e);
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

      if (!this.audioBuffer) {
        await this.loadRealExhaustBuffer();
      }

      if (!this.isRunning && this.audioBuffer) {
        this.buildAudioGraph();
        this.isRunning = true;
        this.startDynamicsTicker();
      }

      return true;
    } catch (e) {
      console.warn('[Spatial Audio] Falha ao iniciar engine:', e);
      return false;
    }
  }

  private buildAudioGraph(): void {
    if (!this.ctx) return;
    this.teardownNodes();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Master Gain (inicia em silêncio absoluto)
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, now);

    // 2. Stereo Panner (efeito surround na curvatura do tubo)
    if (ctx.createStereoPanner) {
      this.panner = ctx.createStereoPanner();
      this.masterGain.connect(this.panner);
      this.panner.connect(ctx.destination);
    } else {
      this.masterGain.connect(ctx.destination);
    }

    // 3. Sub-Bass Boost (pressão nos graves de 80Hz)
    this.subBoost = ctx.createBiquadFilter();
    this.subBoost.type = 'lowshelf';
    this.subBoost.frequency.setValueAtTime(80, now);
    this.subBoost.gain.setValueAtTime(6.0, now);

    // 4. Pipe Chamber Filter (Simula o isolamento e reflexões do tubo de titânio)
    this.pipeFilter = ctx.createBiquadFilter();
    this.pipeFilter.type = 'lowpass';
    this.pipeFilter.frequency.setValueAtTime(2200, now);
    this.pipeFilter.Q.setValueAtTime(2.8, now);

    // 5. Metallic Resonance (Filtro característico do metal sob pressão)
    this.metallicResonance = ctx.createBiquadFilter();
    this.metallicResonance.type = 'peaking';
    this.metallicResonance.frequency.setValueAtTime(1250, now);
    this.metallicResonance.Q.setValueAtTime(3.0, now);
    this.metallicResonance.gain.setValueAtTime(5.0, now);

    // Conexões: Buffer -> subBoost -> pipeFilter -> metallicResonance -> masterGain -> panner -> destination
    this.subBoost.connect(this.pipeFilter);
    this.pipeFilter.connect(this.metallicResonance);
    this.metallicResonance.connect(this.masterGain);

    // Inicia reprodução contínua em loop
    if (this.audioBuffer) {
      this.bufferSource = ctx.createBufferSource();
      this.bufferSource.buffer = this.audioBuffer;
      this.bufferSource.loop = true;
      this.bufferSource.playbackRate.setValueAtTime(0.85, now);
      this.bufferSource.connect(this.subBoost);
      this.bufferSource.start(now);
    }
  }

  /**
   * Atualizado a cada evento de scroll da página.
   * Calcula velocidade e registra timestamp de atividade.
   */
  public updateProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const now = performance.now();
    const dt = Math.max(16, now - this.lastScrollTimestamp);
    const delta = Math.abs(p - this.currentProgress);

    // Velocidade normalizada de rolagem
    this.scrollVelocity = Math.min(3.0, (delta / (dt / 1000)) * 0.8);
    this.lastScrollTimestamp = now;
    this.currentProgress = p;

    // Se ainda não estava tocando e entrou na área de interesse, certifica-se de inicializar
    if (!this.isRunning && p >= 0.15 && p <= 0.84) {
      void this.start();
    }
  }

  /**
   * Loop de dinâmica contínua (60fps) que orquestra a aceleração e marcha lenta.
   */
  private startDynamicsTicker(): void {
    if (this.animationFrameId) return;

    const tick = () => {
      this.animationFrameId = requestAnimationFrame(tick);
      if (!this.isRunning || !this.ctx || !this.masterGain) return;

      const nowPerf = performance.now();
      const ctxNow = this.ctx.currentTime;
      const timeSinceScroll = nowPerf - this.lastScrollTimestamp;
      const isActivelyScrolling = timeSinceScroll < 160;

      const p = this.currentProgress;
      const isInsidePipe = p >= 0.18 && p <= 0.68;
      const isEntering = p >= 0.16 && p < 0.18;
      const isExiting = p > 0.68 && p <= 0.84;

      if (!this.isVisible) {
        this.masterGain.gain.setTargetAtTime(0.0001, ctxNow, 0.1);
        return;
      }

      // -----------------------------------------------------------------
      // CASO 1: DENTRO DO ESCAPE (0.18 <= p <= 0.68)
      // Rolando: Acelera o carro (giro sobe, ganho pleno, agudos abrem).
      // Parado: Marcha lenta (giro baixo cadenciado, volume reduzido, borbulho grave).
      // -----------------------------------------------------------------
      if (isInsidePipe) {
        // Alvo de aceleração: se está rolando, calcula com base na velocidade (0.5 a 1.0)
        // Se parou o dedo/scroll, alvo é 0.0 (marcha lenta)
        const targetAccel = isActivelyScrolling 
          ? Math.min(1.0, 0.55 + this.scrollVelocity * 0.45) 
          : 0.0;

        // Ataque rápido ao começar a rolar (0.24), decaimento macio ao parar (0.09)
        const smoothing = targetAccel > this.accelAmount ? 0.24 : 0.09;
        this.accelAmount += (targetAccel - this.accelAmount) * smoothing;

        // 1. Rotação do Motor (RPM):
        // Marcha lenta: 0.83x (grave cadenciado)
        // Acelerando: até 1.32x (gás aberto, giro cortando alto!)
        const targetPlayback = 0.83 + this.accelAmount * 0.49;
        if (this.bufferSource && 'playbackRate' in this.bufferSource) {
          this.bufferSource.playbackRate.setTargetAtTime(targetPlayback, ctxNow, 0.05);
        }

        // 2. Volume no Tubo:
        // Marcha lenta: 0.35 (carro roncando calmo no fundo do cano)
        // Acelerando: 0.96 (pressão e presença máxima)
        const targetGain = 0.35 + this.accelAmount * 0.61;
        this.masterGain.gain.setTargetAtTime(targetGain, ctxNow, 0.04);

        // 3. Timbre e Filtros Metálicos de Titânio:
        const tubeProg = (p - 0.18) / (0.68 - 0.18);
        const baseCutoff = 1700 - Math.sin(tubeProg * Math.PI) * 500;
        const targetCutoff = baseCutoff + this.accelAmount * 1800; // abre mais rasp e estalos de combustão
        this.pipeFilter?.frequency.setTargetAtTime(targetCutoff, ctxNow, 0.05);
        this.pipeFilter?.Q.setTargetAtTime(3.2, ctxNow, 0.05);

        // Sub-grave pesado na marcha lenta (8.5dB) e vibrante na aceleração (6.0dB)
        this.subBoost?.gain.setTargetAtTime(8.5 - this.accelAmount * 2.5, ctxNow, 0.05);

        // Ressonância metálica de parede de titânio
        this.metallicResonance?.frequency.setTargetAtTime(1150 + tubeProg * 500, ctxNow, 0.05);
        this.metallicResonance?.gain.setTargetAtTime(4.0 + this.accelAmount * 4.5, ctxNow, 0.05);

        // Panning estéreo acompanhando as curvas do duto 3D
        if (this.panner && 'pan' in this.panner) {
          const panSweep = Math.sin(tubeProg * Math.PI * 2) * 0.35;
          this.panner.pan.setTargetAtTime(panSweep, ctxNow, 0.06);
        }
      }
      // -----------------------------------------------------------------
      // CASO 2: ENTRANDO NO ESCAPE (0.16 <= p < 0.18)
      // Despertar progressivo conforme a câmera embica na ponteira
      // -----------------------------------------------------------------
      else if (isEntering) {
        this.accelAmount = 0.1;
        const enterT = (p - 0.16) / (0.18 - 0.16);
        const targetGain = 0.02 + enterT * 0.33;
        this.masterGain.gain.setTargetAtTime(targetGain, ctxNow, 0.06);

        if (this.bufferSource && 'playbackRate' in this.bufferSource) {
          this.bufferSource.playbackRate.setTargetAtTime(0.85, ctxNow, 0.06);
        }
        this.pipeFilter?.frequency.setTargetAtTime(4500 - enterT * 2500, ctxNow, 0.06);
      }
      // -----------------------------------------------------------------
      // CASO 3: SAÍDA COM MAESTRIA (0.68 < p <= 0.84)
      // Abertura de válvulas no estúdio e decaimento acústico magistral
      // -----------------------------------------------------------------
      else if (isExiting) {
        const exitProg = (p - 0.68) / (0.84 - 0.68);

        // Primeiros 25% da saída: válvulas abertas e agudos cristalinos
        if (exitProg < 0.25) {
          this.pipeFilter?.frequency.setTargetAtTime(15500, ctxNow, 0.05);
          this.masterGain.gain.setTargetAtTime(0.95, ctxNow, 0.05);
          if (this.bufferSource && 'playbackRate' in this.bufferSource) {
            this.bufferSource.playbackRate.setTargetAtTime(1.05, ctxNow, 0.05);
          }
        } 
        // 75% restantes: decaimento suave até o silêncio da apresentação de estúdio
        else {
          const fadeOutT = (exitProg - 0.25) / 0.75;
          const targetGain = 0.95 * Math.pow(1 - fadeOutT, 2.4);
          this.masterGain.gain.setTargetAtTime(targetGain, ctxNow, 0.06);

          this.pipeFilter?.frequency.setTargetAtTime(12000 - fadeOutT * 7000, ctxNow, 0.06);
          if (this.bufferSource && 'playbackRate' in this.bufferSource) {
            this.bufferSource.playbackRate.setTargetAtTime(0.95 - fadeOutT * 0.15, ctxNow, 0.06);
          }
        }

        if (this.panner && 'pan' in this.panner) {
          this.panner.pan.setTargetAtTime(0.0, ctxNow, 0.08);
        }
      }
      // -----------------------------------------------------------------
      // CASO 4: FORA DO CANO (p < 0.16 ou p > 0.84)
      // Silêncio limpo e transparente
      // -----------------------------------------------------------------
      else {
        this.accelAmount = 0;
        this.masterGain.gain.setTargetAtTime(0.0001, ctxNow, 0.08);
      }
    };

    this.animationFrameId = requestAnimationFrame(tick);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (!this.ctx || !this.masterGain) return;
    if (!visible) {
      this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
    }
  }

  public stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.teardownNodes();
    this.isRunning = false;
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
