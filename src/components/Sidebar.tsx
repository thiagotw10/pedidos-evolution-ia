import React from 'react';
import { 
  ShoppingBag, 
  UtensilsCrossed, 
  MessageSquareCode, 
  Smartphone, 
  Settings, 
  Sparkles,
  Bot,
  Megaphone,
  TrendingUp,
  Car,
  Home,
  Shirt,
  Package,
  CreditCard
} from 'lucide-react';
import { Establishment } from '../types';
import { getSegmentConfig, getSegmentCatalogIcon, getSegmentOrdersIcon } from '../utils/segments';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  pendingOrdersCount: number;
  isWhatsAppConnected: boolean;
  establishment?: Establishment | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  pendingOrdersCount,
  isWhatsAppConnected,
  establishment
}) => {
  const segConfig = getSegmentConfig(establishment?.segment);
  const CatalogIcon = getSegmentCatalogIcon(establishment?.segment);
  const OrdersIcon = getSegmentOrdersIcon(establishment?.segment);

  const menuItems = [
    {
      id: 'orders',
      label: segConfig.ordersTitle,
      icon: OrdersIcon,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : null,
      badgeColor: 'bg-emerald-500 text-black font-bold animate-pulse'
    },
    {
      id: 'finance',
      label: 'Painel Financeiro',
      icon: TrendingUp,
      badge: null
    },
    { id: 'billing', label: 'Planos & Créditos IA', icon: CreditCard, badge: null },
    {
      id: 'products',
      label: segConfig.catalogTitle,
      icon: CatalogIcon,
      badge: null
    },
    {
      id: 'campaigns',
      label: 'Disparos & Campanhas',
      icon: Megaphone,
      badge: null
    },
    {
      id: 'simulator',
      label: 'Simulador da IA',
      icon: MessageSquareCode,
      badge: 'Testar',
      badgeColor: 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    },
    {
      id: 'whatsapp',
      label: 'Conexão WhatsApp',
      icon: Smartphone,
      badge: isWhatsAppConnected ? 'Online' : 'Desconectado',
      badgeColor: isWhatsAppConnected 
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
    },
    {
      id: 'settings',
      label: 'Configurações & IA',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <aside className="hidden md:flex w-72 bg-slate-900/90 border-r border-slate-800/80 flex-col h-screen select-none backdrop-blur-md flex-shrink-0">
      {/* Brand Header */}
      <div className="h-24 px-6 border-b border-slate-800/60 flex items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-lg text-white tracking-tight">ia<span className="text-emerald-400">Pedido</span></h1>
            </div>
            <p className="text-xs text-slate-400 font-medium">WhatsApp & IA</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Menu Principal
        </div>
        {menuItems.filter(item => segConfig.id !== 'AUTOMOTIVE_PARTS' || !['finance', 'campaigns'].includes(item.id)).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full min-h-12 flex items-center justify-between px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-emerald-300 border border-emerald-500/30 shadow-md shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div className="p-4 border-t border-slate-800/60 m-3 rounded-2xl bg-slate-950/60 border border-slate-800/80">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-xs font-semibold text-slate-300">Atendimento WhatsApp</span>
          <span className="ml-auto text-[10px] text-emerald-400 font-mono font-bold">ATIVO</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Inteligência Artificial</span>
          <span className="font-semibold text-emerald-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Conectada
          </span>
        </div>
      </div>
    </aside>
  );
};
