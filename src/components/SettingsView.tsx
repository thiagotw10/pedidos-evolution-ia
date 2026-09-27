import React, { useState, useEffect } from 'react';
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
  QrCode
} from 'lucide-react';
import { Establishment } from '../types';

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

  useEffect(() => {
    if (establishment) {
      setFormData({ ...establishment });
    }
  }, [establishment]);

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
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
          Configurações da Loja & IA
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Ajuste as informações da empresa, taxas, regras de entrega e o comportamento do atendente de IA.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Store Info */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 space-y-4">
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

        {/* AI Behavior & Personality */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Personalidade & Regras do Atendente IA (Gemini)
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
        <div className="flex items-center justify-end gap-4 pt-2">
          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <Check className="w-4 h-4 stroke-[3]" /> Configurações salvas com sucesso!
            </span>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Save className="w-4 h-4 stroke-[2.5]" />
            <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
