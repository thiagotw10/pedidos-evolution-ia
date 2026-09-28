import React from 'react';
import { 
  ShoppingBag, 
  TrendingUp, 
  UtensilsCrossed, 
  Smartphone, 
  Menu,
  Car,
  Home,
  Shirt,
  Package
} from 'lucide-react';
import { Establishment } from '../types';
import { getSegmentConfig } from '../utils/segments';

interface MobileBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  pendingOrdersCount: number;
  isWhatsAppConnected: boolean;
  onOpenDrawer: () => void;
  establishment?: Establishment | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  pendingOrdersCount,
  isWhatsAppConnected,
  onOpenDrawer,
  establishment
}) => {
  const segConfig = getSegmentConfig(establishment?.segment);

  const getCatalogIconAndLabel = () => {
    switch (segConfig.id) {
      case 'VEHICLES': return { label: 'Veículos', icon: Car };
      case 'REAL_ESTATE': return { label: 'Imóveis', icon: Home };
      case 'FASHION': return { label: 'Coleção', icon: Shirt };
      case 'ELECTRONICS': return { label: 'Aparelhos', icon: Smartphone };
      case 'GENERAL': return { label: 'Produtos', icon: Package };
      default: return { label: 'Cardápio', icon: UtensilsCrossed };
    }
  };

  const catalogMeta = getCatalogIconAndLabel();

  const tabs = [
    {
      id: 'orders',
      label: segConfig.id === 'VEHICLES' ? 'Propostas' : segConfig.id === 'REAL_ESTATE' ? 'Leads' : 'Pedidos',
      icon: ShoppingBag,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : null
    },
    {
      id: 'finance',
      label: 'Financeiro',
      icon: TrendingUp,
      badge: null
    },
    {
      id: 'products',
      label: catalogMeta.label,
      icon: catalogMeta.icon,
      badge: null
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: Smartphone,
      badge: isWhatsAppConnected ? '•' : '!'
    }
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 px-3 py-1.5 flex items-center justify-around shadow-2xl pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setCurrentTab(tab.id)}
            className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-xl transition cursor-pointer min-w-[56px] ${
              isActive 
                ? 'text-emerald-400 font-bold' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              {tab.badge !== null && (
                <span className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
                  tab.id === 'orders'
                    ? 'bg-emerald-500 text-slate-950 animate-pulse shadow-md shadow-emerald-500/50'
                    : (isWhatsAppConnected ? 'bg-emerald-500 text-slate-950 text-[14px] leading-none' : 'bg-amber-500 text-slate-950 font-bold')
                }`}>
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="text-[11px] mt-1 tracking-tight">{tab.label}</span>
          </button>
        );
      })}

      {/* Button for More (Drawer) */}
      <button
        onClick={onOpenDrawer}
        className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-slate-400 hover:text-slate-200 transition cursor-pointer min-w-[56px]"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[11px] mt-1 tracking-tight">Mais</span>
      </button>
    </nav>
  );
};
