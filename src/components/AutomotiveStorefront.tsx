import React, { useState, useEffect } from 'react';
import { 
  ArrowUpRight, 
  Check, 
  ShieldCheck, 
  Play, 
  Volume2, 
  Camera, 
  MessageCircle, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Flame, 
  Maximize2, 
  X, 
  CheckCircle2, 
  Wrench, 
  Send
} from 'lucide-react';
import { getThemeFromStore } from '../utils/automotiveThemes';

export type AutomotiveReference = { 
  id: string; 
  name: string; 
  description?: string; 
  imageUrl?: string; 
  images?: string[]; 
  videoUrl?: string; 
  category?: string;
  price?: number;
};

interface AutomotiveStorefrontProps {
  store: { 
    id: string; 
    name: string; 
    phone?: string; 
    description?: string;
    logoUrl?: string;
    brandColor?: string;
    themePreset?: string;
    tagline?: string;
    brandTheme?: { preset?: string; primaryColor?: string; secondaryColor?: string; tagline?: string; };
  }; 
  products: AutomotiveReference[];
}

export function AutomotiveStorefront({ store, products }: AutomotiveStorefrontProps) {
  const theme = getThemeFromStore(store);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  // Card image slider state map: { [productId]: currentImageIndex }
  const [cardSliderIndices, setCardSliderIndices] = useState<Record<string, number>>({});
  
  // Lightbox Modal state
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    product: AutomotiveReference | null;
    activeTab: 'photos' | 'video';
    photoIndex: number;
  }>({
    isOpen: false,
    product: null,
    activeTab: 'photos',
    photoIndex: 0
  });

  // Hero showcase project
  const featuredProduct = products.find(p => p.videoUrl) || products[0] || null;
  const [heroPhotoIndex, setHeroPhotoIndex] = useState(0);

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
        setLightbox(prev => ({ ...prev, photoIndex: (prev.photoIndex + 1) % imgs.length }));
      } else if (e.key === 'ArrowLeft' && lightbox.activeTab === 'photos') {
        const imgs = getProductImages(lightbox.product);
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

  const openLightbox = (product: AutomotiveReference, initialTab: 'photos' | 'video' = 'photos', initialPhotoIndex = 0) => {
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
    <div className="min-h-screen bg-[#07080a] text-slate-100 selection:bg-orange-500 selection:text-black overflow-x-hidden relative w-full">
      {/* Ambient Glow Effects clamped within screen */}
      <div 
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-xs sm:max-w-lg h-[220px] sm:h-[350px] blur-3xl pointer-events-none -z-10" 
        style={{ background: `radial-gradient(circle, ${theme.glowFrom} 0%, ${theme.glowVia} 50%, transparent 80%)` }}
      />
      <div 
        className="fixed bottom-1/4 right-0 w-48 sm:w-96 h-48 sm:h-96 blur-3xl pointer-events-none -z-10" 
        style={{ background: `radial-gradient(circle, ${theme.glowVia} 0%, transparent 70%)` }}
      />

      {/* Sticky Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#07080a]/95 backdrop-blur-xl z-30 transition-all w-full">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-2.5 sm:py-3.5 flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-cover shrink-0 border border-white/10" />
            ) : (
              <div 
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center p-0.5 shadow-lg shrink-0"
                style={{ background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientVia}, #18181b)` }}
              >
                <div className="w-full h-full bg-[#101114] rounded-[10px] flex items-center justify-center">
                  <Flame className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: theme.primary }} />
                </div>
              </div>
            )}
            <div className="min-w-0">
              <span className="font-black text-xs sm:text-lg tracking-tight uppercase block leading-tight truncate max-w-[125px] xs:max-w-[190px] sm:max-w-none">
                {store.name}
              </span>
              <span className="text-[8px] sm:text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 truncate" style={{ color: theme.primary }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" /> {store.tagline || 'Escapamentos & Performance'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <a 
              href={getWhatsAppLink()} 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3.5 py-2 rounded-full transition"
            >
              <MessageCircle size={15} /> WhatsApp Online
            </a>
            <a 
              href="#project-form" 
              className="text-xs font-bold text-black hover:brightness-110 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full shadow-lg transition flex items-center gap-1 active:scale-95 shrink-0"
              style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
            >
              <span>Simular Projeto</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 w-full min-w-0">
        {/* HERO SECTION */}
        <section className="pt-4 pb-8 sm:py-10 lg:py-14 grid lg:grid-cols-2 gap-8 lg:gap-12 items-center w-full min-w-0">
          <div className="w-full min-w-0 flex flex-col justify-center">
            <div 
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 sm:px-3.5 sm:py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-3.5 sm:mb-5 backdrop-blur-md self-start"
              style={{ borderColor: `${theme.primary}50`, backgroundColor: `${theme.primary}18`, color: theme.accent || theme.primary }}
            >
              <Sparkles size={12} style={{ color: theme.primary }} className="shrink-0" />
              <span className="truncate">Titânio · Válvulas Originais · Ronco Único</span>
            </div>

            <h1 className="text-2xl xs:text-3xl sm:text-5xl lg:text-5xl xl:text-6xl font-black tracking-tight leading-[1.08] break-words text-white">
              Seu carro.<br />
              Sua assinatura.<br />
              <span 
                className="text-transparent bg-clip-text"
                style={{ backgroundImage: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.accent || theme.gradientVia}, ${theme.gradientTo})` }}
              >
                Seu próximo projeto.
              </span>
            </h1>

            <p className="text-slate-400 text-xs sm:text-sm lg:text-base mt-3 sm:mt-4 max-w-xl leading-relaxed">
              {store.description || 'Sistemas de escapamento de alta performance em titânio e inox cirúrgico sob medida. Controle de válvulas originais com acabamento e acústica de pista para o seu veículo.'}
            </p>

            <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <a 
                href="#project-form" 
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl sm:rounded-full hover:brightness-110 px-6 py-3.5 sm:px-7 sm:py-4 text-black font-extrabold text-sm sm:text-base shadow-xl transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
                style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
              >
                <span>Configurar meu projeto</span>
                <ArrowUpRight size={18} />
              </a>

              <a 
                href={getWhatsAppLink()} 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl sm:rounded-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 px-5 py-3.5 sm:px-6 sm:py-4 text-white font-bold text-sm sm:text-base transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <MessageCircle size={18} className="text-emerald-400 shrink-0" />
                <span>Falar com consultor via IA</span>
              </a>
            </div>

            {/* Differentiators */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-6 mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/10 text-xs text-slate-400 w-full min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Volume2 className="w-4 h-4 shrink-0" style={{ color: theme.primary }} />
                <span>Ronco esportivo sem ressonância</span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Wrench className="w-4 h-4 shrink-0" style={{ color: theme.primary }} />
                <span>Válvulas Plug & Play originais</span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: theme.primary }} />
                <span>Garantia e envio seguro nacional</span>
              </div>
            </div>
          </div>

          {/* Interactive Hero Media Showcase */}
          <div className="relative w-full min-w-0">
            {featuredProduct ? (
              <div className="group relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/15 bg-zinc-950 shadow-2xl shadow-black/80 aspect-square sm:aspect-[4/3] lg:aspect-[16/11] xl:aspect-[16/10] lg:min-h-[480px] xl:min-h-[530px] flex flex-col justify-end w-full min-w-0">
                {/* Background Image Carousel in Hero */}
                <img 
                  src={featuredImages[heroPhotoIndex] || featuredProduct.imageUrl} 
                  alt={featuredProduct.name} 
                  className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105" 
                />

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/20 pointer-events-none" />

                {/* Top Badges */}
                <div className="absolute top-2.5 left-2.5 right-2.5 sm:top-4 sm:left-4 sm:right-4 flex items-center justify-between pointer-events-none gap-2">
                  <span 
                    className="inline-flex items-center gap-1.5 rounded-full backdrop-blur-md px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-black uppercase text-black shadow-lg"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Flame size={12} /> Destaque da Garagem
                  </span>
                  {featuredImages.length > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold text-slate-200 border border-white/15 shrink-0">
                      <Camera size={12} /> {heroPhotoIndex + 1}/{featuredImages.length}
                    </span>
                  )}
                </div>

                {/* Floating Interactive Controls inside Hero */}
                <div className="relative z-10 p-3.5 sm:p-5 lg:p-6 space-y-2 sm:space-y-3 w-full min-w-0">
                  <div className="min-w-0">
                    <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider block mb-0.5 truncate" style={{ color: theme.primary }}>
                      {featuredProduct.category || 'Projeto Especial'}
                    </span>
                    <h3 className="text-base sm:text-xl lg:text-2xl font-black text-white leading-tight drop-shadow-md break-words line-clamp-2">
                      {featuredProduct.name}
                    </h3>
                  </div>

                  <div className="flex flex-row items-center gap-2 pt-1 w-full min-w-0">
                    {/* Ouvir Ronco Button */}
                    {featuredProduct.videoUrl && (
                      <button
                        onClick={() => openLightbox(featuredProduct, 'video')}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl text-black px-3 py-2.5 sm:px-4 sm:py-2.5 font-black text-xs sm:text-sm shadow-xl transition active:scale-95 whitespace-nowrap shrink-0"
                        style={{ background: `linear-gradient(to right, ${theme.gradientFrom}, ${theme.gradientVia}, ${theme.gradientTo})` }}
                      >
                        <span className="w-4 h-4 rounded-full bg-black flex items-center justify-center">
                          <Play size={9} style={{ fill: theme.primary }} className="ml-0.5" />
                        </span>
                        <span>Ouvir Ronco</span>
                      </button>
                    )}

                    {/* Ver Galeria de Fotos */}
                    <button
                      onClick={() => openLightbox(featuredProduct, 'photos', heroPhotoIndex)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-2xl bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white px-3 py-2.5 sm:px-3.5 sm:py-2.5 font-bold text-xs sm:text-sm transition active:scale-95 whitespace-nowrap shrink-0"
                    >
                      <Maximize2 size={13} />
                      <span>Galeria ({featuredImages.length})</span>
                    </button>
                  </div>

                  {/* Hero Mini Thumbnail Bar */}
                  {featuredImages.length > 1 && (
                    <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar py-1 w-full">
                      {featuredImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setHeroPhotoIndex(idx)}
                          className={`relative w-10 h-9 sm:w-12 sm:h-10 lg:w-14 lg:h-11 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                            heroPhotoIndex === idx 
                              ? 'scale-105 ring-2' 
                              : 'border-white/20 opacity-60 hover:opacity-100'
                          }`}
                          style={heroPhotoIndex === idx ? { borderColor: theme.primary } : {}}
                        >
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-800 to-black aspect-square flex items-center justify-center p-8 text-center w-full">
                <Flame size={64} className="mx-auto mb-4 opacity-75" style={{ color: theme.primary }} />
                <p className="text-xl sm:text-2xl font-black uppercase">Projetos em Produção</p>
                <p className="text-slate-400 text-xs sm:text-sm mt-2">Novas referências serão publicadas em breve.</p>
              </div>
            )}
          </div>
        </section>

        {/* WORKFLOW STEPS BAR */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 border-y border-white/10 py-6 sm:py-8 my-6 sm:my-8 w-full">
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
            className="my-8 sm:my-10 rounded-2xl sm:rounded-3xl border bg-gradient-to-b sm:bg-gradient-to-r from-zinc-900/90 via-zinc-900/60 to-black p-5 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 sm:gap-6 relative overflow-hidden shadow-2xl"
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
                <span className="text-[10px] sm:text-xs font-black tracking-wider uppercase" style={{ color: theme.primary }}>Acústica em Titânio</span>
                <h3 className="text-lg sm:text-2xl font-black text-white leading-tight">Quer ouvir o ronco real deste {featuredProduct.name}?</h3>
                <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
                  Grave acelerando e abrindo as válvulas originais. Dê o play agora ou solicite mais vídeos no WhatsApp!
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
        <section className="py-8 sm:py-12 w-full">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 w-full min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs uppercase font-extrabold tracking-wider block mb-1" style={{ color: theme.primary }}>
                Portfólio de Referências
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight break-words">Inspirações para o seu veículo</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 sm:mt-2 max-w-2xl leading-relaxed">
                Navegue pelas fotos dos projetos e escute o ronco. Nossa equipe e nossa IA confirmarão aplicação, materiais e orçamento sob medida.
              </p>
            </div>

            {/* Category Filter Pills */}
            {categories.length > 0 && (
              <div className="w-full sm:w-auto max-w-full overflow-x-auto no-scrollbar pb-2 pt-1 scroll-smooth min-w-0">
                <div className="inline-flex items-center gap-2">
                  <button
                    onClick={() => setActiveCategory('all')}
                    className={`text-xs font-bold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border transition whitespace-nowrap active:scale-95 ${
                      activeCategory === 'all'
                        ? 'shadow-md'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
                    }`}
                    style={activeCategory === 'all' ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#000' } : {}}
                  >
                    Todos ({products.length})
                  </button>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`text-xs font-bold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border transition whitespace-nowrap active:scale-95 ${
                        activeCategory === cat
                          ? 'shadow-md'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
                      }`}
                      style={activeCategory === cat ? { backgroundColor: theme.primary, borderColor: theme.primary, color: '#000' } : {}}
                    >
                      {cat} ({products.filter(p => p.category === cat).length})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredProducts.map(p => {
              const images = getProductImages(p);
              const currentSlide = cardSliderIndices[p.id] || 0;
              const isSelected = selected.includes(p.id);

              return (
                <article 
                  key={p.id} 
                  className={`group relative rounded-2xl sm:rounded-3xl overflow-hidden border transition-all duration-300 flex flex-col bg-gradient-to-b from-white/[0.04] to-black/60 backdrop-blur-md ${
                    isSelected 
                      ? 'shadow-2xl ring-1' 
                      : 'border-white/10 hover:border-white/25 hover:shadow-xl hover:shadow-black/50'
                  }`}
                  style={isSelected ? { borderColor: theme.primary, boxShadow: `0 20px 25px -5px ${theme.glowFrom}` } : {}}
                >
                  {/* Card Media Section with mini-slider */}
                  <div className="relative aspect-[4/3] bg-zinc-950 overflow-hidden">
                    {images.length > 0 ? (
                      <img 
                        loading="lazy" 
                        src={images[currentSlide]} 
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
                  <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between">
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

        {/* INTERACTIVE PROJECT INQUIRY FORM */}
        <section id="project-form" className="scroll-mt-20 my-10 sm:my-14 grid lg:grid-cols-[1fr_1.3fr] gap-6 sm:gap-8 bg-gradient-to-b from-white/[0.04] to-black/80 border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-10 shadow-2xl relative w-full">
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
              Sem compromisso. Nossa equipe técnica e inteligência artificial avaliam seu veículo para garantir encaixe perfeito, fluxo ideal e acústica incomparável.
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
        <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-500 w-full mt-12">
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

      {/* FLOATING WHATSAPP BUTTON */}
      <aside aria-label="Atendimento rápido" className="fixed bottom-4 right-3 sm:bottom-6 sm:right-6 z-40 max-w-[calc(100vw-24px)] pointer-events-auto">
        <a
          href={getWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 sm:gap-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold p-3 sm:px-5 sm:py-3.5 shadow-2xl shadow-emerald-500/50 border border-emerald-400/40 transition-all hover:scale-105 active:scale-95"
        >
          <div className="relative">
            <MessageCircle size={22} className="fill-white" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          </div>
          <div className="text-left hidden sm:block">
            <span className="block text-xs uppercase tracking-wider font-bold text-emerald-100">Atendimento IA & Técnico</span>
            <span className="block text-sm font-black leading-none text-white">Tirar Dúvidas no WhatsApp</span>
          </div>
        </a>
      </aside>

      {/* LIGHTBOX MODAL: Fullscreen Photos & Cinematic Video Player */}
      {lightbox.isOpen && lightbox.product && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
          onClick={() => setLightbox(prev => ({ ...prev, isOpen: false }))}
        >
          <div 
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
                    style={lightbox.activeTab === 'photos' ? { backgroundColor: theme.primary, color: '#000' } : {}}
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
                      style={lightbox.activeTab === 'video' ? { backgroundColor: theme.primary, color: '#000' } : {}}
                    >
                      <Play size={11} className="fill-current" />
                      <span>Vídeo & Ronco</span>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setLightbox(prev => ({ ...prev, isOpen: false }))}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="flex-1 overflow-auto bg-black flex items-center justify-center min-h-[300px] sm:min-h-[500px] relative">
              {lightbox.activeTab === 'photos' ? (
                (() => {
                  const images = getProductImages(lightbox.product);
                  const currentImg = images[lightbox.photoIndex] || lightbox.product.imageUrl;

                  return (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4">
                      <div className="relative max-h-[60vh] flex items-center justify-center">
                        <img 
                          src={currentImg} 
                          alt="" 
                          className="max-h-[60vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl" 
                        />

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
