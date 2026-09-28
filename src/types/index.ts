export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Establishment {
  id: string;
  name: string;
  phone: string;
  address: string;
  deliveryFee: number;
  estimatedDeliveryTime: string;
  operatingHours: string;
  description: string;
  pixKey?: string;
  // Evolution API
  evolutionApiUrl: string;
  evolutionApiKey: string;
  evolutionInstanceName: string;
  evolutionConnected?: boolean;
  // AI Settings
  aiPromptCustom?: string;
  aiWelcomeMessage?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  orderId?: string;
  mediaUrl?: string;
}
