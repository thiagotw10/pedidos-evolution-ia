import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { 
  ArrowUpRight,
  ArrowDown,
  Check, 
  ShieldCheck, 
  Play, 
  Volume2, 
  Camera, 
  MessageCircle, 
  ChevronLeft, 
  ChevronRight, 
  Flame, 
  Maximize2, 
  X, 
  CheckCircle2, 
  Send,
  Box
} from 'lucide-react';
import { getThemeFromStore } from '../utils/automotiveThemes';
import type { AutomotiveModel3D } from '../../functions/src/automotiveModel3d';
import { DealershipRouteScrollytelling } from './DealershipRouteScrollytelling';
import './automotive-storefront.css';
import AutomotiveImmersiveIntro from './AutomotiveImmersiveIntro';

const AutomotiveExhaustScene = lazy(() => import('./AutomotiveExhaustScene'));
const AutomotiveProjectModelScene = lazy(() => import('./AutomotiveProjectModelScene'));

const expandHex = (color: string) => /^#[0-9a-f]{3}$/i.test(color) ? '#' + color.slice(1).split('').map(c => c + c).join('') : color;

class AutomotiveSceneBoundary extends React.Component<{ children: React.ReactNode; image?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="auto-scene-unavailable">{this.props.image && <img src={this.props.image} alt="Projeto real da loja" loading="lazy" />}<p role="status">A experiência 3D não está disponível agora. Explore as fotos e os vídeos dos projetos abaixo.</p></div>;
  }
}

export type AutomotiveReference = { 
  id: string; 
  name: string; 
  description?: string; 
  imageUrl?: string; 
  images?: string[]; 
  videoUrl?: string; 
  model3d?: AutomotiveModel3D | null;
  category?: string;
  price?: number;
};

interface AutomotiveStorefrontProps {
  store: { 
    id: string; 
    name: string; 
    phone?: string; 
    description?: string;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
    operatingHours?: string;
    logoUrl?: string;
    brandColor?: string;
    themePreset?: string;
    tagline?: string;
    brandTheme?: { preset?: string; primaryColor?: string; secondaryColor?: string; tagline?: string; };
  }; 
  products: AutomotiveReference[];
}

