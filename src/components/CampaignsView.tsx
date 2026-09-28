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
  BellRing
} from 'lucide-react';
import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CampaignTemplate, Establishment } from '../types';

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
  const [campaigns, setCampaigns] = useState<CampaignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [audienceCount, setAudienceCount] = useState<number>(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Partial<CampaignTemplate> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);
  const [sendResultNotice, setSendResultNotice] = useState<string | null>(null);
  const [confirmSendCampaign, setConfirmSendCampaign] = useState<CampaignTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch campaigns, audience and periodic cron check
  useEffect(() => {
    fetchCampaigns();
    fetchAudience();

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
    setEditingCampaign({
      title: 'Abertura da Cozinha - 18h',
      scheduledTime: '18:00',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0], // Todos os dias por padrão
      active: true,
      targetAudience: 'ALL_CUSTOMERS',
      message: 'Boa noite, *{cliente}*! 🍔🔥\n\nNossa cozinha acabou de abrir com novidades deliciosas saindo do fogo agora!\n\nHoje temos promoção imperdível em nossos lanches artesanais. Peça agora pelo WhatsApp antes que acabe!\n\nBasta responder esta mensagem para ver nosso cardápio ou fazer seu pedido. 🛵',
      imageUrl: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (camp: CampaignTemplate) => {
    setEditingCampaign({ ...camp });
    setIsModalOpen(true);
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
      setSendResultNotice('Iniciando disparos em segundo plano para sua base de clientes...');

      const res = await fetch(`/api/campaigns/${camp.id}/send-now?establishmentId=${establishmentId}`, {
        method: 'POST'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar disparo');
      }

      setSendResultNotice(`✅ Disparo concluído com sucesso! Enviado para ${data.sentCount || 0} cliente(s) da sua loja.`);
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
                      <span>
                        Público: <strong>Quem já pediu ({audienceCount})</strong>
                      </span>
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

            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Público Estimado:</span>
                <strong className="text-emerald-400">{audienceCount} clientes que já pediram</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Imagem/Arte:</span>
                <strong className="text-slate-200">{confirmSendCampaign.imageUrl ? 'Sim (com foto)' : 'Apenas texto'}</strong>
              </div>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 leading-relaxed">
                💡 O envio é feito com intervalo de segurança entre cada cliente para garantir a entrega sem bloqueios pelo WhatsApp.
              </p>
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
                    placeholder="Ex: Abertura da Cozinha - 18h com Promoção de Hambúrguer"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-emerald-500"
                  />
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
                    <div className="flex items-center gap-1.5">
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
                  <p className="text-[11px] text-slate-400 mt-1">
                    Use *texto* para negrito. A tag <strong>{'{cliente}'}</strong> será automaticamente trocada pelo nome real de quem comprou!
                  </p>
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
                    Visão do Cliente
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
                        .replace('{cliente}', 'Thiago')
                        .replace('{loja}', establishment?.name || 'Nosso Restaurante')}
                    </div>

                    <div className="text-[10px] text-emerald-200/70 text-right flex items-center justify-end gap-1 font-mono">
                      <span>{editingCampaign.scheduledTime || '18:00'}</span>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 inline" />
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 text-center mt-3">
                  Quando o cliente responder este disparo, a IA entra automaticamente para atender e fechar o pedido! 🤖
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
