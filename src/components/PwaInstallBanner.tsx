import React, { useState, useEffect } from 'react';
import { Bell, Download, X, CheckCircle2, Smartphone, Volume2, Sparkles } from 'lucide-react';
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
    <div className="relative mx-3 sm:mx-6 mt-3 sm:mt-4 mb-2 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-slate-900 to-slate-900 border border-emerald-500/40 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
      {/* Left Info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-lg shadow-emerald-950/50">
          <Smartphone className="w-5 h-5 animate-pulse" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              Baixe o App iaPedido no seu Celular
            </h4>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wide border border-emerald-500/30">
              PWA
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate sm:whitespace-normal">
            Receba alertas sonoros na tela de bloqueio quando a IA fechar pedidos no WhatsApp.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
        {!isGranted && (
          <button
            onClick={handleEnableNotifications}
            disabled={isSubscribing}
            className="flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 whitespace-nowrap"
            title="Ativar som e alerta de novo pedido"
          >
            {isSubscribing ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            <span>Ativar Som</span>
          </button>
        )}

        <button
          onClick={onOpenModal}
          className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Baixar App (PWA)</span>
        </button>

        <button
          onClick={handleDismiss}
          title="Fechar aviso"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="absolute -bottom-12 right-0 bg-emerald-500 text-slate-950 text-xs font-black px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>Alertas ativados com sucesso!</span>
        </div>
      )}
    </div>
  );
};
