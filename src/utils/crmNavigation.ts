import {Home, MessageCircle, Wrench, Compass, Target, TrendingUp, CreditCard, Megaphone, MessageSquareCode, Smartphone, Instagram, Settings} from 'lucide-react';
import {Establishment} from '../types';
import {getSegmentConfig,getSegmentCatalogIcon,getSegmentOrdersIcon} from './segments';

/** One navigation inventory shared by desktop, mobile drawer and page titles. */
export function getCrmNavigation(establishment?:Establishment|null) {
 const config=getSegmentConfig(establishment?.segment), automotive=config.id==='AUTOMOTIVE_PARTS',affiliate=config.id==='AFFILIATES';
 return [
  {id:'daily',label:'Atendimento',items:[
   {id:'home',label:'Início',icon:Home},
   {id:'inbox',label:'Conversas',icon:MessageCircle},
   {id:'orders',label:config.ordersTitle,icon:getSegmentOrdersIcon(establishment?.segment)},
  ]},
  {id:'operation',label:affiliate?'Produtos':'Operação',items:[
   {id:'products',label:automotive?'Catálogo e referências':config.catalogTitle,icon:getSegmentCatalogIcon(establishment?.segment)},
   ...(automotive?[
    {id:'garage',label:'Garagem e estoque',icon:Wrench},
    {id:'internal',label:'Consultas da equipe',icon:MessageCircle},
    {id:'workshops',label:'Oficinas parceiras',icon:Wrench},
   ]:[]),
  ]},
  {id:'growth',label:'Canais e crescimento',items:[
   {id:'instagram',label:'Instagram',icon:Instagram},
   ...(!affiliate?[{id:'whatsapp',label:'WhatsApp',icon:Smartphone},
    ...(automotive?[{id:'radar',label:'Radar de leads',icon:Compass}]:[]),
    {id:'traffic',label:'Tráfego e comissões',icon:Target},
    ...(!automotive?[{id:'campaigns',label:'Campanhas e disparos',icon:Megaphone}]:[]),
   ]:[]),
  ]},
  {id:'management',label:'Gestão',items:[
   ...(!automotive&&!affiliate?[{id:'finance',label:'Financeiro',icon:TrendingUp}]:[]),
   {id:'settings',label:'Configurações e IA',icon:Settings},
   ...(!affiliate?[{id:'simulator',label:'Testar atendimento IA',icon:MessageSquareCode}]:[]),
   {id:'billing',label:'Plano e créditos',icon:CreditCard},
  ]},
 ];
}
