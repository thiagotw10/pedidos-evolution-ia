import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Camera, Play, Volume2, VolumeX } from 'lucide-react';
import type { AutomotiveReference } from './AutomotiveStorefront';
import { spatialAudio, type ExhaustAudioStatus } from '../utils/automotiveSpatialAudio';
import './automotive-immersive-intro.css';

const ImmersiveScene = lazy(() => import('./AutomotiveImmersiveScene'));
const chapters = ['Presença', 'Fluxo', 'Assinatura'];
const positions = [0, .43, .88];
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ramp = (p: number, from: number, to: number) => clamp((p - from) / (to - from));

class IntroSceneBoundary extends React.Component<{ children: React.ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

interface Props {
  storeName: string;
  tagline: string;
  accent: string;
  featuredProject: AutomotiveReference | null;
  modelProject: AutomotiveReference | null;
  onOpenProject: (project: AutomotiveReference, tab: 'photos' | 'video') => void;
  onExploreModel: (project: AutomotiveReference) => void;
  soundPaused?: boolean;
}

/** Native scrolling owns the timeline. No wheel interception or page-level animation loop. */
export default function AutomotiveImmersiveIntro({ storeName, tagline, accent, featuredProject, modelProject, onOpenProject, onExploreModel, soundPaused = false }: Props) {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const progressLabel = useRef<HTMLSpanElement>(null);
  const currentPhase = useRef(0);
  const [phase, setPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [shortViewport, setShortViewport] = useState(() => window.matchMedia('(max-height: 600px)').matches);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [realModel, setRealModel] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [near, setNear] = useState(false);
  const [audioStatus, setAudioStatus] = useState<ExhaustAudioStatus>(() => spatialAudio.getStatus());
  const [muted, setMuted] = useState(() => spatialAudio.isMuted());
  const [isSuspended, setIsSuspended] = useState<boolean>(() => spatialAudio.isSuspended());

  const staticMode = reducedMotion || unavailable || shortViewport;
  const image = featuredProject?.images?.[0] || featuredProject?.imageUrl;
  const sceneReady = useCallback(() => setReady(true), []);
  const sceneFailed = useCallback(() => setUnavailable(true), []);
  const modelReady = useCallback((value: boolean) => setRealModel(value), []);

  useEffect(() => spatialAudio.subscribeState(status => {
    setAudioStatus(status); setIsSuspended(spatialAudio.isSuspended()); setMuted(spatialAudio.isMuted());
  }), []);

  useEffect(() => {
    const project = modelProject || featuredProject;
    const source = /corvette|chevrolet/i.test(project?.name || '') ? '/audio/corvette_ronco_real.mp3' : '/audio/porsche_ronco_real.mp3';
    spatialAudio.configure({ source });
  }, [modelProject?.id, featuredProject?.id]);

  useEffect(() => {
    spatialAudio.setPaused(soundPaused || staticMode);
  }, [soundPaused, staticMode]);

  // A real activation gesture unlocks audio; wheel and scroll do not bypass autoplay policy.
  useEffect(() => {
    if (staticMode || soundPaused) return;
    const unlock = (event: Event) => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      spatialAudio.unlockOnUserGesture();
    };
    const events = ['pointerdown', 'touchend', 'click', 'keydown'];
    events.forEach(event => window.addEventListener(event, unlock, { passive: true, capture: true }));
    return () => events.forEach(event => window.removeEventListener(event, unlock, true));
  }, [staticMode, soundPaused]);

  useEffect(() => () => spatialAudio.stop(), []);

  const toggleAudio = () => {
    if (muted || isSuspended || audioStatus === 'error') {
      spatialAudio.setMuted(false); setMuted(false); spatialAudio.unlockOnUserGesture();
    } else {
      spatialAudio.setMuted(true); setMuted(true);
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const short = window.matchMedia('(max-height: 600px)');
    const change = () => { setReducedMotion(media.matches); setShortViewport(short.matches); };
    media.addEventListener('change', change); short.addEventListener('change', change);
    return () => { media.removeEventListener('change', change); short.removeEventListener('change', change); };
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) { setNear(true); spatialAudio.setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      const isIntersecting = entries.some(entry => entry.isIntersecting);
      spatialAudio.setVisible(isIntersecting);
      if (isIntersecting) { setNear(true); }
    }, { rootMargin: '0px' });
    observer.observe(element.firstElementChild || element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let frame = 0;
    let fromScroll = false;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const stageHeight = element.firstElementChild?.clientHeight || window.innerHeight;
      const p = staticMode ? 0 : clamp(-rect.top / Math.max(1, rect.height - stageHeight));
      element.dataset.active = String(rect.bottom > stageHeight * .4 && rect.top < stageHeight);
      progress.current = p;

      // Alimenta continuamente a engine com o scroll e a dinâmica de aceleração
      spatialAudio.updateProgress(p, fromScroll);
      fromScroll = false;

      element.style.setProperty('--intro-p', p.toFixed(4));
      element.style.setProperty('--intro-first', String(1 - ramp(p, .10, .24)));
      element.style.setProperty('--intro-middle', String(ramp(p, .25, .33) * (1 - ramp(p, .57, .66))));
      element.style.setProperty('--intro-last', String(ramp(p, .68, .78)));
      element.style.setProperty('--intro-drift', `${-ramp(p, 0, .24) * 55}px`);
      if (progressLabel.current) progressLabel.current.textContent = `${String(Math.round(p * 100)).padStart(2, '0')}%`;
      const nextPhase = p < .25 ? 0 : p < .68 ? 1 : 2;
      if (nextPhase !== currentPhase.current) { currentPhase.current = nextPhase; setPhase(nextPhase); }
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(update); };
    const scroll = () => { fromScroll = true; request(); };
    const observer = new ResizeObserver(request);
    observer.observe(element);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', request, { passive: true });
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', request); };
  }, [staticMode]);

  const goToChapter = (index: number) => {
    const element = root.current;
    if (!element) return;
    const stageHeight = element.firstElementChild?.clientHeight || window.innerHeight;
    const top = window.scrollY + element.getBoundingClientRect().top;
    window.scrollTo({ top: top + positions[index] * (element.offsetHeight - stageHeight), behavior: reducedMotion ? 'instant' : 'smooth' });
  };

  return <section ref={root} className={`auto-immersion ${staticMode ? 'is-static' : ''} ${ready ? 'is-ready' : ''}`} aria-label={`Experiência de performance da ${storeName}`}>
    <div className="auto-immersion-stage">
      <div className="auto-immersion-backdrop" aria-hidden="true">
        {image && !imageFailed && <img src={image} alt="" fetchPriority="high" onError={() => setImageFailed(true)} />}
      </div>
      {!staticMode && near && <div className="auto-immersion-canvas" aria-hidden="true">
        <IntroSceneBoundary onError={sceneFailed}><Suspense fallback={null}>
          <ImmersiveScene progress={progress} accent={accent} model={modelProject?.model3d} onReady={sceneReady} onUnavailable={sceneFailed} onModelReady={modelReady} />
        </Suspense></IntroSceneBoundary>
      </div>}
      <div className="auto-immersion-vignette" aria-hidden="true" />
      <div className="auto-immersion-topline">
        <span><i /> {tagline}</span>
        <div className="auto-immersion-topline-right">
          {!staticMode && <button type="button" className={`auto-immersion-audio-btn ${muted ? 'is-muted' : !isSuspended ? 'is-active' : ''}`} onClick={toggleAudio} aria-pressed={audioStatus === 'ready'} aria-label={audioStatus === 'error' ? 'Tentar carregar o som novamente' : muted || isSuspended ? 'Ativar som imersivo' : 'Silenciar som imersivo'} title="Ronco interativo: acelere ao rolar e desacelere ao parar">
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}<span>{audioStatus === 'loading' ? 'Carregando som' : audioStatus === 'error' ? 'Tentar som' : muted ? 'Som desligado' : isSuspended ? 'Ativar som' : 'Som ativo'}</span>
          </button>}
          <a href="#auto-engineering">Pular abertura <ArrowUpRight size={14} /></a>
        </div>
      </div>

      <div className="auto-immersion-copy auto-immersion-first" inert={phase !== 0} aria-hidden={phase !== 0}>
        <p className="auto-immersion-overline">MAIS DO QUE OUVIR.</p>
        <h1>O RONCO<br />COMEÇA<br /><em>AQUI.</em></h1>
        <p className="auto-immersion-description">{staticMode ? <>Do acabamento ao ronco.<br />Descubra a sua próxima assinatura.</> : <>Role para entrar. Acelere o som.<br />Pare e sinta o giro baixar.</>}</p>
        <div className="auto-immersion-actions">
          <a className="auto-btn auto-btn-primary" href="#project-form">Criar meu projeto <ArrowUpRight size={17} /></a>
          {featuredProject?.videoUrl && <button className="auto-immersion-sound" type="button" onClick={() => onOpenProject(featuredProject, 'video')}><Play size={13} fill="currentColor" /> Ouvir um projeto real</button>}
        </div>
      </div>

      <div className="auto-immersion-copy auto-immersion-middle" inert={phase !== 1} aria-hidden={phase !== 1}>
        <p className="auto-immersion-overline">02 / SIGA O FLUXO</p>
        <h2>POR DENTRO<br />DA <em>SENSAÇÃO.</em></h2>
        <p className="auto-immersion-description">O caminho do fluxo.<br />A presença do som. A sua personalidade.</p>
      </div>

      {phase === 1 && isSuspended && !muted && !staticMode && (
        <button
          type="button"
          className="auto-immersion-unlock-pill"
          onClick={() => spatialAudio.unlockOnUserGesture()}
          aria-label="Liberar áudio do motor"
        >
          <Volume2 size={14} />
          <span>Toque para ativar o ronco</span>
        </button>
      )}

      <div className="auto-immersion-copy auto-immersion-last" inert={phase !== 2} aria-hidden={phase !== 2}>
        <p className="auto-immersion-overline">03 / SUA PRÓXIMA ASSINATURA</p>
        <h2>CADA CURVA.<br />UMA <em>INTENÇÃO.</em></h2>
        <p className="auto-immersion-description">Do primeiro detalhe ao último acorde.<br />Um projeto que faz sentido para o seu carro.</p>
        <div className="auto-immersion-actions">
          <a className="auto-btn auto-btn-primary" href="#auto-engineering" onClick={() => { if (modelProject && realModel) onExploreModel(modelProject); }}>Explore a engenharia <ArrowDown size={17} /></a>
          <a className="auto-immersion-text-link" href="#auto-projects">Projetos reais <ArrowUpRight size={15} /></a>
        </div>
      </div>

      {featuredProject && image && !imageFailed && <button className="auto-immersion-project" type="button" inert={phase !== 0} aria-hidden={phase !== 0} onClick={() => onOpenProject(featuredProject, 'photos')}>
        <img src={image} alt="" /><span><small>DA NOSSA GARAGEM</small><strong>{featuredProject.name}</strong><span>Ver projeto <Camera size={12} /></span></span>
      </button>}
      <p className="auto-immersion-model-caption" aria-hidden={phase !== 2}>{realModel && modelProject ? <><span>PROJETO EM CENA</span>{modelProject.name}</> : <><span>EXPERIÊNCIA CONCEITUAL</span>Inspiração para a sua próxima transformação.</>}</p>

      <div className="auto-immersion-bottom">
        <button type="button" className="auto-immersion-scroll" onClick={() => { if (phase === 2) document.getElementById('auto-engineering')?.scrollIntoView({ behavior: 'smooth' }); else goToChapter(phase + 1); }}><span className="auto-immersion-scroll-icon"><ArrowDown size={15} /></span><span>ROLE PARA<br /><strong>{phase === 2 ? 'CONTINUAR' : 'SENTIR'}</strong></span></button>
        <nav className="auto-immersion-chapters" aria-label="Etapas da experiência">{chapters.map((chapter, index) => <button type="button" key={chapter} aria-current={phase === index ? 'step' : undefined} onClick={() => goToChapter(index)}><span>0{index + 1}</span>{chapter}</button>)}</nav>
        <span className="auto-immersion-progress" ref={progressLabel} aria-hidden="true">00%</span>
      </div>
      <div className="auto-immersion-track" aria-hidden="true"><span /></div>
    </div>
  </section>;
}
