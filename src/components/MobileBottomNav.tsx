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
import { getSegmentConfig, getSegmentCatalogIcon, getSegmentOrdersIcon } from '../utils/segments';

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
  const CatalogIcon = getSegmentCatalogIcon(establishment?.segment);
  const OrdersIcon = getSegmentOrdersIcon(establishment?.segment);

  const tabs = [
    {
      id: 'orders',
      label: segConfig.id === 'AUTOMOTIVE_PARTS' ? 'Orçamentos' : segConfig.id === 'VEHICLES' ? 'Propostas' : segConfig.id === 'REAL_ESTATE' ? 'Leads' : 'Pedidos',
      icon: OrdersIcon,
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
      label: segConfig.id === 'AUTOMOTIVE_PARTS' ? 'Vitrine' : (segConfig.shortLabel ? segConfig.shortLabel.split(' ')[0] : 'Catálogo'),
      icon: CatalogIcon,
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 px-3 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-2xl">
      {tabs.filter(tab => establishment?.segment !== 'AUTOMOTIVE_PARTS' || !['finance', 'campaigns'].includes(tab.id)).map(tab => {
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