export function AutomotiveStorefront({ store, products }: AutomotiveStorefrontProps) {
  const configuredTheme = getThemeFromStore(store);
  const theme = { ...configuredTheme, primary: expandHex(configuredTheme.primary), accent: expandHex(configuredTheme.accent) };
  const accent = theme.primary;
  const rgb = /^#[0-9a-f]{6}$/i.test(accent) ? [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16)) : [91, 132, 255];
  const linear = rgb.map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  const onAccent = (luminance + .05) / .0527 >= 1.05 / (luminance + .05) ? '#08090b' : '#ffffff';
  const storefrontRef = useRef<HTMLDivElement>(null);
  const engineeringRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sceneReady, setSceneReady] = useState(false);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${store.name} | ${store.tagline || store.brandTheme?.tagline || 'Escapamentos & Performance'}`;
    return () => { document.title = previousTitle; };
  }, [store.name, store.tagline, store.brandTheme?.tagline]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  // Card image slider state map: { [productId]: currentImageIndex }
  const [cardSliderIndices, setCardSliderIndices] = useState<Record<string, number>>({});
  
  // Lightbox Modal state
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    product: AutomotiveReference | null;
    activeTab: 'photos' | 'video' | 'model';
    photoIndex: number;
  }>({
    isOpen: false,
    product: null,
    activeTab: 'photos',
    photoIndex: 0
  });

  // Hero showcase project
  const featuredProduct = products.find(p => p.videoUrl) || products[0] || null;
  const modelProjects = products.filter(product => product.model3d?.url);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const activeModelProject = modelProjects.find(product => product.id === activeModelId) || modelProjects[0] || null;

  // Load the 3D chunk near its section; other storefront niches do not load it.
  useEffect(() => {
    const element = engineeringRef.current;
    if (!element || sceneReady) return;
    if (!('IntersectionObserver' in window)) { setSceneReady(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setSceneReady(true); observer.disconnect(); }
    }, { rootMargin: '350px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sceneReady]);

  // Native reveal animations keep scrolling and all existing controls available.
  useEffect(() => {
    const root = storefrontRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!root || reduced.matches || !('IntersectionObserver' in window)) return;
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (reduced.matches || !('animate' in entry.target)) return;
        const animation = entry.target.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation)).catch(() => {});
      });
    }, { threshold: .08 });
    root.querySelectorAll('[data-auto-reveal]').forEach(element => observer.observe(element));
    const stopMotion = () => { if (reduced.matches) animations.forEach(animation => animation.finish()); };
    reduced.addEventListener('change', stopMotion);
    return () => { observer.disconnect(); reduced.removeEventListener('change', stopMotion); animations.forEach(animation => animation.cancel()); };
  }, [activeCategory, products.length]);

  // Modal focus is trapped and restored; videos still begin only after a click.
  useEffect(() => {
    if (!lightbox.isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('[data-auto-close]')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], video[controls], input, [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', trapFocus); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [lightbox.isOpen]);

  // Form state
  const [form, setForm] = useState({ 
    customerName: '', 
    phone: '', 
    brand: 'Porsche', 
    model: '', 
    year: '', 
    version: '', 
    modifications: '', 
    objective: '', 
    cep: '', 
    delivery: 'Envio nacional' 
  });
  const [busy, setBusy] = useState(false); 
  const [error, setError] = useState(''); 
  const [result, setResult] = useState<{ id: string; whatsappUrl: string } | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  // Clean phone number for WhatsApp links
  const cleanPhone = (store.phone || '').replace(/\D/g, '');
  const waNumber = cleanPhone.startsWith('55') ? cleanPhone : (cleanPhone ? `55${cleanPhone}` : '');

  const getWhatsAppLink = (customText?: string) => {
    if (!waNumber) return '#project-form';
    const text = customText || `Olá! Estava no site da ${store.name} e gostaria de tirar dúvidas e solicitar um orçamento para o meu carro.`;
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  };

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightbox.isOpen || !lightbox.product) return;
      if (e.key === 'Escape') {
        setLightbox(prev => ({ ...prev, isOpen: false }));
      } else if (e.key === 'ArrowRight' && lightbox.activeTab === 'photos') {
        const imgs = getProductImages(lightbox.product);
        if (!imgs.length) return;
        setLightbox(prev => ({ ...prev, photoIndex: (prev.photoIndex + 1) % imgs.length }));
      } else if (e.key === 'ArrowLeft' && lightbox.activeTab === 'photos') {
        const imgs = getProductImages(lightbox.product);
        if (!imgs.length) return;
        setLightbox(prev => ({ ...prev, photoIndex: (prev.photoIndex - 1 + imgs.length) % imgs.length }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox]);

  const getProductImages = (prod: AutomotiveReference): string[] => {
    if (prod.images && Array.isArray(prod.images) && prod.images.length > 0) {
      return prod.images;
    }
    return prod.imageUrl ? [prod.imageUrl] : [];
  };

  const handleCardSlider = (productId: string, direction: 'prev' | 'next', total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardSliderIndices(prev => {
      const current = prev[productId] || 0;
      const next = direction === 'next' 
        ? (current + 1) % total 
        : (current - 1 + total) % total;
      return { ...prev, [productId]: next };
    });
  };

  const openLightbox = (product: AutomotiveReference, initialTab: 'photos' | 'video' | 'model' = 'photos', initialPhotoIndex = 0) => {
    setLightbox({
      isOpen: true,
      product,
      activeTab: initialTab,
      photoIndex: initialPhotoIndex
    });
  };

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
  const filteredProducts = activeCategory === 'all' 
    ? products 
    : products.filter(p => p.category === activeCategory);

  const field = (key: keyof typeof form, label: string, required = false, placeholder = '') => (
    <label className="block text-xs sm:text-sm font-medium text-slate-300">
      <span className="flex items-center justify-between">
        <span>{label} {required && <span className="text-orange-400">*</span>}</span>
      </span>
      <input 
        required={required} 
        placeholder={placeholder}
        maxLength={key === 'objective' || key === 'modifications' ? 600 : 100} 
        value={form[key]} 
        onChange={e => setForm({ ...form, [key]: e.target.value })} 
        className="mt-1.5 block w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-3 text-base sm:text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition shadow-inner" 
      />
    </label>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault(); 
    setBusy(true); 
    setError('');
    try {
      const response = await fetch(`/api/public/automotive/${encodeURIComponent(store.id)}/projects`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ ...form, referenceIds: selected, requestId }) 
      });
      const data = await response.json(); 
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar a solicitação.'); 
      setResult(data);
    } catch (e) { 
      setError(e instanceof Error ? e.message : 'Falha ao enviar. Tente novamente.'); 
    } finally { 
      setBusy(false); 
    }
  }

  const featuredImages = featuredProduct ? getProductImages(featuredProduct) : [];

  return (
    <div ref={storefrontRef} id="auto-top" className="auto-storefront" style={{ '--auto-accent': accent, '--auto-accent-rgb': rgb.join(', '), '--auto-on-accent': onAccent } as React.CSSProperties}>
      <header className="auto-header">
        <a className="auto-brand" href="#auto-top" aria-label={`${store.name} — início`}>
          {store.logoUrl ? <img src={store.logoUrl} alt="" /> : <span className="auto-brand-symbol"><Flame size={23} strokeWidth={1.5} /></span>}
          <span className="auto-brand-name">{store.name}<small>{store.tagline || store.brandTheme?.tagline || 'Escapamentos & Performance'}</small></span>
        </a>
        <nav className="auto-header-nav" aria-label="Navegação da vitrine">
          <a href="#auto-engineering">Explore em 3D</a>
          <a href="#auto-projects">Projetos reais</a>
          <a href="#auto-route">Rota até a loja</a>
        </nav>
        <div className="auto-header-actions">
          <a className="auto-header-whatsapp" href={getWhatsAppLink()} target="_blank" rel="noopener noreferrer" aria-label="Conversar com a loja no WhatsApp"><MessageCircle size={19} /><span>Fale com a garagem</span></a>
          <a className="auto-btn auto-btn-primary auto-header-cta" href="#project-form">Seu projeto <ArrowUpRight size={16} /></a>
        </div>
      </header>

      <main className="auto-main">
        <AutomotiveImmersiveIntro
          storeName={store.name}
          tagline={store.tagline || store.brandTheme?.tagline || 'Escapamentos & Performance'}
          accent={theme.primary}
          featuredProject={featuredProduct}
          modelProject={modelProjects[0] || null}
          onOpenProject={openLightbox}
          onExploreModel={project => setActiveModelId(project.id)}
          soundPaused={lightbox.isOpen}
        />

        <div className="auto-editorial-strip" aria-hidden="true"><span>ENGENHARIA</span><i>✳</i><span>PERSONALIDADE</span><i>✳</i><span>ACÚSTICA</span><i>✳</i><span>ACABAMENTO</span><i>✳</i><span>PERFORMANCE</span></div>

        <section id="auto-engineering" className="auto-engineering auto-section" aria-labelledby="auto-engineering-title">
          <div className="auto-section-heading" data-auto-reveal>
            <div><p className="auto-eyebrow">01 / CADA DETALHE IMPORTA</p><h2 id="auto-engineering-title">POR DENTRO<br /><span>DA PERFORMANCE.</span></h2></div>
            <p>{activeModelProject ? 'Cada projeto tem sua própria forma. Escolha um escapamento, explore a composição em 3D e compare com as fotos da oficina.' : 'Forma, material e conexões. Explore uma composição de escapamento em 3D, gire a peça e descubra o que existe por trás do próximo ronco.'}</p>
          </div>
          {modelProjects.length > 0 && <div className="auto-model-selector" role="group" aria-label="Escolher projeto para explorar em 3D">
            {modelProjects.map(project => <button type="button" key={project.id} aria-pressed={activeModelProject?.id === project.id} onClick={() => setActiveModelId(project.id)}>
              {(project.imageUrl || project.images?.[0]) && <img src={project.imageUrl || project.images?.[0]} alt="" loading="lazy" />}
              <span><small>{project.category || 'PROJETO'}</small>{project.name}</span><Box size={18} aria-hidden="true" />
            </button>)}
          </div>}
          <div ref={engineeringRef} className="auto-engineering-mount">
            {sceneReady ? <AutomotiveSceneBoundary key={`${store.id}-${activeModelProject?.model3d?.url || 'illustrative'}`} image={activeModelProject?.imageUrl || featuredImages[0]}><Suspense fallback={<div className="auto-scene-loading"><span className="auto-status-dot" /> Preparando a experiência 3D…</div>}>{activeModelProject?.model3d ? <AutomotiveProjectModelScene key={activeModelProject.model3d.url} accent={theme.primary} model={activeModelProject.model3d} projectName={activeModelProject.name} fallbackImage={activeModelProject.imageUrl || activeModelProject.images?.[0]} /> : <AutomotiveExhaustScene accent={theme.primary} fallbackImage={featuredImages[0]} />}</Suspense></AutomotiveSceneBoundary> : <div className="auto-scene-loading"><span className="auto-status-dot" /> Uma nova perspectiva do seu próximo projeto</div>}
          </div>
          {activeModelProject && <div className="auto-model-reference-links">
            <span>{activeModelProject.name}</span>
            <button type="button" onClick={() => {
              const images = getProductImages(activeModelProject);
              const referenceIndex = images.indexOf(activeModelProject.model3d?.referenceImages?.[0] || '');
              openLightbox(activeModelProject, 'photos', Math.max(0, referenceIndex));
            }}><Camera size={14} /> Comparar com as fotos</button>
            {activeModelProject.videoUrl && <button type="button" onClick={() => openLightbox(activeModelProject, 'video')}><Play size={13} /> Ouvir este projeto</button>}
          </div>}
        </section>

        {/* WORKFLOW STEPS BAR */}
        <div className="auto-workflow grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 border-y border-white/10 py-6 sm:py-8 my-6 sm:my-8 w-full">
          <div className="flex items-start gap-3.5">
            <span className="text-2xl sm:text-3xl font-black font-mono shrink-0" style={{ color: theme.primary }}>01</span>
            <div>
              <h4 className="font-bold text-white text-sm sm:text-base">Conte sobre seu veículo</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Marca, modelo, motor e o que você busca de ronco e estética.</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <span className="text-2xl sm:text-3xl font-black font-mono shrink-0" style={{ color: theme.primary }}>02</span>
            <div>
              <h4 className="font-bold text-white text-sm sm:text-base">Receba análise técnica</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Nossa equipe e IA analisam compatibilidade e opções sob medida.</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <span className="text-2xl sm:text-3xl font-black font-mono shrink-0" style={{ color: theme.primary }}>03</span>
            <div>
              <h4 className="font-bold text-white text-sm sm:text-base">Aprove sua proposta</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Defina acabamento, ponteiras e envio nacional ou instalação.</p>
            </div>
          </div>
        </div>

        {/* SOUND EXPERIENCE CALLOUT */}
        {featuredProduct?.videoUrl && (
          <section 
            className="auto-sound my-8 sm:my-10 rounded-2xl sm:rounded-3xl border bg-gradient-to-b sm:bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-black p-5 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 sm:gap-6 relative overflow-hidden shadow-2xl"
            style={{ borderColor: `${theme.primary}40` }}
          >
            <div className="flex items-start sm:items-center gap-3.5 sm:gap-5">
              <div 
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border flex items-center justify-center shrink-0 animate-pulse"
                style={{ backgroundColor: `${theme.primary}20`, borderColor: `${theme.primary}40`, color: theme.primary }}
              >
                <Volume2 size={24} className="sm:w-7 sm:h-7" />
              </div>
              <div>
                <span className="text-[10px] sm:text-xs font-black tracking-wider uppercase" style={{ color: theme.primary }}>02 / O SOM DO PROJETO REAL</span>
                <h3 className="text-lg sm:text-2xl font-black text-white leading-tight">NÃO É SÓ PARA VER. É PARA SENTIR.</h3>
                <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
                  Ouça o vídeo de {featuredProduct.name}. Depois, conte para a equipe o que você busca para o seu carro.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 w-full md:w-auto">
              <button
                onClick={() => openLightbox(featuredProduct, 'video')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl text-black font-extrabold px-5 py-3 text-xs sm:text-sm shadow-xl transition active:scale-95"
                style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
              >
                <Play size={14} className="fill-black" />
                <span>Ouvir Ronco Agora</span>
              </button>
              <a
                href={getWhatsAppLink(`Olá! Quero ouvir o ronco do projeto ${featuredProduct.name} pelo WhatsApp!`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold px-4 py-3 text-xs sm:text-sm transition active:scale-95"
              >
                <MessageCircle size={15} />
                <span>Pedir no WhatsApp</span>
              </a>
            </div>
          </section>
        )}

        {/* PROJECTS & REFERENCES CATALOG */}
        <section id="auto-projects" className="auto-projects" aria-label="Portfólio de projetos">
          <div className="auto-projects-heading flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 w-full min-w-0" data-auto-reveal>
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider block mb-1" style={{ color: theme.primary }}>
                03 / PROJETOS COM PERSONALIDADE
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight break-words">CADA CARRO, UMA ASSINATURA.</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 sm:mt-2 max-w-2xl leading-relaxed">
                Navegue pelas fotos dos projetos e escute o ronco. Nossa equipe e nossa IA confirmarão aplicação, materiais e orçamento sob medida.
              </p>
            </div>

            {/* Category Filter Pills */}
            {categories.length > 0 && (
              <div className="auto-project-filters w-full sm:w-auto max-w-full overflow-x-auto no-scrollbar pb-2 pt-1 scroll-smooth min-w-0">
                <div className="inline-flex items-center gap-2">
                  <button
                    onClick={() => setActiveCategory('all')}
                    aria-pressed={activeCategory === 'all'}
                    className={`text-xs font-bold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border transition whitespace-nowrap active:scale-95 ${
                      activeCategory === 'all'
                        ? 'shadow-md'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
                    }`}
                    style={activeCategory === 'all' ? { backgroundColor: theme.primary, borderColor: theme.primary, color: onAccent } : {}}
                  >
                    Todos ({products.length})
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      aria-pressed={activeCategory === cat}
                      className={`text-xs font-bold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border transition whitespace-nowrap active:scale-95 ${
                        activeCategory === cat
                          ? 'shadow-md'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
                      }`}
                      style={activeCategory === cat ? { backgroundColor: theme.primary, borderColor: theme.primary, color: onAccent } : {}}
                    >
                      {cat} ({products.filter(p => p.category === cat).length})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cards Grid */}
          <div className="auto-project-grid">
            {filteredProducts.map(p => {
              const images = getProductImages(p);
              const currentSlide = cardSliderIndices[p.id] || 0;
              const isSelected = selected.includes(p.id);

              return (
                <article 
                  key={p.id} 
                  data-auto-reveal
                  className={`auto-project-card group relative rounded-2xl sm:rounded-3xl overflow-hidden border transition-all duration-300 flex flex-col bg-gradient-to-b from-white/[0.04] to-black/60 backdrop-blur-md ${
                    isSelected 
                      ? 'shadow-2xl ring-1' 
                      : 'border-white/10 hover:border-white/25 hover:shadow-xl hover:shadow-black/50'
                  }`}
                  style={isSelected ? { borderColor: theme.primary, boxShadow: `0 20px 25px -5px ${theme.glowFrom}` } : {}}
                >
                  {/* Card Media Section with mini-slider */}
                  <div className="auto-project-media relative aspect-[4/3] bg-zinc-950 overflow-hidden">
                    {images.length > 0 ? (
                      <img 
                        src={images[currentSlide]}
                        loading="lazy" decoding="async"
                        alt={p.name} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer" 
                        onClick={() => openLightbox(p, 'photos', currentSlide)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-slate-600">
                        <Flame size={48} style={{ color: theme.primary }} />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 sm:top-3 sm:left-3 sm:right-3 flex items-center justify-between pointer-events-none">
                      <span className="rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider border border-white/15 truncate max-w-[150px]" style={{ color: theme.primary }}>
                        {p.category || 'PROJETO'}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.videoUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openLightbox(p, 'video'); }}
                            className="pointer-events-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-black text-black shadow-lg hover:scale-105 active:scale-95 transition"
                            style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
                          >
                            <Play size={9} className="fill-black" /> Ronco
                          </button>
                        )}
                        {images.length > 1 && (
                          <span className="rounded-full bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-slate-300 border border-white/15">
                            {currentSlide + 1}/{images.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Slider Arrows */}
                    {images.length > 1 && (
                      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 flex items-center justify-between pointer-events-none opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleCardSlider(p.id, 'prev', images.length, e)}
                          className="pointer-events-auto w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/20 backdrop-blur-md transition active:scale-95 shadow-md"
                          aria-label="Foto anterior"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          onClick={(e) => handleCardSlider(p.id, 'next', images.length, e)}
                          className="pointer-events-auto w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/20 backdrop-blur-md transition active:scale-95 shadow-md"
                          aria-label="Próxima foto"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}

                    {/* Quick Lightbox Open Trigger */}
                    <button
                      onClick={() => openLightbox(p, 'photos', currentSlide)}
                      className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/20 backdrop-blur-md transition opacity-80 sm:opacity-0 sm:group-hover:opacity-100 active:scale-95"
                      title="Ver em tela cheia"
                    >
                      <Maximize2 size={13} />
                    </button>
                  </div>

                  {/* Card Content */}
                  <div className="auto-project-body p-4 sm:p-6 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white transition leading-snug">
                        {p.name}
                      </h3>

                      <p className="text-xs sm:text-sm text-slate-400 mt-2 sm:mt-3 line-clamp-2 sm:line-clamp-3 leading-relaxed whitespace-pre-line">
                        {p.description || 'Configuração completa de alto rendimento. Consulte opções para seu veículo.'}
                      </p>
                    </div>

                    {/* Card Actions */}
                    <div className="mt-4 sm:mt-6 pt-3.5 sm:pt-4 border-t border-white/10 space-y-2">
                      {p.model3d?.url && <button type="button" className="auto-project-model-button" onClick={() => openLightbox(p, 'model')}><Box size={16} /> Explorar este escapamento em 3D <ArrowUpRight size={14} /></button>}
                      {/* Secondary Buttons: Video / WhatsApp */}
                      <div className="grid grid-cols-2 gap-2">
                        {p.videoUrl ? (
                          <button
                            onClick={() => openLightbox(p, 'video')}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-xs font-bold transition active:scale-95"
                            style={{ backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}40`, color: theme.primary }}
                          >
                            <Play size={12} style={{ fill: theme.primary }} /> Ouvir Ronco
                          </button>
                        ) : (
                          <button
                            onClick={() => openLightbox(p, 'photos', 0)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-2.5 py-2.5 text-xs font-semibold transition active:scale-95"
                          >
                            <Camera size={12} /> {images.length} Fotos
                          </button>
                        )}

                        <a
                          href={getWhatsAppLink(`Olá! Vi o projeto "${p.name}" no site de vocês e gostaria de saber se é compatível com meu carro e orçar!`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 px-2.5 py-2.5 text-xs font-bold transition active:scale-95"
                        >
                          <MessageCircle size={13} /> Orçar no Zap
                        </a>
                      </div>

                      {/* Main Card Action: Select for project */}
                      <button 
                        aria-pressed={isSelected} 
                        onClick={() => {
                          setSelected(s => s.includes(p.id) ? s.filter(id => id !== p.id) : [...s, p.id]);
                        }} 
                        className={`w-full rounded-xl py-3 px-4 text-xs font-bold transition flex items-center justify-center gap-2 active:scale-98 ${
                          isSelected 
                            ? 'text-black shadow-lg' 
                            : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                        }`}
                        style={isSelected ? { backgroundColor: theme.primary, boxShadow: `0 10px 15px -3px ${theme.glowFrom}` } : {}}
                      >
                        {isSelected ? (
                          <>
                            <CheckCircle2 size={14} /> Referência Selecionada
                          </>
                        ) : (
                          'Quero algo nesse estilo'
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {!products.length && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 sm:p-10 text-center">
              <Flame size={40} className="mx-auto text-orange-400 mb-3" />
              <p className="text-slate-300 font-bold">Novas referências serão publicadas em breve.</p>
              <p className="text-slate-500 text-xs mt-1">Você já pode preencher o formulário abaixo e solicitar um projeto personalizado.</p>
            </div>
          )}
        </section>

        {/* 04 / DEDICATED INTERACTIVE ROUTE SECTION (ISOLATED SECTION WITHOUT OVERLAP) */}
        <div className="my-12 sm:my-16 clear-both relative z-10">
          <DealershipRouteScrollytelling
            sectionId="auto-route"
            storeName={store.name}
            storeTagline="04 / ROTA INTERATIVA • DA SUA GARAGEM ATÉ NOSSA OFICINA"
            storeAddress={store.address}
            storeLatitude={store.latitude}
            storeLongitude={store.longitude}
            storePhone={store.phone}
            accentColor={theme.primary}
            featuredVehicleName={featuredProduct?.name}
            featuredVehicleImage={featuredImages[0]}
            whatsappUrl={getWhatsAppLink(`Olá! Calculei minha rota no site da ${store.name} e gostaria de agendar uma visita à garagem!`)}
            onScheduleClick={() => {
              const el = document.getElementById('project-form');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>

        {/* INTERACTIVE PROJECT INQUIRY FORM */}
        <section id="project-form" className="auto-form-section scroll-mt-20 my-10 sm:my-14 grid lg:grid-cols-[1fr_1.3fr] gap-6 sm:gap-8 bg-gradient-to-b from-white/[0.04] to-black/80 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-2xl relative w-full">
          <div className="w-full min-w-0">
            <div 
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border flex items-center justify-center mb-4 sm:mb-6"
              style={{ backgroundColor: `${theme.primary}18`, borderColor: `${theme.primary}40`, color: theme.primary }}
            >
              <ShieldCheck size={24} className="sm:w-6 sm:h-6" />
            </div>

            <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight break-words">
              Vamos desenhar seu próximo projeto.
            </h2>

            <p className="text-slate-400 text-xs sm:text-sm mt-3 sm:mt-4 leading-relaxed">
              Sem compromisso. Nossa equipe técnica e inteligência artificial avaliam seu veículo, as referências e o que você busca de acabamento e acústica para preparar uma proposta sob medida.
            </p>

            {/* Selected References Showcase */}
            {selected.length > 0 && (
              <div 
                className="mt-5 p-3.5 sm:p-4 rounded-2xl border"
                style={{ backgroundColor: `${theme.primary}10`, borderColor: `${theme.primary}40` }}
              >
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block mb-2" style={{ color: theme.primary }}>
                  Referências selecionadas ({selected.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {selected.map(id => {
                    const found = products.find(p => p.id === id);
                    return found ? (
                      <span 
                        key={id} 
                        className="inline-flex items-center gap-1.5 text-xs bg-black/60 border px-2.5 py-1 rounded-full"
                        style={{ borderColor: `${theme.primary}40`, color: theme.accent || theme.primary }}
                      >
                        <Check size={11} style={{ color: theme.primary }} /> {found.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 sm:mt-8 space-y-2.5 text-xs text-slate-400">
              <p className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                Compatibilidade e orçamento confirmados antes da aprovação
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                Atendimento consultivo direto pelo WhatsApp
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                Sem cobranças antecipadas nesta etapa
              </p>
            </div>
          </div>

          <div className="w-full min-w-0">
            {result ? (
              <div role="status" className="p-6 sm:p-8 rounded-2xl bg-white/[0.03] border border-emerald-500/40 text-center space-y-5">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto">
                  <Check size={28} className="sm:w-8 sm:h-8" />
                </div>
                
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">Solicitação Recebida com Sucesso!</h3>
                  <p className="text-slate-400 text-xs sm:text-sm mt-2">
                    Protocolo: <span className="font-mono font-bold" style={{ color: theme.primary }}>{result.id.slice(0, 8).toUpperCase()}</span>
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    Nossa equipe técnica e o consultor IA já estão processando os detalhes do seu veículo.
                  </p>
                </div>

                {result.whatsappUrl && (
                  <a 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    href={result.whatsappUrl} 
                    className="inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black px-6 py-3.5 sm:py-4 text-sm shadow-xl shadow-emerald-500/20 transition w-full active:scale-98"
                  >
                    <MessageCircle size={18} /> Continuar no WhatsApp com Consultor ↗
                  </a>
                )}

                <button 
                  onClick={() => { setResult(null); setRequestId(crypto.randomUUID()); }} 
                  className="block mx-auto text-xs text-slate-400 hover:text-white underline pt-2"
                >
                  Solicitar análise para outro veículo
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3.5 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {field('customerName', 'Seu Nome', true, 'Ex: João Silva')}
                  {field('phone', 'WhatsApp com DDD', true, 'Ex: (11) 99999-9999')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {field('brand', 'Marca', true, 'Ex: Porsche, BMW, Audi...')}
                  {field('model', 'Modelo', true, 'Ex: 911 Carrera, M3, RS6...')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {field('year', 'Ano', true, 'Ex: 2024')}
                  {field('version', 'Versão / Motor', false, 'Ex: 3.0 Biturbo (992.2)')}
                </div>

                {field('modifications', 'Modificações existentes no carro (opcional)', false, 'Ex: Downpipe, Remap Stage 2, filtro...')}
                
                {field('objective', 'O que você procura no projeto?', true, 'Ex: Catback com ronco esportivo mantendo conforto com válvulas fechadas')}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {field('cep', 'CEP para consulta de envio', form.delivery === 'Envio nacional', '00000-000')}
                  <label className="text-xs sm:text-sm font-medium text-slate-300">
                    Atendimento
                    <select 
                      value={form.delivery} 
                      onChange={e => setForm({ ...form, delivery: e.target.value })} 
                      className="mt-1.5 w-full rounded-xl bg-black/50 border border-white/10 px-3.5 py-3 text-base sm:text-sm text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition shadow-inner"
                    >
                      <option value="Envio nacional">Envio nacional (Transportadora)</option>
                      <option value="Atendimento local">Instalação na oficina parceira</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-slate-400 pt-1 cursor-pointer">
                  <input type="checkbox" required className="mt-0.5 rounded border-white/20 bg-black/40 text-orange-500 focus:ring-orange-500 shrink-0" />
                  <span>Autorizo o contato técnico sobre esta solicitação. Meus dados serão usados exclusivamente para orçar o projeto.</span>
                </label>

                {error && (
                  <p role="alert" className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 p-3 rounded-xl">
                    {error}
                  </p>
                )}

                <button 
                  disabled={busy} 
                  className="w-full rounded-2xl hover:brightness-110 text-black font-black p-4 text-sm sm:text-base shadow-xl disabled:opacity-50 transition active:scale-[0.98] flex items-center justify-center gap-2"
                  style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
                >
                  <Send size={18} />
                  {busy ? 'Enviando solicitação…' : `Enviar para análise técnica${selected.length ? ` · ${selected.length} ref.` : ''}`}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="auto-footer border-t border-white/10 py-8 text-center text-xs text-slate-500 w-full mt-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-300">{store.name}</span>
              <span>•</span>
              <span style={{ color: theme.primary }}>{store.tagline || 'Escapamentos & Performance'}</span>
            </div>
            <p>© {new Date().getFullYear()} {store.name}. Todos os direitos reservados.</p>
          </div>
        </footer>
      </main>

      <aside className="auto-floating-contact" aria-label="Atendimento da loja">
        <a href={getWhatsAppLink()} target="_blank" rel="noopener noreferrer" aria-label="Conversar com a loja no WhatsApp"><MessageCircle size={20} /><span>Vamos conversar<small>IA + equipe técnica</small></span><ArrowUpRight size={14} /></a>
      </aside>

      {/* LIGHTBOX MODAL: Fullscreen Photos & Cinematic Video Player */}
      {lightbox.isOpen && lightbox.product && (
        <div 
          className="auto-lightbox fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
          onClick={() => setLightbox(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
            ref={dialogRef} role="dialog" aria-modal="true" aria-label={lightbox.product.name}
            className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#121316] border border-white/15 rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-white/10 bg-black/40">
              <div className="min-w-0 pr-2 sm:pr-4">
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider block truncate" style={{ color: theme.primary }}>
                  {lightbox.product.category || 'PROJETO'}
                </span>
                <h3 className="text-sm sm:text-xl font-black text-white truncate max-w-[140px] xs:max-w-[190px] sm:max-w-md">
                  {lightbox.product.name}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Tabs: Photos vs Video */}
                <div className="flex items-center bg-white/10 rounded-xl p-0.5 sm:p-1 border border-white/10">
                  <button
                    onClick={() => setLightbox(prev => ({ ...prev, activeTab: 'photos' }))}
                    className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition ${
                      lightbox.activeTab === 'photos'
                        ? 'shadow'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    style={lightbox.activeTab === 'photos' ? { backgroundColor: theme.primary, color: onAccent } : {}}
                  >
                    <Camera size={12} />
                    <span>Fotos ({getProductImages(lightbox.product).length})</span>
                  </button>

                  {lightbox.product.videoUrl && (
                    <button
                      onClick={() => setLightbox(prev => ({ ...prev, activeTab: 'video' }))}
                      className={`flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition ${
                        lightbox.activeTab === 'video'
                          ? 'shadow'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      style={lightbox.activeTab === 'video' ? { backgroundColor: theme.primary, color: onAccent } : {}}
                    >
                      <Play size={11} className="fill-current" />
                      <span>Vídeo & Ronco</span>
                    </button>
                  )}
                  {lightbox.product.model3d && <button type="button" aria-pressed={lightbox.activeTab === 'model'} onClick={() => setLightbox(prev => ({...prev, activeTab:'model'}))} className="auto-model-tab" style={lightbox.activeTab === 'model' ? {backgroundColor:theme.primary,color:onAccent} : {}}><Box size={13} /> 3D</button>}
                </div>

                <button
                  data-auto-close aria-label="Fechar galeria" onClick={() => setLightbox(prev => ({ ...prev, isOpen: false }))}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="flex-1 min-h-0 overflow-auto bg-black flex items-center justify-center relative">
              {lightbox.activeTab === 'photos' ? (
                (() => {
                  const images = getProductImages(lightbox.product);
                  const currentImg = images[lightbox.photoIndex] || lightbox.product.imageUrl;

                  return (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4">
                      <div className="relative max-h-[60vh] flex items-center justify-center">
                        {images.length ? <img
                          src={currentImg} 
                          alt={`${lightbox.product.name} — foto ${lightbox.photoIndex + 1}`}
                          className="max-h-[60vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl" 
                        /> : <p className="text-sm text-slate-400 text-center p-8">Esta referência ainda não possui fotos. Consulte os detalhes do projeto com a equipe.</p>}

                        {/* Prev/Next arrows in Lightbox */}
                        {images.length > 1 && (
                          <>
                            <button
                              onClick={() => setLightbox(prev => ({ ...prev, photoIndex: (prev.photoIndex - 1 + images.length) % images.length }))}
                              className="absolute -left-2 sm:left-2 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/20 shadow-xl transition active:scale-95"
                              aria-label="Anterior"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <button
                              onClick={() => setLightbox(prev => ({ ...prev, photoIndex: (prev.photoIndex + 1) % images.length }))}
                              className="absolute -right-2 sm:right-2 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/20 shadow-xl transition active:scale-95"
                              aria-label="Próxima"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Thumbnails strip */}
                      {images.length > 1 && (
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4 max-w-full overflow-x-auto py-1.5 px-2 no-scrollbar">
                          {images.map((img, idx) => (
                            <button
                              key={idx}
                              onClick={() => setLightbox(prev => ({ ...prev, photoIndex: idx }))}
                              aria-label={`Ver foto ${idx + 1} de ${images.length}`}
                              aria-pressed={lightbox.photoIndex === idx}
                              className={`w-11 h-9 sm:w-14 sm:h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                                lightbox.photoIndex === idx 
                                ? 'scale-105 ring-2' 
                                : 'border-white/20 opacity-50 hover:opacity-100'
                              }`}
                              style={lightbox.photoIndex === idx ? { borderColor: theme.primary } : {}}
                            >
                              <img src={img} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : lightbox.activeTab === 'model' && lightbox.product.model3d ? (
                <div className="auto-lightbox-model w-full">
                  <AutomotiveSceneBoundary key={lightbox.product.model3d.url} image={lightbox.product.imageUrl}>
                    <Suspense fallback={<div className="auto-scene-loading" role="status">Preparando este projeto em 3D…</div>}>
                      <AutomotiveProjectModelScene accent={theme.primary} model={lightbox.product.model3d} projectName={lightbox.product.name} fallbackImage={lightbox.product.imageUrl || lightbox.product.images?.[0]} />
                    </Suspense>
                  </AutomotiveSceneBoundary>
                </div>
              ) : (
                /* Video Tab */
                <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4">
                  {lightbox.product.videoUrl ? (
                    <div className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-white/15">
                      <video 
                        src={lightbox.product.videoUrl} 
                        controls 
                        autoPlay 
                        playsInline
                        className="w-full h-full object-contain"
                      >
                        Seu navegador não suporta reprodução de vídeo.
                      </video>
                    </div>
                  ) : (
                    <p className="text-slate-400">Vídeo não disponível para este projeto.</p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer CTA */}
            <div className="p-3.5 sm:p-5 border-t border-white/10 bg-[#0d0e11] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
              <div className="text-center sm:text-left hidden sm:block">
                <span className="text-xs text-slate-400">Gostou deste acabamento e ronco?</span>
                <p className="text-sm font-bold text-white">Solicite um orçamento sob medida para seu veículo.</p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <a
                  href={getWhatsAppLink(`Olá! Estive vendo os detalhes do projeto "${lightbox.product.name}" no site e quero fazer um igual no meu carro!`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black px-4 py-3 text-xs sm:text-sm shadow-xl shadow-emerald-500/20 transition active:scale-95"
                >
                  <MessageCircle size={15} />
                  <span>Conversar no WhatsApp</span>
                </a>

                <button
                  onClick={() => {
                    if (lightbox.product) {
                      const pid = lightbox.product.id;
                      setSelected(s => s.includes(pid) ? s : [...s, pid]);
                    }
                    setLightbox(prev => ({ ...prev, isOpen: false }));
                    const el = document.getElementById('project-form');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl hover:brightness-110 text-black font-extrabold px-4 py-3 text-xs sm:text-sm transition active:scale-95"
                  style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
                >
                  <Check size={15} />
                  <span>Quero este estilo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
