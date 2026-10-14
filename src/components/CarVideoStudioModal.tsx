import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Sparkles, 
  Play, 
  Pause, 
  Volume2, 
  Video, 
  User, 
  Mic, 
  Film, 
  Check, 
  Copy, 
  Download, 
  Share2, 
  Car, 
  ShieldCheck, 
  Repeat, 
  Zap, 
  Loader2, 
  CheckCircle2, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Product } from '../types';

interface StudioPersona {
  id: string;
  name: string;
  role: string;
  gender: 'Feminino' | 'Masculino';
  tone: string;
  avatarUrl: string;
  badge: string;
}

interface ScriptResponse {
  title: string;
  hook: string;
  fullScript: string;
  cleanSpokenText: string;
  estimatedSeconds: number;
  specsCards: Array<{ label: string; value: string }>;
  captionsTimeline: Array<{ text: string; time: string }>;
  cta: string;
}

interface CarVideoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  establishmentId: string;
  storeName?: string;
  onProductUpdated?: (updatedProduct: Product) => void;
}

export const CarVideoStudioModal: React.FC<CarVideoStudioModalProps> = ({
  isOpen,
  onClose,
  product,
  establishmentId,
  storeName = 'Nossa Loja',
  onProductUpdated
}) => {
  const [format, setFormat] = useState<'influencer' | 'voiceover'>('influencer');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('sofia');
  const [personas, setPersonas] = useState<StudioPersona[]>([
    {
      id: 'sofia',
      name: 'Sofia',
      role: 'Consultora Digital',
      gender: 'Feminino',
      tone: 'Jovem, dinâmica, empática e persuasiva',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
      badge: 'Reels & Stories'
    },
    {
      id: 'lucas',
      name: 'Lucas',
      role: 'Especialista em Seminovos',
      gender: 'Masculino',
      tone: 'Profissional, seguro, foco em procedência e laudo cautelar',
      avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
      badge: 'Fechador de Negócios'
    },
    {
      id: 'locutor_tv',
      name: 'Locutor Cinema',
      role: 'Comercial em Off',
      gender: 'Masculino',
      tone: 'Voz cinematográfica e impactante estilo comercial de TV',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      badge: 'Narração em Off'
    }
  ]);

  // Form state
  const [carName, setCarName] = useState('');
  const [carPrice, setCarPrice] = useState<number | string>('');
  const [carCategory, setCarCategory] = useState('');
  const [highlights, setHighlights] = useState('Laudo cautelar 100% aprovado, revisado com garantia, aceitamos troca');
  
  // Pipeline status
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<ScriptResponse | null>(null);
  const [editedSpokenText, setEditedSpokenText] = useState('');
  
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [savingToVehicle, setSavingToVehicle] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync form when product changes
  useEffect(() => {
    if (product) {
      setCarName(product.name || '');
      setCarPrice(product.price || '');
      setCarCategory(product.category || 'Veículos');
      if (product.aiAudioUrl) {
        setAudioUrl(product.aiAudioUrl);
      } else {
        setAudioUrl(null);
      }
      if (product.aiVideoScript) {
        setGeneratedScript(product.aiVideoScript as ScriptResponse);
        setEditedSpokenText(product.aiVideoScript.cleanSpokenText || '');
      } else {
        setGeneratedScript(null);
        setEditedSpokenText('');
      }
      setSaveSuccess(false);
    }
  }, [product]);

  // Handle format toggle change
  const handleFormatChange = (newFormat: 'influencer' | 'voiceover') => {
    setFormat(newFormat);
    if (newFormat === 'voiceover') {
      setSelectedPersonaId('locutor_tv');
    } else if (selectedPersonaId === 'locutor_tv') {
      setSelectedPersonaId('sofia');
    }
  };

  const handleGenerateScript = async () => {
    if (!carName.trim()) return;
    setGeneratingScript(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/ai/car-video-studio/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carName,
          category: carCategory,
          price: carPrice,
          highlights,
          description: product?.description || '',
          format,
          personaId: selectedPersonaId,
          storeName
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar roteiro');

      setGeneratedScript(data.script);
      setEditedSpokenText(data.script.cleanSpokenText || '');
    } catch (err: any) {
      alert(`Falha ao gerar roteiro com IA: ${err.message}`);
    } finally {
      setGeneratingScript(false);
    }
  };

  const handleGenerateAudio = async () => {
    const textToSpeak = editedSpokenText || generatedScript?.cleanSpokenText;
    if (!textToSpeak) {
      alert('Gere ou digite o roteiro antes de sintetizar a voz.');
      return;
    }

    setGeneratingAudio(true);
    try {
      const res = await fetch('/api/ai/car-video-studio/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spokenText: textToSpeak,
          personaId: selectedPersonaId,
          storeId: establishmentId || 'default'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar áudio');

      setAudioUrl(data.audioUrl);
      // Auto-play the synthesized preview
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().catch(() => {});
          setIsPlayingAudio(true);
        }
      }, 300);
    } catch (err: any) {
      alert(`Falha ao sintetizar áudio: ${err.message}`);
    } finally {
      setGeneratingAudio(false);
    }
  };

  const toggleAudioPlayback = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlayingAudio(true);
    }
  };

  const handleSaveToVehicle = async () => {
    if (!product || !establishmentId) return;
    setSavingToVehicle(true);

    try {
      const res = await fetch('/api/ai/car-video-studio/attach-to-vehicle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: establishmentId,
          productId: product.id,
          audioUrl: audioUrl || null,
          videoUrl: product.videoUrl || null,
          scriptData: generatedScript
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar no veículo');

      setSaveSuccess(true);
      if (onProductUpdated) {
        onProductUpdated({
          ...product,
          aiAudioUrl: audioUrl || product.aiAudioUrl,
          aiVideoScript: generatedScript || product.aiVideoScript
        });
      }
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      alert(`Falha ao salvar no veículo: ${err.message}`);
    } finally {
      setSavingToVehicle(false);
    }
  };

  const copyScriptToClipboard = () => {
    if (!generatedScript) return;
    navigator.clipboard.writeText(generatedScript.fullScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  if (!isOpen) return null;

  const currentPersona = personas.find(p => p.id === selectedPersonaId) || personas[0];
  const previewImage = product?.imageUrl || (product?.images && product.images[0]) || 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Estúdio de Vídeo IA & Influencer</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-sm">
                  Exclusivo Automotivo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Gere roteiro magnético e voz ultra-realista para transformar o veículo em um Reels de alta conversão.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Form & Configuration (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* Step 1: Format Selector */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5">
                1. Formato do Vídeo
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleFormatChange('influencer')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    format === 'influencer'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${format === 'influencer' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      Influencer Virtual
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      Avatar em destaque na tela conduzindo a apresentação.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleFormatChange('voiceover')}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    format === 'voiceover'
                      ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${format === 'voiceover' ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      Comercial em Off
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      Foco total no carro com narração cinematográfica.
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Step 2: Persona Selection */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2.5">
                2. Apresentador(a) / Voz da Loja
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {personas.map(p => {
                  const isSelected = selectedPersonaId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersonaId(p.id)}
                      className={`relative flex items-center sm:flex-col sm:items-center text-left sm:text-center gap-3 p-2.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-gradient-to-b from-indigo-950/80 to-slate-900 border-indigo-400 ring-2 ring-indigo-500/30 text-white'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="relative">
                        <img 
                          src={p.avatarUrl} 
                          alt={p.name} 
                          className="w-12 h-12 rounded-full object-cover border-2 border-slate-700 shadow-md"
                        />
                        {isSelected && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center border-2 border-slate-900">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white">{p.name}</div>
                        <div className="text-[10px] text-slate-400">{p.role}</div>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-800 text-indigo-300 border border-slate-700/60">
                          {p.badge}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Vehicle Data & Script Trigger */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                3. Dados do Veículo para a IA
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Veículo / Modelo</label>
                  <input
                    type="text"
                    value={carName}
                    onChange={e => setCarName(e.target.value)}
                    placeholder="Ex: Honda Civic Touring 1.5 Turbo 2021"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Preço (R$)</label>
                  <input
                    type="text"
                    value={carPrice}
                    onChange={e => setCarPrice(e.target.value)}
                    placeholder="Ex: 139900"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Destaques e Condições</label>
                <input
                  type="text"
                  value={highlights}
                  onChange={e => setHighlights(e.target.value)}
                  placeholder="Ex: Teto solar, 40.000 km, IPVA pago, garantia de 1 ano, aceita troca"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={generatingScript || !carName.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingScript ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando Roteiro Magnético com Gemini 2.5...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {generatedScript ? 'Regerar Roteiro com IA' : 'Gerar Roteiro para Vídeo com IA'}
                  </>
                )}
              </button>
            </div>

            {/* Step 4: Generated Script Preview & Speech Synthesis */}
            {generatedScript && (
              <div className="bg-slate-800/60 border border-indigo-500/30 rounded-xl p-4 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-400" /> Roteiro Gerado (~{generatedScript.estimatedSeconds}s)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={copyScriptToClipboard}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedScript ? 'Copiado!' : 'Copiar Roteiro'}
                  </button>
                </div>

                {/* Hook Box */}
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
                  <span className="font-bold text-amber-400">🔥 Gancho Inicial (0-3s): </span>
                  "{generatedScript.hook}"
                </div>

                {/* Script Editor */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Texto que a Voz IA vai narrar (editável):
                  </label>
                  <textarea
                    rows={4}
                    value={editedSpokenText}
                    onChange={e => setEditedSpokenText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500 font-sans"
                  />
                </div>

                {/* Trigger Voice Synthesis */}
                <button
                  type="button"
                  onClick={handleGenerateAudio}
                  disabled={generatingAudio}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
                >
                  {generatingAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sintetizando Voz Neural Ultra-Realista...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      {audioUrl ? 'Regerar Voz do Narrador' : 'Gerar Áudio da Voz com IA'}
                    </>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* Right Column: Live Video Mockup Player (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            
            <div className="w-full max-w-[280px] sm:max-w-[320px] bg-slate-950 border-2 border-slate-700/80 rounded-3xl p-3 shadow-2xl relative overflow-hidden flex flex-col">
              
              {/* Notch Header */}
              <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-slate-900" />
              </div>

              {/* Vertical Screen Container (9:16 Aspect) */}
              <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex flex-col justify-between">
                
                {/* Background Car Media */}
                {product?.videoUrl ? (
                  <video
                    src={product.videoUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={previewImage}
                    alt={carName || 'Veículo'}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}

                {/* Gradient Overlays for High Legibility */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 pointer-events-none" />

                {/* Top Badge: Dealership & Model */}
                <div className="relative z-10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                    <Car className="w-3 h-3 text-indigo-400" />
                    <span className="text-[10px] font-bold text-white truncate max-w-[140px]">
                      {storeName}
                    </span>
                  </div>

                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/90 text-slate-950 shadow">
                    EM ESTOQUE
                  </span>
                </div>

                {/* Center Overlay: Animated Specs Cards */}
                <div className="relative z-10 px-3 space-y-1.5 my-auto">
                  {generatedScript?.specsCards ? (
                    <div className="space-y-1">
                      {generatedScript.specsCards.slice(0, 3).map((spec, i) => (
                        <div 
                          key={i} 
                          className="flex items-center justify-between bg-black/75 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-lg text-[10px]"
                        >
                          <span className="text-slate-300 font-medium">{spec.label}</span>
                          <span className="text-amber-300 font-bold">{spec.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-black/60 backdrop-blur-md border border-white/10 p-2.5 rounded-xl text-center">
                      <p className="text-[11px] font-semibold text-white truncate">{carName || 'Seu Veículo Aqui'}</p>
                      <p className="text-[10px] text-emerald-400 font-bold mt-0.5">
                        {carPrice ? `R$ ${Number(carPrice).toLocaleString('pt-BR')}` : 'Consulte Valor'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Bottom Overlay: Influencer / Presenter Box & Audio Controls */}
                <div className="relative z-10 p-3 space-y-2">
                  
                  {/* Dynamic Subtitle / Hook */}
                  <div className="bg-black/80 backdrop-blur-md border border-white/20 p-2 rounded-xl text-center">
                    <p className="text-[10px] text-white font-bold leading-tight">
                      {generatedScript?.hook || 'Filme o carro e deixe nossa IA apresentar com perfeição.'}
                    </p>
                  </div>

                  {/* Influencer PIP Avatar or Cinema Badge */}
                  {format === 'influencer' ? (
                    <div className="flex items-center gap-2 bg-gradient-to-r from-slate-950/90 to-indigo-950/90 backdrop-blur-md p-1.5 rounded-xl border border-indigo-500/40 shadow-xl">
                      <div className="relative">
                        <img
                          src={currentPersona.avatarUrl}
                          alt={currentPersona.name}
                          className="w-10 h-10 rounded-full object-cover border-2 border-indigo-400"
                        />
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-black text-white truncate flex items-center gap-1">
                          {currentPersona.name}
                          <span className="text-[9px] text-indigo-300 font-normal">({currentPersona.role})</span>
                        </div>
                        <div className="text-[9px] text-slate-300 truncate">
                          Apresentando {carName || 'o seminovo'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-black/80 backdrop-blur-md p-1.5 rounded-xl border border-purple-500/40">
                      <Film className="w-5 h-5 text-purple-400 ml-1" />
                      <div className="text-[10px] text-white font-bold">
                        Locução em Off: {currentPersona.name}
                      </div>
                    </div>
                  )}

                  {/* Audio Player Controls */}
                  {audioUrl && (
                    <div className="flex items-center justify-between bg-emerald-950/90 border border-emerald-500/50 p-2 rounded-xl">
                      <audio
                        ref={audioRef}
                        src={audioUrl}
                        onEnded={() => setIsPlayingAudio(false)}
                      />
                      <button
                        type="button"
                        onClick={toggleAudioPlayback}
                        className="flex items-center gap-2 text-[10px] font-bold text-white hover:text-emerald-300 transition-colors"
                      >
                        {isPlayingAudio ? (
                          <>
                            <Pause className="w-3.5 h-3.5 text-emerald-400" />
                            Pausar Áudio IA
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 text-emerald-400" />
                            Ouvir Narrador IA
                          </>
                        )}
                      </button>

                      <a
                        href={audioUrl}
                        download={`apresentacao_${carName.replace(/\s+/g, '_')}.mp3`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-white"
                        title="Baixar arquivo de áudio"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                </div>

              </div>

            </div>

            {/* Action Buttons Below Mockup */}
            <div className="w-full max-w-[280px] sm:max-w-[320px] mt-4 space-y-2">
              <button
                type="button"
                onClick={handleSaveToVehicle}
                disabled={savingToVehicle || (!audioUrl && !generatedScript)}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50"
              >
                {savingToVehicle ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando no Veículo...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    Vinculado com Sucesso!
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Salvar Roteiro & Áudio no Veículo
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400 text-center leading-tight">
                O áudio e roteiro salvos serão usados pela IA do WhatsApp e exibidos na ficha do veículo no site.
              </p>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
