import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Copy,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  QrCode
} from 'lucide-react';
import { Establishment } from '../types';
import {
  getSubscriptionStatus,
  PLAN_TIER_LIST,
  PLAN_TIERS,
  PlanTierId,
  getPlanConfig
} from '../utils/subscription';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  establishment: Establishment | null;
  userEmail?: string | null;
}

interface PixData {
  id: string | number;
  qr_code: string;
  qr_code_base64: string;
  planName?: string;
  amount?: number;
  includedCredits?: number;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  establishment,
  userEmail
}) => {
  if (!isOpen) return null;

  const status = getSubscriptionStatus(establishment);
  const defaultPlan = getPlanConfig(establishment?.planTier, establishment?.segment);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanTierId>(defaultPlan.id);
  const selectedPlan = PLAN_TIERS[selectedPlanId] || defaultPlan;

  const [pixData, setPixData] = useState<PixData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setSelectedPlanId(defaultPlan.id);
  }, [defaultPlan.id]);

  // Polling to verify payment approval
  useEffect(() => {
    if (!pixData?.id || paymentSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/subscription/status/${pixData.id}`);
        const data = await res.json();

        if (data.approved || data.status === 'approved') {
          setPaymentSuccess(true);
          clearInterval(interval);
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } catch (err) {
        console.warn('Erro ao verificar status:', err);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [pixData?.id, paymentSuccess]);

  const handleGeneratePix = async () => {
    if (!establishment?.id) return;
    setGenerating(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/subscription/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId: establishment.id,
          email: userEmail || establishment.pixKey || 'cliente@iapedido.com.br',
          name: establishment.name || 'Estabelecimento iaPedido',
          planTier: selectedPlan.id
        })
      });

      const data = await res.json();
      if (data.success && data.qr_code) {
        setPixData({
          id: data.id,
          qr_code: data.qr_code,
          qr_code_base64: data.qr_code_base64,
          planName: data.planName || selectedPlan.name,
          amount: data.amount || selectedPlan.price,
          includedCredits: data.includedCredits || selectedPlan.includedCredits
        });
      } else {
        setErrorMsg(data.error || 'Erro ao gerar QR Code PIX.');
      }
    } catch (err: any) {
      console.error('Erro ao gerar PIX:', err);
      setErrorMsg('Falha de conexão com o servidor.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPix = () => {
    if (!pixData?.qr_code) return;
    navigator.clipboard.writeText(pixData.qr_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Planos & Assinatura iaPedido</h2>
            <p className="text-xs text-slate-400">Escolha seu plano com franquia mensal de créditos de IA inclusa</p>
          </div>
        </div>

        {/* Status Card */}
        <div className="mb-5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                status.isActivePaid ? 'bg-emerald-400' : status.isTrial ? 'bg-amber-400' : 'bg-rose-500'
              }`}
            />
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Status Atual</p>
              <p className="text-sm font-bold text-white">{status.statusLabel}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{selectedPlan.name}</p>
            <p className="text-sm font-black text-emerald-400">R$ {selectedPlan.price},00 / mês</p>
          </div>
        </div>

        {paymentSuccess && (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Pagamento Confirmado!</p>
              <p className="text-xs text-emerald-400/80">
                Plano ativado por 30 dias + R$ {selectedPlan.includedCredits},00 em créditos de IA liberados!
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {/* PIX Generation / Display */}
        {!pixData ? (
          <div>
            {/* Plan Selector Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
              {PLAN_TIER_LIST.map(plan => {
                const isSelected = selectedPlanId === plan.id;
                const isRecommended = defaultPlan.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/60 shadow-lg'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-bold text-emerald-400">{plan.name}</span>
                      {isRecommended && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950">
                          Recomendado
                        </span>
                      )}
                    </div>
                    <p className="text-xl font-black text-white">
                      R$ {plan.price}
                      <span className="text-[11px] font-normal text-slate-400">/mês</span>
                    </p>
                    <p className="text-[10px] text-emerald-300 font-semibold mt-1">
                      +R$ {plan.includedCredits} créditos IA/mês
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 mb-6 text-xs text-slate-300">
              <p className="font-bold text-white text-xs mb-2">
                Incluso no {selectedPlan.name} ({selectedPlan.estimatedInteractions}):
              </p>
              {selectedPlan.features.map((feat, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleGeneratePix}
              disabled={generating}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-emerald-950/50"
            >
              {generating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  <span>Gerando PIX...</span>
                </>
              ) : (
                <>
                  <QrCode className="w-5 h-5" />
                  <span>
                    Pagar R$ {selectedPlan.price} via PIX (Ativar 30 Dias + R$ {selectedPlan.includedCredits} IA)
                  </span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white text-slate-900">
              <img
                src={
                  pixData.qr_code_base64.startsWith('data:')
                    ? pixData.qr_code_base64
                    : `data:image/png;base64,${pixData.qr_code_base64}`
                }
                alt="QR Code PIX iaPedido"
                className="w-44 h-44 object-contain rounded-lg"
              />
              <p className="text-[11px] font-semibold text-slate-600 mt-1">
                {pixData.planName} — R$ {pixData.amount},00 (+R$ {pixData.includedCredits} Créditos IA)
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">PIX Copia e Cola:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={pixData.qr_code}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono outline-none"
                />
                <button
                  onClick={handleCopyPix}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer flex items-center gap-1.5"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>Aguardando pagamento... Identificação automática</span>
              </div>
              <button
                onClick={() => setPixData(null)}
                title="Trocar plano"
                className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
              >
                Trocar plano
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Processado via Mercado Pago
          </span>
          <button onClick={onClose} className="hover:text-slate-300 cursor-pointer">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
