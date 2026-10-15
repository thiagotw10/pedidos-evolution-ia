import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowUpRight,
  ArrowDown,
  MessageCircle,
  Play,
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Check,
  CheckCircle2,
  ShieldCheck,
  Car,
  Sparkles,
  MapPin,
  Clock,
  Search,
  SlidersHorizontal,
  Gauge,
  Calendar,
  Settings2,
  Award,
  PhoneCall
} from 'lucide-react';
import { getThemeFromStore } from '../utils/automotiveThemes';
import { DealershipRouteScrollytelling } from './DealershipRouteScrollytelling';

export interface VehicleProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
}

export interface VehicleStoreInfo {
  id: string;
  publicSlug?: string;
  name: string;
  description?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  operatingHours?: string;
  segment?: string;
  phone?: string;
  logoUrl?: string;
  brandColor?: string;
  themePreset?: string;
  tagline?: string;
  brandTheme?: {
    preset?: string;
    primaryColor?: string;
    secondaryColor?: string;
    tagline?: string;
  } | null;
}

interface VehicleDealershipStorefrontProps {
  store: VehicleStoreInfo;
  products: VehicleProduct[];
}

const formatBRL = (value: number) =>
  value > 0
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : 'Sob Consulta';

function extractVehicleSpecs(name: string, description = ''): {
  year?: string;
  km?: string;
  transmission?: string;
  engine?: string;
} {
  const combined = `${name} ${description}`;
  const yearMatch = combined.match(/\b(19[89]\d|20[0-2]\d(?:\/20[0-2]\d)?)\b/);
  const kmMatch = combined.match(/\b(\d{1,3}(?:\.\d{3})*|\d+)\s*km\b/i);
  const transMatch = combined.match(/\b(autom[aá]tico|manual|cvt|dsg|pdk|tiptronic|borboleta)\b/i);
  const engineMatch = combined.match(/\b(\d\.\d\s*(?:turbo|biturbo|tsi|tfSI|flex|v6|v8|16v|8v)?|el[eé]trico|h[ií]brido)\b/i);

  return {
    year: yearMatch ? yearMatch[1] : undefined,
    km: kmMatch ? `${kmMatch[1]} km` : undefined,
    transmission: transMatch
      ? transMatch[1].charAt(0).toUpperCase() + transMatch[1].slice(1).toLowerCase()
      : undefined,
    engine: engineMatch ? engineMatch[1].toUpperCase() : undefined
  };
}

