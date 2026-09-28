import React from 'react';
import { Volume2, VolumeX, Smartphone, Store, Clock, LogOut, User, Sparkles, Menu } from 'lucide-react';
import { Establishment } from '../types';
import { getSubscriptionStatus } from '../utils/subscription';

interface HeaderProps {
  establishment: Establishment | null;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onOpenWhatsApp: () => void;
  onOpenSettings: () => void;
  onOpenSubscription?: () => void;
  onOpenMenu?: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  establishment,
  soundEnabled,
  setSoundEnabled,
  onOpenWhatsApp,
  onOpenSettings,
  onOpenSubscription,
  onOpenMenu,
  userEmail,
  onSignOut
}) => {
  const subStatus = getSubscriptionStatus(establishment);

  return (
    <header className="h-16 sm:h-20 bg-slate-900/80 border-b border-slate-800/80 px-3 sm:px-8 flex items-center justify-between backdrop-blur-md sticky top-0 z-30">
      {/* Store Info */}
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-2 sm:gap-3 group text-left transition hover:opacity-90 cursor-pointer min-w-0"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/50 transition flex-shrink-0">
            <Store className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-base font-bold text-white flex items-center gap-1.5 truncate max-w-[130px] sm:max-w-[280px]">
              <span className="truncate">{establishment?.name || 'Estabelecimento'}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:flex items-center gap-1.5 truncate">
              <Clock className="w-3 h-3 text-slate-500" />
              <span className="truncate">{establishment?.operatingHours || 'Aberto hoje'}</span>
            </p>
          </div>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
        {/* Subscription Status Badge */}
        {onOpenSubscription && (
          <button
            onClick={onOpenSubscription}
            title="Ver detalhes da assinatura"
            className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 sm:gap-1.5 border transition cursor-pointer ${
              subStatus.isActivePaid
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                : (subStatus.isTrial
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20 animate-pulse')
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">
              {subStatus.isActivePaid
                ? `Plano Ativo (${subStatus.daysRemaining}d)`
                : (subStatus.isTrial
                    ? `7 Dias Grátis (${subStatus.daysRemaining}d)`
                    : 'Assinar R$ 50/mês')}
            </span>
            <span className="sm:hidden text-[11px]">
              {subStatus.isActivePaid
                ? `${subStatus.daysRemaining}d`
                : (subStatus.isTrial
                    ? `${subStatus.daysRemaining}d grátis`
                    : 'Assinar')}
            </span>
          </button>
        )}

        {/* Sound Alert Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Alerta sonoro de novo pedido ativado' : 'Alerta sonoro desativado'}
          className={`p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border ${
            soundEnabled
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          <span className="hidden sm:inline">{soundEnabled ? 'Som Ativo' : 'Sem Som'}</span>
        </button>

        {/* WhatsApp Status */}
        <button
          onClick={onOpenWhatsApp}
          title={establishment?.evolutionConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
          className="p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 transition cursor-pointer text-slate-200 shadow-sm"
        >
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span className="hidden sm:inline">WhatsApp</span>
          <span className={`w-2 h-2 rounded-full ${establishment?.evolutionConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
        </button>

        {/* User Session & Logout (Desktop) */}
        {userEmail && (
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="max-w-[130px] truncate">{userEmail}</span>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                title="Desconectar da conta"
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 border border-slate-700/60 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Mobile Menu Hamburger (Opens Drawer) */}
        {onOpenMenu && (
          <button
            onClick={onOpenMenu}
            title="Abrir Menu"
            className="md:hidden p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

