import React from 'react';
import { 
  ShoppingBag, 
  TrendingUp, 
  UtensilsCrossed, 
  Smartphone, 
  Menu,
  MessageCircle,
  Car,
  Home,
  Shirt,
  Package,
  Wrench
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
      label: segConfig.id === 'AFFILIATES' ? 'Reels' : segConfig.id === 'AUTOMOTIVE_PARTS' ? 'Orçamentos' : segConfig.id === 'VEHICLES' ? 'Propostas' : segConfig.id === 'REAL_ESTATE' ? 'Leads' : 'Pedidos',
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
      label: segConfig.id === 'AFFILIATES' ? 'Achadinhos' : segConfig.id === 'AUTOMOTIVE_PARTS' ? 'Vitrine' : (segConfig.shortLabel ? segConfig.shortLabel.split(' ')[0] : 'Catálogo'),
      icon: CatalogIcon,
      badge: null
    },
    {
      id: 'inbox',
      label: 'Conversas',
      icon: MessageCircle,
      badge: null
    }
  ];

  const primaryTabs = segConfig.id === 'AUTOMOTIVE_PARTS' ? [
    {id: 'home', label: 'Início', icon: Home, badge: null},
    {id: 'orders', label: 'Projetos', icon: OrdersIcon, badge: null},
    {id: 'inbox', label: 'Conversas', icon: MessageCircle, badge: null},
    {id: 'garage', label: 'Garagem', icon: Wrench, badge: null},
  ] : tabs.filter(tab => segConfig.id !== 'AFFILIATES' || tab.id !== 'finance');
  const moreActive = !primaryTabs.some(tab => tab.id === currentTab);
  return (
    <nav aria-label="Navegação principal" className="crm-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center border-t border-white/10">
      {primaryTabs.map(tab => <button key={tab.id} type="button" aria-current={currentTab === tab.id ? 'page' : undefined}
        onClick={() => setCurrentTab(tab.id)} className={`crm-tab ${currentTab === tab.id ? 'is-active' : ''}`}>
        <span className="relative"><tab.icon size={21} strokeWidth={currentTab === tab.id ? 2.4 : 1.8}/>
          {tab.badge !== null && <span className="crm-tab-badge">{tab.badge}</span>}
        </span><span>{tab.label}</span>
      </button>)}
      <button type="button" onClick={onOpenDrawer} className={`crm-tab ${moreActive ? 'is-active' : ''}`} aria-label="Mais opções"><Menu size={21}/><span>Mais</span></button>
    </nav>
  );
};
