import React, { useState, useEffect, useRef } from 'react';
import { 
  Megaphone, 
  Plus, 
  Calendar, 
  Clock, 
  Users, 
  Send, 
  Image as ImageIcon, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Smartphone, 
  X,
  Upload,
  Loader2,
  RefreshCw,
  Eye,
  Sliders,
  BellRing,
  MessageCircle,
  Users2,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CampaignTemplate, Establishment, WhatsAppGroup } from '../types';
import { getSegmentConfig } from '../utils/segments';

interface CampaignsViewProps {
  establishmentId: string;
  establishment: Establishment | null;
  onNavigateToWhatsApp?: () => void;
}

const DAYS_OF_WEEK = [
  { id: 0, label: 'Dom', full: 'Domingo' },
  { id: 1, label: 'Seg', full: 'Segunda-feira' },
  { id: 2, label: 'Ter', full: 'Terça-feira' },
  { id: 3, label: 'Qua', full: 'Quarta-feira' },
  { id: 4, label: 'Qui', full: 'Quinta-feira' },
  { id: 5, label: 'Sex', full: 'Sexta-feira' },
  { id: 6, label: 'Sáb', full: 'Sábado' },
];

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  establishmentId,
  establishment,
  onNavigateToWhatsApp
}) => {
  const segConfig = getSegmentConfig(establishment?.segment);
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [audienceCount, setAudienceCount] = useState<number>(0);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<CampaignTemplate> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);
  const [sendResultNotice, setSendResultNotice] = useState<string | null>(null);
  const [confirmSendCampaign, setConfirmSendCampaign] = useState<CampaignTemplate | null>(null);
  const [showAntiBanGuide, setShowAntiBanGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch campaigns, audience, groups and periodic cron check
  useEffect(() => {
    fetchCampaigns();
    fetchAudience();
    fetchGroups();

    // Check scheduled campaigns every 20 seconds
    const checkSchedule = async () => {
      try {
        await fetch('/api/cron/check-campaigns');
      } catch {}
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 20000);
    return () => clearInterval(interval);
  }, [establishmentId]);

  const fetchGroups = async () => {
    try {
      setLoadingGroups(true);
      const res = await fetch(`/api/evolution/groups?establishmentId=${establishmentId}`, {
        headers: {
          'x-establishment-id': establishmentId
        }
      });
      const data = await res.json();
      if (Array.isArray(data.groups)) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.warn('Erro ao carregar grupos do WhatsApp:', err);
    } finally {
      setLoadingGroups(false);
    }
  };

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/campaigns?establishmentId=${establishmentId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCampaigns(data);
      }
    } catch (err) {
      console.error('Erro ao carregar campanhas:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAudience = async () => {
    try {
      const res = await fetch(`/api/campaigns/audience?establishmentId=${establishmentId}`);
      const data = await res.json();
      if (data && typeof data.totalCount === 'number') {
        setAudienceCount(data.totalCount);
      }
    } catch (err) {
      console.warn('Erro ao carregar audiência de clientes:', err);
    }
  };

  const handleOpenNewModal = () => {
    const segConfig = getSegmentConfig(establishment?.segment);
    let defaultTitle = 'Abertura da Cozinha - 18h';
    let defaultTime = '18:00';
    let defaultMsg = 'Boa noite, *{cliente}*! 🍔🔥\n\nNossa cozinha acabou de abrir com novidades deliciosas saindo do fogo agora!\n\nHoje temos promoção imperdível em nossos lanches artesanais. Peça agora pelo WhatsApp antes que acabe!\n\nBasta responder esta mensagem para ver nosso cardápio ou fazer seu pedido. 🛵';

    if (segConfig.id === 'VEHICLES') {
      defaultTitle = 'Novidades no Estoque de Veículos';
      defaultTime = '10:00';
      defaultMsg = 'Olá, *{cliente}*! 🚗🔥\n\nAcabaram de chegar novos veículos no nosso estoque aqui na *{loja}* com condições especiais de financiamento e entrada facilitada!\n\nAceitamos seu carro ou moto na troca com avaliação justa.\n\nBasta responder esta mensagem para receber as fotos, anos e valores dos modelos disponíveis!';
    } else if (segConfig.id === 'REAL_ESTATE') {
      defaultTitle = 'Destaques Imobiliários da Semana';
      defaultTime = '10:00';
      defaultMsg = 'Olá, *{cliente}*! 🏡✨\n\nSeparamos oportunidades exclusivas de imóveis para venda e locação nesta semana na *{loja}*!\n\nBasta responder esta mensagem informando o bairro ou perfil que você procura para receber as fotos e agendar uma visita!';
    } else if (segConfig.id === 'FASHION') {
      defaultTitle = 'Novidades da Coleção';
      defaultTime = '14:00';
      defaultMsg = 'Olá, *{cliente}*! ✨👗\n\nChegaram peças incríveis na nossa nova coleção aqui na *{loja}*!\n\nPeças com caimento perfeito nos tamanhos P, M e G. Responda aqui para ver as fotos e garantir a sua antes que esgote!';
    } else if (segConfig.id === 'ELECTRONICS') {
      defaultTitle = 'Ofertas de Smartphones & Aparelhos';
      defaultTime = '11:00';
      defaultMsg = 'Fala, *{cliente}*! 📱💥\n\nChegaram novos aparelhos com garantia e preço especial aqui na *{loja}*!\n\nBateria 100%, parcelamento em até 12x ou desconto no Pix. Responda aqui para receber a lista atualizada com fotos dos modelos!';
    } else if (segConfig.id === 'GENERAL') {
      defaultTitle = 'Novidades & Ofertas Especiais';
      defaultTime = '09:00';
      defaultMsg = 'Olá, *{cliente}*! 👋🎉\n\nTemos novidades e ofertas imperdíveis preparadas para você aqui na *{loja}*!\n\nResponda esta mensagem para tirar dúvidas ou fazer seu pedido diretamente pelo WhatsApp!';
    }

    setEditingCampaign({
      title: defaultTitle,
      scheduledTime: defaultTime,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0], // Todos os dias por padrão
      active: true,
      targetAudience: 'ALL_CUSTOMERS',
      targetGroupIds: [],
      message: defaultMsg,
      imageUrl: ''
    });
    if (groups.length === 0) {
      fetchGroups();
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (camp: CampaignTemplate) => {
    setEditingCampaign({ 
      ...camp,
      targetAudience: camp.targetAudience || 'ALL_CUSTOMERS',
      targetGroupIds: camp.targetGroupIds || []
    });
    if (groups.length === 0) {
      fetchGroups();
    }
    setIsModalOpen(true);
  };

  const handleToggleGroup = (groupId: string) => {
    if (!editingCampaign) return;
    const current = editingCampaign.targetGroupIds || [];
    const exists = current.includes(groupId);
    const updated = exists ? current.filter(id => id !== groupId) : [...current, groupId];
    setEditingCampaign({ ...editingCampaign, targetGroupIds: updated });
  };

  const handleSelectAllGroups = () => {
    if (!editingCampaign) return;
    setEditingCampaign({ ...editingCampaign, targetGroupIds: groups.map(g => g.id) });
  };

  const handleDeselectAllGroups = () => {
    if (!editingCampaign) return;
    setEditingCampaign({ ...editingCampaign, targetGroupIds: [] });
  };

  const handleToggleDay = (dayId: number) => {
    if (!editingCampaign) return;
    const currentDays = editingCampaign.daysOfWeek || [];
    const exists = currentDays.includes(dayId);
    const updated = exists 
      ? currentDays.filter(d => d !== dayId)
      : [...currentDays, dayId].sort();
    setEditingCampaign({ ...editingCampaign, daysOfWeek: updated });
  };

  const handleSelectAllDays = () => {
    if (!editingCampaign) return;
    setEditingCampaign({ ...editingCampaign, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
  };

  const handleSelectWeekdays = () => {
    if (!editingCampaign) return;
    setEditingCampaign({ ...editingCampaign, daysOfWeek: [1, 2, 3, 4, 5] });
  };

  const handleSelectWeekend = () => {
    if (!editingCampaign) return;
    setEditingCampaign({ ...editingCampaign, daysOfWeek: [5, 6, 0] });
  };

  const handleInsertVariable = (varName: string) => {
    if (!editingCampaign) return;
    setEditingCampaign(prev => ({
      ...prev,
      message: (prev?.message || '') + varName
    }));
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCampaign) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 8MB.');
      return;
    }

    try {
      setUploadingImage(true);
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const store = establishmentId || 'default';
      const fileId = editingCampaign.id || Date.now().toString();
      const storageRef = ref(storage, `establishments/${store}/campaigns/${fileId}_${cleanFileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setEditingCampaign(prev => prev ? { ...prev, imageUrl: downloadUrl } : null);
    } catch (err: any) {
      console.error('Erro ao fazer upload da imagem:', err);
      alert('Não foi possível enviar a arte. Tente novamente ou use uma URL direta.');
    } finally {
      setUploadingImage(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleToggleActive = async (camp: CampaignTemplate) => {
    try {
      const res = await fetch(`/api/campaigns/${camp.id}/toggle?establishmentId=${establishmentId}`, {
        method: 'POST'
      });
      if (res.ok) {
        setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, active: !c.active } : c));
      }
    } catch (err) {
      console.error('Erro ao alternar status da campanha:', err);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta campanha de disparo?')) return;
    try {
      const res = await fetch(`/api/campaigns/${id}?establishmentId=${establishmentId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setCampaigns(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Erro ao excluir campanha:', err);
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign?.title || !editingCampaign.message) {
      alert('Por favor, preencha o título e a mensagem do template.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-establishment-id': establishmentId 
        },
        body: JSON.stringify({
          ...editingCampaign,
          establishmentId
        })
      });

      if (!res.ok) throw new Error('Falha ao salvar campanha');

      await fetchCampaigns();
      setIsModalOpen(false);
      setEditingCampaign(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar campanha');
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteSendNow = async (camp: CampaignTemplate) => {
    try {
      setSendingNowId(camp.id);
      setConfirmSendCampaign(null);
      const isGroups = camp.targetAudience === 'WHATSAPP_GROUPS';
      setSendResultNotice(
        isGroups
          ? `Iniciando disparos para ${(camp.targetGroupIds || []).length} grupo(s) do WhatsApp...`
          : 'Iniciando disparos em segundo plano para sua base de clientes...'
      );

      const res = await fetch(`/api/campaigns/${camp.id}/send-now?establishmentId=${establishmentId}`, {
        method: 'POST'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar disparo');
      }

      setSendResultNotice(
        isGroups
          ? `✅ Disparo em grupos concluído! Mensagem enviada para ${data.sentCount || 0} grupo(s) do WhatsApp.`
          : `✅ Disparo concluído com sucesso! Enviado para ${data.sentCount || 0} cliente(s) da sua loja.`
      );
      await fetchCampaigns();
    } catch (err: any) {
      console.error('Erro no disparo:', err);
      setSendResultNotice(`❌ Erro no disparo: ${err.message}`);
    } finally {
      setSendingNowId(null);
      setTimeout(() => setSendResultNotice(null), 8000);
    }
  };

  const activeCount = campaigns.filter(c => c.active).length;
  const totalSentAll = campaigns.reduce((acc, c) => acc + (c.stats?.totalSent || 0), 0);

  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-5 sm:space-y-8 max-w-7xl mx-auto">
      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Disparos Agendados & Campanhas
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Marketing WhatsApp
              </span>
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configure templates com fotos e arte promocional para disparar automaticamente nos horários de abertura da sua loja para quem já comprou com você!
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={fetchCampaigns}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer shrink-0"
            title="Atualizar lista"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenNewModal}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Template de Disparo</span>
          </button>
        </div>
      </div>

      {/* WhatsApp Status Alert if disconnected */}
      {!establishment?.evolutionConnected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
            <span>
              <strong>Atenção:</strong> O WhatsApp da sua loja está desconectado. Para que os disparos automáticos sejam entregues, mantenha sua instância conectada.
            </span>
          </div>
          {onNavigateToWhatsApp && (
            <button
              onClick={onNavigateToWhatsApp}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/40 transition shrink-0 cursor-pointer"
            >
              Conectar WhatsApp
            </button>
          )}
        </div>
      )}

      {/* Notice Banner */}
      {sendResultNotice && (
        <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl p-4 text-emerald-300 text-sm flex items-center justify-between shadow-xl animate-in fade-in">
          <span>{sendResultNotice}</span>
          <button onClick={() => setSendResultNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Anti-Ban Protection & Chip Health Center */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-white">Central de Proteção Anti-Ban & Saúde do Chip</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  3 Escudos Ativos 🛡️
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Seu número está protegido por algoritmos que simulam o comportamento humano e evitam denúncias.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAntiBanGuide(!showAntiBanGuide)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>{showAntiBanGuide ? 'Ocultar Guia' : 'Ver Guia de Aquecimento & Regras'}</span>
            {showAntiBanGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* 3 Active Shield Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-200">Fila Jitter (25s a 45s)</div>
              <div className="text-[11px] text-slate-400 truncate">Pausas humanas entre envios</div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-200">Opt-out Automático ("0")</div>
              <div className="text-[11px] text-slate-400 truncate">Descadastro sem denúncia à Meta</div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-200">Spintax & Hash Única</div>
              <div className="text-[11px] text-slate-400 truncate">Variação digital por mensagem</div>
            </div>
          </div>
        </div>

        {/* Collapsible Warm-up & Best Practices Guide */}
        {showAntiBanGuide && (
          <div className="pt-4 border-t border-slate-800 space-y-4 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Warm-up Table */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                  📈 Tabela de Aquecimento Seguro do Chip
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Para números novos ou recém-ativados, aumente o volume aos poucos:
                </p>
                <div className="divide-y divide-slate-800/60 text-xs">
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-slate-300">🐣 <strong>Chip Novo (Dias 1 a 7):</strong></span>
                    <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">Até 15 envios/dia</span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-slate-300">🔥 <strong>Em Aquecimento (Dias 8 a 15):</strong></span>
                    <span className="font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">20 a 50 envios/dia</span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-slate-300">💎 <strong>Chip Maduro (+30 dias de uso):</strong></span>
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">100 a 200 envios/dia</span>
                  </div>
                </div>
              </div>

              {/* 3 Golden Rules */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                  ⭐ As 3 Regras de Ouro Anti-Bloqueio
                </span>
                <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold">1.</span>
                    <span><strong>Nunca use listas compradas de terceiros:</strong> Envie apenas para quem já é seu cliente. Listas frias geram denúncias instantâneas.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">2.</span>
                    <span><strong>Horário Comercial Seguro (09:00 às 20:30):</strong> Disparos enviados tarde da noite incomodam os clientes e disparam denúncias de spam.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold">3.</span>
                    <span><strong>Separe o chip se for fazer volume extremo:</strong> Para campanhas de centenas de mensagens diárias, use um chip exclusivo de vendas para blindar o número principal.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Audience Reach */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Base de Clientes</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white">{audienceCount}</div>
            <p className="text-xs text-slate-400 mt-0.5">Clientes únicos que já pediram</p>
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Campanhas Ativas</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Megaphone className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-400">{activeCount} / {campaigns.length}</div>
            <p className="text-xs text-slate-400 mt-0.5">Templates em monitoramento</p>
          </div>
        </div>

        {/* Total Sent */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mensagens Enviadas</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Send className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-purple-300">{totalSentAll}</div>
            <p className="text-xs text-slate-400 mt-0.5">Impactos totais gerados</p>
          </div>
        </div>

        {/* Delivery Timing */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Modo Automático</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Horário de Brasília
            </div>
            <p className="text-xs text-slate-400 mt-1">Disparos no horário exato configurado</p>
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            Seus Templates de Disparo
          </h3>
          <span className="text-xs text-slate-400">
            {campaigns.length} template(s) cadastrado(s)
          </span>
        </div>

        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Carregando campanhas agendadas...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
              <Megaphone className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto">
              <h4 className="font-bold text-white text-base">Nenhum template de disparo criado</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Crie um template promocional com a foto do seu melhor produto para disparar todos os dias às 18:00 quando a loja abre e convidar seus clientes de volta!
              </p>
            </div>
            <button
              onClick={handleOpenNewModal}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Criar Primeiro Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {campaigns.map((camp) => (
              <div 
                key={camp.id}
                className={`bg-slate-900/90 border rounded-3xl p-6 space-y-5 transition-all duration-200 relative overflow-hidden backdrop-blur-sm ${
                  camp.active 
                    ? 'border-slate-800 hover:border-slate-700 shadow-xl' 
                    : 'border-slate-800/50 opacity-70'
                }`}
              >
                {/* Header with Title & Active Toggle */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <h4 className="font-bold text-white text-base leading-tight">
                        {camp.title}
                      </h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        camp.active
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {camp.active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1 font-mono text-emerald-400 font-bold bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                        <Clock className="w-3.5 h-3.5" />
                        {camp.scheduledTime}
                      </span>
                      {camp.targetAudience === 'WHATSAPP_GROUPS' ? (
                        <span className="flex items-center gap-1 text-purple-300 font-semibold bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20">
                          <Users2 className="w-3.5 h-3.5" />
                          {(camp.targetGroupIds || []).length} grupo(s) do WhatsApp
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-blue-300 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20">
                          <Users className="w-3.5 h-3.5" />
                          Base de Clientes ({audienceCount})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={() => handleToggleActive(camp)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      camp.active ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                    title={camp.active ? 'Pausar disparo' : 'Ativar disparo'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        camp.active ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Days of week chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {DAYS_OF_WEEK.map((d) => {
                    const isSelected = (camp.daysOfWeek || []).includes(d.id);
                    return (
                      <span
                        key={d.id}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                          isSelected
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-950 text-slate-500 border-slate-800/80'
                        }`}
                      >
                        {d.label}
                      </span>
                    );
                  })}
                </div>

                {/* Content Preview (Photo + Text) */}
                <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 flex gap-4 items-start">
                  {camp.imageUrl ? (
                    <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-800 shrink-0 bg-slate-900">
                      <img 
                        src={camp.imageUrl} 
                        alt="Arte do disparo" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed border-slate-800 shrink-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50">
                      <ImageIcon className="w-6 h-6 mb-1 opacity-60" />
                      <span className="text-[10px]">Sem foto</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 whitespace-pre-line line-clamp-3 leading-relaxed">
                      {camp.message}
                    </p>
                    {camp.stats && (
                      <div className="mt-2 pt-2 border-t border-slate-900 flex items-center gap-4 text-[11px] text-slate-400">
                        <span>Total disparado: <strong className="text-slate-200">{camp.stats.totalSent || 0}</strong></span>
                        {camp.lastRunAt && (
                          <span>Último: {new Date(camp.lastRunAt).toLocaleDateString('pt-BR')}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <button
                    onClick={() => setConfirmSendCampaign(camp)}
                    disabled={sendingNowId === camp.id}
                    className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    {sendingNowId === camp.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Disparando...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Disparar Agora (Teste)
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(camp)}
                      className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition cursor-pointer"
                      title="Editar Campanha"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCampaign(camp.id)}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                      title="Excluir Campanha"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Immediate Send */}
      {confirmSendCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-purple-400">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">Confirmar Disparo Imediato</h4>
                <p className="text-xs text-slate-400">Campanha: {confirmSendCampaign.title}</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Destino do Disparo:</span>
                <strong className={confirmSendCampaign.targetAudience === 'WHATSAPP_GROUPS' ? 'text-purple-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {confirmSendCampaign.targetAudience === 'WHATSAPP_GROUPS'
                    ? `${(confirmSendCampaign.targetGroupIds || []).length} grupo(s) do WhatsApp`
                    : `${audienceCount} clientes que já pediram`}
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Imagem/Arte:</span>
                <strong className="text-slate-200">{confirmSendCampaign.imageUrl ? 'Sim (com foto)' : 'Apenas texto'}</strong>
              </div>
              {confirmSendCampaign.targetAudience === 'WHATSAPP_GROUPS' ? (
                <div className="pt-2 border-t border-slate-800/80 space-y-1 text-emerald-400 text-[11px] flex items-start gap-2 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span className="text-emerald-300 leading-relaxed">
                    <strong>100% Seguro:</strong> A IA <u>NÃO</u> responde mensagens dentro de nenhum grupo. Ela apenas envia sua publicação/promoção. Quem for pedir chamará você no privado!
                  </span>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-emerald-300">
                  <span className="font-bold flex items-center gap-1.5 text-emerald-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" /> Proteção Anti-Ban Ativada:
                  </span>
                  <div className="space-y-0.5 text-slate-300 leading-relaxed pl-5">
                    <p>• Intervalo seguro de <strong>25s a 45s</strong> entre cada contato para proteger seu chip contra bloqueios.</p>
                    <p>• Cada mensagem recebe variações de texto e hash única (Spintax).</p>
                    <p>• Rodapé automático <em>"Responda 0 para sair"</em> (descadastra o cliente na hora se ele não quiser receber).</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSendCampaign(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleExecuteSendNow(confirmSendCampaign)}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Iniciar Disparo Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Campaign Modal */}
      {isModalOpen && editingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full my-2 sm:my-8 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">
                    {editingCampaign.id ? 'Editar Template de Disparo' : 'Novo Template de Disparo'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina o horário, a imagem e o texto promocional que será enviado
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingCampaign(null);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: 2 Columns (Form + WhatsApp Preview) */}
            <form onSubmit={handleSaveCampaign} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Controls (7 cols) */}
              <div className="lg:col-span-7 space-y-5">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome da Campanha / Template:
                  </label>
                  <input
                    type="text"
                    required
                    value={editingCampaign.title || ''}
                    onChange={e => setEditingCampaign({ ...editingCampaign, title: e.target.value })}
                    placeholder={`Ex: Novidades & Ofertas de ${segConfig.itemPluralNoun}`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Target Audience Selector */}
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                  <label className="block text-xs font-bold text-slate-200">
                    Destino do Disparo (Para onde enviar?):
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setEditingCampaign({ ...editingCampaign, targetAudience: 'ALL_CUSTOMERS' })}
                      className={`p-3 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                        editingCampaign.targetAudience !== 'WHATSAPP_GROUPS'
                          ? 'bg-blue-500/10 border-blue-500/50 text-white shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        editingCampaign.targetAudience !== 'WHATSAPP_GROUPS'
                          ? 'bg-blue-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold">Base de Clientes (1-a-1)</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Envia no privado dos clientes ({audienceCount} clientes)
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingCampaign({ ...editingCampaign, targetAudience: 'WHATSAPP_GROUPS' })}
                      className={`p-3 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                        editingCampaign.targetAudience === 'WHATSAPP_GROUPS'
                          ? 'bg-purple-500/10 border-purple-500/50 text-white shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        editingCampaign.targetAudience === 'WHATSAPP_GROUPS'
                          ? 'bg-purple-500 text-white font-bold'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        <Users2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold">Grupos do WhatsApp</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Dispara nos grupos que você participa (Bairro, amigos, etc.)
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Groups checklist and safety warning */}
                  {editingCampaign.targetAudience === 'WHATSAPP_GROUPS' && (
                    <div className="pt-2 space-y-3">
                      {/* Safety Banner */}
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs">
                        <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                        <div className="text-emerald-300 leading-relaxed text-[11px]">
                          <strong className="text-emerald-200">100% Seguro:</strong> A IA <u>NÃO</u> responde mensagens dentro dos grupos. Ela apenas publica seu anúncio/promoção. Quem quiser pedir vai chamar você no privado!
                        </div>
                      </div>

                      {/* Group selection header */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <span>Grupos do seu WhatsApp:</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                            {(editingCampaign.targetGroupIds || []).length} selecionado(s)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          <button
                            type="button"
                            onClick={handleSelectAllGroups}
                            className="text-purple-400 hover:underline cursor-pointer"
                          >
                            Todos
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={handleDeselectAllGroups}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            Nenhum
                          </button>
                          <span className="text-slate-600">|</span>
                          <button
                            type="button"
                            onClick={fetchGroups}
                            disabled={loadingGroups}
                            className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${loadingGroups ? 'animate-spin' : ''}`} />
                            Atualizar
                          </button>
                        </div>
                      </div>

                      {/* Group Search Filter */}
                      {groups.length > 0 && (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={groupSearch}
                            onChange={(e) => setGroupSearch(e.target.value)}
                            placeholder="Filtrar por nome do grupo (ex: Bairro, Condomínio, Delivery)..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3.5 py-2 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      )}

                      {/* Groups list */}
                      {loadingGroups ? (
                        <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          <span>Buscando seus grupos do WhatsApp...</span>
                        </div>
                      ) : groups.length === 0 ? (
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-center text-xs text-slate-400 space-y-2">
                          <p>Nenhum grupo encontrado na sua conta do WhatsApp ou WhatsApp desconectado.</p>
                          <button
                            type="button"
                            onClick={fetchGroups}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Tentar Novamente
                          </button>
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/40">
                          {groups
                            .filter(g => !groupSearch || g.subject.toLowerCase().includes(groupSearch.toLowerCase()))
                            .map((group) => {
                              const isChecked = (editingCampaign.targetGroupIds || []).includes(group.id);
                              return (
                                <label
                                  key={group.id}
                                  className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                                    isChecked ? 'bg-purple-950/30 border border-purple-500/30' : 'hover:bg-slate-900 border border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleGroup(group.id)}
                                      className="w-4 h-4 rounded text-purple-500 focus:ring-purple-500 bg-slate-950 border-slate-800 cursor-pointer"
                                    />
                                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                                      {group.pictureUrl ? (
                                        <img src={group.pictureUrl} alt={group.subject} className="w-full h-full object-cover" />
                                      ) : (
                                        <Users2 className="w-3.5 h-3.5 text-slate-400" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-white truncate max-w-[240px] sm:max-w-[320px]">
                                        {group.subject}
                                      </div>
                                      {group.size !== undefined && (
                                        <div className="text-[10px] text-slate-400">
                                          {group.size} participantes
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                    isChecked ? 'bg-purple-500/20 text-purple-300' : 'text-slate-500'
                                  }`}>
                                    {isChecked ? 'Selecionado' : 'Ignorar'}
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Time & Quick Presets */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      Horário do Disparo:
                    </label>
                    <input
                      type="time"
                      required
                      value={editingCampaign.scheduledTime || '18:00'}
                      onChange={e => setEditingCampaign({ ...editingCampaign, scheduledTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      Status Inicial:
                    </label>
                    <select
                      value={editingCampaign.active ? 'active' : 'paused'}
                      onChange={e => setEditingCampaign({ ...editingCampaign, active: e.target.value === 'active' })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="active">🟢 Ativo (Agendado)</option>
                      <option value="paused">⚪ Pausado (Não disparar)</option>
                    </select>
                  </div>
                </div>

                {/* Days of week selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      Dias da Semana para Disparo:
                    </label>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={handleSelectAllDays}
                        className="text-emerald-400 hover:underline cursor-pointer"
                      >
                        Todos
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={handleSelectWeekdays}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        Seg-Sex
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={handleSelectWeekend}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        Fim de Semana
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS_OF_WEEK.map((d) => {
                      const isSelected = (editingCampaign.daysOfWeek || []).includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleToggleDay(d.id)}
                          className={`py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex flex-col items-center justify-center ${
                            isSelected
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span>{d.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Promotional Image / Banner Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                      Foto ou Arte da Promoção (Opcional):
                    </span>
                    {editingCampaign.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditingCampaign({ ...editingCampaign, imageUrl: '' })}
                        className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                      >
                        Remover foto
                      </button>
                    )}
                  </label>

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2 transition cursor-pointer"
                    >
                      {uploadingImage ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          <span>Enviando arte da promoção...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-emerald-400" />
                          <span>{editingCampaign.imageUrl ? 'Substituir Arte' : 'Selecionar Imagem do Computador'}</span>
                        </>
                      )}
                    </button>

                    <input
                      type="url"
                      value={editingCampaign.imageUrl || ''}
                      onChange={e => setEditingCampaign({ ...editingCampaign, imageUrl: e.target.value })}
                      placeholder="Ou cole a URL da imagem aqui"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Message Body with Variable Buttons */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Mensagem de Disparo (WhatsApp):
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">Variáveis rápidas:</span>
                      <button
                        type="button"
                        onClick={() => handleInsertVariable('{cliente}')}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 cursor-pointer"
                        title="Substitui pelo primeiro nome do cliente"
                      >
                        +{'{cliente}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertVariable('{loja}')}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 cursor-pointer"
                        title="Substitui pelo nome da loja"
                      >
                        +{'{loja}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertVariable('{Olá|Oi|Tudo bem?}')}
                        className="text-[10px] px-2 py-0.5 rounded bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-700/60 cursor-pointer font-mono"
                        title="Spintax: Varia a saudação aleatoriamente para cada cliente"
                      >
                        +{'{variação}'}
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={6}
                    required
                    value={editingCampaign.message || ''}
                    onChange={e => setEditingCampaign({ ...editingCampaign, message: e.target.value })}
                    placeholder="Digite a mensagem promocional com emojis e detalhes do produto..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white text-xs leading-relaxed focus:outline-none focus:border-emerald-500 font-sans"
                  />
                  
                  {/* Anti-Ban Shield Info Box */}
                  <div className="mt-3 p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                    <div className="space-y-1 text-[11px] leading-relaxed">
                      <span className="font-bold block text-emerald-200 text-xs">🛡️ Proteção Anti-Ban Ativa para seu Número</span>
                      <p className="text-slate-300">
                        • <strong>Intervalo Seguro:</strong> envios com pausas humanas de <strong>25s a 45s</strong> entre contatos.<br />
                        • <strong>Variação Única (Spintax):</strong> cada mensagem é gerada com assinatura e hash única.<br />
                        • <strong>Rodapé Automático:</strong> anexa <em>"Responda 0 para sair"</em>. Se o cliente responder 0, o sistema descadastra ele na hora, impedindo que denuncie seu número à Meta.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live WhatsApp Preview (5 cols) */}
              <div className="lg:col-span-5 bg-slate-950 rounded-2xl border border-slate-800 p-5 flex flex-col h-full">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    Prévia ao Vivo no WhatsApp
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
                    {editingCampaign.targetAudience === 'WHATSAPP_GROUPS' ? 'Visão no Grupo' : 'Visão do Cliente'}
                  </span>
                </div>

                <div 
                  className="flex-1 rounded-2xl p-4 bg-slate-950/90 border border-slate-800/80 flex flex-col justify-end"
                  style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '14px 14px' }}
                >
                  {/* WhatsApp Message Bubble */}
                  <div className="bg-[#005c4b] text-white rounded-2xl rounded-tr-none p-3 max-w-[95%] ml-auto shadow-md space-y-2.5">
                    {/* Media Image */}
                    {editingCampaign.imageUrl ? (
                      <div className="rounded-xl overflow-hidden bg-slate-900 border border-emerald-700/50 max-h-48">
                        <img 
                          src={editingCampaign.imageUrl} 
                          alt="Prévia Arte" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    ) : null}

                    {/* Text */}
                    <div className="text-xs leading-relaxed whitespace-pre-line text-emerald-50">
                      {(editingCampaign.message || '')
                        .replace('{cliente}', editingCampaign.targetAudience === 'WHATSAPP_GROUPS' ? 'Pessoal' : 'Thiago')
                        .replace('{loja}', establishment?.name || 'Nosso Estabelecimento')}
                    </div>

                    {/* Auto Opt-out Footer Preview */}
                    {editingCampaign.targetAudience !== 'WHATSAPP_GROUPS' && (
                      <div className="text-[10px] text-emerald-200/70 italic pt-1 border-t border-emerald-600/30">
                        Responda 0 para não receber novidades.
                      </div>
                    )}

                    <div className="text-[10px] text-emerald-200/70 text-right flex items-center justify-end gap-1 font-mono">
                      <span>{editingCampaign.scheduledTime || '18:00'}</span>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 inline" />
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 text-center mt-3 leading-relaxed">
                  {editingCampaign.targetAudience === 'WHATSAPP_GROUPS' ? (
                    <span>🛡️ <strong>Seguro:</strong> A IA não conversa dentro do grupo. Os membros interessados abrem a conversa privada da loja para fazer o pedido com a IA! 🛵</span>
                  ) : (
                    <span>Quando o cliente responder este disparo, a IA entra automaticamente para atender e fechar o pedido! 🤖</span>
                  )}
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="lg:col-span-12 pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingCampaign(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Salvar Template de Disparo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
