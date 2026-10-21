import { Establishment } from '../types';

export type PlanTierId = 'essencial' | 'pro' | 'performance';

export interface PlanTierConfig {
  id: PlanTierId;
  name: string;
  badge?: string;
  price: number;
  includedCredits: number;
  estimatedInteractions: string;
  setupFeeOptional?: number;
  targetAudience: string;
  features: string[];
  highlighted?: boolean;
}

export const PLAN_TIERS: Record<PlanTierId, PlanTierConfig> = {
  essencial: {
    id: 'essencial',
    name: 'Plano Essencial',
    price: 197,
    includedCredits: 50,
    estimatedInteractions: '~400 atendimentos IA / mês',
    targetAudience: 'Restaurantes, Delivery Iniciante & Comércio Geral',
    features: [
      'Agente Chatbot IA 24h no WhatsApp (Texto + Áudio)',
      'Franquia de R$ 50,00 em créditos de IA inclusa todo mês',
      'Vitrine Digital Responsiva + Catálogo com Fotos',
      'Gestor de Pedidos em Tempo Real com Alerta Sonoro',
      '0% de comissão sobre suas vendas'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Plano Pro Multimídia',
    badge: 'Mais Escolhido',
    price: 347,
    includedCredits: 100,
    estimatedInteractions: '~900 atendimentos IA / mês',
    targetAudience: 'Delivery Estruturado, Moda, Eletrônicos, Imóveis & Veículos',
    highlighted: true,
    features: [
      'Tudo do Plano Essencial + R$ 100,00 em créditos IA/mês',
      'Espelho de Voz Neural (IA responde clientes em áudio)',
      'Co-Pilot do Dono no WhatsApp (gestão por voz e fotos)',
      'Disparos e Campanhas Agendadas (Clientes e Grupos)',
      'Radar de Catálogo IA + Despacho GPS 1-Clique (Waze/Maps)'
    ]
  },
  performance: {
    id: 'performance',
    name: 'Plano Performance & 3D',
    badge: 'High-Ticket / Automotivo',
    price: 497,
    includedCredits: 180,
    estimatedInteractions: '~1.500 interações qualificadoras / mês',
    setupFeeOptional: 997,
    targetAudience: 'Performance & Escapamentos, Oficinas Premium & Concessionárias',
    features: [
      'Tudo do Plano Pro + R$ 180,00 em créditos IA/mês',
      'Vitrine 3D Imersiva (.GLB interativo + Áudio Espacial do Ronco)',
      'CRM Técnico de Projetos & Orçamentos integrado ao WhatsApp',
      'Memória de Contexto por Contato + Envio de Vídeos do Ronco',
      'Estúdio de Vídeo IA (Reels Automotivo com Locução Neural)'
    ]
  }
};

export const PLAN_TIER_LIST: PlanTierConfig[] = [
  PLAN_TIERS.essencial,
  PLAN_TIERS.pro,
  PLAN_TIERS.performance
];

export const MIN_CREDIT_TOPUP_BRL = 100;
export const CREDIT_TOPUP_PACKAGES = [100, 200, 350, 500];

export function getRecommendedPlanForSegment(segment?: string): PlanTierConfig {
  const norm = String(segment || '').toUpperCase();
  if (norm === 'AUTOMOTIVE_PARTS') return PLAN_TIERS.performance;
  if (
    norm.includes('VEIC') ||
    norm.includes('CARRO') ||
    norm.includes('IMOB') ||
    norm.includes('MODA') ||
    norm.includes('ELETRO')
  ) {
    return PLAN_TIERS.pro;
  }
  return PLAN_TIERS.essencial;
}

export function getPlanConfig(planTier?: string, segment?: string): PlanTierConfig {
  if (planTier && PLAN_TIERS[planTier as PlanTierId]) {
    return PLAN_TIERS[planTier as PlanTierId];
  }
  return getRecommendedPlanForSegment(segment);
}

export interface SubscriptionStatus {
  hasAccess: boolean;
  isTrial: boolean;
  isActivePaid: boolean;
  isExpired: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  trialEndsAt: Date | null;
  subscriptionValidUntil: Date | null;
  statusLabel: string;
  planTier: PlanTierId;
  planName: string;
  planPrice: number;
  includedCredits: number;
}

const TRIAL_DAYS = 7;

export function getSubscriptionStatus(establishment: Establishment | null | undefined): SubscriptionStatus {
  const resolvedPlan = getPlanConfig(establishment?.planTier, establishment?.segment);

  if (!establishment) {
    return {
      hasAccess: true,
      isTrial: true,
      isActivePaid: false,
      isExpired: false,
      daysRemaining: 7,
      hoursRemaining: 168,
      trialEndsAt: null,
      subscriptionValidUntil: null,
      statusLabel: 'Carregando...',
      planTier: resolvedPlan.id,
      planName: resolvedPlan.name,
      planPrice: resolvedPlan.price,
      includedCredits: resolvedPlan.includedCredits
    };
  }

  const now = new Date();

  // 0. Estabelecimento proprietário ou Flow Garage
  if (establishment.id === 'ZFFWUNspKNYKsn22kKDH6nybCWw2' || establishment.publicSlug === 'flow-garage-exhaust-ZFFWU' || establishment.isOwner || establishment.plan === 'active' || establishment.accountStatus === 'active_paid') {
    return {
      hasAccess: true,
      isTrial: false,
      isActivePaid: true,
      isExpired: false,
      daysRemaining: 999,
      hoursRemaining: 99999,
      trialEndsAt: null,
      subscriptionValidUntil: new Date('2099-12-31T23:59:59.000Z'),
      statusLabel: `${resolvedPlan.name} Ativo`,
      planTier: resolvedPlan.id,
      planName: resolvedPlan.name,
      planPrice: Number(establishment.planPrice || resolvedPlan.price),
      includedCredits: resolvedPlan.includedCredits
    };
  }

  // 1. Verificar se possui assinatura ativa paga (Mercado Pago PIX)
  if (establishment.subscriptionValidUntil) {
    const validUntil = new Date(establishment.subscriptionValidUntil);
    if (!isNaN(validUntil.getTime()) && validUntil > now) {
      const diffMs = validUntil.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const hoursRemaining = Math.ceil(diffMs / (1000 * 60 * 60));

      return {
        hasAccess: true,
        isTrial: false,
        isActivePaid: true,
        isExpired: false,
        daysRemaining,
        hoursRemaining,
        trialEndsAt: null,
        subscriptionValidUntil: validUntil,
        statusLabel: `${resolvedPlan.name} (${daysRemaining} ${daysRemaining === 1 ? 'dia restante' : 'dias restantes'})`,
        planTier: resolvedPlan.id,
        planName: resolvedPlan.name,
        planPrice: Number(establishment.planPrice || resolvedPlan.price),
        includedCredits: resolvedPlan.includedCredits
      };
    }
  }

  // 2. Verificar período de teste grátis (7 dias a partir da criação)
  let createdAtDt: Date;
  if (establishment.createdAt) {
    createdAtDt = new Date(establishment.createdAt);
    if (isNaN(createdAtDt.getTime())) {
      createdAtDt = new Date();
    }
  } else {
    createdAtDt = new Date();
  }

  let trialEndsAt: Date;
  if (establishment.trialEndsAt) {
    trialEndsAt = new Date(establishment.trialEndsAt);
    if (isNaN(trialEndsAt.getTime())) {
      trialEndsAt = new Date(createdAtDt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    }
  } else {
    trialEndsAt = new Date(createdAtDt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }

  if (now < trialEndsAt) {
    const diffMs = trialEndsAt.getTime() - now.getTime();
    const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

    return {
      hasAccess: true,
      isTrial: true,
      isActivePaid: false,
      isExpired: false,
      daysRemaining,
      hoursRemaining,
      trialEndsAt,
      subscriptionValidUntil: null,
      statusLabel: `Teste Grátis (${daysRemaining} ${daysRemaining === 1 ? 'dia restante' : 'dias restantes'})`,
      planTier: resolvedPlan.id,
      planName: resolvedPlan.name,
      planPrice: resolvedPlan.price,
      includedCredits: resolvedPlan.includedCredits
    };
  }

  // 3. Período expirado e sem assinatura ativa
  return {
    hasAccess: false,
    isTrial: false,
    isActivePaid: false,
    isExpired: true,
    daysRemaining: 0,
    hoursRemaining: 0,
    trialEndsAt,
    subscriptionValidUntil: establishment.subscriptionValidUntil ? new Date(establishment.subscriptionValidUntil) : null,
    statusLabel: 'Período Expirado',
    planTier: resolvedPlan.id,
    planName: resolvedPlan.name,
    planPrice: resolvedPlan.price,
    includedCredits: resolvedPlan.includedCredits
  };
}
