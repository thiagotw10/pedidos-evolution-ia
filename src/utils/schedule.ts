import { OperatingSchedule, DaySchedule } from '../types';

export const DEFAULT_AI_SCHEDULE: OperatingSchedule = {
  monday: { enabled: false, open: '18:00', close: '23:30' },
  tuesday: { enabled: true, open: '18:00', close: '23:30' },
  wednesday: { enabled: true, open: '18:00', close: '23:30' },
  thursday: { enabled: true, open: '18:00', close: '23:30' },
  friday: { enabled: true, open: '18:00', close: '23:59' },
  saturday: { enabled: true, open: '18:00', close: '23:59' },
  sunday: { enabled: true, open: '18:00', close: '23:30' },
};

export const DEFAULT_OUT_OF_HOURS_MESSAGE = 
  "Olá! Agradecemos pelo seu contato. 😊\n\nNo momento nosso atendimento automático de pedidos está fechado. Deixe sua mensagem que te responderemos assim que abrirmos nosso expediente!\n\nHorário de atendimento: Terça a Domingo das 18:00 às 23:30.";

export const DAY_LABELS: Record<keyof OperatingSchedule, { short: string; full: string; order: number }> = {
  monday: { short: 'Seg', full: 'Segunda-feira', order: 1 },
  tuesday: { short: 'Ter', full: 'Terça-feira', order: 2 },
  wednesday: { short: 'Qua', full: 'Quarta-feira', order: 3 },
  thursday: { short: 'Qui', full: 'Quinta-feira', order: 4 },
  friday: { short: 'Sex', full: 'Sexta-feira', order: 5 },
  saturday: { short: 'Sáb', full: 'Sábado', order: 6 },
  sunday: { short: 'Dom', full: 'Domingo', order: 0 },
};

export const DAY_KEYS_BY_DAY_OF_WEEK: (keyof OperatingSchedule)[] = [
  'sunday',    // 0
  'monday',    // 1
  'tuesday',   // 2
  'wednesday', // 3
  'thursday',  // 4
  'friday',    // 5
  'saturday'   // 6
];

export interface StoreOpenStatus {
  isOpen: boolean;
  currentDayKey: keyof OperatingSchedule;
  currentTimeStr: string;
  currentDayLabel: string;
  todaySchedule?: DaySchedule;
  reason?: string;
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

/**
 * Checks if the store AI is currently open based on America/Sao_Paulo timezone.
 * Supports cross-midnight hours (e.g. 18:00 to 02:00 next day).
 */
export function isStoreOpenNow(schedule?: OperatingSchedule, enabled?: boolean): StoreOpenStatus {
  const now = new Date();
  
  // Format into America/Sao_Paulo time components
  const spFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false
  });

  const parts = spFormatter.formatToParts(now);
  let hour = 0;
  let minute = 0;
  
  for (const part of parts) {
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  // Get day of week in Sao Paulo (0 = Sunday ... 6 = Saturday)
  const spDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dayOfWeek = spDate.getDay();
  const currentMinutes = hour * 60 + minute;
  const currentTimeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const currentDayKey = DAY_KEYS_BY_DAY_OF_WEEK[dayOfWeek];
  const currentDayLabel = DAY_LABELS[currentDayKey].full;

  // If schedule enforcement is disabled, the AI responds 24/7
  if (!enabled || !schedule) {
    return {
      isOpen: true,
      currentDayKey,
      currentTimeStr,
      currentDayLabel,
      reason: 'Horário livre (24 horas ativo)'
    };
  }

  const todayConfig = schedule[currentDayKey];

  // 1. Check today's schedule
  if (todayConfig && todayConfig.enabled) {
    const openMin = parseTimeToMinutes(todayConfig.open);
    const closeMin = parseTimeToMinutes(todayConfig.close);

    if (closeMin > openMin) {
      // Normal schedule (e.g. 18:00 to 23:30)
      if (currentMinutes >= openMin && currentMinutes < closeMin) {
        return {
          isOpen: true,
          currentDayKey,
          currentTimeStr,
          currentDayLabel,
          todaySchedule: todayConfig
        };
      }
    } else if (closeMin < openMin) {
      // Crosses midnight (e.g. 18:00 to 02:00) - current evening portion
      if (currentMinutes >= openMin) {
        return {
          isOpen: true,
          currentDayKey,
          currentTimeStr,
          currentDayLabel,
          todaySchedule: todayConfig
        };
      }
    } else {
      // Open 24h if open === close
      return {
        isOpen: true,
        currentDayKey,
        currentTimeStr,
        currentDayLabel,
        todaySchedule: todayConfig
      };
    }
  }

  // 2. Check yesterday's schedule in case it crossed midnight into today's early morning
  const prevDayIndex = (dayOfWeek + 6) % 7;
  const prevDayKey = DAY_KEYS_BY_DAY_OF_WEEK[prevDayIndex];
  const prevDayConfig = schedule[prevDayKey];

  if (prevDayConfig && prevDayConfig.enabled) {
    const prevOpen = parseTimeToMinutes(prevDayConfig.open);
    const prevClose = parseTimeToMinutes(prevDayConfig.close);

    if (prevClose < prevOpen) {
      // Crosses midnight! Check if current time is within early morning of yesterday's shift
      if (currentMinutes < prevClose) {
        return {
          isOpen: true,
          currentDayKey: prevDayKey,
          currentTimeStr,
          currentDayLabel: `${DAY_LABELS[prevDayKey].full} (madrugada)`,
          todaySchedule: prevDayConfig
        };
      }
    }
  }

  return {
    isOpen: false,
    currentDayKey,
    currentTimeStr,
    currentDayLabel,
    todaySchedule: todayConfig,
    reason: todayConfig?.enabled ? `Fechado agora (Hoje abre das ${todayConfig.open} às ${todayConfig.close})` : 'Fechado hoje (Dia sem expediente)'
  };
}
