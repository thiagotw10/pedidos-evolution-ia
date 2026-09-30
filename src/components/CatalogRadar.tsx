import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  TrendingUp, 
  AlertCircle, 
  Lightbulb, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Image as ImageIcon,
  Flame,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import { Product, Establishment, CatalogRadarInsight } from '../types';
import { getSegmentConfig } from '../utils/segments';

interface CatalogRadarProps {
  establishmentId?: string;
  establishment?: Establishment | null;
  products: Product[];
  onAddSuggestedProduct: (suggestion: { name: string; price: number; category: string; description: string }) => void;
  onFilterWithoutPhoto?: () => void;
}

export const CatalogRadar: React.FC<CatalogRadarProps> = ({
  establishmentId,
  establishment,
  products,
  onAddSuggestedProduct,
  onFilterWithoutPhoto
}) => {
  const segConfig = getSegmentConfig(establishment?.segment);
  const [insight, setInsight] = useState<CatalogRadarInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'demands' | 'crosssell' | 'health'>('demands');

  const storeId = establishmentId || establishment?.id || 'default';

  // Compute live local photo health stats
  const totalItems = products.length;
  const withPhoto = products.filter(p => p.imageUrl && p.imageUrl.trim()).length;
  const withoutPhoto = totalItems - withPhoto;
  const photoPercentage = totalItems > 0 ? Math.round((withPhoto / totalItems) * 100) : 0;

  const fetchInsights = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ai/catalog-radar?storeId=${storeId}${forceRefresh ? '&refresh=true' : ''}`, {
        headers: {
          'x-establishment-id': storeId
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setInsight(json.data);
          try {
            localStorage.setItem(`radar_insight_${storeId}`, JSON.stringify(json.data));
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[CatalogRadar] Falha ao carregar análise de IA:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Try restoring from localStorage first for instant render
    try {
      const cached = localStorage.getItem(`radar_insight_${storeId}`);
      if (cached) {
        setInsight(JSON.parse(cached));
      }
    } catch {}

    fetchInsights(false);
  }, [storeId]);

  // Fallback default insight if API is still generating
  const currentInsight: CatalogRadarInsight = insight || {
    score: Math.min(95, Math.max(60, 60 + Math.round(photoPercentage * 0.35))),
    summary: `O catálogo possui ${totalItems} itens cadastrados. ${photoPercentage < 70 ? 'Adicionar fotos aos itens pendentes pode elevar a taxa de conversão em até 3x no WhatsApp.' : 'Excelente cobertura visual! Foque em combos estratégicos para elevar o ticket médio.'}`,
    unmetDemands: [
      {
        title: establishment?.segment?.includes('VEIC') 
          ? 'Sedan Automático Conforto' 
          : establishment?.segment?.includes('MODA') 
          ? 'Combo Look Casual Dia a Dia' 
          : 'Combo Individual Econômico (Prato + Bebida)',
        reason: 'Item com procura recorrente em conversas no WhatsApp e alto apelo de compra rápida.',
        suggestedCategory: products[0]?.category || 'Destaques',
        suggestedPrice: 38.00,
        demandLevel: 'ALTA'
      }
    ],
    topOpportunities: products.slice(0, 2).map((p, idx) => ({
      productName: p.name,
      insight: 'Produto com alto interesse de compra quando sugerido pelo atendente virtual.',
      badge: idx === 0 ? 'Item Estrela' : 'Mais Desejado'
    })),
    crossSellAction: {
      title: 'Estratégia de Combo Express',
      suggestion: 'Configurar a IA para sugerir complemento ou sobremesa/acessório logo após o cliente escolher o item principal.',
      ticketImpact: '+20% a +25% no ticket médio'
    },
    health: {
      totalItems,
      withPhoto,
      withoutPhoto,
      photoPercentage,
      alertMessage: withoutPhoto > 0 ? `${withoutPhoto} item(ns) estão sem foto no catálogo.` : 'Todos os itens possuem fotos cadastradas!'
    },
    analyzedAt: new Date().toISOString()
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    if (score >= 60) return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
  };

  return (
    <div className="bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-purple-950/20 rounded-2xl border border-purple-500/30 shadow-2xl p-4 sm:p-5 relative overflow-hidden transition-all duration-300">
      {/* Background Ambient Glow */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                Radar de IA: Oportunidades do {segConfig.catalogTitle}
              </h3>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${getScoreColor(currentInsight.score)}`}>
                <TrendingUp className="w-3 h-3" />
                Score: {currentInsight.score}/100
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl line-clamp-1">
              {currentInsight.summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={() => fetchInsights(true)}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Reanalisar conversas do WhatsApp com Gemini"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
            <span>{loading ? 'Analisando...' : 'Re-analisar com IA'}</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition cursor-pointer"
            title={isExpanded ? 'Recolher Radar' : 'Expandir Radar'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-4 relative z-10">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setActiveTab('demands')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === 'demands'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Demandas Ocultas</span>
              {currentInsight.unmetDemands.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-purple-900/80 text-[10px] flex items-center justify-center font-black">
                  {currentInsight.unmetDemands.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('crosssell')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === 'crosssell'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Upsell & Combos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-400/20 text-emerald-300 font-bold border border-emerald-400/30">
                +20% Ticket
              </span>
            </button>

            <button
              onClick={() => setActiveTab('health')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === 'health'
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Fotos & Qualidade ({photoPercentage}%)</span>
              {withoutPhoto > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] flex items-center justify-center font-black">
                  {withoutPhoto}
                </span>
              )}
            </button>
          </div>

          {/* Tab 1: Demandas Ocultas */}
          {activeTab === 'demands' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentInsight.unmetDemands.map((demand, i) => (
                <div 
                  key={i} 
                  className="bg-slate-950/60 rounded-xl p-3.5 border border-purple-500/20 hover:border-purple-500/40 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        {demand.title}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {demand.demandLevel} PROCURA
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                      {demand.reason}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                    <div className="text-[11px] text-slate-400">
                      Sugerido: <strong className="text-emerald-400 font-bold">R$ {Number(demand.suggestedPrice || 25).toFixed(2)}</strong>
                      <span className="ml-2 text-slate-500">• {demand.suggestedCategory}</span>
                    </div>

                    <button
                      onClick={() => onAddSuggestedProduct({
                        name: demand.title,
                        price: demand.suggestedPrice || 25,
                        category: demand.suggestedCategory || 'Destaques',
                        description: demand.reason
                      })}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1 transition cursor-pointer shadow-sm shadow-emerald-500/20"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                      <span>Cadastrar</span>
                    </button>
                  </div>
                </div>
              ))}

              {currentInsight.topOpportunities.map((opp, idx) => (
                <div 
                  key={`opp-${idx}`}
                  className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800/70 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      {opp.productName}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {opp.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {opp.insight}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Upsell & Combos */}
          {activeTab === 'crosssell' && (
            <div className="bg-slate-950/60 rounded-xl p-4 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-black text-white">
                    {currentInsight.crossSellAction.title}
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {currentInsight.crossSellAction.ticketImpact}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentInsight.crossSellAction.suggestion}
                </p>
                <p className="text-[11px] text-slate-500 italic">
                  💡 A IA aplica essa técnica automaticamente na hora em que o cliente estiver fechando o pedido no WhatsApp.
                </p>
              </div>

              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3 text-center shrink-0 w-full sm:w-auto">
                <span className="text-[10px] font-bold text-emerald-300 uppercase block tracking-wider">
                  Potencial Estimado
                </span>
                <span className="text-xl font-black text-emerald-400">
                  {currentInsight.crossSellAction.ticketImpact}
                </span>
              </div>
            </div>
          )}

          {/* Tab 3: Fotos & Saúde Visual */}
          {activeTab === 'health' && (
            <div className="bg-slate-950/60 rounded-xl p-4 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-2 max-w-2xl w-full">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>Cobertura de Fotos no Catálogo</span>
                  <span className="text-emerald-400">{withPhoto} de {totalItems} itens ({photoPercentage}%)</span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${photoPercentage}%` }}
                  />
                </div>

                <p className="text-xs text-slate-400">
                  {withoutPhoto > 0 
                    ? `⚠️ ${withoutPhoto} produto(s) ainda não possuem foto cadastrada. No WhatsApp, produtos com foto recebem até 300% mais pedidos porque o cliente compra primeiro com os olhos!`
                    : '🎉 Parabéns! 100% dos seus produtos possuem foto cadastrada, garantindo o melhor impacto visual nas conversas do WhatsApp.'}
                </p>
              </div>

              {withoutPhoto > 0 && onFilterWithoutPhoto && (
                <button
                  onClick={onFilterWithoutPhoto}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver {withoutPhoto} Sem Foto</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
