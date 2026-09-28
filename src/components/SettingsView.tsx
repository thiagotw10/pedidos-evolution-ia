import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Store, 
  Sparkles, 
  DollarSign, 
  Clock, 
  MapPin, 
  Phone, 
  Save, 
  Check, 
  Bot, 
  QrCode, 
  Bike, 
  Plus, 
  Trash2,
  Calendar,
  Moon,
  Sun,
  VolumeX,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Power,
  Loader2
} from 'lucide-react';
import { Establishment, OperatingSchedule, DaySchedule, OutOfHoursAction } from '../types';
import { 
  DEFAULT_AI_SCHEDULE, 
  DEFAULT_OUT_OF_HOURS_MESSAGE, 
  isStoreOpenNow, 
  DAY_LABELS 
} from '../utils/schedule';

interface SettingsViewProps {
  establishment: Establishment | null;
  onSaveEstablishment: (data: Partial<Establishment>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  establishment,
  onSaveEstablishment
}) => {
  const [formData, setFormData] = useState<Partial<Establishment>>({});
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const initializedStoreIdRef = useRef<string | null>(null);

  // Initialize form data only once per establishment ID so background pollings don't overwrite user edits
  useEffect(() => {
    if (establishment && (!initializedStoreIdRef.current || initializedStoreIdRef.current !== establishment.id)) {
      setFormData({ ...establishment });
      initializedStoreIdRef.current = establishment.id;
    }
  }, [establishment]);

  // Operating schedule state with fallback to defaults
  const operatingSchedule: OperatingSchedule = useMemo(() => {
    return formData.aiOperatingSchedule || DEFAULT_AI_SCHEDULE;
  }, [formData.aiOperatingSchedule]);

  const scheduleEnabled = formData.aiScheduleEnabled ?? false;
  const outOfHoursAction: OutOfHoursAction = formData.aiOutOfHoursAction || 'SILENT';
  const outOfHoursMessage = formData.aiOutOfHoursMessage || DEFAULT_OUT_OF_HOURS_MESSAGE;

  // Real-time calculation of current AI status in São Paulo time
  const currentOpenStatus = useMemo(() => {
    return isStoreOpenNow(operatingSchedule, scheduleEnabled);
  }, [operatingSchedule, scheduleEnabled]);

  // Immediately persist toggle switch changes so it never deactivates
  const handleToggleSchedule = async (newVal: boolean) => {
    const updated: Partial<Establishment> = {
      ...formData,
      aiScheduleEnabled: newVal,
      aiOperatingSchedule: formData.aiOperatingSchedule || DEFAULT_AI_SCHEDULE,
      aiOutOfHoursAction: formData.aiOutOfHoursAction || 'SILENT',
      aiOutOfHoursMessage: formData.aiOutOfHoursMessage || DEFAULT_OUT_OF_HOURS_MESSAGE
    };
    setFormData(updated);

    try {
      setSaving(true);
      await onSaveEstablishment(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert('Erro ao salvar alteração: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateDaySchedule = (dayKey: keyof OperatingSchedule, updates: Partial<DaySchedule>) => {
    const current = operatingSchedule[dayKey] || { enabled: false, open: '18:00', close: '23:30' };
    const updatedSchedule: OperatingSchedule = {
      ...operatingSchedule,
      [dayKey]: { ...current, ...updates }
    };
    setFormData(prev => ({
      ...prev,
      aiOperatingSchedule: updatedSchedule
    }));
  };

  const applyPreset = async (preset: 'TER_A_DOM' | 'SEG_A_SAB' | 'TODOS_OS_DIAS' | 'ALMOCO_JANTAR') => {
    let newSchedule: OperatingSchedule;
    if (preset === 'TER_A_DOM') {
      newSchedule = {
        monday: { enabled: false, open: '18:00', close: '23:30' },
        tuesday: { enabled: true, open: '18:00', close: '23:30' },
        wednesday: { enabled: true, open: '18:00', close: '23:30' },
        thursday: { enabled: true, open: '18:00', close: '23:30' },
        friday: { enabled: true, open: '18:00', close: '23:59' },
        saturday: { enabled: true, open: '18:00', close: '23:59' },
        sunday: { enabled: true, open: '18:00', close: '23:30' },
      };
    } else if (preset === 'SEG_A_SAB') {
      newSchedule = {
        monday: { enabled: true, open: '08:00', close: '18:00' },
        tuesday: { enabled: true, open: '08:00', close: '18:00' },
        wednesday: { enabled: true, open: '08:00', close: '18:00' },
        thursday: { enabled: true, open: '08:00', close: '18:00' },
        friday: { enabled: true, open: '08:00', close: '18:00' },
        saturday: { enabled: true, open: '08:00', close: '14:00' },
        sunday: { enabled: false, open: '08:00', close: '14:00' },
      };
    } else if (preset === 'ALMOCO_JANTAR') {
      newSchedule = {
        monday: { enabled: true, open: '11:00', close: '23:00' },
        tuesday: { enabled: true, open: '11:00', close: '23:00' },
        wednesday: { enabled: true, open: '11:00', close: '23:00' },
        thursday: { enabled: true, open: '11:00', close: '23:00' },
        friday: { enabled: true, open: '11:00', close: '23:30' },
        saturday: { enabled: true, open: '11:00', close: '23:30' },
        sunday: { enabled: true, open: '11:00', close: '23:00' },
      };
    } else {
      // TODOS_OS_DIAS
      newSchedule = {
        monday: { enabled: true, open: '18:00', close: '23:30' },
        tuesday: { enabled: true, open: '18:00', close: '23:30' },
        wednesday: { enabled: true, open: '18:00', close: '23:30' },
        thursday: { enabled: true, open: '18:00', close: '23:30' },
        friday: { enabled: true, open: '18:00', close: '23:59' },
        saturday: { enabled: true, open: '18:00', close: '23:59' },
        sunday: { enabled: true, open: '18:00', close: '23:30' },
      };
    }
    const updated: Partial<Establishment> = {
      ...formData,
      aiScheduleEnabled: true,
      aiOperatingSchedule: newSchedule
    };
    setFormData(updated);

    try {
      setSaving(true);
      await onSaveEstablishment(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert('Erro ao salvar modelo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const DAYS_LIST: (keyof OperatingSchedule)[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await onSaveEstablishment(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert('Erro ao salvar configurações: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
          Configurações da Loja & IA
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Ajuste as informações da empresa, taxas, regras de entrega e o comportamento do atendente de IA.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
        {/* Basic Store Info */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-emerald-400" />
            Dados do Estabelecimento
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nome do Estabelecimento *</label>
              <input
                type="text"
                required
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Burger & Cia Gourmet"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Telefone WhatsApp da Loja</label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                placeholder="5511999999999"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Endereço Completo</label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                placeholder="Av. Paulista, 1000 - Bela Vista, São Paulo - SP"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Taxa Padrão de Entrega (R$)</label>
              <input
                type="number"
                step="0.01"
                value={formData.deliveryFee !== undefined ? formData.deliveryFee : ''}
                onChange={e => setFormData({ ...formData, deliveryFee: parseFloat(e.target.value) || 0 })}
                placeholder="7.50"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tempo Estimado de Entrega</label>
              <input
                type="text"
                value={formData.estimatedDeliveryTime || ''}
                onChange={e => setFormData({ ...formData, estimatedDeliveryTime: e.target.value })}
                placeholder="35 a 50 minutos"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Horário de Funcionamento</label>
              <input
                type="text"
                value={formData.operatingHours || ''}
                onChange={e => setFormData({ ...formData, operatingHours: e.target.value })}
                placeholder="Terça a Domingo das 18:00 às 23:30"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Chave PIX (Para envio aos clientes)</label>
              <input
                type="text"
                value={formData.pixKey || ''}
                onChange={e => setFormData({ ...formData, pixKey: e.target.value })}
                placeholder="contato@restaurante.com ou CNPJ"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>
        </div>

        {/* Motoboys & Couriers Management */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Bike className="w-5 h-5 text-cyan-400" />
                Equipe de Entregadores & Motoboys
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Cadastre os motoboys que fazem suas entregas para enviar o pedido com 1 clique com link do Waze e Google Maps
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 w-fit">
              {(formData.couriers || []).length} Entregador(es)
            </span>
          </div>

          {/* List of existing couriers */}
          {(formData.couriers && formData.couriers.length > 0) ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {formData.couriers.map((courier, index) => (
                <div 
                  key={courier.id || index}
                  className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
                      <Bike className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm">{courier.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        {courier.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (formData.couriers || []).filter((_, i) => i !== index);
                        setFormData({ ...formData, couriers: updated });
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Remover entregador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
              Nenhum motoboy cadastrado ainda. Adicione abaixo para facilitar na hora de despachar.
            </div>
          )}

          {/* Add new courier row */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-cyan-400" />
              Adicionar Novo Motoboy
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nome</label>
                <input
                  type="text"
                  id="newCourierName"
                  placeholder="Ex: Carlos Motoboy"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">WhatsApp (com DDD)</label>
                <input
                  type="text"
                  id="newCourierPhone"
                  placeholder="Ex: 5511999998888"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    const nameInput = document.getElementById('newCourierName') as HTMLInputElement;
                    const phoneInput = document.getElementById('newCourierPhone') as HTMLInputElement;
                    const name = nameInput?.value.trim();
                    const phone = phoneInput?.value.replace(/\D/g, '');

                    if (!name || !phone || phone.length < 10) {
                      alert('Preencha o nome e um telefone WhatsApp válido (com DDD)');
                      return;
                    }

                    const newCourier = {
                      id: `c_${Date.now()}`,
                      name,
                      phone,
                      vehicle: 'MOTO' as const,
                      active: true,
                      createdAt: new Date().toISOString()
                    };

                    setFormData({
                      ...formData,
                      couriers: [...(formData.couriers || []), newCourier]
                    });

                    if (nameInput) nameInput.value = '';
                    if (phoneInput) phoneInput.value = '';
                  }}
                  className="w-full py-2 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Motoboy</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Operating Hours & Business Schedule */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">
                  Horário de Funcionamento da IA no WhatsApp
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Mantenha seu WhatsApp sempre conectado sem precisar escanear QR Code todo dia! A IA só responderá aos clientes nos horários que você determinar.
              </p>
            </div>

            {/* Main Toggle Switch */}
            <div className="flex items-center gap-2.5 bg-slate-950 p-2 px-3 rounded-xl border border-slate-800 shrink-0">
              {saving && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
              <span className={`text-xs font-bold ${scheduleEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                {scheduleEnabled ? 'Horário Ativo' : 'Atender 24 Horas'}
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleToggleSchedule(!scheduleEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  scheduleEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                } ${saving ? 'opacity-60 cursor-wait' : ''}`}
                title={scheduleEnabled ? 'Clique para desativar e atender 24h' : 'Clique para ativar controle de horários'}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    scheduleEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Current Live Status Banner */}
          {scheduleEnabled ? (
            <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              currentOpenStatus.isOpen 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-center gap-2.5">
                {currentOpenStatus.isOpen ? (
                  <Sun className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
                ) : (
                  <Moon className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <p className="font-bold text-white flex items-center gap-1.5">
                    {currentOpenStatus.isOpen ? '🟢 IA ABERTA AGORA' : '🌙 IA EM REPOUSO AGORA'}
                    <span className="text-[11px] font-normal text-slate-300 font-mono">
                      ({currentOpenStatus.currentTimeStr} - Brasília)
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {currentOpenStatus.isOpen 
                      ? `Atendendo e fechando pedidos normalmente hoje (${currentOpenStatus.currentDayLabel}).`
                      : (currentOpenStatus.reason || 'Fora do horário configurado. A IA não fechará pedidos.')}
                  </p>
                </div>
              </div>

              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                currentOpenStatus.isOpen ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {currentOpenStatus.isOpen ? 'Em Atendimento' : 'Pausado'}
              </span>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-2.5 text-xs text-slate-400">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>Modo 24 Horas:</strong> O controle de horário está desativado. A IA responderá a todas as mensagens que chegarem ao WhatsApp a qualquer hora do dia ou da noite.
              </span>
            </div>
          )}

          {/* Schedule Configuration (visible when enabled) */}
          {scheduleEnabled && (
            <div className="space-y-4 pt-1 animate-fadeIn">
              {/* Presets Bar */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Preencher rapidamente com modelo:
                </span>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => applyPreset('TER_A_DOM')}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 hover:text-amber-300 text-slate-300 transition cursor-pointer text-[11px]"
                  >
                    🍕 Delivery / Noturno (Ter a Dom 18h às 23h30)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('SEG_A_SAB')}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 hover:text-amber-300 text-slate-300 transition cursor-pointer text-[11px]"
                  >
                    🏢 Comercial (Seg a Sáb 08h às 18h)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('ALMOCO_JANTAR')}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 hover:text-amber-300 text-slate-300 transition cursor-pointer text-[11px]"
                  >
                    🍽️ Almoço & Jantar (Todos os dias 11h às 23h)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('TODOS_OS_DIAS')}
                    className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-amber-500/60 hover:text-amber-300 text-slate-300 transition cursor-pointer text-[11px]"
                  >
                    ⭐ Todos os Dias (18h às 23h30)
                  </button>
                </div>
              </div>

              {/* Day by Day Table/Cards */}
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  {DAYS_LIST.map(dayKey => {
                    const info = DAY_LABELS[dayKey];
                    const cfg = operatingSchedule[dayKey] || { enabled: false, open: '18:00', close: '23:30' };
                    const isOvernight = cfg.enabled && cfg.close && cfg.open && cfg.close < cfg.open;

                    return (
                      <div
                        key={dayKey}
                        className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                          cfg.enabled
                            ? 'bg-slate-950/80 border-slate-800'
                            : 'bg-slate-950/30 border-slate-900 opacity-60'
                        }`}
                      >
                        {/* Day Name & Toggle */}
                        <div className="flex items-center gap-3 min-w-[150px]">
                          <input
                            type="checkbox"
                            id={`day_${dayKey}`}
                            checked={cfg.enabled}
                            onChange={e => updateDaySchedule(dayKey, { enabled: e.target.checked })}
                            className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                          />
                          <label
                            htmlFor={`day_${dayKey}`}
                            className={`font-bold cursor-pointer select-none ${
                              cfg.enabled ? 'text-white' : 'text-slate-500 line-through'
                            }`}
                          >
                            {info.full}
                          </label>
                        </div>

                        {/* Hours Inputs */}
                        {cfg.enabled ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400">Das</span>
                              <input
                                type="time"
                                value={cfg.open || '18:00'}
                                onChange={e => updateDaySchedule(dayKey, { open: e.target.value })}
                                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-400">até</span>
                              <input
                                type="time"
                                value={cfg.close || '23:30'}
                                onChange={e => updateDaySchedule(dayKey, { close: e.target.value })}
                                className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            {isOvernight && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                                🌙 Madrugada (+1 dia)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            Fechado o dia todo (IA em repouso)
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Out of hours behavior */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <label className="block text-slate-200 font-bold text-xs">
                  O que a IA deve fazer quando o estabelecimento estiver fechado?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, aiOutOfHoursAction: 'SILENT' })}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                      outOfHoursAction === 'SILENT'
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <VolumeX className={`w-5 h-5 shrink-0 mt-0.5 ${outOfHoursAction === 'SILENT' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div>
                      <p className="font-bold text-xs text-white">Ficar em Silêncio (Recomendado)</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        A IA não responde nenhuma mensagem fora do horário. Você pode conversar manualmente no WhatsApp ou responder quando abrir.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, aiOutOfHoursAction: 'AUTO_REPLY' })}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                      outOfHoursAction === 'AUTO_REPLY'
                        ? 'bg-emerald-500/10 border-emerald-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <MessageSquare className={`w-5 h-5 shrink-0 mt-0.5 ${outOfHoursAction === 'AUTO_REPLY' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <div>
                      <p className="font-bold text-xs text-white">Enviar Mensagem Automática</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        A IA envia uma resposta educada avisando que a loja está fechada e informa seus horários de funcionamento.
                      </p>
                    </div>
                  </button>
                </div>

                {outOfHoursAction === 'AUTO_REPLY' && (
                  <div className="pt-2 space-y-1.5 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 font-semibold text-xs">
                        Mensagem de Estabelecimento Fechado:
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, aiOutOfHoursMessage: DEFAULT_OUT_OF_HOURS_MESSAGE })}
                        className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                      >
                        Restaurar padrão
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={formData.aiOutOfHoursMessage ?? DEFAULT_OUT_OF_HOURS_MESSAGE}
                      onChange={e => setFormData({ ...formData, aiOutOfHoursMessage: e.target.value })}
                      placeholder={DEFAULT_OUT_OF_HOURS_MESSAGE}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500/60 text-xs leading-relaxed font-sans"
                    />
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      Para não irritar o cliente, essa mensagem é enviada no máximo 1 vez a cada 3 horas para o mesmo número.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI Behavior & Personality */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            Personalidade & Regras da Inteligência Artificial
          </h3>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Mensagem Inicial / Boas-vindas:
              </label>
              <input
                type="text"
                value={formData.aiWelcomeMessage || ''}
                onChange={e => setFormData({ ...formData, aiWelcomeMessage: e.target.value })}
                placeholder="Olá! Seja muito bem-vindo ao Burger & Cia Gourmet 🍔! O que você gostaria de pedir hoje?"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Instruções Personalizadas do Estabelecimento (Prompt do Sistema):
              </label>
              <textarea
                rows={5}
                value={formData.aiPromptCustom || ''}
                onChange={e => setFormData({ ...formData, aiPromptCustom: e.target.value })}
                placeholder="Descreva como a IA deve se comportar, se deve oferecer combos, políticas de troca, aviso de tempo de chuva, etc..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500/60 leading-relaxed font-sans"
              />
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 sm:gap-4 pt-2">
          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <Check className="w-4 h-4 stroke-[3]" /> Configurações salvas com sucesso!
            </span>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Save className="w-4 h-4 stroke-[2.5]" />
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
