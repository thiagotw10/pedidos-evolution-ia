import React from 'react';
import { Volume2, VolumeX, Smartphone, Instagram, Store, Clock, LogOut, User, Menu, Download } from 'lucide-react';
import { Establishment } from '../types';

interface HeaderProps {
  establishment: Establishment | null;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onOpenWhatsApp: () => void;
  onOpenSettings: () => void;
  onOpenSubscription?: () => void;
  onOpenMenu?: () => void;
  onOpenInstallModal?: () => void;
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
  onOpenInstallModal,
  userEmail,
  onSignOut
}) => {
  return (
    <header className="h-16 sm:h-[72px] bg-slate-900/90 border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-4 backdrop-blur-xl sticky top-0 z-30 pt-[max(0rem,env(safe-area-inset-top))] min-w-0 w-full">
      {/* Store Info */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 sm:flex-initial">
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-2.5 sm:gap-3 group text-left transition hover:opacity-90 cursor-pointer min-w-0 max-w-full"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/50 transition shrink-0 shadow-sm">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5 min-w-0">
              <span className="truncate">{establishment?.name || 'Estabelecimento'}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-sm shadow-emerald-500/50" />
            </h2>
            <p className="text-[10px] text-slate-400 sm:hidden truncate flex items-center gap-1 mt-0.5">
              <span className="text-emerald-400 font-semibold">• Online</span>
              <span className="text-slate-600">|</span>
              <span className="truncate">{establishment?.segment === 'AFFILIATES' ? 'Afiliados & Achadinhos' : establishment?.segment === 'AUTOMOTIVE_PARTS' ? 'Oficina & Performance' : 'Painel de Vendas'}</span>
            </p>
            <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:flex items-center gap-1.5 truncate">
              <Clock className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate">{establishment?.segment === 'AFFILIATES' ? 'Conteúdo, produtos e conversas' : establishment?.operatingHours || 'Aberto hoje'}</span>
            </p>
          </div>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        {/* PWA Download / Install App Button (Desktop only in header, mobile has dedicated banner and drawer) */}
        {onOpenInstallModal && (
          <button
            onClick={onOpenInstallModal}
            title="Instalar Aplicativo iaPedido no Celular (PWA)"
            className="hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 border border-emerald-500/40 items-center gap-1.5 transition cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Baixar App</span>
          </button>
        )}

        {/* Sound Alert Toggle (Desktop in header, mobile in drawer) */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          style={['AUTOMOTIVE_PARTS','AFFILIATES'].includes(establishment?.segment || '') ? { display: 'none' } : undefined}
          title={soundEnabled ? 'Alerta sonoro de novo pedido ativado' : 'Alerta sonoro desativado'}
          className={`hidden sm:flex p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold items-center gap-2 transition cursor-pointer border ${
            soundEnabled
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          <span>{soundEnabled ? 'Som Ativo' : 'Sem Som'}</span>
        </button>

        {/* WhatsApp Status (Desktop in header, mobile in bottom nav) */}
        <button
          onClick={onOpenWhatsApp}
          title={establishment?.segment === 'AFFILIATES' ? 'Gerenciar Instagram' : establishment?.evolutionConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
          className="hidden sm:flex p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs font-semibold items-center gap-2 bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 transition cursor-pointer text-slate-200 shadow-sm"
        >
          {establishment?.segment === 'AFFILIATES' ? <Instagram className="w-4 h-4 text-pink-400" /> : <Smartphone className="w-4 h-4 text-emerald-400" />}
          <span>{establishment?.segment === 'AFFILIATES' ? 'Instagram' : 'WhatsApp'}</span>
          {establishment?.segment !== 'AFFILIATES' && <span className={`w-2 h-2 rounded-full ${establishment?.evolutionConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />}
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
            className="md:hidden w-10 h-10 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer flex items-center justify-center shrink-0 shadow-sm"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>
    </header>
  );
};