export const VehicleDealershipStorefront: React.FC<VehicleDealershipStorefrontProps> = ({
  store,
  products
}) => {
  const theme = getThemeFromStore(store);
  const accent = store.brandColor || store.brandTheme?.primaryColor || theme.primary || '#10b981';

  const rootRef = useRef<HTMLDivElement>(null);
  const cursorDotRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);

  // Veículo ativo em destaque no Hero e na Rota
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [heroPhotoIdx, setHeroPhotoIdx] = useState(0);

  // Filtros de Catálogo
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');
  const [cardSliders, setCardSliders] = useState<Record<string, number>>({});

  // Veículos selecionados para proposta / negociação no WhatsApp
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Estado do Simulador / Proposta Direta para o WhatsApp
  const [proposalForm, setProposalForm] = useState({
    customerName: '',
    customerPhone: '',
    dealType: 'Financiamento + Entrada',
    tradeInVehicle: '',
    entryValue: '',
    visitPreference: 'Agendar Test-Drive na Loja',
    notes: ''
  });

  // Lightbox Modal (Fotos HD & Vídeo)
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    vehicle: VehicleProduct | null;
    tab: 'photos' | 'video';
    photoIndex: number;
  }>({
    isOpen: false,
    vehicle: null,
    tab: 'photos',
    photoIndex: 0
  });

  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${store.name} | ${store.tagline || 'Showroom & Catálogo de Veículos'}`;
    return () => {
      document.title = prevTitle;
    };
  }, [store.name, store.tagline]);

  // Custom Magnetic Follower Cursor (Estilo Awwwards / United Carriers)
  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    if (!dot || !ring || window.matchMedia('(max-width: 991px)').matches) return;

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let rafId = 0;

    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    };

    const tick = () => {
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const getVehicleImages = (v: VehicleProduct): string[] => {
    if (Array.isArray(v.images) && v.images.length > 0) return v.images;
    return v.imageUrl ? [v.imageUrl] : [];
  };

  const featuredVehicle = products[featuredIdx % Math.max(1, products.length)] || null;
  const featuredImages = featuredVehicle ? getVehicleImages(featuredVehicle) : [];
  const featuredSpecs = featuredVehicle
    ? extractVehicleSpecs(featuredVehicle.name, featuredVehicle.description)
    : {};

  // Formatação de WhatsApp da loja
  const cleanPhone = (store.phone || '').replace(/\D/g, '');
  const waNumber = cleanPhone.startsWith('55') ? cleanPhone : cleanPhone ? `55${cleanPhone}` : '';

  const getWhatsAppLink = (customMessage?: string) => {
    const defaultMsg = featuredVehicle
      ? `Olá! Estava na vitrine digital da *${store.name}* e tenho interesse no veículo *${featuredVehicle.name}* (${formatBRL(featuredVehicle.price)}). Podemos conversar?`
      : `Olá! Estava na vitrine digital da *${store.name}* e gostaria de atendimento sobre o estoque de veículos.`;
    const text = customMessage || defaultMsg;
    if (!waNumber) return '#proposta-whatsapp';
    return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
  };

  const getVehicleWhatsAppLink = (v: VehicleProduct, actionLabel = 'tenho interesse') => {
    const specs = extractVehicleSpecs(v.name, v.description);
    const specLine = [specs.year, specs.km, specs.transmission].filter(Boolean).join(' • ');
    const msg = `Olá! Vi no catálogo online da *${store.name}* o veículo:\n\n🚗 *${v.name}*\n💰 Valor: *${formatBRL(v.price)}*${specLine ? `\n📋 Detalhes: ${specLine}` : ''}\n\n${actionLabel === 'test-drive' ? 'Gostaria de agendar uma visita / test-drive para conhecer o carro!' : 'Ainda está disponível? Gostaria de mais fotos, informações e simular negócio!'}`;
    return getWhatsAppLink(msg);
  };

  // Categorias e filtragem do catálogo
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchesCat = activeCategory === 'all' || p.category === activeCategory;
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });

    if (sortBy === 'price-asc') return [...list].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, activeCategory, searchQuery, sortBy]);

  const toggleSelectVehicle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleCardSlide = (id: string, dir: 1 | -1, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardSliders((prev) => {
      const curr = prev[id] || 0;
      return { ...prev, [id]: (curr + dir + total) % total };
    });
  };

  const handleSendProposalWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenVehicles = products.filter((p) => selectedIds.includes(p.id));
    const vehicleNames =
      chosenVehicles.length > 0
        ? chosenVehicles.map((v) => `• *${v.name}* (${formatBRL(v.price)})`).join('\n')
        : featuredVehicle
        ? `• *${featuredVehicle.name}* (${formatBRL(featuredVehicle.price)})`
        : '• Consultar estoque disponível';

    const lines = [
      `Olá! Vim pelo Showroom Digital da *${store.name}* e montei uma proposta:`,
      '',
      `👤 *Cliente:* ${proposalForm.customerName || 'Visitante do Site'}`,
      proposalForm.customerPhone ? `📱 *WhatsApp:* ${proposalForm.customerPhone}` : '',
      '',
      `🚗 *Veículo(s) de Interesse:*`,
      vehicleNames,
      '',
      `💳 *Modalidade:* ${proposalForm.dealType}`,
      proposalForm.entryValue ? `💰 *Entrada Estimada:* ${proposalForm.entryValue}` : '',
      proposalForm.tradeInVehicle ? `🔄 *Veículo na Troca:* ${proposalForm.tradeInVehicle}` : '',
      `📍 *Atendimento:* ${proposalForm.visitPreference}`,
      proposalForm.notes ? `📝 *Observações:* ${proposalForm.notes}` : '',
      '',
      `Podemos dar andamento pelo WhatsApp?`
    ]
      .filter(Boolean)
      .join('\n');

    if (waNumber) {
      window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(lines)}`, '_blank');
    } else {
      alert('Número de WhatsApp da loja ainda não configurado no painel.');
    }
  };

  return (
    <div
      ref={rootRef}
      id="showroom-top"
      className="min-h-screen bg-[#050609] text-[#f3f4f6] relative overflow-x-clip selection:text-black"
      style={{ '--sotd-accent': accent } as React.CSSProperties}
    >
      {/* Custom Awwwards Follower Cursor (Desktop) */}
      <div
        ref={cursorDotRef}
        className="hidden lg:block fixed top-0 left-0 w-2 h-2 -ml-1 -mt-1 rounded-full pointer-events-none z-[90]"
        style={{ backgroundColor: accent }}
      />
      <div
        ref={cursorRingRef}
        className="hidden lg:block fixed top-0 left-0 w-9 h-9 -ml-4.5 -mt-4.5 rounded-full border pointer-events-none z-[89] transition-colors duration-200"
        style={{ borderColor: `${accent}66` }}
      />

      {/* 1. TOP STICKY NAVIGATION BAR (Estilo Editorial Awwwards) */}
      <header className="sticky top-0 z-40 h-20 px-4 sm:px-8 lg:px-14 flex items-center justify-between gap-4 bg-[#050609]/85 backdrop-blur-2xl border-b border-white/10">
        <a href="#showroom-top" className="flex items-center gap-3.5 min-w-0 group">
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="w-11 h-11 rounded-xl object-cover border border-white/15 shrink-0"
            />
          ) : (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center border border-white/20 shrink-0"
              style={{ backgroundColor: `${accent}18`, color: accent }}
            >
              <Car className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <span className="block font-black text-sm sm:text-lg tracking-tight uppercase truncate text-white">
              {store.name}
            </span>
            <span className="block text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.22em] text-slate-400 truncate">
              {store.tagline || store.brandTheme?.tagline || 'Showroom & Catálogo Oficial'}
            </span>
          </div>
        </a>

        <nav className="hidden lg:flex items-center gap-8 text-xs font-mono uppercase tracking-[0.16em] text-slate-300">
          <a href="#estoque-veiculos" className="hover:text-white transition">
            01 / Catálogo ({products.length})
          </a>
          <a href="#rota-showroom" className="hover:text-white transition">
            02 / Rota até a Loja
          </a>
          <a href="#proposta-whatsapp" className="hover:text-white transition">
            03 / Simular & Troca
          </a>
        </nav>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {selectedIds.length > 0 && (
            <a
              href="#proposta-whatsapp"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/15 text-xs font-mono font-bold text-white"
            >
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: accent }} />
              <span>{selectedIds.length} selecionado(s)</span>
            </a>
          )}

          <a
            href={getWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 shadow-xl transition hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: accent,
              boxShadow: `0 10px 30px -6px ${accent}55`
            }}
          >
            <MessageCircle className="w-4 h-4 fill-current" />
            <span>Atendimento WhatsApp</span>
            <ArrowUpRight className="w-4 h-4 hidden sm:inline" />
          </a>
        </div>
      </header>

      {/* 2. HERO STAGE: VITRINE CINEMATOGRÁFICA DO CATÁLOGO DE VEÍCULOS */}
      <section className="relative min-h-[calc(100svh-5rem)] flex flex-col justify-between px-4 sm:px-8 lg:px-14 pt-8 pb-10 overflow-hidden">
        {/* Imagem de Fundo Cinematográfica do Veículo Selecionado */}
        <div className="absolute inset-0 pointer-events-none z-0">
          {featuredImages.length > 0 ? (
            <img
              key={featuredImages[heroPhotoIdx] || featuredImages[0]}
              src={featuredImages[heroPhotoIdx] || featuredImages[0]}
              alt={featuredVehicle?.name || ''}
              className="w-full h-full object-cover object-center scale-[1.02] brightness-[0.42] contrast-[1.08] transition-all duration-700"
            />
          ) : (
            <div
              className="w-full h-full opacity-25"
              style={{
                background: `radial-gradient(circle at 70% 35%, ${accent}44 0%, transparent 60%)`
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#050609] via-[#050609]/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050609] via-transparent to-[#050609]/60" />
        </div>

        {/* Topo do Hero: Metadados e Endereço Cadastrado da Loja */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-300 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: accent }} />
            <span className="uppercase tracking-[0.2em]" style={{ color: accent }}>
              VITRINE OFICIAL • ATENDIMENTO IMEDIATO NO WHATSAPP
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-400">
            {store.address && (
              <a
                href="#rota-showroom"
                className="inline-flex items-center gap-1.5 hover:text-white transition"
              >
                <MapPin className="w-3.5 h-3.5" style={{ color: accent }} />
                <span className="truncate max-w-[260px] sm:max-w-md">{store.address}</span>
              </a>
            )}
            {store.operatingHours && (
              <span className="hidden md:inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>{store.operatingHours}</span>
              </span>
            )}
          </div>
        </div>

        {/* Conteúdo Central do Hero: Destaque do Veículo + Card Interativo */}
        <div className="relative z-10 grid lg:grid-cols-[1.2fr_0.8fr] gap-8 lg:gap-12 items-center my-auto py-8">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/15 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" style={{ color: accent }} />
              <span>
                {featuredVehicle?.category || 'ESTOQUE SELECIONADO'} •{' '}
                {String((featuredIdx % Math.max(1, products.length)) + 1).padStart(2, '0')} /{' '}
                {String(products.length).padStart(2, '0')}
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl xl:text-7xl font-black tracking-tight text-white leading-[0.98] uppercase">
              {featuredVehicle ? (
                <>
                  {featuredVehicle.name.split(' ').slice(0, 2).join(' ')}{' '}
                  <span className="block" style={{ color: accent }}>
                    {featuredVehicle.name.split(' ').slice(2).join(' ') || 'DISPONÍVEL'}
                  </span>
                </>
              ) : (
                <>
                  SEU PRÓXIMO <span style={{ color: accent }}>VEÍCULO ESTÁ AQUI.</span>
                </>
              )}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              {featuredVehicle?.description ||
                store.description ||
                'Explore nosso estoque real cadastrado no painel, simule financiamento ou avaliação do seu usado na troca e fale direto com nosso consultor no WhatsApp.'}
            </p>

            {/* Pílulas de Especificações Extraídas Automaticamente */}
            {featuredVehicle && (
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <div className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/15 backdrop-blur-md">
                  <span className="block text-[10px] font-mono uppercase text-slate-400">Valor à Vista / Troca</span>
                  <strong className="text-lg sm:text-2xl font-black text-white">
                    {formatBRL(featuredVehicle.price)}
                  </strong>
                </div>

                {featuredSpecs.year && (
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">Ano</span>
                    <strong className="text-sm font-bold text-white">{featuredSpecs.year}</strong>
                  </div>
                )}

                {featuredSpecs.km && (
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">Quilometragem</span>
                    <strong className="text-sm font-bold text-white">{featuredSpecs.km}</strong>
                  </div>
                )}

                {featuredSpecs.transmission && (
                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="block text-[10px] font-mono uppercase text-slate-400">Câmbio</span>
                    <strong className="text-sm font-bold text-white">{featuredSpecs.transmission}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Botões de Ação Principais (Foco Total em WhatsApp + Catálogo) */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href={
                  featuredVehicle
                    ? getVehicleWhatsAppLink(featuredVehicle)
                    : getWhatsAppLink()
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-6 sm:px-8 py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider text-slate-950 shadow-2xl transition hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  backgroundColor: accent,
                  boxShadow: `0 16px 40px -8px ${accent}66`
                }}
              >
                <MessageCircle className="w-5 h-5 fill-current" />
                <span>Negociar no WhatsApp</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>

              <a
                href="#estoque-veiculos"
                className="inline-flex items-center gap-2.5 px-6 py-4 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/15 font-bold text-xs sm:text-sm text-white backdrop-blur-md transition"
              >
                <span>Ver Todo o Estoque ({products.length})</span>
                <ArrowDown className="w-4 h-4" style={{ color: accent }} />
              </a>

              {featuredVehicle && (
                <button
                  type="button"
                  onClick={() =>
                    setLightbox({
                      isOpen: true,
                      vehicle: featuredVehicle,
                      tab: featuredVehicle.videoUrl ? 'video' : 'photos',
                      photoIndex: heroPhotoIdx
                    })
                  }
                  className="inline-flex items-center gap-2 px-4 py-4 rounded-2xl bg-black/60 hover:bg-black border border-white/15 text-xs font-mono uppercase tracking-wider text-slate-200 transition cursor-pointer"
                >
                  {featuredVehicle.videoUrl ? (
                    <>
                      <Play className="w-4 h-4 fill-current" style={{ color: accent }} />
                      <span>Ver Vídeo</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-4 h-4" style={{ color: accent }} />
                      <span>Galeria ({featuredImages.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Card Flutuante do Veículo em Destaque + Seletor Rápido do Estoque */}
          {featuredVehicle && (
            <div className="bg-[#0b0e16]/90 backdrop-blur-2xl border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_30px_90px_rgba(0,0,0,0.85)] space-y-4">
              <div
                className="relative aspect-[16/10] rounded-2xl overflow-hidden bg-slate-950 border border-white/10 cursor-pointer group"
                onClick={() =>
                  setLightbox({
                    isOpen: true,
                    vehicle: featuredVehicle,
                    tab: 'photos',
                    photoIndex: heroPhotoIdx
                  })
                }
              >
                {featuredImages.length > 0 ? (
                  <img
                    src={featuredImages[heroPhotoIdx] || featuredImages[0]}
                    alt={featuredVehicle.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Car className="w-14 h-14" style={{ color: accent }} />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase bg-black/75 border border-white/15 backdrop-blur-md"
                    style={{ color: accent }}
                  >
                    DESTAQUE DO SHOWROOM
                  </span>
                  {featuredImages.length > 1 && (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-mono bg-black/75 text-white border border-white/15">
                      {heroPhotoIdx + 1}/{featuredImages.length} fotos
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-300 font-mono">Pronta Entrega • Visita ou Online</p>
                    <h2 className="text-base sm:text-lg font-black text-white truncate max-w-[260px]">
                      {featuredVehicle.name}
                    </h2>
                  </div>
                  <span
                    className="px-3 py-1.5 rounded-xl text-xs font-black text-slate-950 shrink-0"
                    style={{ backgroundColor: accent }}
                  >
                    {formatBRL(featuredVehicle.price)}
                  </span>
                </div>
              </div>

              {/* Miniaturas das fotos do veículo ativo */}
              {featuredImages.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {featuredImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHeroPhotoIdx(i)}
                      className={`w-14 h-10 rounded-lg overflow-hidden border-2 shrink-0 transition cursor-pointer ${
                        heroPhotoIdx === i ? 'opacity-100 scale-105' : 'border-white/15 opacity-50 hover:opacity-90'
                      }`}
                      style={heroPhotoIdx === i ? { borderColor: accent } : undefined}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Troca Rápida entre Veículos Cadastrados no Painel */}
              {products.length > 1 && (
                <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Alternar veículo em destaque ({featuredIdx + 1}/{products.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setFeaturedIdx((i) => (i - 1 + products.length) % products.length);
                        setHeroPhotoIdx(0);
                      }}
                      className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/15 flex items-center justify-center text-white transition cursor-pointer"
                      aria-label="Veículo anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFeaturedIdx((i) => (i + 1) % products.length);
                        setHeroPhotoIdx(0);
                      }}
                      className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/15 flex items-center justify-center text-white transition cursor-pointer"
                      aria-label="Próximo veículo"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Hero */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-white/10 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">
          <a href="#estoque-veiculos" className="inline-flex items-center gap-2 text-white hover:opacity-80">
            <ArrowDown className="w-3.5 h-3.5 animate-bounce" style={{ color: accent }} />
            <span>ROLE PARA EXPLORAR O ESTOQUE E TRAÇAR SUA ROTA</span>
          </a>
          <span>LAUDO CAUTELAR • TROCA COM TROCO • FINANCIAMENTO EM ATÉ 60X</span>
        </div>
      </section>

      {/* FAIXA EDITORIAL (MARQUEE STRIP) */}
      <div className="py-4 px-4 border-y border-white/10 bg-[#080a10] flex items-center justify-around gap-6 overflow-x-auto no-scrollbar text-[11px] font-mono font-bold uppercase tracking-[0.22em] text-slate-400 whitespace-nowrap">
        <span>CATÁLOGO OFICIAL {store.name}</span>
        <i style={{ color: accent }}>✳</i>
        <span>ATENDIMENTO WHATSAPP COM IA 24H</span>
        <i style={{ color: accent }}>✳</i>
        <span>AVALIAÇÃO DO SEU USADO NA TROCA</span>
        <i style={{ color: accent }}>✳</i>
        <span>AGENDAMENTO DE TEST-DRIVE VIP</span>
      </div>

      {/* 3. CATÁLOGO PRINCIPAL DE VEÍCULOS CADASTRADOS NO PAINEL */}
      <section id="estoque-veiculos" className="py-16 sm:py-24 px-4 sm:px-8 lg:px-14 max-w-[1720px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/10">
          <div className="space-y-2">
            <span
              className="text-xs font-mono font-bold uppercase tracking-[0.25em] block"
              style={{ color: accent }}
            >
              01 / SHOWROOM & ESTOQUE DISPONÍVEL
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white uppercase">
              Catálogo de Veículos ({filteredProducts.length})
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Todos os veículos abaixo são sincronizados em tempo real com o painel da loja. Clique em{' '}
              <strong className="text-white">Chamar no WhatsApp</strong> para receber fotos detalhadas, vídeo do motor
              ou simular financiamento.
            </p>
          </div>

          {/* Barra de Busca + Ordenação */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar modelo, ano, versão..."
                className="pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-white/40 w-56 sm:w-64"
              />
            </div>

            <div className="relative flex items-center">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Ordenar veículos"
                className="pl-8 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/15 text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="featured" className="bg-slate-900">Destaques do Showroom</option>
                <option value="price-asc" className="bg-slate-900">Menor Valor</option>
                <option value="price-desc" className="bg-slate-900">Maior Valor</option>
              </select>
            </div>
          </div>
        </div>

        {/* Abas de Categorias */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-6">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 rounded-full text-xs font-mono font-bold uppercase tracking-wider border transition cursor-pointer shrink-0 ${
                activeCategory === 'all'
                  ? 'text-slate-950 shadow-lg'
                  : 'bg-white/[0.03] text-slate-300 border-white/10 hover:border-white/25'
              }`}
              style={activeCategory === 'all' ? { backgroundColor: accent, borderColor: accent } : undefined}
            >
              Todos ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-mono font-bold uppercase tracking-wider border transition cursor-pointer shrink-0 ${
                  activeCategory === cat
                    ? 'text-slate-950 shadow-lg'
                    : 'bg-white/[0.03] text-slate-300 border-white/10 hover:border-white/25'
                }`}
                style={activeCategory === cat ? { backgroundColor: accent, borderColor: accent } : undefined}
              >
                {cat} ({products.filter((p) => p.category === cat).length})
              </button>
            ))}
          </div>
        )}

        {/* Grid de Veículos Awwwards */}
        {filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
            {filteredProducts.map((vehicle, idx) => {
              const images = getVehicleImages(vehicle);
              const slideIdx = cardSliders[vehicle.id] || 0;
              const isSelected = selectedIds.includes(vehicle.id);
              const specs = extractVehicleSpecs(vehicle.name, vehicle.description);

              return (
                <article
                  key={vehicle.id}
                  className={`group rounded-3xl overflow-hidden border bg-[#0b0e15] flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 ${
                    isSelected ? 'ring-2' : 'border-white/12 hover:border-white/30'
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: accent,
                          boxShadow: `0 24px 50px -12px ${accent}33`
                        }
                      : undefined
                  }
                >
                  <div>
                    {/* Galeria de Imagens do Card */}
                    <div className="relative aspect-[16/10] bg-slate-950 overflow-hidden">
                      {images.length > 0 ? (
                        <img
                          src={images[slideIdx] || images[0]}
                          alt={vehicle.name}
                          loading="lazy"
                          onClick={() =>
                            setLightbox({
                              isOpen: true,
                              vehicle,
                              tab: 'photos',
                              photoIndex: slideIdx
                            })
                          }
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 cursor-pointer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700">
                          <Car className="w-12 h-12" style={{ color: accent }} />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e15] via-transparent to-black/30 pointer-events-none" />

                      {/* Badges Superiores */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                        <span
                          className="px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[10px] font-mono font-bold uppercase tracking-wider truncate"
                          style={{ color: accent }}
                        >
                          {String(idx + 1).padStart(2, '0')} • {vehicle.category || 'VEÍCULO'}
                        </span>

                        <div className="flex items-center gap-1.5 pointer-events-auto">
                          {vehicle.videoUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightbox({ isOpen: true, vehicle, tab: 'video', photoIndex: 0 });
                              }}
                              className="px-2.5 py-1 rounded-full text-[10px] font-mono font-black text-slate-950 inline-flex items-center gap-1 shadow-lg cursor-pointer"
                              style={{ backgroundColor: accent }}
                            >
                              <Play className="w-2.5 h-2.5 fill-current" /> Vídeo
                            </button>
                          )}

                          {images.length > 1 && (
                            <span className="px-2 py-0.5 rounded-full bg-black/75 border border-white/15 text-[10px] font-mono text-slate-200">
                              {slideIdx + 1}/{images.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Setas de Navegação das Fotos no Card */}
                      {images.length > 1 && (
                        <div className="absolute inset-x-2.5 top-1/2 -translate-y-1/2 flex items-center justify-between opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleCardSlide(vehicle.id, -1, images.length, e)}
                            className="w-8 h-8 rounded-full bg-black/75 hover:bg-black border border-white/20 text-white flex items-center justify-center cursor-pointer"
                            aria-label="Foto anterior"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleCardSlide(vehicle.id, 1, images.length, e)}
                            className="w-8 h-8 rounded-full bg-black/75 hover:bg-black border border-white/20 text-white flex items-center justify-center cursor-pointer"
                            aria-label="Próxima foto"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* Preço em Destaque no Canto da Imagem */}
                      <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                            Valor de Venda
                          </span>
                          <strong className="text-xl sm:text-2xl font-black text-white tracking-tight">
                            {formatBRL(vehicle.price)}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({
                              isOpen: true,
                              vehicle,
                              tab: 'photos',
                              photoIndex: slideIdx
                            })
                          }
                          className="w-8 h-8 rounded-xl bg-black/75 hover:bg-black border border-white/20 text-slate-200 flex items-center justify-center cursor-pointer"
                          title="Ampliar fotos"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Corpo do Card: Título, Specs e Descrição */}
                    <div className="p-5 sm:p-6 space-y-3.5">
                      <h3 className="text-lg sm:text-xl font-black text-white leading-snug">{vehicle.name}</h3>

                      {/* Badges de Especificações */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-300">
                        {specs.year && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10">
                            <Calendar className="w-3 h-3" style={{ color: accent }} />
                            {specs.year}
                          </span>
                        )}
                        {specs.km && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10">
                            <Gauge className="w-3 h-3" style={{ color: accent }} />
                            {specs.km}
                          </span>
                        )}
                        {specs.transmission && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10">
                            <Settings2 className="w-3 h-3" style={{ color: accent }} />
                            {specs.transmission}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10">
                          <Award className="w-3 h-3" style={{ color: accent }} />
                          Garantia & Procedência
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                        {vehicle.description ||
                          'Veículo revisado com procedência garantida. Aceitamos seu usado na troca e financiamos com as melhores taxas.'}
                      </p>
                    </div>
                  </div>

                  {/* Rodapé de Conversão do Card (WhatsApp Central) */}
                  <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-3 border-t border-white/10 space-y-2">
                    <a
                      href={getVehicleWhatsAppLink(vehicle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 flex items-center justify-center gap-2 shadow-lg transition hover:brightness-110 active:scale-98"
                      style={{ backgroundColor: accent }}
                    >
                      <MessageCircle className="w-4 h-4 fill-current" />
                      <span>Negociar no WhatsApp</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </a>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFeaturedIdx(products.findIndex((p) => p.id === vehicle.id));
                          const routeEl = document.getElementById('rota-showroom');
                          routeEl?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-[11px] font-bold text-slate-200 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" style={{ color: accent }} />
                        <span>Traçar Rota</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleSelectVehicle(vehicle.id)}
                        className={`py-2.5 px-3 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                          isSelected
                            ? 'bg-white/15 text-white border-white/40'
                            : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/10 text-slate-300'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" style={{ color: accent }} />
                            <span>Na Proposta</span>
                          </>
                        ) : (
                          <span>+ Simular Troca</span>
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center space-y-3">
            <Car className="w-10 h-10 mx-auto" style={{ color: accent }} />
            <h3 className="text-lg font-bold text-white">Nenhum veículo encontrado para este filtro</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Limpe a busca ou chame nossa equipe diretamente no WhatsApp para consultar novos veículos entrando no
              estoque.
            </p>
          </div>
        )}
      </section>

      {/* 4. SEÇÃO CENTRAL DE SCROLLYTELLING: ROTA DO VISITANTE ATÉ O ENDEREÇO CADASTRADO DA LOJA */}
      <DealershipRouteScrollytelling
        sectionId="rota-showroom"
        storeName={store.name}
        storeTagline="02 / ROTA INTERATIVA • DO SEU GPS ATÉ NOSSO SHOWROOM"
        storeAddress={store.address}
        storeLatitude={store.latitude}
        storeLongitude={store.longitude}
        storePhone={store.phone}
        accentColor={accent}
        featuredVehicleName={featuredVehicle?.name}
        featuredVehicleImage={featuredImages[0]}
        featuredVehiclePrice={featuredVehicle ? formatBRL(featuredVehicle.price) : undefined}
        whatsappUrl={
          featuredVehicle
            ? getVehicleWhatsAppLink(featuredVehicle, 'test-drive')
            : getWhatsAppLink()
        }
      />

      {/* 5. SIMULADOR DE PROPOSTA, TROCA & FINANCIAMENTO DIRETO NO WHATSAPP */}
      <section id="proposta-whatsapp" className="py-16 sm:py-24 px-4 sm:px-8 lg:px-14 max-w-[1720px] mx-auto">
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8 sm:gap-12 rounded-3xl border border-white/15 bg-gradient-to-b from-[#0c1018] to-[#06080d] p-6 sm:p-12 shadow-2xl">
          <div className="space-y-6">
            <span
              className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-[0.22em]"
              style={{ color: accent }}
            >
              <Sparkles className="w-4 h-4" />
              03 / CONCIERGE DE NEGOCIAÇÃO WHATSAPP
            </span>

            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.05]">
              Simule Financiamento, Troca ou Agende seu Test-Drive.
            </h2>

            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Preencha os dados ao lado e envie sua proposta direto para o WhatsApp da{' '}
              <strong className="text-white">{store.name}</strong>. Nossa Inteligência Artificial e consultores
              respondem na hora com simulação de parcelas e pré-avaliação do seu usado.
            </p>

            {selectedIds.length > 0 && (
              <div
                className="p-4 rounded-2xl border space-y-2"
                style={{ backgroundColor: `${accent}12`, borderColor: `${accent}40` }}
              >
                <span className="text-[11px] font-mono font-bold uppercase block" style={{ color: accent }}>
                  Veículos incluídos na sua proposta ({selectedIds.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedIds.map((id) => {
                    const v = products.find((p) => p.id === id);
                    if (!v) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-white/15 text-xs text-white"
                      >
                        <span>{v.name}</span>
                        <button
                          type="button"
                          onClick={() => toggleSelectVehicle(id)}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2 text-xs text-slate-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: accent }} />
                <span>Atendimento instantâneo pelo WhatsApp oficial da loja</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: accent }} />
                <span>Aceitamos seu carro ou moto na troca com avaliação justa</span>
              </div>
              {store.address && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 shrink-0" style={{ color: accent }} />
                  <span>Showroom físico: {store.address}</span>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSendProposalWhatsApp} className="space-y-4 bg-black/50 border border-white/10 rounded-2xl p-5 sm:p-8">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-xs font-semibold text-slate-300">
                Seu Nome *
                <input
                  required
                  type="text"
                  placeholder="Ex: Carlos Eduardo"
                  value={proposalForm.customerName}
                  onChange={(e) => setProposalForm({ ...proposalForm, customerName: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-white/40"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Seu WhatsApp com DDD *
                <input
                  required
                  type="tel"
                  placeholder="Ex: (11) 99999-9999"
                  value={proposalForm.customerPhone}
                  onChange={(e) => setProposalForm({ ...proposalForm, customerPhone: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-white/40"
                />
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-xs font-semibold text-slate-300">
                Como pretende negociar?
                <select
                  value={proposalForm.dealType}
                  onChange={(e) => setProposalForm({ ...proposalForm, dealType: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white focus:outline-none"
                >
                  <option value="Financiamento + Entrada">Financiamento Bancário</option>
                  <option value="Dar meu Veículo na Troca">Dar meu Veículo na Troca</option>
                  <option value="Troca + Financiamento do Saldo">Troca + Financiamento do Saldo</option>
                  <option value="Pagamento à Vista / PIX">Pagamento à Vista / PIX</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Preferência de Atendimento
                <select
                  value={proposalForm.visitPreference}
                  onChange={(e) => setProposalForm({ ...proposalForm, visitPreference: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white focus:outline-none"
                >
                  <option value="Agendar Test-Drive na Loja">Ir até a Loja / Test-Drive</option>
                  <option value="Aprovar Ficha pelo WhatsApp Primeiro">Simular pelo WhatsApp Primeiro</option>
                  <option value="Solicitar Vídeo Detalhado do Carro">Receber Vídeo Detalhado no WhatsApp</option>
                </select>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-xs font-semibold text-slate-300">
                Carro/Moto na troca (opcional)
                <input
                  type="text"
                  placeholder="Ex: Compass 2020 Longitude 50mil km"
                  value={proposalForm.tradeInVehicle}
                  onChange={(e) => setProposalForm({ ...proposalForm, tradeInVehicle: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-white/40"
                />
              </label>

              <label className="block text-xs font-semibold text-slate-300">
                Valor de Entrada Estimado (opcional)
                <input
                  type="text"
                  placeholder="Ex: R$ 40.000"
                  value={proposalForm.entryValue}
                  onChange={(e) => setProposalForm({ ...proposalForm, entryValue: e.target.value })}
                  className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-white/40"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold text-slate-300">
              Dúvidas ou observações (opcional)
              <input
                type="text"
                placeholder="Ex: Gostaria de ver o carro neste sábado de manhã"
                value={proposalForm.notes}
                onChange={(e) => setProposalForm({ ...proposalForm, notes: e.target.value })}
                className="mt-1.5 w-full rounded-xl bg-[#090c12] border border-white/15 px-3.5 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-white/40"
              />
            </label>

            <button
              type="submit"
              className="w-full py-4 px-6 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider text-slate-950 shadow-2xl flex items-center justify-center gap-2.5 transition hover:brightness-110 cursor-pointer"
              style={{ backgroundColor: accent }}
            >
              <MessageCircle className="w-5 h-5 fill-current" />
              <span>Enviar Proposta para o WhatsApp da Loja</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>

      {/* 6. RODAPÉ INSTITUCIONAL */}
      <footer className="border-t border-white/10 py-10 px-4 sm:px-8 lg:px-14 max-w-[1720px] mx-auto text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-white uppercase">{store.name}</strong>
          {store.address && (
            <>
              <span>•</span>
              <span>{store.address}</span>
            </>
          )}
        </div>
        <p>© {new Date().getFullYear()} {store.name}. Vitrine Digital & Atendimento Inteligente via WhatsApp.</p>
      </footer>

      {/* BOTÃO FLUTUANTE DE WHATSAPP (PONTO CENTRAL DE CONVERSÃO) */}
      <aside className="fixed right-5 bottom-5 z-40">
        <a
          href={getWhatsAppLink()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-slate-950 font-black text-xs shadow-2xl transition hover:scale-105"
          style={{
            backgroundColor: accent,
            boxShadow: `0 14px 36px -6px ${accent}77`
          }}
        >
          <PhoneCall className="w-4 h-4" />
          <div className="text-left leading-tight">
            <span className="block uppercase tracking-wider">Falar no WhatsApp</span>
            <small className="block text-[9px] opacity-80 font-mono">Estoque & Financiamento</small>
          </div>
          <ArrowUpRight className="w-4 h-4" />
        </a>
      </aside>

      {/* LIGHTBOX MODAL (FOTOS EM TELA CHEIA & VÍDEO) */}
      {lightbox.isOpen && lightbox.vehicle && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
          onClick={() => setLightbox((prev) => ({ ...prev, isOpen: false }))}
        >
          <div
            className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#0b0e15] border border-white/15 rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-black/50">
              <div className="min-w-0 pr-3">
                <span className="text-[10px] font-mono font-bold uppercase block" style={{ color: accent }}>
                  {lightbox.vehicle.category || 'SHOWROOM'} • {formatBRL(lightbox.vehicle.price)}
                </span>
                <h3 className="text-sm sm:text-xl font-black text-white truncate">{lightbox.vehicle.name}</h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setLightbox((prev) => ({ ...prev, tab: 'photos' }))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                    lightbox.tab === 'photos' ? 'text-slate-950' : 'bg-white/10 text-slate-300'
                  }`}
                  style={lightbox.tab === 'photos' ? { backgroundColor: accent } : undefined}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Fotos ({getVehicleImages(lightbox.vehicle).length})</span>
                </button>

                {lightbox.vehicle.videoUrl && (
                  <button
                    type="button"
                    onClick={() => setLightbox((prev) => ({ ...prev, tab: 'video' }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                      lightbox.tab === 'video' ? 'text-slate-950' : 'bg-white/10 text-slate-300'
                    }`}
                    style={lightbox.tab === 'video' ? { backgroundColor: accent } : undefined}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Vídeo</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLightbox((prev) => ({ ...prev, isOpen: false }))}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto bg-black flex items-center justify-center p-4 relative">
              {lightbox.tab === 'photos' ? (
                (() => {
                  const imgs = getVehicleImages(lightbox.vehicle);
                  const currentImg = imgs[lightbox.photoIndex] || imgs[0];
                  return (
                    <div className="w-full flex flex-col items-center justify-center">
                      <div className="relative max-h-[60vh] flex items-center justify-center">
                        {currentImg ? (
                          <img
                            src={currentImg}
                            alt={lightbox.vehicle.name}
                            className="max-h-[60vh] w-auto max-w-full object-contain rounded-2xl"
                          />
                        ) : (
                          <p className="text-slate-400 text-sm p-8">Sem fotos cadastradas.</p>
                        )}

                        {imgs.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setLightbox((prev) => ({
                                  ...prev,
                                  photoIndex: (prev.photoIndex - 1 + imgs.length) % imgs.length
                                }))
                              }
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center cursor-pointer"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLightbox((prev) => ({
                                  ...prev,
                                  photoIndex: (prev.photoIndex + 1) % imgs.length
                                }))
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 border border-white/20 text-white flex items-center justify-center cursor-pointer"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden bg-black border border-white/15">
                  <video
                    src={lightbox.vehicle.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 border-t border-white/10 bg-[#0b0e15] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400">Gostou deste veículo?</p>
                <p className="text-sm font-black text-white">
                  {lightbox.vehicle.name} — {formatBRL(lightbox.vehicle.price)}
                </p>
              </div>
              <a
                href={getVehicleWhatsAppLink(lightbox.vehicle)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 flex items-center justify-center gap-2"
                style={{ backgroundColor: accent }}
              >
                <MessageCircle className="w-4 h-4 fill-current" />
                <span>Negociar este Veículo no WhatsApp</span>
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleDealershipStorefront;
