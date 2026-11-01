import React, {useEffect, useRef} from 'react';
import {getCrmNavigation} from '../utils/crmNavigation';
import {X,LogOut,Volume2,VolumeX,Sparkles,Store,Download} from 'lucide-react';
import { Establishment } from '../types';
import { getSubscriptionStatus } from '../utils/subscription';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  establishment: Establishment | null;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onOpenSubscription?: () => void;
  onOpenInstallModal?: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  setCurrentTab,
  establishment,
  soundEnabled,
  setSoundEnabled,
  onOpenSubscription,
  onOpenInstallModal,
  userEmail,
  onSignOut
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panel) return;
      const buttons = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(el => el.getClientRects().length > 0);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    };
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('keydown', onKey); previous?.focus();};
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const subStatus = getSubscriptionStatus(establishment);

  const groups = getCrmNavigation(establishment);

  const handleSelectTab = (tabId: string) => {
    setCurrentTab(tabId);
    onClose();
  };

  return (
    <div className="crm-more-sheet md:hidden fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer Content */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Menu do CRM" className="crm-more-panel relative ml-auto w-4/5 max-w-sm h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col p-5 overflow-y-auto animate-in slide-in-from-right duration-300">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/50">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-white">ia<span className="text-emerald-400">Pedido</span></h2>
              <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">
                {establishment?.name || 'Estabelecimento'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subscription Status Card */}
        {onOpenSubscription && (
          <button
            onClick={() => {
              onClose();
              onOpenSubscription();
            }}
            className="my-4 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-emerald-500/30 text-left transition cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">Plano Mensal</p>
                <p className="text-xs font-bold text-white">{subStatus.statusLabel}</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              Gerenciar
            </span>
          </button>
        )}

        {/* Quick Toggles */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={['AUTOMOTIVE_PARTS','AFFILIATES'].includes(establishment?.segment || '') ? { display: 'none' } : undefined}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border ${
              soundEnabled
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-800/60 text-slate-400 border-slate-800'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? 'Som Ativo' : 'Sem Som'}</span>
          </button>
        </div>

        {/* PWA Install Button in Drawer */}
        {onOpenInstallModal && (
          <button
            onClick={() => {
              onClose();
              onOpenInstallModal();
            }}
            className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between transition cursor-pointer hover:from-emerald-500/30 hover:to-teal-500/30"
          >
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <p className="text-xs font-black text-white">Instalar App no Celular</p>
                <p className="text-[10px] text-emerald-400/80">Acesso rápido pela tela inicial</p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950">
              Instalar
            </span>
          </button>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1">
          {groups.map(group=><section key={group.id} className="crm-nav-group" aria-label={group.label}>
            <h2 className="crm-nav-group-label">{group.label}</h2>
            {group.items.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                title={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full h-11 flex items-center justify-between gap-2 border border-transparent px-3.5 py-2.5 text-left rounded-xl text-xs font-semibold transition cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="truncate leading-5">{item.label}</span>
                </div>

              </button>
            );
          })}</section>)}
        </nav>

        {/* Footer / User Session */}
        <div className="pt-4 border-t border-slate-800 mt-4 space-y-2">
          {userEmail && (
            <div className="px-2 py-1 text-[11px] text-slate-400 truncate">
              Conectado como: <span className="text-white font-medium">{userEmail}</span>
            </div>
          )}

          {onSignOut && (
            <button
              onClick={() => {
                onClose();
                onSignOut();
              }}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Desconectar da Conta</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
