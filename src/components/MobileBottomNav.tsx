import React from 'react';
import {Menu,MessageCircle,Home,Wrench} from 'lucide-react';
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

  const primaryTabs = [
    {id:'home',label:'Início',icon:Home,badge:null},
    {id:'orders',label:segConfig.id==='AFFILIATES'?'Reels':segConfig.id==='AUTOMOTIVE_PARTS'?'Projetos':segConfig.id==='VEHICLES'?'Propostas':segConfig.id==='REAL_ESTATE'?'Leads':'Pedidos',icon:OrdersIcon,badge:pendingOrdersCount>0?pendingOrdersCount:null},
    {id:'inbox',label:'Conversas',icon:MessageCircle,badge:null},
    segConfig.id==='AUTOMOTIVE_PARTS'?{id:'garage',label:'Garagem',icon:Wrench,badge:null}:{id:'products',label:segConfig.id==='AFFILIATES'?'Achadinhos':'Catálogo',icon:CatalogIcon,badge:null},
  ];
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
