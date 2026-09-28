import React, { useState, useEffect } from 'react';
import { Download, X, CheckCircle2, Smartphone, Volume2 } from 'lucide-react';
import { 
  isNotificationGranted, 
  subscribeToPushNotifications, 
  playNewOrderChime 
} from '../utils/pwaNotifications';

interface PwaInstallBannerProps {
  establishmentId: string;
  onOpenModal: () => void;
  deferredPrompt?: any;
}

export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({ 
  establishmentId, 
  onOpenModal,
  deferredPrompt 
}) => {
  const [isGranted, setIsGranted] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      const saved = localStorage.getItem('iapedido_pwa_banner_dismissed');
      if (saved) {
        const time = parseInt(saved, 10);
        // Não mostrar por 12 horas se fechado
        if (Date.now() - time < 12 * 60 * 60 * 1000) return true;
      }
    } catch {}
    return false;
  });
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  useEffect(() => {
    setIsGranted(isNotificationGranted());
  }, []);

  const isStandalone = typeof window !== 'undefined' && 
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone);

  // Se já estiver em app standalone e as notificações já foram concedidas, não precisa do banner
  if (isStandalone && isGranted) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('iapedido_pwa_banner_dismissed', Date.now().toString());
    } catch {}
  };

  const handleEnableNotifications = async () => {
    setIsSubscribing(true);
    try {
      const res = await subscribeToPushNotifications(establishmentId);
      if (res.success) {
        setIsGranted(true);
        setShowSuccessToast(true);
        playNewOrderChime();
        setTimeout(() => setShowSuccessToast(false), 4000);
      } else {
        alert(res.error || 'Não foi possível ativar as notificações.');
      }
    } catch (e: any) {
      alert('Erro ao ativar notificações: ' + e.message);
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div className="relative mx-3 sm:mx-6 md:mx-8 mt-3 sm:mt-4 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-300">
      
      {/* Top row: Icon + Title + Close Button */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-md shadow-emerald-950/40">
            <Smartphone className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs sm:text-sm font-black text-white">
                Instale o App iaPedido no Celular
              </h4>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase tracking-wider border border-emerald-500/30">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
              Receba pedidos com som na tela de bloqueio mesmo com o app fechado.
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          title="Fechar aviso temporariamente"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0 -mt-1 -mr-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          onClick={onOpenModal}
          className="w-full sm:w-auto flex-1 sm:flex-initial py-2.5 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-[0.99]"
        >
          <Download className="w-4 h-4" />
          <span>Baixar / Adicionar à Tela de Início</span>
        </button>

        {!isGranted && (
          <button
            onClick={handleEnableNotifications}
            disabled={isSubscribing}
            className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            title="Ativar som e alerta de novo pedido"
          >
            {isSubscribing ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            <span>Ativar Som de Pedido</span>
          </button>
        )}
      </div>

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="absolute -bottom-10 right-2 bg-emerald-500 text-slate-950 text-xs font-black px-3 py-1.5 rounded-xl shadow-2xl flex items-center gap-1.5 animate-in fade-in duration-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Alertas sonoros ativados!</span>
        </div>
      )}
    </div>
  );
};
