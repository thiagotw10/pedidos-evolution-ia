import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  LogOut, 
  Zap, 
  QrCode, 
  Sparkles, 
  ShieldCheck, 
  Smartphone, 
  MapPin, 
  DollarSign, 
  RefreshCw 
} from 'lucide-react';
import { Establishment } from '../types';
import { getSubscriptionStatus } from '../utils/subscription';

interface SubscriptionGateProps {
  establishment: Establishment | null;
  userEmail?: string | null;
  onSignOut?: () => void;
  children: React.ReactNode;
}

interface PixData {
  id: string | number;
  qr_code: string;
  qr_code_base64: string;
}

export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({
  establishment,
  userEmail,
  onSignOut,
  children
}) => {
  const status = getSubscriptionStatus(establishment);

  const [pixData, setPixData] = useState<PixData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-generate PIX immediately when gate is locked so the QR Code is instantly "na cara"
  useEffect(() => {
    if (!status.hasAccess && !pixData && !generating && establishment?.id) {
      handleGeneratePix();
    }
  }, [status.hasAccess, establishment?.id]);

  // Polling to verify payment approval automatically
  useEffect(() => {
    if (!pixData?.id || paymentSuccess || status.hasAccess) return;

    const interval = setInterval(async () => {
      try {
        setCheckingPayment(true);
        const res = await fetch(`/api/subscription/status/${pixData.id}`);
        const data = await res.json();
        
        if (data.approved || data.status === 'approved') {
          setPaymentSuccess(true);
          clearInterval(interval);
          // Wait 2 seconds for visual confirmation then window reloads or updates via Firestore
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } catch (err) {
        console.warn('Erro ao checar status de pagamento:', err);
      } finally {
        setCheckingPayment(false);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [pixData?.id, paymentSuccess, status.hasAccess]);

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
          name: establishment.name || 'Estabelecimento iaPedido'
        })
      });

      const data = await res.json();
      if (data.success && data.qr_code) {
        setPixData({
          id: data.id,
          qr_code: data.qr_code,
          qr_code_base64: data.qr_code_base64
        });
      } else {
        setErrorMsg(data.error || 'Não foi possível gerar a chave PIX no momento.');
      }
    } catch (err: any) {
      console.error('Erro ao gerar PIX:', err);
      setErrorMsg('Falha de conexão ao gerar o PIX. Tente novamente.');
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

  // Se tem acesso ativo (seja pelos 7 dias grátis ou pelo plano pago), libera o app
  if (status.hasAccess) {
    return <>{children}</>;
  }

  // Caso contrário, BLOQUEIO TOTAL COM PIX QR CODE NA CARA DO ESTABELECIMENTO
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl my-auto">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-400 mb-3 shadow-lg">
            <Lock className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold mb-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Período de Teste de 7 Dias Concluído
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Ative seu plano para continuar usando o <span className="text-emerald-400">iaPedido</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Seu período gratuito encerrou. As respostas da inteligência artificial no WhatsApp e o painel de pedidos foram pausados até a renovação.
          </p>
        </div>

        {/* Success Alert if Paid */}
        {paymentSuccess && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3 animate-bounce">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0 text-emerald-400" />
            <div>
              <p className="font-bold text-sm">Pagamento Confirmado com Sucesso!</p>
              <p className="text-xs text-emerald-400/80">Desbloqueando seu painel e ativando a IA agora...</p>
            </div>
          </div>
        )}

        {/* Plan Highlights */}
        <div className="mb-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Plano Mensal Completo</span>
              <h3 className="text-lg font-bold text-white">iaPedido Ilimitado</h3>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">R$ 50</span>
              <span className="text-xs text-slate-400 font-medium"> / mês</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Atendente IA no WhatsApp 24/7</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Gestão de Pedidos & Comandas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Envio de GPS/Waze a Motoboys</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Disparos e Campanhas Agendadas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Módulo Financeiro & Projeções</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>0% de comissão sobre vendas</span>
            </div>
          </div>
        </div>

        {/* PIX Payment Section */}
        {generating && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-300">Gerando QR Code PIX Mercado Pago...</p>
          </div>
        )}

        {errorMsg && !generating && (
          <div className="mb-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              onClick={handleGeneratePix}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {pixData && !generating && (
          <div className="space-y-4">
            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/95 text-slate-900 shadow-inner">
              <img
                src={pixData.qr_code_base64.startsWith('data:') ? pixData.qr_code_base64 : `data:image/png;base64,${pixData.qr_code_base64}`}
                alt="QR Code PIX iaPedido"
                className="w-52 h-52 object-contain rounded-xl p-1"
              />
              <p className="text-xs font-semibold text-slate-600 mt-2 text-center">
                Aponte a câmera do aplicativo do seu banco para pagar via PIX
              </p>
            </div>

            {/* Copia e Cola */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Ou use o PIX Copia e Cola:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={pixData.qr_code}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono outline-none focus:border-emerald-500/50 select-all"
                />
                <button
                  onClick={handleCopyPix}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    copied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                  }`}
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Código</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Waiting Payment Confirmation Banner */}
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <p className="text-xs text-emerald-300 font-medium">
                  Identificação automática: assim que você pagar no app do banco, esta tela libera na hora!
                </p>
              </div>
              <button
                onClick={handleGeneratePix}
                title="Recarregar QR Code"
                className="p-1.5 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Footer info & Logout */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Pagamento seguro via Mercado Pago</span>
          </div>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 text-slate-400 hover:text-rose-400 transition cursor-pointer font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair da conta</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
