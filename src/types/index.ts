export interface Product {
  id: string;
  name: string;
  publicSlug?: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  images?: string[];
  videoUrl?: string;
  available: boolean;
  options?: {
    name: string;
    price: number;
  }[];
  createdAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface OrderItem {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  total: number;
}

export type OrderStatus = 
  | 'PENDENTE' 
  | 'CONFIRMADO' 
  | 'EM_PREPARO' 
  | 'A_CAMINHO' 
  | 'PRONTO' 
  | 'CONCLUIDO' 
  | 'CANCELADO';

export interface Courier {
  id: string;
  name: string;
  phone: string;
  vehicle?: 'MOTO' | 'CARRO' | 'BIKE';
  active?: boolean;
  createdAt?: string;
}

export interface Order {
  id: string;
  establishmentId: string;
  orderNumber?: number;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryType: 'DELIVERY' | 'RETIRADA';
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string; // 'PIX' | 'CARTAO_ENTREGA' | 'DINHEIRO'
  changeFor?: number;
  status: OrderStatus;
  notes?: string;
  rejectionReason?: string;
  latitude?: number;
  longitude?: number;
  locationUrl?: string;
  isGpsLocation?: boolean;
  courierId?: string;
  courierName?: string;
  courierPhone?: string;
  dispatchedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DaySchedule {
  enabled: boolean;
  open: string;  // e.g. "18:00"
  close: string; // e.g. "23:30"
}

export interface OperatingSchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export type OutOfHoursAction = 'SILENT' | 'AUTO_REPLY';

export type BusinessSegment = 
  | 'FOOD'
  | 'VEHICLES'
  | 'AUTOMOTIVE_PARTS'
  | 'REAL_ESTATE'
  | 'FASHION'
  | 'ELECTRONICS'
  | 'GENERAL';

export interface Establishment {
  id: string;
  publicSlug?: string;
  name: string;
  phone: string;
  whatsappNumber?: string;
  address: string;
  segment?: BusinessSegment | string;
  deliveryFee: number;
  estimatedDeliveryTime: string;
  operatingHours: string;
  description: string;
  pixKey?: string;
  couriers?: Courier[];
  // Evolution API
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstanceName: string;
  evolutionConnected?: boolean;
  // AI Settings
  aiPromptCustom?: string;
  aiWelcomeMessage?: string;
  // AI Voice Mirror (Espelho de Voz WhatsApp)
  aiVoiceMirrorEnabled?: boolean;
  aiVoiceId?: string;
  // AI Operating Hours & Schedule
  aiScheduleEnabled?: boolean;
  aiOperatingSchedule?: OperatingSchedule;
  aiOutOfHoursAction?: OutOfHoursAction;
  aiOutOfHoursMessage?: string;
  // Subscription & Plan (Mercado Pago PIX)
  plan?: 'trial' | 'active' | 'expired';
  accountStatus?: 'trial' | 'active_paid' | 'expired';
  trialEndsAt?: string;
  subscriptionValidUntil?: string;
  lastPaymentDate?: string;
  planPrice?: number;
  referralCode?: string;
  referredBy?: string;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  orderId?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface WhatsAppGroup {
  id: string; // e.g. "1203630283921938@g.us"
  subject: string;
  size?: number;
  pictureUrl?: string;
}

export interface CampaignTemplate {
  id: string;
  establishmentId: string;
  title: string;
  description?: string;
  message: string;
  imageUrl?: string;
  scheduledTime: string; // e.g. "18:00"
  daysOfWeek: number[]; // [0, 1, 2, 3, 4, 5, 6] (0 = Sunday, 1 = Monday, etc.)
  active: boolean;
  targetAudience: 'ALL_CUSTOMERS' | 'LAST_30_DAYS' | 'WHATSAPP_GROUPS';
  targetGroupIds?: string[]; // IDs of selected groups for WHATSAPP_GROUPS audience
  lastRunAt?: string;
  stats?: {
    totalSent: number;
    lastBatchCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CatalogRadarInsight {
  score: number; // 0 a 100
  summary: string;
  unmetDemands: Array<{
    title: string;
    reason: string;
    suggestedCategory: string;
    suggestedPrice: number;
    demandLevel: 'ALTA' | 'MÉDIA' | 'EMERGENTE';
  }>;
  topOpportunities: Array<{
    productName: string;
    insight: string;
    badge: string;
  }>;
  crossSellAction: {
    title: string;
    suggestion: string;
    ticketImpact: string;
  };
  health: {
    totalItems: number;
    withPhoto: number;
    withoutPhoto: number;
    photoPercentage: number;
    alertMessage?: string;
  };
  analyzedAt: string;
}
