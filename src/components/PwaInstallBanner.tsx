import React, { useState, useEffect } from 'react';
import { Bell, Download, X, CheckCircle2, Smartphone, Sparkles, Volume2 } from 'lucide-react';
import { 
  isPushSupported, 
  isNotificationGranted, 
  subscribeToPushNotifications, 
  playNewOrderChime 
} from '../utils/pwaNotifications';

interface PwaInstallBannerProps {
  establishmentId: string;
}

export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({ establishmentId }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isGranted, setIsGranted] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  useEffect(() => {
    setIsGranted(isNotificationGranted());

    // Captura evento de instalação PWA (Chrome/Edge/Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Se já estiver rodando em standalone (PWA instalado), não mostra botão de instalar
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setCanInstall(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
      setDeferredPrompt(null);
    }
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

  if (dismissed) return null;
  if (isGranted && !canInstall) return null;

  return (
    <div className="relative mx-6 mt-4 mb-2 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
      
      {/* Left Info */}
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0 shadow-lg shadow-emerald-950/50">
          <Bell className="w-5 h-5 animate-bounce" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white">
              Receba alertas de novos pedidos mesmo com o app fechado
            </h4>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wide">
              PWA
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Ative as notificações e instale o iaPedido para o celular tocar e vibrar quando chegar pedido no WhatsApp.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
        {!isGranted && (
          <button
            onClick={handleEnableNotifications}
            disabled={isSubscribing}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-950/40 disabled:opacity-50"
          >
            {isSubscribing ? (
              <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            <span>Ativar Alertas de Pedidos</span>
          </button>
        )}

        {canInstall && (
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Instalar App</span>
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          title="Fechar aviso"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="absolute -bottom-12 right-0 bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>Notificações ativadas com sucesso!</span>
        </div>
      )}
    </div>
  );
};
