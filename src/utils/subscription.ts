import { Establishment } from '../types';

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
}

const TRIAL_DAYS = 7;

export function getSubscriptionStatus(establishment: Establishment | null | undefined): SubscriptionStatus {
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
    };
  }

  const now = new Date();

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
        statusLabel: `Plano Ativo (${daysRemaining} ${daysRemaining === 1 ? 'dia restante' : 'dias restantes'})`,
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
    // Se não tiver data salva, usa data atual como marco inicial
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
  };
}
