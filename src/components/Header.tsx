import React from 'react';
import { Volume2, VolumeX, Smartphone, Store, Clock, LogOut, User } from 'lucide-react';
import { Establishment } from '../types';

interface HeaderProps {
  establishment: Establishment | null;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  onOpenWhatsApp: () => void;
  onOpenSettings: () => void;
  userEmail?: string | null;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  establishment,
  soundEnabled,
  setSoundEnabled,
  onOpenWhatsApp,
  onOpenSettings,
  userEmail,
  onSignOut
}) => {
  return (
    <header className="h-20 bg-slate-900/60 border-b border-slate-800/80 px-8 flex items-center justify-between backdrop-blur-md sticky top-0 z-30">
      {/* Store Info */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-3 group text-left transition hover:opacity-90 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/50 transition">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              {establishment?.name || 'Carregando Estabelecimento...'}
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </h2>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {establishment?.operatingHours || 'Aberto hoje'}
            </p>
          </div>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Sound Alert Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Alerta sonoro de novo pedido ativado' : 'Alerta sonoro desativado'}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border ${
            soundEnabled
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-slate-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          <span>{soundEnabled ? 'Som Ativo' : 'Sem Som'}</span>
        </button>

        {/* WhatsApp Status */}
        <button
          onClick={onOpenWhatsApp}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 transition cursor-pointer text-slate-200 shadow-sm"
        >
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <span>WhatsApp</span>
          <span className={`w-2 h-2 rounded-full ${establishment?.evolutionConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
        </button>

        {/* User Session & Logout */}
        {userEmail && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="max-w-[150px] truncate">{userEmail}</span>
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
      </div>
    </header>
  );
};
