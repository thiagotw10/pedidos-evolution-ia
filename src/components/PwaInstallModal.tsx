import React, { useState } from 'react';
import { 
  Download, 
  Smartphone, 
  Share, 
  PlusSquare, 
  CheckCircle2, 
  X, 
  Bell, 
  Volume2, 
  Sparkles,
  ShieldCheck,
  Check
} from 'lucide-react';
import { 
  isNotificationGranted, 
  subscribeToPushNotifications, 
  playNewOrderChime 
} from '../utils/pwaNotifications';

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  establishmentId: string;
  onInstalled?: () => void;
}

export const PwaInstallModal: React.FC<PwaInstallModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  establishmentId,
  onInstalled
}) => {
  const [subscribing, setSubscribing] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(() => isNotificationGranted());
  const [installedSuccess, setInstalledSuccess] = useState(false);

  if (!isOpen) return null;

  const isIOS = typeof navigator !== 'undefined' && 
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || 
     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  const isStandalone = typeof window !== 'undefined' && 
    (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone);

  const handleNativeInstall = async () => {
    if (!deferredPrompt) {
      alert('Seu navegador não suporta a instalação direta em 1 clique. Siga as instruções abaixo.');
      return;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstalledSuccess(true);
        if (onInstalled) onInstalled();
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err: any) {
      console.warn('Erro ao solicitar instalação:', err);
    }
  };

  const handleEnableNotifications = async () => {
    setSubscribing(true);
    try {
      const res = await subscribeToPushNotifications(establishmentId);
      if (res.success) {
        setNotificationsActive(true);
        playNewOrderChime();
      } else {
        alert(res.error || 'Não foi possível ativar notificações push.');
      }
    } catch (err: any) {
      alert('Erro ao ativar notificações: ' + err.message);
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20 shrink-0">
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Instalar Aplicativo iaPedido
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  PWA
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tenha o sistema como um app nativo no seu celular
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-200 flex-1">
          {/* Benefits list */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>Acesso direto na tela inicial</strong> sem precisar digitar URL ou abrir navegador.</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>Alertas e avisos na tela de bloqueio</strong> mesmo com o aplicativo fechado.</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>Som sonoro e vibração</strong> a cada pedido que a IA receber no WhatsApp.</span>
            </div>
          </div>

          {/* Already installed feedback */}
          {isStandalone && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Você já está executando o iaPedido no modo aplicativo instalado!</span>
            </div>
          )}

          {installedSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2.5 animate-in fade-in">
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Aplicativo instalado com sucesso! Verifique a tela inicial do seu celular.</span>
            </div>
          )}

          {/* Android / Chrome One-Click Install */}
          {deferredPrompt && !isStandalone && (
            <div className="space-y-3">
              <button
                onClick={handleNativeInstall}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/20 transition cursor-pointer"
              >
                <Download className="w-5 h-5" />
                <span>Baixar Aplicativo Agora (1 Clique)</span>
              </button>
              <p className="text-[11px] text-center text-slate-400">
                Toque no botão verde acima e confirme a instalação no seu aparelho.
              </p>
            </div>
          )}

          {/* iOS / iPhone Safari Step-by-Step Instructions */}
          {isIOS && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span>Como instalar no iPhone (Safari)</span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
                  <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0">
                    1
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      Toque no botão <Share className="w-3.5 h-3.5 text-cyan-400" /> Compartilhar
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Ele fica no rodapé da tela do Safari no seu iPhone.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
                  <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0">
                    2
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white flex items-center gap-1.5">
                      Selecione <PlusSquare className="w-3.5 h-3.5 text-emerald-400" /> Adicionar à Tela de Início
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Role um pouco o menu para baixo até encontrar essa opção.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
                  <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white">
                      Toque em "Adicionar" no canto superior
                    </p>
                    <p className="text-[11px] text-slate-400">
                      O ícone do <strong>iaPedido</strong> aparecerá direto entre os seus apps!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Android without prompt or Desktop fallback */}
          {!deferredPrompt && !isIOS && !isStandalone && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Como instalar no Chrome / Android / PC</span>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs space-y-1.5 text-slate-300">
                <p>1. Toque nos <strong>três pontinhos (⋮)</strong> no canto superior do navegador.</p>
                <p>2. Toque em <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</p>
                <p>3. Confirme para criar o aplicativo direto na tela do seu aparelho!</p>
              </div>
            </div>
          )}

          {/* Push notification enable card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">Alertas Sonoros de Pedidos</span>
              </div>
              {notificationsActive ? (
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  Ativado
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30">
                  Pendente
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Permite que o aparelho toque e vibre automaticamente assim que a IA registrar um novo pedido no WhatsApp.
            </p>

            {!notificationsActive && (
              <button
                onClick={handleEnableNotifications}
                disabled={subscribing}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer border border-emerald-500/30"
              >
                {subscribing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                    <span>Ativando alertas...</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    <span>Ativar Permissão de Notificação & Som</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer text-center"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
