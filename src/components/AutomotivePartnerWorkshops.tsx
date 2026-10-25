import React, { useState, useEffect } from 'react';
import {
  Wrench,
  ShieldCheck,
  MapPin,
  Phone,
  MessageCircle,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Trash2,
  Edit2,
  ExternalLink,
  Sparkles,
  Bot,
  RefreshCw,
  Compass,
  Building2,
  Layers,
  Award,
  DollarSign
} from 'lucide-react';
import { Establishment } from '../types';

export interface PartnerWorkshop {
  id?: string;
  name: string;
  city: string;
  state: string;
  country: string;
  address: string;
  phone?: string;
  whatsapp?: string;
  contactPerson?: string;
  specialties: string[];
  installationWarrantyDays: number;
  installationFeeEstimate?: string;
  discountTierB2B?: string;
  notes?: string;
  active: boolean;
  rating?: number;
  googleMapsUrl?: string;
  instagram?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AutomotivePartnerWorkshopsProps {
  establishment?: Establishment | null;
  onNavigateToRadar?: () => void;
}

export const AutomotivePartnerWorkshops: React.FC<AutomotivePartnerWorkshopsProps> = ({
  establishment,
  onNavigateToRadar
}) => {
  const [partners, setPartners] = useState<PartnerWorkshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerWorkshop | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<PartnerWorkshop>>({
    name: '',
    city: '',
    state: 'SP',
    country: 'Brasil',
    address: '',
    phone: '',
    whatsapp: '',
    contactPerson: '',
    specialties: ['Porsche', 'Instalação Plug&Play'],
    installationWarrantyDays: 180,
    installationFeeEstimate: 'R$ 1.200 a R$ 1.800',
    discountTierB2B: 'Tabela Ouro (20% Margem)',
    notes: '',
    active: true,
    rating: 5.0,
    instagram: ''
  });

  const [specialtyInput, setSpecialtyInput] = useState('');

  const storeId = establishment?.id || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/automotive/partners?establishmentId=${storeId}`);
      if (!res.ok) throw new Error('Falha ao buscar oficinas parceiras');
      const data = await res.json();
      setPartners(data.partners || []);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: 'Não foi possível carregar as oficinas parceiras.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [storeId]);

  const handleOpenCreateModal = () => {
    setEditingPartner(null);
    setFormData({
      name: '',
      city: '',
      state: 'SP',
      country: 'Brasil',
      address: '',
      phone: '',
      whatsapp: '',
      contactPerson: '',
      specialties: ['Porsche', 'Instalação Plug&Play'],
      installationWarrantyDays: 180,
      installationFeeEstimate: 'R$ 1.200 a R$ 1.800',
      discountTierB2B: 'Tabela Ouro (20% Margem)',
      notes: '',
      active: true,
      rating: 5.0,
      instagram: ''
    });
    setSpecialtyInput('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: PartnerWorkshop) => {
    setEditingPartner(p);
    setFormData({ ...p });
    setSpecialtyInput('');
    setIsModalOpen(true);
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.city || !formData.state) {
      alert('Preencha ao menos Nome, Cidade e Estado.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/automotive/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-establishment-id': storeId
        },
        body: JSON.stringify({
          ...formData,
          establishmentId: storeId,
          ...(editingPartner?.id ? { id: editingPartner.id } : {})
        })
      });

      if (!res.ok) throw new Error('Erro ao salvar parceiro');
      const data = await res.json();

      setStatusMessage({
        type: 'success',
        text: editingPartner
          ? 'Oficina parceira atualizada e sincronizada com o RAG da IA!'
          : 'Nova oficina credenciada com sucesso e ativa no RAG de atendimento!'
      });

      setIsModalOpen(false);
      fetchPartners();
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar oficina parceira: ' + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePartner = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja descredenciar a oficina "${name}"?`)) return;
    try {
      const res = await fetch(`/api/automotive/partners/${id}?establishmentId=${storeId}`, {
        method: 'DELETE',
        headers: { 'x-establishment-id': storeId }
      });
      if (!res.ok) throw new Error('Falha ao remover oficina');
      setPartners(prev => prev.filter(p => p.id !== id));
      setStatusMessage({ type: 'success', text: `Oficina ${name} descredenciada com sucesso.` });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      alert('Erro ao descredenciar oficina: ' + err.message);
    }
  };

  const handleAddSpecialty = () => {
    const s = specialtyInput.trim();
    if (!s) return;
    const current = formData.specialties || [];
    if (!current.includes(s)) {
      setFormData({ ...formData, specialties: [...current, s] });
    }
    setSpecialtyInput('');
  };

  const handleRemoveSpecialty = (item: string) => {
    setFormData({
      ...formData,
      specialties: (formData.specialties || []).filter(s => s !== item)
    });
  };

  const handleResetDefaults = async () => {
    if (!confirm('Deseja repovoar a rede com os centros parceiros credenciados padrão nas principais capitais?')) return;
    try {
      setLoading(true);
      const res = await fetch('/api/automotive/partners/seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-establishment-id': storeId
        },
        body: JSON.stringify({ establishmentId: storeId })
      });
      if (!res.ok) throw new Error('Falha ao restaurar parceiros padrão');
      await fetchPartners();
      setStatusMessage({ type: 'success', text: 'Rede credenciada padrão restaurada com sucesso!' });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      alert('Erro ao restaurar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter list
  const availableStates = Array.from(new Set(partners.map(p => p.state.toUpperCase()))).sort();

  const filteredPartners = partners.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.specialties.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesState = selectedState === 'all' || p.state.toUpperCase() === selectedState.toUpperCase();
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-6 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <Bot className="w-3 h-3 animate-pulse" />
              RAG Conectado à IA
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Rede Nacional & Internacional
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Wrench className="w-7 h-7 text-emerald-400" />
            Rede de Oficinas Credenciadas
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            A IA de atendimento consulta este catálogo em tempo real para quebrar o medo de instalação do cliente, indicando a oficina credenciada mais próxima em Curitiba, SP, RJ, BH, Brasília, Goiânia e exterior.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToRadar && (
            <button
              onClick={onNavigateToRadar}
              className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 font-bold text-xs flex items-center gap-2 transition shadow-md"
            >
              <Compass className="w-4 h-4 text-cyan-400" />
              Minerar Oficinas no Maps
            </button>
          )}

          <button
            onClick={handleOpenCreateModal}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            Credenciar Nova Oficina
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* RAG Explainer Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-3xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 flex-shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Como a IA utiliza essas oficinas no WhatsApp?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              Quando um cliente de <strong className="text-white">Curitiba, Goiânia, RJ ou Brasília</strong> pergunta:
              <em className="text-indigo-200"> "Vocês são de onde? Onde é que eu vou instalar isso no meu Porsche?"</em>, a IA responde instantaneamente citando o nome da oficina parceira, o endereço e reforçando que o sistema é 100% plug & play com garantia de montagem, fechando a venda na hora!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Ativas</span>
            <span className="text-base font-black text-emerald-400">{partners.filter(p => p.active).length}</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Estados</span>
            <span className="text-base font-black text-cyan-400">{availableStates.length}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome da oficina, cidade, endereço ou especialidade (ex: Porsche, Batel, Moema)..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 ml-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Estado:
          </span>
          <button
            onClick={() => setSelectedState('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedState === 'all'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
            }`}
          >
            Todos ({partners.length})
          </button>
          {availableStates.map(st => (
            <button
              key={st}
              onClick={() => setSelectedState(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                selectedState === st
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
              }`}
            >
              {st} ({partners.filter(p => p.state.toUpperCase() === st).length})
            </button>
          ))}

          <button
            onClick={handleResetDefaults}
            title="Restaurar lista padrão de parceiros nas capitais"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition border border-slate-700/60 ml-auto"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid of Partner Workshops */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm font-medium">Carregando oficinas credenciadas...</p>
        </div>
      ) : filteredPartners.length === 0 ? (
        <div className="py-16 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-8 space-y-3">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">Nenhuma oficina parceira encontrada</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Você pode cadastrar novas oficinas ou restaurar os centros padrão pré-configurados para São Paulo, Curitiba, RJ, BH, Goiânia e Brasília.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
            >
              Cadastrar Oficina
            </button>
            <button
              onClick={handleResetDefaults}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold text-xs"
            >
              Restaurar Rede Padrão
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPartners.map(partner => (
            <div
              key={partner.id}
              className="bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800/90 hover:border-emerald-500/40 rounded-3xl p-5 shadow-xl transition group relative overflow-hidden flex flex-col justify-between"
            >
              <div className="space-y-3.5">
                {/* Header Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {partner.state} • {partner.city}
                      </span>
                      {partner.country !== 'Brasil' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {partner.country}
                        </span>
                      )}
                      <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                        ★ {partner.rating?.toFixed(1) || '5.0'}
                      </span>
                    </div>

                    <h2 className="text-base font-black text-white group-hover:text-emerald-300 transition tracking-tight">
                      {partner.name}
                    </h2>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                    <button
                      onClick={() => handleOpenEditModal(partner)}
                      className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      title="Editar Oficina"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {partner.id && (
                      <button
                        onClick={() => handleDeletePartner(partner.id!, partner.name)}
                        className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 transition"
                        title="Descredenciar Oficina"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Address & Contact */}
                <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-2xl border border-slate-800/60">
                  <p className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{partner.address}</span>
                  </p>
                  {partner.contactPerson && (
                    <p className="text-[11px] text-slate-400 pl-5.5">
                      Responsável: <strong className="text-white">{partner.contactPerson}</strong>
                    </p>
                  )}
                  {partner.phone && (
                    <p className="flex items-center gap-2 pl-5.5 text-[11px] text-slate-400">
                      <Phone className="w-3 h-3 text-cyan-400" />
                      {partner.phone}
                    </p>
                  )}
                </div>

                {/* Specialties tags */}
                <div className="flex flex-wrap gap-1.5">
                  {partner.specialties.map(spec => (
                    <span
                      key={spec}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-800/70 text-slate-300 border border-slate-700/50"
                    >
                      {spec}
                    </span>
                  ))}
                </div>

                {/* Commercial Conditions */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block">Garantia Montagem</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      {partner.installationWarrantyDays} dias
                    </span>
                  </div>
                  <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
                    <span className="text-[9px] uppercase font-bold text-slate-500 block">Condição B2B</span>
                    <span className="font-bold text-cyan-300 truncate block">
                      {partner.discountTierB2B || 'Tabela Ouro'}
                    </span>
                  </div>
                </div>

                {partner.installationFeeEstimate && (
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 px-1">
                    <DollarSign className="w-3 h-3 text-slate-500" />
                    Mão de obra estimada: <strong className="text-white">{partner.installationFeeEstimate}</strong>
                  </p>
                )}

                {partner.notes && (
                  <p className="text-[11px] text-slate-400 italic line-clamp-2 bg-slate-900/40 p-2 rounded-xl border border-slate-800/30">
                    "{partner.notes}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800/60 mt-3 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-emerald-400/90 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  RAG IA Ativo
                </span>

                <div className="flex items-center gap-2">
                  {partner.whatsapp && (
                    <a
                      href={`https://wa.me/${partner.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Olá ${partner.contactPerson || ''}! Aqui é da Flow Garage Exhaust. Temos um cliente de Porsche para direcionar a instalação para vocês.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                      WhatsApp
                    </a>
                  )}

                  {partner.googleMapsUrl && (
                    <a
                      href={partner.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                      title="Ver no Google Maps"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Creating / Editing Partner Workshop */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    {editingPartner ? 'Editar Oficina Parceira' : 'Credenciar Nova Oficina Parceira'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ao salvar, o RAG da IA começará a indicá-la imediatamente para clientes dessa cidade.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePartner} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300 block mb-1">Nome da Oficina / Centro Automotivo *</label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Pitstop Motorsport & Tuning"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Cidade *</label>
                  <input
                    type="text"
                    required
                    value={formData.city || ''}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Ex: Curitiba"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Estado (UF) *</label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    value={formData.state || ''}
                    onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    placeholder="Ex: PR, SP, RJ, MG, DF"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300 block mb-1">Endereço Completo</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Ex: Av. Batel, 1550 - Batel, Curitiba - PR"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">WhatsApp / Telefone</label>
                  <input
                    type="text"
                    value={formData.whatsapp || formData.phone || ''}
                    onChange={e => setFormData({ ...formData, whatsapp: e.target.value, phone: e.target.value })}
                    placeholder="Ex: 41999981234"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Nome do Contato / Chefe de Oficina</label>
                  <input
                    type="text"
                    value={formData.contactPerson || ''}
                    onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="Ex: Guilherme (Chefe de Oficina)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Garantia de Instalação (dias)</label>
                  <input
                    type="number"
                    value={formData.installationWarrantyDays || 180}
                    onChange={e => setFormData({ ...formData, installationWarrantyDays: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Estimativa de Mão de Obra</label>
                  <input
                    type="text"
                    value={formData.installationFeeEstimate || ''}
                    onChange={e => setFormData({ ...formData, installationFeeEstimate: e.target.value })}
                    placeholder="Ex: R$ 1.000 a R$ 1.500"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Condição Comercial B2B / Margem</label>
                  <input
                    type="text"
                    value={formData.discountTierB2B || ''}
                    onChange={e => setFormData({ ...formData, discountTierB2B: e.target.value })}
                    placeholder="Ex: Tabela Ouro (20% Margem)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Instagram (@)</label>
                  <input
                    type="text"
                    value={formData.instagram || ''}
                    onChange={e => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="Ex: @pitstopcuritiba"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Specialties */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Especialidades & Homologações</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={specialtyInput}
                    onChange={e => setSpecialtyInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSpecialty();
                      }
                    }}
                    placeholder="Ex: Porsche 911, Inox 304, Dinamômetro, Valvetronic..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSpecialty}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    Adicionar
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(formData.specialties || []).map(spec => (
                    <span
                      key={spec}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs flex items-center gap-1.5"
                    >
                      {spec}
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialty(spec)}
                        className="hover:text-rose-400 font-bold"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Observações Técnicas Internas</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Informações para orientar os consultores ou instruções especiais de montagem..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {editingPartner ? 'Salvar Alterações' : 'Credenciar e Ativar no RAG'}
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
