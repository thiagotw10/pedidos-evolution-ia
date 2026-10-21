import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
  Crown
} from 'lucide-react';
import { Establishment } from '../types';
import {
  PLAN_TIER_LIST,
  PLAN_TIERS,
  PlanTierId,
  CREDIT_TOPUP_PACKAGES,
  MIN_CREDIT_TOPUP_BRL,
  getPlanConfig
} from '../utils/subscription';

export const BillingView: React.FC<{
  establishmentId: string;
  email?: string | null;
  establishment?: Establishment | null;
}> = ({ establishmentId, email, establishment }) => {
  const recommendedPlan = getPlanConfig(establishment?.planTier, establishment?.segment);
  const [summary, setSummary] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanTierId>(recommendedPlan.id);

  // Plan Subscription PIX State
  const [planPix, setPlanPix] = useState<any>(null);
  const [loadingPlanPix, setLoadingPlanPix] = useState(false);
  const [copiedPlanPix, setCopiedPlanPix] = useState(false);
  const [planApproved, setPlanApproved] = useState(false);
  const [planError, setPlanError] = useState('');

  // Extra Credits Top-up PIX State
  const [amount, setAmount] = useState(String(CREDIT_TOPUP_PACKAGES[0]));
  const [pix, setPix] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const r = await fetch(`/api/billing/summary?establishmentId=${encodeURIComponent(establishmentId)}`);
      if (r.ok) {
        const data = await r.json();
        setSummary(data);
        if (data.planTier && PLAN_TIERS[data.planTier as PlanTierId]) {
          setSelectedPlanId(data.planTier as PlanTierId);
        }
      }
    } catch {}
  };

  useEffect(() => {
    load();
  }, [establishmentId]);

  useEffect(() => {
    setSelectedPlanId(recommendedPlan.id);
  }, [recommendedPlan.id]);

  // Poll for Credit Top-up approval
  useEffect(() => {
    if (!pix?.id || approved) return;
    const t = setInterval(async () => {
      try {
        const d = await (await fetch(`/api/billing/credits/status/${pix.id}`)).json();
        if (d.approved) {
          setApproved(true);
          clearInterval(t);
          load();
        }
      } catch {}
    }, 3500);
    return () => clearInterval(t);
  }, [pix?.id, approved]);

  // Poll for Plan Subscription approval
  useEffect(() => {
    if (!planPix?.id || planApproved) return;
    const t = setInterval(async () => {
      try {
        const d = await (await fetch(`/api/subscription/status/${planPix.id}`)).json();
        if (d.approved || d.status === 'approved') {
          setPlanApproved(true);
          clearInterval(t);
          load();
        }
      } catch {}
    }, 3500);
    return () => clearInterval(t);
  }, [planPix?.id, planApproved]);

  const handleGeneratePlanPix = async (tierId: PlanTierId) => {
    setSelectedPlanId(tierId);
    setLoadingPlanPix(true);
    setPlanError('');
    setPlanApproved(false);
    try {
      const r = await fetch('/api/subscription/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId,
          email: email || establishment?.pixKey || 'cliente@iapedido.com.br',
          name: establishment?.name || 'Estabelecimento iaPedido',
          planTier: tierId
        })
      });
      const d = await r.json();
      if (!r.ok || !d.qr_code) throw new Error(d.error || 'Falha ao gerar PIX do plano.');
      setPlanPix(d);
    } catch (e: any) {
      setPlanError(e.message || 'Falha ao gerar PIX da assinatura.');
    } finally {
      setLoadingPlanPix(false);
    }
  };

  const generateCreditsPix = async () => {
    setLoading(true);
    setError('');
    setApproved(false);
    try {
      const r = await fetch('/api/billing/credits/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishmentId, amount: Number(amount), email })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPix(d);
    } catch (e: any) {
      setError(e.message || 'Falha ao gerar PIX.');
    } finally {
      setLoading(false);
    }
  };

  const copyCreditsPix = async () => {
    await navigator.clipboard?.writeText(pix?.qr_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const copyPlanPix = async () => {
    await navigator.clipboard?.writeText(planPix?.qr_code || '');
    setCopiedPlanPix(true);
    setTimeout(() => setCopiedPlanPix(false), 2500);
  };

  const trial = !!summary?.trialActive;
  const activePlanConfig = PLAN_TIERS[selectedPlanId] || recommendedPlan;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-emerald-400 text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Crown className="w-4 h-4" /> Assinatura & Créditos de IA
          </p>
          <h1 className="text-2xl sm:text-4xl font-black text-white mt-1">Planos, Uso & Créditos</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            {trial
              ? 'Você está nos 7 dias grátis. Escolha o plano ideal para o seu nicho (já inclui franquia mensal de créditos de IA) ou adicione créditos avulsos.'
              : 'Sua assinatura garante acesso completo à plataforma + franquia mensal de créditos de IA.'}
          </p>
        </div>
        <button
          onClick={load}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          <span>Atualizar Saldo</span>
        </button>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric
          label="Plano Recomendado / Atual"
          value={summary?.planName || activePlanConfig.name}
          sub={`R$ ${Number(summary?.monthlyPlatformFee || activePlanConfig.price).toFixed(2).replace('.', ',')} / mês`}
        />
        <Metric
          label="Franquia Inclusa no Plano"
          value={`R$ ${Number(summary?.includedCredits || activePlanConfig.includedCredits).toFixed(2).replace('.', ',')}`}
          sub="Créditos de IA liberados a cada renovação"
        />
        <Metric
          label="Saldo Disponível de IA"
          value={`R$ ${Number(summary?.creditsBalance || 0).toFixed(2).replace('.', ',')}`}
          sub={trial ? 'Período de teste gratuito ativo' : 'Saldo para atendimentos no WhatsApp'}
        />
        <Metric
          label="Consumo Registrado"
          value={`R$ ${Number(summary?.totalUsed || 0).toFixed(2).replace('.', ',')}`}
          sub="Total investido em conversas IA"
        />
      </div>

      {/* SECTION 1: MONTHLY PLANS */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Planos Mensais por Segmento (0% de Comissão)
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Ao ativar ou renovar seu plano via PIX, sua loja recebe 30 dias de acesso + o valor da franquia de créditos de IA adicionado automaticamente ao saldo.
            </p>
          </div>
        </div>

        {planApproved && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">Assinatura confirmada com sucesso!</p>
              <p className="text-xs">Seu plano foi ativado por 30 dias e seus créditos de IA já foram liberados.</p>
            </div>
          </div>
        )}

        {planError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
            {planError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {PLAN_TIER_LIST.map(plan => {
            const isSelected = selectedPlanId === plan.id;
            const isRecommended = recommendedPlan.id === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`rounded-3xl p-6 border transition flex flex-col justify-between cursor-pointer relative ${
                  isSelected
                    ? 'bg-slate-900 border-emerald-500/60 shadow-2xl shadow-emerald-950/30'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      {plan.name}
                    </span>
                    {isRecommended ? (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                        Ideal p/ Seu Nicho
                      </span>
                    ) : plan.badge ? (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {plan.badge}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl font-black text-white">R$ {plan.price}</span>
                    <span className="text-xs text-slate-400 font-semibold">/ mês</span>
                  </div>

                  <p className="text-xs text-emerald-300 font-semibold mt-1.5">
                    Inclui R$ {plan.includedCredits},00 em créditos IA ({plan.estimatedInteractions})
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{plan.targetAudience}</p>

                  {plan.setupFeeOptional && (
                    <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/25 text-[11px] text-orange-300 font-semibold">
                      Setup de Implantação 3D & Catálogo sob medida: R$ {plan.setupFeeOptional} (opcional)
                    </div>
                  )}

                  <ul className="mt-5 space-y-2.5 border-t border-slate-800 pt-4 text-xs text-slate-300">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  disabled={loadingPlanPix}
                  onClick={e => {
                    e.stopPropagation();
                    handleGeneratePlanPix(plan.id);
                  }}
                  className={`mt-6 w-full py-3.5 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {loadingPlanPix && isSelected ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gerando PIX...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>Ativar {plan.name} (R$ {plan.price})</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Plan PIX Payment Box */}
        {planPix && !planApproved && (
          <div className="rounded-3xl border border-emerald-500/40 bg-slate-900 p-6 shadow-2xl grid md:grid-cols-2 gap-6 items-center">
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white text-slate-900 max-w-xs mx-auto w-full">
              <img
                src={
                  planPix.qr_code_base64?.startsWith('data:')
                    ? planPix.qr_code_base64
                    : `data:image/png;base64,${planPix.qr_code_base64}`
                }
                alt="QR Code PIX Assinatura"
                className="w-48 h-48 object-contain"
              />
              <p className="text-xs font-bold text-slate-600 mt-2">
                {planPix.planName} — R$ {planPix.amount},00
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold uppercase text-emerald-400">PIX Copia e Cola da Assinatura</span>
                <h3 className="text-lg font-bold text-white mt-1">
                  {planPix.planName} (+R$ {planPix.includedCredits} em Créditos IA)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Após o pagamento, seu acesso de 30 dias e sua franquia de créditos são liberados automaticamente em segundos.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={planPix.qr_code || ''}
                  className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-xs text-slate-300 font-mono"
                />
                <button
                  onClick={copyPlanPix}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  {copiedPlanPix ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <button
                onClick={() => setPlanPix(null)}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                Escolher outro plano
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 2: EXTRA AI CREDITS TOP-UP */}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:p-7 shadow-xl space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Recarga Avulsa de Créditos de IA</h2>
              <p className="text-xs text-slate-400">
                Para alto volume de conversas, áudios e geração de vídeos · Recarga mínima de R$ {MIN_CREDIT_TOPUP_BRL} via PIX
              </p>
            </div>
          </div>
        </div>

        {/* Quick Package Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CREDIT_TOPUP_PACKAGES.map(pkg => (
            <button
              key={pkg}
              type="button"
              onClick={() => {
                setAmount(String(pkg));
                setPix(null);
              }}
              className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                Number(amount) === pkg
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase text-emerald-400 block">Pacote IA</span>
              <span className="text-lg font-black text-white">R$ {pkg},00</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                ~{Math.round(pkg * 8.5)} atendimentos
              </span>
            </button>
          ))}
        </div>

        {approved && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6" />
            <div>
              <p className="font-bold">Pagamento confirmado!</p>
              <p className="text-xs">Os créditos já foram adicionados ao saldo da sua loja.</p>
            </div>
          </div>
        )}

        {!pix ? (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="number"
                min={MIN_CREDIT_TOPUP_BRL}
                max="5000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-4 py-3 text-white outline-none focus:border-emerald-500"
              />
              <button
                onClick={generateCreditsPix}
                disabled={loading}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-6 py-3.5 font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                <span>Gerar PIX de R$ {amount}</span>
              </button>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </>
        ) : (
          <div className="grid md:grid-cols-2 gap-5 items-center pt-2">
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white text-slate-900">
              <img
                src={
                  pix.qr_code_base64?.startsWith('data:')
                    ? pix.qr_code_base64
                    : `data:image/png;base64,${pix.qr_code_base64}`
                }
                alt="QR Code PIX"
                className="w-48 h-48 object-contain"
              />
            </div>
            <div className="space-y-3">
              <p className="text-xs text-slate-400">PIX Copia e Cola (Recarga R$ {amount})</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={pix.qr_code || ''}
                  className="flex-1 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-300 font-mono"
                />
                <button
                  onClick={copyCreditsPix}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <button
                onClick={() => setPix(null)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Alterar valor
              </button>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Pagamentos processados com segurança via Mercado Pago · Liberação instantânea 24h</span>
        </div>
      </section>
    </div>
  );
};

const Metric = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-black text-white">{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
  </div>
);
