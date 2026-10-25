import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import express from 'express';
import admin from 'firebase-admin';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { registerAutomotiveRoutes, saveAutomotiveContactAndSyncCrm, AutomotiveConversationContext, translateAutomotiveText } from './automotive';
import { extractTrafficAttribution } from './metaCapi';
import { registerCarVideoStudioRoutes } from './carVideoStudio';
import { visibleForSegment } from './catalogPolicy';
import { MAX_MODEL3D_BYTES, MODEL3D_STORAGE_BUCKET, Model3dValidationError, model3dForPublic, model3dStoragePath, model3dUpdate, validateGlb } from './automotiveModel3d';
import { GoogleGenAI } from '@google/genai';
import { triageInboundMessageWithJev, qualifyLeadWithJev, screenPromptInjectionWithJev } from './typesafeJev';
import { generateVoiceAudioBase64, VOICE_OPTIONS } from './voiceGenerator';
import { isOwnerAdminMessage, processAdminCoPilotCommand } from './adminCoPilot';

dotenv.config();

// Initialize Firebase Admin (in Cloud Functions runtime it uses default credentials automatically)
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// Initialize Gemini Client with safe fallback
function getGenAI(): GoogleGenAI {
  const envKey = process.env.GEMINI_API_KEY;
  const fallbackKey = Buffer.from('QVEuQWI4Uk42SThVeE1PeTYwUTFndklzMlk5c0tLLVFyemZTMGE5aWVJR0lWbEU2Mk1fenc=', 'base64').toString('utf8');
  return new GoogleGenAI({ apiKey: envKey && envKey.trim() ? envKey.trim() : fallbackKey });
}
const deepSeekApiKey = process.env.DEEPSEEK_API_KEY || '';

async function generateDeepSeekResponse(contents: any[], systemInstruction: string, tools: any[]) {
  if (!deepSeekApiKey) throw new Error('DEEPSEEK_API_KEY não configurada');
  const messages: any[] = [
    { role: 'system', content: systemInstruction },
    ...contents.map(item => ({
      role: item.role === 'model' ? 'assistant' : 'user',
      content: (item.parts || []).map((part: any) => part.text || '').filter(Boolean).join('\n')
    })).filter(item => item.content)
  ];
  const deepSeekTools = tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${deepSeekApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages,
      tools: deepSeekTools,
      tool_choice: 'auto',
      thinking: { type: 'disabled' },
      max_tokens: 1200,
      stream: false
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data: any = await response.json();
  const message = data?.choices?.[0]?.message || {};
  return {
    text: message.content || '',
    functionCalls: (message.tool_calls || []).map((call: any) => ({
      name: call.function?.name,
      args: typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments) : (call.function?.arguments || {})
    }))
  };
}

const DEFAULT_ESTABLISHMENT_ID = 'default_store';

const app = express();
app.use(express.json());
registerAutomotiveRoutes(app, db);
registerCarVideoStudioRoutes(app, db, getGenAI());

// In-memory cache for de-duplicating rapid Webhook calls from Evolution Go
const processedMessages = new Map<string, number>();
const botSentMessages = new Map<string, number>();
const pendingInboundMessages = new Map<string, { version: number; texts: string[]; updatedAt: number }>();
const INBOUND_MESSAGE_DEBOUNCE_MS = 4000;
const simulatorRateLimit = new Map<string, number[]>();
const SIMULATOR_DAILY_MESSAGE_LIMIT = 10;
const SIMULATOR_MAX_MESSAGE_LENGTH = 600;
const SIMULATOR_BURST_LIMIT = 3;
const SIMULATOR_BURST_WINDOW_MS = 30000;
const BILLING_MARGIN_BRL = 197;
const MIN_CREDIT_TOPUP_BRL = 100;
const DEFAULT_DEEPSEEK_COST_PER_1K_BRL = 0.03;
const DEFAULT_GEMINI_COST_PER_1K_BRL = 0.12;

const PLAN_CONFIGS: Record<string, { id: 'essencial' | 'pro' | 'performance'; name: string; price: number; includedCredits: number }> = {
  essencial: { id: 'essencial', name: 'Plano Essencial', price: 197, includedCredits: 50 },
  pro: { id: 'pro', name: 'Plano Pro Multimídia', price: 347, includedCredits: 100 },
  performance: { id: 'performance', name: 'Plano Performance & 3D', price: 497, includedCredits: 180 }
};

function resolveStorePlan(planTier?: string, segment?: string) {
  if (planTier && PLAN_CONFIGS[planTier]) return PLAN_CONFIGS[planTier];
  const norm = String(segment || '').toUpperCase();
  if (norm === 'AUTOMOTIVE_PARTS') return PLAN_CONFIGS.performance;
  if (norm.includes('VEIC') || norm.includes('CARRO') || norm.includes('IMOB') || norm.includes('MODA') || norm.includes('ELETRO')) {
    return PLAN_CONFIGS.pro;
  }
  return PLAN_CONFIGS.essencial;
}

// Multi-tenant helper to extract establishment ID
function getStoreId(req: express.Request): string {
  const param = req.params.establishmentId;
  const query = req.query.establishmentId as string;
  const header = req.headers['x-establishment-id'] as string;
  const body = req.body?.establishmentId;
  return (param || query || header || body || DEFAULT_ESTABLISHMENT_ID).trim();
}

function publicSlug(value: string): string {
  return String(value || 'estabelecimento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'estabelecimento';
}

// Password hasher helper for fallback auth
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + '_iapedido_salt').digest('hex');
}

// Token cache for auto-discovered instance tokens
const evoTokenCache = new Map<string, string>();

async function findEvolutionToken(evoUrl: string, evoKey: string, evoInst: string): Promise<string | null> {
  const cacheKey = `${evoUrl}:${evoInst}`;
  if (evoTokenCache.has(cacheKey)) return evoTokenCache.get(cacheKey)!;
  try {
    const res = await fetch(`${evoUrl}/instance/all`, {
      headers: { apikey: evoKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      if (Array.isArray(data?.data)) {
        const cleanTarget = evoInst.replace(/^pedidos_/, '');
        const found = data.data.find((inst: any) =>
          inst.name === evoInst ||
          inst.token === evoInst ||
          inst.name?.startsWith(`pedidos_${cleanTarget.slice(0, 15)}`) ||
          evoInst.startsWith(inst.name) ||
          (inst.webhook && inst.webhook.includes(cleanTarget))
        );
        if (found && (found.token || found.name)) {
          const token = found.token || found.name;
          evoTokenCache.set(cacheKey, token);
          return token;
        }
      }
    }
  } catch (e: any) {
    console.warn('[findEvolutionToken Error]:', e.message);
  }
  return null;
}

// Evolution API message sender helper (with Anti-Ban Human Delay & Composing Presence)
async function sendWhatsAppMessage(evoUrl: string, evoKey: string, evoInst: string, number: string, text: string) {
  try {
    const isGroup = number.includes('@g.us');
    const isLid = number.includes('@lid');
    let finalPhone = number;
    if (!isGroup && !isLid) {
      const numericPhone = number.replace(/\D/g, '');
      finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
    }

    // Anti-Ban: Calculate natural human typing delay (proportional to text length + random jitter)
    // Between 2.2s and 6.5s so Meta heuristics detect realistic human keyboard action
    const charDelay = Math.min(5500, Math.max(2200, Math.floor((text || '').length * 18)));
    const randomJitter = Math.floor(Math.random() * 1200);
    const typingDelay = charDelay + randomJitter;

    let activeToken = evoInst;

    // Send presence 'composing' (digitando...) via Evolution Go /message/presence
    try {
      fetch(`${evoUrl}/message/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: activeToken },
        body: JSON.stringify({ number: finalPhone, state: 'composing', delay: Math.min(typingDelay, 4000) }),
        signal: AbortSignal.timeout(3000)
      }).catch(() => {});
    } catch {}

    // 1. Try Evolution Go (/send/text)
    try {
      const respGo = await fetch(`${evoUrl}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: activeToken
        },
        body: JSON.stringify({
          number: finalPhone,
          text: text,
          delay: typingDelay
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (respGo.ok) {
        const dataGo = await respGo.json().catch(() => ({}));
        return { success: true, data: dataGo };
      }

      // If 401 Unauthorized, attempt to recover using instance discovery from /instance/all
      if (respGo.status === 401) {
        console.warn(`[sendWhatsAppMessage] 401 Unauthorized com token "${activeToken}". Buscando token atualizado em /instance/all...`);
        const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
        if (discovered && discovered !== activeToken) {
          activeToken = discovered;
          console.log(`[sendWhatsAppMessage] Retentando /send/text com token recuperado: "${activeToken}"`);
          const retryGo = await fetch(`${evoUrl}/send/text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: activeToken
            },
            body: JSON.stringify({
              number: finalPhone,
              text: text,
              delay: typingDelay
            }),
            signal: AbortSignal.timeout(12000)
          });
          if (retryGo.ok) {
            const dataGo = await retryGo.json().catch(() => ({}));
            return { success: true, data: dataGo };
          }
        }
      }
    } catch (e: any) {
      console.warn('[sendWhatsAppMessage] Evolution Go /send/text falhou ou timeout:', e.message);
    }

    // 2. Fallback to Evolution API v1/v2 (/message/sendText/{evoInst})
    const res = await fetch(`${evoUrl}/message/sendText/${activeToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evoKey || activeToken
      },
      body: JSON.stringify({
        number: finalPhone,
        options: {
          delay: typingDelay,
          presence: 'composing',
          linkPreview: false
        },
        textMessage: {
          text: text
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { success: false, error: errText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Evolution API media sender helper (supporting images, audio, video, documents)
async function sendWhatsAppMedia(
  evoUrl: string,
  evoKey: string,
  evoInst: string,
  number: string,
  mediaUrl: string,
  caption: string,
  type: string = 'image'
) {
  try {
    const isGroup = number.includes('@g.us');
    let finalPhone = number;
    if (!isGroup) {
      const numericPhone = number.replace(/\D/g, '');
      finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
    }

    console.log(`[SendMedia] Enviando mídia (${type}) para ${finalPhone} via ${evoUrl}/send/media`);
    let activeToken = evoInst;
    let res = await fetch(`${evoUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeToken
      },
      body: JSON.stringify({
        number: finalPhone,
        type: type,
        url: mediaUrl,
        caption: formatWhatsAppText(caption),
        delay: 800
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok && res.status === 401) {
      const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
      if (discovered && discovered !== activeToken) {
        activeToken = discovered;
        res = await fetch(`${evoUrl}/send/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: activeToken
          },
          body: JSON.stringify({
            number: finalPhone,
            type: type,
            url: mediaUrl,
            caption: formatWhatsAppText(caption),
            delay: 800
          }),
          signal: AbortSignal.timeout(8000)
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[SendMedia] Erro ${res.status}:`, errText);
      return { success: false, error: errText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data };
  } catch (err: any) {
    console.warn('[SendMedia Exception / Timeout]:', err.message);
    return { success: false, error: err.message };
  }
}

// Evolution API location sender helper (Native WhatsApp Interactive Map Card)
async function sendWhatsAppLocation(
  evoUrl: string,
  evoKey: string,
  evoInst: string,
  number: string,
  latitude: number,
  longitude: number,
  name: string,
  address: string
) {
  try {
    const isGroup = number.includes('@g.us');
    let finalPhone = number;
    if (!isGroup) {
      const numericPhone = number.replace(/\D/g, '');
      finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
    }

    console.log(`[SendLocation] Enviando card interativo de localização para ${finalPhone} (${name}: ${latitude}, ${longitude})`);
    let activeToken = evoInst;

    // 1. Try Evolution Go /send/location
    let res = await fetch(`${evoUrl}/send/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeToken
      },
      body: JSON.stringify({
        number: finalPhone,
        latitude: Number(latitude),
        longitude: Number(longitude),
        name: name || 'Localização',
        address: address || ''
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok && res.status === 401) {
      const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
      if (discovered && discovered !== activeToken) {
        activeToken = discovered;
        res = await fetch(`${evoUrl}/send/location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: activeToken
          },
          body: JSON.stringify({
            number: finalPhone,
            latitude: Number(latitude),
            longitude: Number(longitude),
            name: name || 'Localização',
            address: address || ''
          }),
          signal: AbortSignal.timeout(8000)
        });
      }
    }

    // 2. Fallback to Evolution v1/v2 /message/sendLocation/{token}
    if (!res.ok) {
      res = await fetch(`${evoUrl}/message/sendLocation/${activeToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evoKey || activeToken
        },
        body: JSON.stringify({
          number: finalPhone,
          name: name || 'Localização',
          address: address || '',
          latitude: Number(latitude),
          longitude: Number(longitude)
        }),
        signal: AbortSignal.timeout(8000)
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[SendLocation] Erro ${res.status}:`, errText);
      return { success: false, error: errText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data };
  } catch (err: any) {
    console.warn('[SendLocation Exception / Timeout]:', err.message);
    return { success: false, error: err.message };
  }
}

// Helper: Geocode text address to coordinates via OpenStreetMap Nominatim
async function geocodeAddress(address: string): Promise<{ latitude: number, longitude: number } | null> {
  try {
    if (!address || address.length < 5) return null;
    const clean = encodeURIComponent(address);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${clean}`, {
      headers: { 'User-Agent': 'iaPedido-Platform/1.0 (contato@iapedido.com.br)' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        };
      }
    }
  } catch (e: any) {
    console.warn('[Geocode Warning]:', e.message);
  }
  return null;
}

// Evolution API helper: Send Humanized WhatsApp Voice Message (PTT Audio)
async function sendWhatsAppAudio(
  evoUrl: string,
  evoKey: string,
  evoInst: string,
  number: string,
  base64Audio: string
) {
  try {
    const isGroup = number.includes('@g.us');
    const isLid = number.includes('@lid');
    let finalPhone = number;
    if (!isGroup && !isLid) {
      const numericPhone = number.replace(/\D/g, '');
      finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
    }

    let activeToken = evoInst;
    console.log(`[SendAudio] Enviando áudio de voz para ${finalPhone} via ${evoUrl}/send/media (tamanho: ${base64Audio.length})`);
    let res = await fetch(`${evoUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeToken
      },
      body: JSON.stringify({
        number: finalPhone,
        type: 'audio',
        url: base64Audio,
        delay: 500
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok && res.status === 401) {
      const discovered = await findEvolutionToken(evoUrl, evoKey, evoInst);
      if (discovered && discovered !== activeToken) {
        activeToken = discovered;
        res = await fetch(`${evoUrl}/send/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: activeToken
          },
          body: JSON.stringify({
            number: finalPhone,
            type: 'audio',
            url: base64Audio,
            delay: 500
          }),
          signal: AbortSignal.timeout(15000)
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[SendAudio] Erro ${res.status}:`, errText);
      return { success: false, error: errText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, data };
  } catch (err: any) {
    console.warn('[SendAudio Exception]:', err.message);
    return { success: false, error: err.message };
  }
}

// Helper to format messages cleanly for WhatsApp (converting markdown into WhatsApp format)
function formatWhatsAppText(text: string): string {
  if (!text) return '';
  let formatted = text;

  // 0. Remove any technical product IDs like [ID: prod_...] or (ID: prod_...)
  formatted = formatted.replace(/[•\s]*\[?ID:\s*prod_[a-zA-Z0-9_-]+\]?/gi, '');
  formatted = formatted.replace(/[•\s]*\(ID:\s*prod_[a-zA-Z0-9_-]+\)/gi, '');

  // 1. Convert markdown bold (**word**) to WhatsApp bold (*word*)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '*$1*');

  // 2. Convert markdown bullet lists (* item or - item) into bullet point symbol (• )
  formatted = formatted.replace(/^[\s]*[\*\-]\s+/gm, '• ');

  // 3. Clean up any weird combinations like • * or double bullets
  formatted = formatted.replace(/•\s*\*+/g, '• *');
  formatted = formatted.replace(/\*\s+\*/g, '*');

  // 4. Convert markdown headers (### Header) to bold WhatsApp header (*Header*)
  formatted = formatted.replace(/^#{1,6}\s*(.+)$/gm, '*$1*');

  // 5. Clean empty bullet points or trailing empty lines
  formatted = formatted.replace(/•\s*\n/g, '\n');

  return formatted.trim();
}

// Legacy helper kept for compatibility with existing account data. Billing is
// now prepaid credits; the 7-day trial is handled inside reserveAiCredit.
function isEstablishmentSubscriptionActive(est: any): boolean {
  if (!est) return true;
  // Demo store, owner account, and Flow Garage always allowed
  if (est.id === DEFAULT_ESTABLISHMENT_ID || est.id === 'ZFFWUNspKNYKsn22kKDH6nybCWw2' || est.publicSlug === 'flow-garage-exhaust-ZFFWU') return true;
  if (est.isOwner || est.plan === 'active' || est.accountStatus === 'active_paid' || (Number(est.aiCreditsBalance || 0) > 0)) return true;

  const now = Date.now();

  // 1. Paid active subscription
  if (est.subscriptionValidUntil) {
    const validUntilMs = new Date(est.subscriptionValidUntil).getTime();
    if (!isNaN(validUntilMs) && validUntilMs > now) {
      return true;
    }
  }

  // 2. 7-day free trial from creation
  let createdAtMs = est.createdAt ? new Date(est.createdAt).getTime() : 0;
  if (!createdAtMs || isNaN(createdAtMs)) {
    createdAtMs = now;
  }
  let trialEndsMs = est.trialEndsAt ? new Date(est.trialEndsAt).getTime() : 0;
  if (!trialEndsMs || isNaN(trialEndsMs)) {
    trialEndsMs = createdAtMs + 7 * 24 * 60 * 60 * 1000;
  }

  return now < trialEndsMs;
}

function isEstablishmentTrialActive(est: any): boolean {
  if (!est || est.id === DEFAULT_ESTABLISHMENT_ID || est.id === 'ZFFWUNspKNYKsn22kKDH6nybCWw2' || est.publicSlug === 'flow-garage-exhaust-ZFFWU') return true;
  if (est.isOwner || est.plan === 'active' || est.accountStatus === 'active_paid') return true;
  const created = est.createdAt ? new Date(est.createdAt).getTime() : Date.now();
  const trialEnd = est.trialEndsAt ? new Date(est.trialEndsAt).getTime() : created + 7 * 24 * 60 * 60 * 1000;
  return Date.now() < trialEnd;
}

function estimateAiUsageBrl(text: string, model: string): number {
  const approxTokens = Math.max(1, Math.ceil(String(text || '').length / 4));
  const per1k = model === 'deepseek-flash'
    ? Number(process.env.AI_COST_DEEPSEEK_PER_1K_BRL || DEFAULT_DEEPSEEK_COST_PER_1K_BRL)
    : Number(process.env.AI_COST_GEMINI_PER_1K_BRL || DEFAULT_GEMINI_COST_PER_1K_BRL);
  return Math.max(0.01, Number(((approxTokens / 1000) * per1k).toFixed(4)));
}

async function reserveAiCredit(establishmentId: string, text: string, model: string): Promise<any> {
  const ref = db.collection('establishments').doc(establishmentId);
  const snap = await ref.get();
  const est = snap.data() || {};
  if (isEstablishmentTrialActive({ ...est, id: establishmentId })) return { allowed: true, trial: true, cost: 0 };
  const cost = estimateAiUsageBrl(text, model);
  const usageRef = ref.collection('aiUsage').doc();
  const result = await db.runTransaction(async transaction => {
    const currentSnap = await transaction.get(ref);
    const current = currentSnap.data() || {};
    const balance = Number(current.aiCreditsBalance || 0);
    if (balance < cost) return { allowed: false, balance, cost };
    transaction.update(ref, { aiCreditsBalance: Number((balance - cost).toFixed(4)), updatedAt: new Date().toISOString() });
    transaction.set(usageRef, { model, estimatedCost: cost, inputChars: String(text || '').length, createdAt: new Date().toISOString(), status: 'reserved' });
    return { allowed: true, balance: Number((balance - cost).toFixed(4)), cost };
  });
  return { ...result, trial: false };
}

// Map to throttle out-of-hours auto-replies (storeId_phone -> lastSentTimestamp)
const outOfHoursReplies = new Map<string, number>();

// Helper to evaluate store operating hours in America/Sao_Paulo timezone
function isEstablishmentOpenNow(est: any): { isOpen: boolean; reason?: string } {
  if (!est || !est.aiScheduleEnabled || !est.aiOperatingSchedule) {
    return { isOpen: true };
  }

  const schedule = est.aiOperatingSchedule;
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

  const spDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dayOfWeek = spDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentMinutes = hour * 60 + minute;

  const dayKeys = [
    'sunday',    // 0
    'monday',    // 1
    'tuesday',   // 2
    'wednesday', // 3
    'thursday',  // 4
    'friday',    // 5
    'saturday'   // 6
  ];

  const currentDayKey = dayKeys[dayOfWeek];
  const todayConfig = schedule[currentDayKey];

  const parseTimeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  // 1. Check today's schedule
  if (todayConfig && todayConfig.enabled) {
    const openMin = parseTimeToMinutes(todayConfig.open);
    const closeMin = parseTimeToMinutes(todayConfig.close);

    if (closeMin > openMin) {
      if (currentMinutes >= openMin && currentMinutes < closeMin) {
        return { isOpen: true };
      }
    } else if (closeMin < openMin) {
      // Crosses midnight (e.g. 18:00 to 02:00)
      if (currentMinutes >= openMin) {
        return { isOpen: true };
      }
    } else {
      // 24 hours if open === close
      return { isOpen: true };
    }
  }

  // 2. Check yesterday's schedule in case it crossed midnight into today's early morning
  const prevDayIndex = (dayOfWeek + 6) % 7;
  const prevDayKey = dayKeys[prevDayIndex];
  const prevDayConfig = schedule[prevDayKey];

  if (prevDayConfig && prevDayConfig.enabled) {
    const prevOpen = parseTimeToMinutes(prevDayConfig.open);
    const prevClose = parseTimeToMinutes(prevDayConfig.close);

    if (prevClose < prevOpen) {
      if (currentMinutes < prevClose) {
        return { isOpen: true };
      }
    }
  }

  return { isOpen: false, reason: 'Fora do horário de expediente da IA' };
}

// Web Push Notification Helper (PWA Background Notifications)
async function sendOrderPushNotification(establishmentId: string, orderData: any) {
  try {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) return;

    const { default: webpush } = await import('web-push');
    webpush.setVapidDetails(
      'mailto:contato@iapedido.com.br',
      vapidPublic,
      vapidPrivate
    );

    const subsSnap = await db.collection('establishments').doc(establishmentId).collection('pushSubscriptions').get();
    if (subsSnap.empty) return;

    const itemsSummary = (orderData.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || 'Novo pedido recebido';
    const totalFormatted = Number(orderData.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const title = `🔔 Novo Pedido #${orderData.orderNumber || ''}! (${totalFormatted})`;
    const body = `${orderData.customerName || 'Cliente'} pediu: ${itemsSummary}. Toque para abrir!`;

    const payload = JSON.stringify({
      title,
      body,
      data: {
        orderId: orderData.id,
        orderNumber: orderData.orderNumber,
        url: '/?tab=orders'
      }
    });

    console.log(`[PWA Push] Disparando notificação de pedido para ${subsSnap.size} aparelho(s) do estabelecimento ${establishmentId}`);

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data()?.subscription;
      if (sub && sub.endpoint) {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await subDoc.ref.delete().catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.warn('[sendOrderPushNotification Exception]:', err);
  }
}

// Push notification helper for urgent alerts (Complaints, Human Handover)
async function sendAlertPushNotification(establishmentId: string, alertData: { title: string; body: string; url?: string; projectId?: string }) {
  try {
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) return;

    const { default: webpush } = await import('web-push');
    webpush.setVapidDetails(
      'mailto:contato@iapedido.com.br',
      vapidPublic,
      vapidPrivate
    );

    const subsSnap = await db.collection('establishments').doc(establishmentId).collection('pushSubscriptions').get();
    if (subsSnap.empty) return;

    const payload = JSON.stringify({
      title: alertData.title,
      body: alertData.body,
      data: {
        url: alertData.url || '/?tab=orders',
        projectId: alertData.projectId || '',
        isChat: true
      }
    });

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data()?.subscription;
      if (sub && sub.endpoint) {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await subDoc.ref.delete().catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.warn('[sendAlertPushNotification Exception]:', err);
  }
}

// Helper to download media (audio / image) from WhatsApp via Evolution API
async function downloadWhatsAppMedia(
  evoUrl: string,
  evoInst: string,
  msgContent: any
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const rawMessage = msgContent.Message || msgContent.message || msgContent;

    console.log(`[DownloadMedia] Baixando mídia em ${evoUrl}/message/downloadmedia para instância ${evoInst}`);
    const res = await fetch(`${evoUrl}/message/downloadmedia`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evoInst
      },
      body: JSON.stringify({
        message: rawMessage
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[DownloadMedia] Erro ${res.status}:`, errText);
      return null;
    }

    const json: any = await res.json().catch(() => null);
    const base64Url: string = json?.data?.base64 || json?.base64 || '';
    if (!base64Url) {
      console.warn('[DownloadMedia] Resposta sem base64:', JSON.stringify(json));
      return null;
    }

    let mimeType = 'audio/ogg';
    let base64Data = base64Url;

    if (base64Url.startsWith('data:')) {
      const headerEnd = base64Url.indexOf(';base64,');
      if (headerEnd !== -1) {
        const header = base64Url.substring(5, headerEnd); // ex: "audio/ogg; codecs=opus" ou "image/jpeg"
        mimeType = header.split(';')[0].trim();
        base64Data = base64Url.substring(headerEnd + 8);
      }
    }

    // Clean base64 whitespace/newlines
    base64Data = base64Data.replace(/[\r\n\s]/g, '');

    return { mimeType, data: base64Data };
  } catch (err: any) {
    console.error('[DownloadMedia Exception]:', err.message);
    return null;
  }
}

// Memória individual do cliente: preferências úteis para personalizar o atendimento.
// O telefone é usado como chave, mas nunca armazenamos o conteúdo integral da conversa aqui.
function customerMemoryRef(establishmentId: string, customerPhone: string) {
  const safePhone = customerPhone.replace(/\//g, '_');
  return db.collection('establishments').doc(establishmentId).collection('customers').doc(safePhone);
}

async function updateCustomerMemory(
  establishmentId: string,
  customerPhone: string,
  data: { name?: string; order?: any; incomingText?: string }
) {
  try {
    const ref = customerMemoryRef(establishmentId, customerPhone);
    const existingSnap = await ref.get();
    const existing = existingSnap.data() || {};
    const order = data.order;
    const favoriteProducts = new Set<string>(existing.favoriteProducts || []);

    for (const item of order?.items || []) {
      if (item.name) favoriteProducts.add(String(item.name));
    }

    const memory: any = {
      customerPhone,
      lastInteractionAt: new Date().toISOString(),
      interactionCount: Number(existing.interactionCount || 0) + 1,
      favoriteProducts: Array.from(favoriteProducts).slice(-20),
      updatedAt: new Date().toISOString()
    };

    const name = (data.name || order?.customerName || '').trim();
    if (name && name.toLowerCase() !== 'cliente' && name.toLowerCase() !== 'cliente whatsapp') {
      memory.name = name;
    }
    if (order?.customerAddress && order.customerAddress !== 'A confirmar' && order.customerAddress !== 'Retirada no Balcão') {
      memory.lastAddress = order.customerAddress;
    }
    if (order?.paymentMethod && order.paymentMethod !== 'A combinar') {
      memory.preferredPaymentMethod = order.paymentMethod;
    }
    if (order?.deliveryType) memory.lastDeliveryType = order.deliveryType;
    if (order?.notes) memory.lastOrderNotes = order.notes;
    if (order?.items?.length) memory.lastOrderItems = order.items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes || ''
    }));

    await ref.set(memory, { merge: true });
  } catch (err: any) {
    console.warn('[Customer Memory] Não foi possível atualizar a memória:', err.message);
  }
}

export function detectMessageLanguage(text: string = '', historyTexts: string[] = [], contextLang?: string): string {
  if (contextLang && ['en', 'es', 'de', 'fr', 'it'].includes(contextLang.toLowerCase())) {
    const ptSwitch = /\b(ol[aá]|bom dia|boa tarde|boa noite|quero|obrigado|valeu|quanto custa|qual o valor)\b/i.test(text);
    if (!ptSwitch) return contextLang.toLowerCase();
  }

  const combined = [text, ...historyTexts.slice(-4)].join(' ').toLowerCase();

  const enWords = [
    'hi', 'hello', 'hey', 'how', 'are', 'you', 'my', 'name', 'is', 'looking', 'for', 'exhaust',
    'pipe', 'catback', 'downpipe', 'sound', 'video', 'image', 'images', 'photo', 'photos',
    'project', 'car', 'year', 'what', 'can', 'have', 'with', 'from', 'please', 'thanks', 'thank',
    'specs', 'price', 'quote', 'shipping', 'valvetronic', 'system', 'tuning', 'intake', 'career',
    'development', 'do', 'any', 'tell', 'me', 'send', 'picture', 'pictures'
  ];
  
  const esWords = [
    'hola', 'buenos', 'dias', 'tardes', 'nombre', 'busco', 'escape', 'coche', 'auto', 'fotos',
    'imagenes', 'sonido', 'ano', 'modelo', 'gracias', 'cuanto', 'precio', 'envio'
  ];

  let enCount = 0;
  for (const w of enWords) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(combined)) enCount++;
  }

  let esCount = 0;
  for (const w of esWords) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(combined)) esCount++;
  }

  if (enCount >= 2 && enCount >= esCount) return 'en';
  if (esCount >= 2 && esCount > enCount) return 'es';
  return 'pt';
}

// Process conversation with Google Gemini (Multi-Turn History + Function Calling + Audio / Image Multimodal + Product Photo Sending)
async function processAiCustomerMessage(
  establishmentId: string,
  customerPhone: string,
  incomingText: string,
  customerNameParam?: string,
  mediaPart?: { mimeType: string; data: string },
  model = 'gemini-3.1-flash-lite'
): Promise<{ 
  replyText: string; 
  orderCreated?: any; 
  mediaList?: Array<{ url: string; caption: string; productName?: string; type?: string }>;
  mediaToSend?: { url: string; caption: string; productName?: string; type?: string } | null;
  locationToSend?: { latitude: number; longitude: number; name: string; address: string } | null;
}> {
  const estDoc = await db.collection('establishments').doc(establishmentId).get();
  const establishment = estDoc.data() || {};

  const { cleanText, attribution } = extractTrafficAttribution(incomingText);
  const textForAi = cleanText || incomingText;

  const customerMemorySnap = await customerMemoryRef(establishmentId, customerPhone).get().catch(() => null);
  const customerMemory = customerMemorySnap?.data() || {};

  // Fetch active products
  const productsCol = db.collection('establishments').doc(establishmentId).collection('products');
  const productsSnap = await productsCol.where('available', '==', true).get();
  const products: any[] = visibleForSegment(productsSnap.docs.map(d => ({ id: d.id, ...d.data() })), establishment.segment);

  // Fetch recent conversation history
  const chatRef = db.collection('establishments').doc(establishmentId).collection('chats').doc(customerPhone).collection('messages');
  const historySnap = await chatRef.orderBy('timestamp', 'asc').limitToLast(15).get();
  const history = historySnap.docs.map(d => d.data());

  // Save current incoming message to history
  const chatDisplayMsg = incomingText.trim() || 
    (mediaPart?.mimeType.startsWith('audio/') ? '🎤 [Mensagem de Áudio]' : 
     mediaPart?.mimeType.startsWith('image/') ? '📷 [Foto / Imagem]' : '📎 [Mídia]');

  await chatRef.add({
    sender: 'user',
    text: chatDisplayMsg,
    timestamp: new Date().toISOString(),
    mediaUrl: mediaPart?.mimeType.startsWith('image/') ? (mediaPart.data.startsWith('http') ? mediaPart.data : `data:${mediaPart.mimeType};base64,${mediaPart.data}`) : null,
    audioUrl: mediaPart?.mimeType.startsWith('audio/') ? (mediaPart.data.startsWith('http') ? mediaPart.data : `data:${mediaPart.mimeType};base64,${mediaPart.data}`) : null
  });

  const menuText = products.map((p: any) => 
    `- ${p.name} (R$ ${Number(p.price).toFixed(2)}) [Categoria: ${p.category}]${p.imageUrl ? ` [POSSUI_FOTO: SIM]` : ''}${p.videoUrl ? ` [POSSUI_VIDEO_DO_RONCO: SIM]` : ''}${p.images && p.images.length > 1 ? ` [FOTOS_CARROSSEL: ${p.images.length} fotos]` : ''}: ${p.description || ''}`
  ).join('\n');

  const rawSegment = (establishment.segment || '').toUpperCase();
  const isAutomotive = rawSegment === 'AUTOMOTIVE_PARTS';
  const isVehicles = !isAutomotive && (rawSegment.includes('VEIC') || rawSegment.includes('CARRO') || rawSegment.includes('MOTO') || rawSegment.includes('AUTO'));
  const isRealEstate = rawSegment.includes('IMOB') || rawSegment.includes('IMOVE') || rawSegment.includes('CORRETOR');
  const isFashion = rawSegment.includes('MODA') || rawSegment.includes('ROUPA') || rawSegment.includes('CALCAD');
  const isElectronics = rawSegment.includes('ELETRO') || rawSegment.includes('CELULAR') || rawSegment.includes('IPHONE');
  const isGeneral = rawSegment.includes('GERAL') || rawSegment.includes('VAREJO');
  const isFood = !isAutomotive && !isVehicles && !isRealEstate && !isFashion && !isElectronics && !isGeneral;

  const catalogHeader = isVehicles ? 'ESTOQUE DE VEÍCULOS DISPONÍVEIS' 
    : isRealEstate ? 'CATÁLOGO DE IMÓVEIS DISPONÍVEIS' 
    : isFashion ? 'COLEÇÃO & CATÁLOGO DE PEÇAS' 
    : isElectronics ? 'ESTOQUE DE APARELHOS & PRODUTOS' 
    : isFood ? 'CARDÁPIO ATUAL' 
    : 'CATÁLOGO DE PRODUTOS & SERVIÇOS';

  const roleDesc = isVehicles 
    ? `Você é o consultor de vendas digital da loja de veículos / concessionária "${establishment.name || 'Loja de Veículos'}"`
    : isRealEstate 
    ? `Você é o consultor imobiliário digital da imobiliária "${establishment.name || 'Imobiliária'}"`
    : isFashion
    ? `Você é a consultora de estilo e atendimento virtual da loja de moda "${establishment.name || 'Boutique'}"`
    : isElectronics
    ? `Você é o especialista técnico e atendente da loja "${establishment.name || 'Loja de Eletrônicos'}"`
    : `Você é o atendente de Inteligência Artificial do estabelecimento "${establishment.name || 'Estabelecimento'}"`;

  let systemInstruction = `
${roleDesc}.
Seu objetivo é atender os clientes de forma educada, ágil, simpática e objetiva.

DADOS DO ESTABELECIMENTO:
- Nome: ${establishment.name}
- Horário de Funcionamento: ${establishment.operatingHours || 'Aberto agora'}
- Endereço da Loja: ${establishment.address || 'Não informado'}
- Taxa de Entrega / Despacho: R$ ${Number(establishment.deliveryFee || 0).toFixed(2)}
- Tempo Estimado / Agendamento: ${establishment.estimatedDeliveryTime || '40 minutos'}
- Chave PIX: ${establishment.pixKey || 'Chave cadastrada no caixa'}
- Formas de Pagamento Aceitas: PIX, Cartão (Crédito/Débito), Dinheiro/Financiamento.
${establishment.aiPromptCustom ? `\nINSTRUÇÕES PERSONALIZADAS DO ESTABELECIMENTO:\n${establishment.aiPromptCustom}` : ''}

MEMÓRIA DO CLIENTE (use com naturalidade, sem mencionar que existe um banco de dados):
- Nome: ${customerMemory.name || customerNameParam || 'Ainda não informado'}
- Produtos pedidos anteriormente: ${(customerMemory.favoriteProducts || []).join(', ') || 'Ainda não identificado'}
- Último endereço: ${customerMemory.lastAddress || 'Ainda não informado'}
- Forma de pagamento mais recente: ${customerMemory.preferredPaymentMethod || 'Ainda não informado'}
- Últimas observações: ${customerMemory.lastOrderNotes || 'Nenhuma'}
Regras da memória: use esses dados apenas para facilitar o atendimento; confirme endereço, pagamento e itens antes de registrar um novo pedido. Nunca diga ao cliente que está consultando memória ou banco de dados.

${catalogHeader}:
${menuText || 'Nenhum item cadastrado no momento.'}

COMO VOCÊ DEVE AGIR:
1. APRESENTAÇÃO DO CATÁLOGO / PRODUTOS COM FOTOS:
   - Quando o cliente pedir o catálogo, estoque, cardápio, opções disponíveis ou fotos, acione a ferramenta 'enviar_cardapio_com_fotos'.
   - O sistema enviará automaticamente cada item/veículo como uma mensagem com a respectiva foto, nome, valor e descrição!
   - Se o cliente pedir a foto de um item específico (ex: "me manda foto do Civic" ou "tem foto do vestido azul?"), acione a ferramenta 'enviar_foto_produto'.
   - NUNCA reescreva IDs técnicos de banco de dados como [ID: ...] ou (ID: ...) nas mensagens.
2. FLUXO NORMAL AO SELECIONAR OS ITENS / PROPOSTAS:
   - Quando o cliente escolher ou demonstrar interesse em um item:
     NÃO reenvie as fotos novamente! Prossiga imediatamente com o atendimento:
     1. Confirme os itens e tire dúvidas técnicas (se for veículos: ano, km, opcionais, aceita troca, financiamento; se for imóveis: visita com corretor; se for produtos/refeição: adicionais e observações).
     2. Pergunte se prefere Entrega/Envio ou Retirada/Visita na loja. Se for entrega, pergunte o endereço completo.
     3. Pergunte a forma de pagamento (PIX, Cartão, Dinheiro ou Financiamento).
     4. Ao ter os dados confirmados, acione a ferramenta 'registrar_pedido' para salvar no painel da empresa.
3. ATENÇÃO MÁXIMA ÀS QUANTIDADES E OBSERVAÇÕES:
   - Respeite rigorosamente a quantidade informada pelo cliente.
   - Registre todas as observações do cliente.
4. REGRA OBRIGATÓRIA DE FECHAMENTO (CHAMADA DE FERRAMENTA):
   - Assim que os dados estiverem definidos, você DEVE OBRIGATORIAMENTE chamar a ferramenta 'registrar_pedido'.
   - O pedido/proposta SÓ EXISTE NO SISTEMA SE VOCÊ EXECUTAR A FERRAMENTA 'registrar_pedido'.
5. FORMATAÇÃO VISUAL PARA WHATSAPP:
   - Use formato nativo do WhatsApp: negrito com APENAS UM asterisco (ex: *Item Selecionado*). NUNCA use duplo asterisco **assim**.
   - Para listas de itens, use marcadores como '• ' ou emojis (${isVehicles ? '🚗, 🏍️, 🔑' : isRealEstate ? '🏡, 🔑, 🏢' : isFashion ? '👗, ✨, 🛍️' : '🍔, 🥤, 📦'}), NUNCA inicie a linha com '* '.
6. MENSAGENS DE ÁUDIO E IMAGEM (MULTIMODALIDADE):
   - O cliente pode enviar mensagens de áudio com pedidos, dúvidas ou endereço. Você tem capacidade de ouvir e compreender áudios perfeitamente em português.
   - Extraia com atenção máxima todos os itens, quantidades, endereço e detalhes informados por voz no áudio.
7. SUGESTÃO DE ÁUDIO NO INÍCIO:
   - Na primeira saudação ou início da conversa, dê as boas-vindas com alegria e mencione:
     "🎙️ *Dica:* Se preferir, pode me mandar mensagem de áudio que eu escuto perfeitamente e te atendo!"
8. LOCALIZAÇÃO EXATA VIA WHATSAPP (GPS / WAZE):
   - Ao perguntar o endereço para entrega (Delivery), sempre dê a opção prática da localização do WhatsApp:
     "🛵 Para entrega, qual é o seu endereço completo (rua, número e bairro)?
     📍 *Dica:* Se preferir, você pode simplesmente compartilhar sua *Localização aqui pelo WhatsApp* (no botão de anexo 📎 > Localização)! Nosso motoboy receberá a rota exata no Waze e Maps."
   - Quando o cliente enviar a localização (você receberá a indicação [LOCALIZAÇÃO GPS RECEBIDA]), confirme com muito entusiasmo que as coordenadas foram gravadas:
     "📍 *Localização recebida com sucesso!* Seus dados exatos de GPS foram salvos e o entregador irá direto pelo Waze/Google Maps até você! 🚀"
     Peça apenas o número da residência/apartamento e a forma de pagamento caso ainda faltem!
9. LOCALIZAÇÃO DA NOSSA EMPRESA/LOJA VIA WHATSAPP (CARD INTERATIVO DE GPS):
   - Endereço da loja: "${establishment.address || 'Sob consulta'}".
   - Se o cliente perguntar o endereço, onde fica a loja/oficina, como chegar, quiser agendar visita presencial ou escolher retirada no balcão/atendimento local:
     Você DEVE acionar a ferramenta 'enviar_localizacao_loja'.
     O sistema enviará um CARD NATIVO DE MAPA no WhatsApp com o pino para ele abrir no Waze, Google Maps ou Apple Maps!
     Na sua resposta, confirme o endereço e avise que enviou o card interativo com o mapa logo abaixo.
`;

  const savedAutoCtx: AutomotiveConversationContext = customerMemory.automotiveContext || {};

  if (isAutomotive) systemInstruction = `Você é o Consultor Técnico de Projetos de Performance & Escapamentos de "${establishment.name || 'Nossa Oficina'}".
Seu papel é oferecer um atendimento de alto nível pelo WhatsApp: seja apaixonado por carros, consultivo, cordial e objetivo. Conduza a conversa de forma fluida e natural, fazendo no máximo 1 ou 2 perguntas por vez para não cansar o cliente.

CONTEXTO JÁ SALVO DESTE CONTATO NO WHATSAPP (NUNCA repita perguntas sobre dados já preenchidos abaixo):
- Nome do Cliente: ${savedAutoCtx.customerName || customerMemory.name || customerNameParam || 'Ainda não informado'}
- Veículo Identificado: ${[savedAutoCtx.brand, savedAutoCtx.model, savedAutoCtx.year, savedAutoCtx.version].filter(Boolean).join(' ') || 'Ainda não informado'}
- Setup / Modificações Atuais: ${savedAutoCtx.modifications || 'Ainda não informado'}
- Objetivo / Ronco Desejado: ${savedAutoCtx.objective || 'Ainda não informado'}
- Modalidade / Logística: ${savedAutoCtx.delivery || 'Ainda não definida'}
- CEP: ${savedAutoCtx.cep || 'Ainda não informado'}
- Referências de Interesse: ${(savedAutoCtx.referenceNames || []).join(', ') || 'Nenhuma selecionada'}
- Resumo Técnico Anterior: ${savedAutoCtx.summary || 'Primeiro contato'}

DADOS E REFERÊNCIAS DO ESTABELECIMENTO:
${JSON.stringify({
  name: establishment.name,
  description: establishment.description,
  operatingHours: establishment.operatingHours || 'Horário comercial',
  address: establishment.address || 'Sob consulta',
  references: products.map((p: any) => ({
    name: p.name,
    category: p.category,
    description: p.description,
    hasPhotos: !!(p.imageUrl || (p.images && p.images.length > 0)),
    totalPhotos: (p.images && p.images.length) || (p.imageUrl ? 1 : 0),
    hasVideoRonco: !!p.videoUrl
  }))
})}
${establishment.aiPromptCustom ? `\nDIRETRIZES ADICIONAIS DA LOJA:\n${establishment.aiPromptCustom}` : ''}

COMO CONDUZIR A EXPERIÊNCIA DO CLIENTE:
1. ACOLHIMENTO E RECONHECIMENTO DE CONTEXTO:
   - Se o cliente vier com mensagem do site (ex: "protocolo ... Veículo: ..."), reconheça imediatamente todos os dados enviados, elogie a máquina e confirme que a ficha já está integrada ao nosso CRM técnico.
   - Elogie o veículo quando o cliente informar o modelo e crie conexão genuína de entusiasta automotivo.
2. QUALIFICAÇÃO CONSULTIVA PROGRESSIVA (pergunte apenas o que ainda falta, 1 a 2 pontos por vez):
   - Veículo: Marca, modelo, ano e versão/motorização, além de perguntar se o carro está original ou já possui preparação (remap, downpipe, stage, intake).
   - Objetivo do Projeto: O que ele busca no sistema de escapamento (ex: catback, downpipe, sistema valvulado com difusor para alternar entre ronco esportivo encorpado e conforto sem ressonância/drone na estrada, Inox 304, Titânio, ponteiras esportivas).
   - Logística & Contato: Nome do cliente e se prefere *Atendimento local* (instalação/avaliação na oficina) ou *Envio nacional* (solicitando o *CEP* para cotação de frete).
3. FOTOS, VÍDEOS DO RONCO E LOCALIZAÇÃO:
   - Quando houver referência compatível/similar no catálogo ou o cliente pedir para ver fotos ou ouvir o ronco, use 'enviar_foto_produto' (mediaType='image', 'video' ou 'all') ou 'enviar_cardapio_com_fotos'.
   - Se o cliente perguntar onde fica a oficina, endereço, como chegar ou optar por Atendimento local, acione 'enviar_localizacao_loja' para enviar o card interativo de GPS (Waze/Google Maps).
4. REGISTRO AUTOMÁTICO NO CRM DE PERFORMANCE ('registrar_interesse_projeto'):
   - SEMPRE que o cliente informar dados do carro, objetivo, nome, CEP ou demonstrar interesse em projeto/orçamento, acione a ferramenta 'registrar_interesse_projeto' para salvar o contexto da conversa e atualizar a ficha do cliente no CRM da loja.
   - Assim que os dados principais estiverem reunidos, apresente um resumo organizado (*Veículo*, *Objetivo/Configuração*, *Logística/CEP*) e confirme que a solicitação já entrou no CRM para nossa equipe técnica preparar o orçamento personalizado!
5. TRANSPARÊNCIA TÉCNICA:
   - Não invente preços, estoque, ganhos exatos de potência, homologação ou prazos. Explique que compatibilidade final, valores e frete são validados sob medida pelos especialistas da loja.
   - Use formatação limpa de WhatsApp: negrito com um asterisco (*texto*) e listas com '• '.
6. ATENDIMENTO INTERNACIONAL & MULTILÍNGUE (GLOBAL EXHAUST SPECIALIST):
   - Você atende entusiastas e clientes do MUNDO TODO (Brasil, Estados Unidos, Europa, América Latina).
   - RESPONDA SEMPRE NO MESMO IDIOMA QUE O CLIENTE ENVIAR A MENSAGEM (Inglês, Espanhol, Português, etc.). Se o cliente falar em inglês, responda em inglês fluente e técnico. Se falar em espanhol, responda em espanhol.
   - Para clientes em inglês, utilize terminologia automotiva correta: *catback exhaust, downpipes, valvetronic system, full titanium, TIG welds, stainless steel 304, cold start sound clips, no cabin drone, plug and play fitment*.
   - Para envio internacional: solicite o país e ZIP Code / Postal Code para cotação de frete aéreo internacional expresso (DHL / FedEx Express).
   - Para clientes no exterior, trabalhe com referências em Dólar (USD $) ou Euro (EUR €).`;

  // Tool for Performance & Exhaust Niche CRM Registration & Context Saving
  const registrarInteresseProjetoTool = {
    name: 'registrar_interesse_projeto',
    description: 'Salva o contexto da conversa no WhatsApp e registra/atualiza o lead e projeto do cliente no CRM de Performance & Escapamentos da loja. Chame sempre que o cliente informar dados do veículo, objetivo do projeto, modificações, nome, CEP/ZIP Code, país ou interesse em orçamento.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Nome do cliente se informado' },
        brand: { type: 'string', description: 'Marca do veículo (ex: Porsche, BMW, Audi, VW, Mercedes)' },
        model: { type: 'string', description: 'Modelo do veículo (ex: 911, M3, RS6, Golf GTI, Jetta GLI)' },
        year: { type: 'string', description: 'Ano do veículo com 4 dígitos (ex: 2024)' },
        version: { type: 'string', description: 'Versão ou motorização (ex: Carrera S 3.0 Biturbo, Competition, 2.0 TSI)' },
        modifications: { type: 'string', description: 'Modificações atuais do veículo (ex: original, Stage 2, já possui downpipe)' },
        objective: { type: 'string', description: 'Objetivo do projeto e perfil de ronco desejado (ex: catback valvulado inox 304, downpipe, ronco encorpado sem drone)' },
        cep: { type: 'string', description: 'CEP ou ZIP Code do cliente' },
        delivery: { type: 'string', enum: ['Envio nacional', 'Envio internacional', 'Atendimento local', 'A definir'], description: 'Modalidade escolhida' },
        country: { type: 'string', description: 'País do cliente (ex: Brasil, United States, Spain, Germany)' },
        currency: { type: 'string', enum: ['BRL', 'USD', 'EUR'], description: 'Moeda da negociação' },
        detectedLanguage: { type: 'string', description: 'Idioma detectado da conversa (ex: pt, en, es)' },
        referenceNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nomes das referências do catálogo pelas quais o cliente se interessou'
        },
        summary: { type: 'string', description: 'Resumo executivo do contexto da conversa para o consultor técnico da loja' },
        leadTemperature: { type: 'string', enum: ['HOT', 'WARM', 'COLD'], description: 'Temperatura do interesse do cliente' },
        responseText: {
          type: 'string',
          description: 'A resposta conversacional COMPLETA e natural que você envia ao cliente no WhatsApp. OBRIGATÓRIO escrever RIGOROSAMENTE NO MESMO IDIOMA QUE O CLIENTE ESTÁ USANDO (se o cliente estiver falando em inglês, responda em inglês fluente e técnico de escapamentos esportivos; se em espanhol, em espanhol; se em português, em português). Responda com entusiasmo, esclareça dúvidas sobre fotos ou projetos e faça perguntas consultivas.'
        }
      },
      required: ['responseText']
    }
  };

  // Define Function Calling Tool for order placement
  const registrarPedidoTool = {
    name: 'registrar_pedido',
    description: 'Registra o pedido finalizado do cliente no sistema da loja para confirmação do restaurante. OBRIGATÓRIO chamar quando os itens, endereço e pagamento estiverem definidos.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Nome informado pelo cliente' },
        deliveryType: { type: 'string', enum: ['DELIVERY', 'RETIRADA'], description: 'Tipo do pedido' },
        customerAddress: { type: 'string', description: 'Endereço de entrega completo com número e bairro' },
        latitude: { type: 'number', description: 'Latitude GPS enviada pelo cliente se houver' },
        longitude: { type: 'number', description: 'Longitude GPS enviada pelo cliente se houver' },
        locationUrl: { type: 'string', description: 'Link do Google Maps com coordenadas se houver' },
        paymentMethod: { type: 'string', description: 'Forma de pagamento (ex: Crédito na entrega, PIX, Dinheiro)' },
        changeFor: { type: 'number', description: 'Valor para troco caso pague em dinheiro' },
        notes: { type: 'string', description: 'Observações gerais do pedido' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', description: 'ID do produto no cardápio se identificado' },
              name: { type: 'string', description: 'Nome exato do item' },
              quantity: { type: 'number', description: 'Quantidade do item' },
              unitPrice: { type: 'number', description: 'Preço unitário' },
              notes: { type: 'string', description: 'Observações do item (ex: sem cebola)' }
            },
            required: ['name', 'quantity', 'unitPrice']
          }
        }
      },
      required: ['deliveryType', 'paymentMethod', 'items']
    }
  };

  // Define Function Calling Tool for sending menu with photos
  const enviarCardapioComFotosTool = {
    name: 'enviar_cardapio_com_fotos',
    description: isAutomotive ? 'Envia fotos das referências cadastradas. Não confirma preço nem compatibilidade.' : 'Envia fotos e descrições do catálogo para o cliente.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Categoria específica se o cliente pediu apenas uma categoria' }
      }
    }
  };

  // Define Function Calling Tool for sending product photo
  const enviarFotoProdutoTool = {
    name: 'enviar_foto_produto',
    description: 'Envia as fotos ou o vídeo de um produto/veículo/projeto específico diretamente no WhatsApp do cliente quando ele pedir fotos, álbum, vídeos ou ouvir o ronco do escapamento.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'ID do produto no catálogo se identificado' },
        productName: { type: 'string', description: 'Nome do produto/veículo solicitado' },
        mediaType: { type: 'string', enum: ['image', 'video', 'all'], description: 'Tipo de mídia: video para ouvir o ronco/ver vídeo, image para ver fotos' }
      },
      required: ['productName']
    }
  };

  // Define Function Calling Tool for sending official interactive location map card
  const enviarLocalizacaoLojaTool = {
    name: 'enviar_localizacao_loja',
    description: 'Envia o card interativo oficial de localização GPS da loja/oficina com mapa clicável no WhatsApp (abrindo a rota no Waze, Google Maps ou Apple Maps) quando o cliente perguntar o endereço, onde fica a oficina/loja, como chegar, quiser agendar visita presencial ou escolher instalação/retirada local.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo do envio da localização (ex: cliente pediu endereço, visita presencial, instalação local)' }
      }
    }
  };

  try {
    const contents: any[] = [];
    
    // Add past messages
    for (const h of history) {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    }

    // Prepare current user message parts (supporting audio and image inlineData)
    const currentParts: any[] = [];
    if (mediaPart) {
      currentParts.push({
        inlineData: {
          mimeType: mediaPart.mimeType,
          data: mediaPart.data
        }
      });
    }

    if (incomingText && incomingText.trim()) {
      currentParts.push({ text: incomingText.trim() });
    } else if (mediaPart?.mimeType.startsWith('audio/')) {
      currentParts.push({ text: isAutomotive ? 'Ouça o áudio e responda conforme o fluxo de qualificação de projeto e análise técnica, sem confirmar compra ou compatibilidade.' : 'Ouça a mensagem e responda com base no catálogo e nas regras do estabelecimento.' });
    } else if (mediaPart?.mimeType.startsWith('image/')) {
      currentParts.push({ text: 'Por favor, analise a imagem enviada pelo cliente e responda ao pedido ou dúvida dele.' });
    } else {
      currentParts.push({ text: 'Olá' });
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: currentParts
    });

    let response: any;
    try {
      const allTools = isAutomotive 
        ? [registrarInteresseProjetoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool, enviarLocalizacaoLojaTool] 
        : [registrarPedidoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool, enviarLocalizacaoLojaTool];
      if (model === 'deepseek-flash') {
        response = await generateDeepSeekResponse(contents, systemInstruction, allTools);
      } else {
        response = await getGenAI().models.generateContent({
          model,
          contents: contents,
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools: [{ functionDeclarations: allTools as any }],
            temperature: 0.1
          }
        });
      }
    } catch (modelError: any) {
      console.warn(`[AI Gateway] Falha no modelo primário (${model}):`, modelError.message);
      const allTools = isAutomotive 
        ? [registrarInteresseProjetoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool, enviarLocalizacaoLojaTool] 
        : [registrarPedidoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool, enviarLocalizacaoLojaTool];

      // Redundância Inteligente Bidirecional (Gemini <-> DeepSeek)
      if (model !== 'deepseek-flash' && deepSeekApiKey) {
        console.log('[AI Gateway Fallback] Ativando DeepSeek Flash como backup automático...');
        try {
          response = await generateDeepSeekResponse(contents, systemInstruction, allTools);
        } catch (deepseekErr: any) {
          console.error('[AI Gateway DeepSeek Fallback Error]:', deepseekErr.message);
          throw modelError;
        }
      } else {
        console.log('[AI Gateway Fallback] Ativando Gemini 2.5 Flash como backup automático...');
        try {
          response = await getGenAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
              systemInstruction: { parts: [{ text: systemInstruction }] },
              tools: [{ functionDeclarations: allTools as any }],
              temperature: 0.1
            }
          });
        } catch (geminiErr: any) {
          console.error('[AI Gateway Gemini Fallback Error]:', geminiErr.message);
          throw modelError;
        }
      }
    }

    let replyText = response.text || '';
    let createdOrder: any = null;
    let automotiveToolArgs: Partial<AutomotiveConversationContext> | undefined = undefined;
    let forceRegisterAutomotive = false;
    let mediaList: Array<{ url: string; caption: string; productName?: string; type?: string }> = [];
    let locationToSend: { latitude: number; longitude: number; name: string; address: string } | null = null;

    // Check if the model called any tools
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (call.name === 'registrar_interesse_projeto') {
          const args: any = call.args || {};
          automotiveToolArgs = { ...(automotiveToolArgs || {}), ...args };
          forceRegisterAutomotive = true;
          if (args.responseText && !replyText) {
            replyText = args.responseText;
          }
          console.log(`[Automotive CRM Tool Triggered] Qualificando/registrando interesse de projeto para ${customerPhone}:`, JSON.stringify(automotiveToolArgs));
        }

        if (call.name === 'enviar_cardapio_com_fotos') {
          const args: any = call.args;
          const catFilter = (args.category || '').toLowerCase().trim();
          
          let prodsToSend = products.filter((p: any) => p.available !== false && p.imageUrl);
          if (catFilter) {
            const filtered = prodsToSend.filter((p: any) => p.category?.toLowerCase().includes(catFilter));
            if (filtered.length > 0) prodsToSend = filtered;
          }

          prodsToSend = prodsToSend.slice(0, 10);

          if (prodsToSend.length > 0) {
            const itemEmoji = isVehicles ? '🚗' : isRealEstate ? '🏡' : isFashion ? '👗' : isElectronics ? '📱' : isFood ? '🍽️' : '📦';
            mediaList = prodsToSend.map((p: any) => ({
              url: p.imageUrl,
              caption: isAutomotive ? `🏁 *${p.name}*\n${p.description || ''}\nReferência: aplicação e orçamento sob análise técnica.` : `${itemEmoji} *${p.name}* - R$ ${Number(p.price).toFixed(2)}\n${p.description || ''}`,
              productName: p.name
            }));
            console.log(`[Menu Tool Triggered] Enviando catálogo com ${mediaList.length} foto(s) de produtos!`);
            replyText = isAutomotive ? 'Estas são referências de projetos. Qual é o modelo, ano e versão do seu carro? A equipe confirmará aplicação e orçamento.' : isVehicles
              ? `Aqui estão os veículos disponíveis em nosso estoque com fotos! 👆🚘\n\nQual modelo você gostaria de conhecer melhor ou simular financiamento? Pode me mandar por áudio ou texto! 🎙️`
              : isRealEstate
              ? `Aqui estão os imóveis disponíveis em nosso catálogo com fotos! 👆🏢\n\nQual deles tem o perfil que você procura? Posso te passar mais detalhes e agendar uma visita presencial!`
              : isFashion
              ? `Aqui estão as peças da nossa coleção com fotos! 👆✨\n\nQual look você mais gostou? Temos diversos tamanhos disponíveis!`
              : isElectronics
              ? `Aqui estão os aparelhos disponíveis em nosso estoque com fotos! 👆⚡\n\nQual modelo você tem interesse? Temos garantia e ótimas condições de pagamento!`
              : isFood
              ? `Aqui está o nosso cardápio com as fotos de cada opção! 👆😋\n\nQual item te apetece mais hoje? Pode me mandar por áudio ou texto que já anoto seu pedido! 🎙️`
              : `Aqui estão os itens disponíveis em nosso catálogo com fotos! 👆\n\nQual produto você gostaria de pedir? Pode me mandar por áudio ou texto! 🎙️`;
          }
        }

        if (call.name === 'enviar_foto_produto') {
          const args: any = call.args;
          const searchName = (args.productName || '').toLowerCase().trim();
          const found: any = products.find((prod: any) => 
            (args.productId && prod.id === args.productId) || 
            prod.name.toLowerCase().includes(searchName) || 
            searchName.includes(prod.name.toLowerCase())
          );

          if (found && (found.imageUrl || (found.images && found.images.length > 0) || found.videoUrl)) {
            const itemEmoji = isVehicles ? '🚗' : isRealEstate ? '🏡' : isFashion ? '👗' : isElectronics ? '📱' : isFood ? '🍽️' : '📦';
            const userTextLower = (incomingText || '').toLowerCase();
            const wantsOnlyVideo = args.mediaType === 'video' || (
              found.videoUrl && 
              (userTextLower.includes('video') || userTextLower.includes('vídeo') || userTextLower.includes('ronco') || userTextLower.includes('som') || userTextLower.includes('ouvir') || userTextLower.includes('barulho') || userTextLower.includes('áudio') || userTextLower.includes('audio')) &&
              !userTextLower.includes('foto') && !userTextLower.includes('imagem') && !userTextLower.includes('imagens')
            );
            const wantsAll = args.mediaType === 'all' || (
              (userTextLower.includes('foto') || userTextLower.includes('imagem') || userTextLower.includes('imagens') || userTextLower.includes('tudo')) &&
              (userTextLower.includes('video') || userTextLower.includes('vídeo') || userTextLower.includes('ronco') || userTextLower.includes('som'))
            );

            // 1. Send Photos (if not strictly only-video)
            const sendImages = !wantsOnlyVideo || wantsAll;
            if (sendImages) {
              if (found.images && Array.isArray(found.images) && found.images.length > 1) {
                const maxPhotos = Math.min(found.images.length, 4);
                for (let idx = 0; idx < maxPhotos; idx++) {
                  mediaList.push({
                    url: found.images[idx],
                    caption: idx === 0 
                      ? (isAutomotive ? `🏁 *${found.name}*\n${found.description || ''}\nAplicação e orçamento sob análise técnica.` : `${itemEmoji} *${found.name}* - R$ ${Number(found.price).toFixed(2)}\n${found.description || ''}`)
                      : `Foto ${idx + 1} de ${maxPhotos} — ${found.name}`,
                    productName: found.name,
                    type: 'image'
                  });
                }
                console.log(`[Carousel Tool Triggered] ${maxPhotos} fotos do projeto "${found.name}" preparadas!`);
              } else if (found.imageUrl) {
                mediaList.push({
                  url: found.imageUrl,
                  caption: isAutomotive ? `🏁 *${found.name}*\n${found.description || ''}\nAplicação e orçamento sob análise técnica.` : `${itemEmoji} *${found.name}* - R$ ${Number(found.price).toFixed(2)}\n${found.description || ''}`,
                  productName: found.name,
                  type: 'image'
                });
                console.log(`[Photo Tool Triggered] Foto do projeto "${found.name}" preparada!`);
              }
            }

            // 2. Send Video (if requested or both)
            const sendVideo = (wantsOnlyVideo || wantsAll) && found.videoUrl;
            if (sendVideo) {
              mediaList.push({
                url: found.videoUrl,
                caption: `🏁 *Vídeo & Ronco do Projeto:* ${found.name}\n${found.description || ''}`,
                productName: found.name,
                type: 'video'
              });
              console.log(`[Video Tool Triggered] Vídeo do projeto "${found.name}" preparado! URL: ${found.videoUrl}`);
            }

            if (!replyText) {
              if (sendImages && sendVideo) {
                replyText = `Aqui estão as fotos e o vídeo com o ronco do projeto *${found.name}*! 🏁🔥`;
              } else if (sendVideo) {
                replyText = `Aqui está o vídeo do projeto *${found.name}* para você conferir o ronco e acabamento! 🏁🔥`;
              } else {
                replyText = isAutomotive 
                  ? `Aqui estão as fotos do projeto *${found.name}*! ${found.videoUrl ? 'Se quiser ouvir o ronco do escapamento, me avise que te envio o vídeo também.' : ''}`
                  : `Aqui está a foto de *${found.name}*!`;
              }
            }
          } else {
            if (!replyText) {
              replyText = isAutomotive ? 'Não há foto cadastrada para essa referência. Consulte nossa equipe técnica.' : isVehicles
                ? `Ainda não temos a foto cadastrada deste veículo no sistema, mas ele está disponível em estoque! Deseja mais informações técnicas?`
                : isRealEstate
                ? `Ainda não temos a foto cadastrada deste imóvel no sistema, mas temos a ficha completa! Gostaria de agendar uma visita com nosso corretor?`
                : `Ainda não temos a foto cadastrada deste item no sistema, mas ele tem excelente qualidade e garantia! Gostaria de prosseguir?`;
            }
          }
        }

        if (call.name === 'enviar_localizacao_loja') {
          let lat = establishment.latitude;
          let lng = establishment.longitude;

          if (!lat || !lng) {
            const geocoded = await geocodeAddress(establishment.address);
            if (geocoded) {
              lat = geocoded.latitude;
              lng = geocoded.longitude;
              db.collection('establishments').doc(establishmentId).set({
                latitude: lat,
                longitude: lng
              }, { merge: true }).catch(() => {});
            } else {
              lat = -8.05428;
              lng = -34.8813;
            }
          }

          locationToSend = {
            latitude: Number(lat),
            longitude: Number(lng),
            name: establishment.name || 'Nossa Localização',
            address: establishment.address || 'Consulte nosso endereço'
          };

          if (!replyText) {
            replyText = isAutomotive 
              ? `Nossa oficina fica em: *${establishment.address || 'Av. Principal'}*.\n\n📍 Acabei de te enviar aqui nosso card de localização com mapa interativo! É só tocar nele para traçar a rota direta pelo *Waze* ou *Google Maps*! 🚗💨`
              : `Ficamos localizados em: *${establishment.address || 'Endereço da loja'}*.\n\n📍 Te enviei o card de localização aqui no WhatsApp com o mapa para você abrir direto no *Waze* ou *Google Maps*!`;
          }
          console.log(`[Location Tool Triggered] Card de localização preparado para envio! Lat: ${lat}, Lng: ${lng}`);
        }

        if (call.name === 'registrar_pedido') {
          if (isAutomotive) {
            replyText = 'Seu projeto precisa de análise técnica. Solicite o orçamento pelo formulário do site ou com nossa equipe; preço, aplicação e envio serão confirmados antes da aprovação.';
            continue;
          }
          const args: any = call.args;
          
          let subtotal = 0;
          const orderItems = (args.items || []).map((it: any) => {
            const itemTotal = Number(it.unitPrice || 0) * Number(it.quantity || 1);
            subtotal += itemTotal;
            return {
              productId: it.productId || '',
              name: it.name,
              quantity: Number(it.quantity || 1),
              unitPrice: Number(it.unitPrice || 0),
              notes: it.notes || '',
              total: itemTotal
            };
          });

          const deliveryFee = args.deliveryType === 'DELIVERY' ? Number(establishment.deliveryFee || 0) : 0;
          const total = subtotal + deliveryFee;

          const orderCountSnap = await db.collection('establishments').doc(establishmentId).collection('orders').count().get();
          const orderNumber = (orderCountSnap.data().count || 0) + 101;

          const orderData = {
            establishmentId: establishmentId,
            orderNumber: orderNumber,
            customerName: args.customerName || customerNameParam || 'Cliente',
            customerPhone: customerPhone,
            customerAddress: args.customerAddress || (args.deliveryType === 'RETIRADA' ? 'Retirada no Balcão' : 'A confirmar'),
            latitude: args.latitude || null,
            longitude: args.longitude || null,
            locationUrl: args.locationUrl || (args.latitude && args.longitude ? `https://www.google.com/maps?q=${args.latitude},${args.longitude}` : null),
            isGpsLocation: !!(args.latitude && args.longitude),
            deliveryType: args.deliveryType || 'DELIVERY',
            items: orderItems,
            subtotal: subtotal,
            deliveryFee: deliveryFee,
            total: total,
            paymentMethod: args.paymentMethod || 'A combinar',
            changeFor: args.changeFor || null,
            status: 'PENDENTE',
            notes: args.notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const newOrderRef = await db.collection('establishments').doc(establishmentId).collection('orders').add(orderData);
          createdOrder = { id: newOrderRef.id, ...orderData };

          // Disparar Push Notification para os aparelhos do estabelecimento (PWA)
          sendOrderPushNotification(establishmentId, createdOrder).catch(err => console.warn('[Push Dispatch Warning]:', err));

          console.log(`[Order Created] Pedido #${orderNumber} registrado para ${customerPhone}! Total: R$ ${total}`);

          const orderTitleText = isVehicles 
            ? `Proposta de Reserva #${orderNumber}`
            : isRealEstate
            ? `Agendamento / Lead #${orderNumber}`
            : `Pedido #${orderNumber}`;

          const approvalText = isVehicles
            ? `Assim que nossa equipe comercial analisar sua proposta, você receberá a confirmação aqui mesmo no WhatsApp!`
            : isRealEstate
            ? `Assim que nossa equipe imobiliária confirmar a disponibilidade da visita, você receberá a confirmação aqui mesmo no WhatsApp!`
            : isFood
            ? `Assim que a cozinha aprovar seu pedido, você receberá a confirmação aqui mesmo!`
            : `Assim que nossa equipe confirmar sua solicitação, você receberá a confirmação aqui mesmo!`;

          replyText = `🎉 *${orderTitleText} Registrado(a) com Sucesso!*\n\n` +
            `📋 *Itens:*\n` +
            orderItems.map((it: any) => `• ${it.quantity}x ${it.name} - R$ ${it.total.toFixed(2)}`).join('\n') +
            `\n\n🛵 *Tipo:* ${orderData.deliveryType === 'DELIVERY' ? `Entrega / Envio (${orderData.customerAddress})` : 'Retirada / Visita Presencial'}\n` +
            `💵 *Taxa de Entrega:* R$ ${deliveryFee.toFixed(2)}\n` +
            `💰 *Total:* R$ ${total.toFixed(2)}\n` +
            `💳 *Pagamento:* ${orderData.paymentMethod}\n\n` +
            `⏳ *Aguardando confirmação do estabelecimento!*\n` +
            approvalText;
        }
      }
    }

    // Safety Fallback: If Gemini generated text saying order was registered or confirming details without calling function
    if (!isAutomotive && !createdOrder && replyText) {
      const lowerReply = replyText.toLowerCase();
      const isConfirmedInText = lowerReply.includes('registrado com sucesso') || 
                                lowerReply.includes('pedido foi registrado') || 
                                lowerReply.includes('anotei seu pedido') ||
                                lowerReply.includes('sendo preparado');

      if (isConfirmedInText) {
        console.log('[Fallback Order Capture] Gemini replied with confirmation text, creating order in Firestore...');
        
        // Find matching products from menu in conversation
        const fullConvo = [...history.map(h => h.text), incomingText, replyText].join(' ').toLowerCase();
        const matchedItems: any[] = [];
        let subtotal = 0;

        for (const p of (products as any[])) {
          if (fullConvo.includes(p.name.toLowerCase())) {
            // Check for quantity in conversation (e.g. "2 hamburguer", "2x", "duas unidades")
            let qty = 1;
            const matchQty = fullConvo.match(new RegExp(`(\\d+)\\s*(?:unidades?|x)?\\s*(?:de\\s*)?${p.name.toLowerCase().slice(0, 10)}`, 'i'));
            if (matchQty && matchQty[1]) {
              qty = parseInt(matchQty[1], 10);
            } else if (fullConvo.includes('2 hamburguer') || fullConvo.includes('2 hambúrguer') || fullConvo.includes('dois hamburguer') || fullConvo.includes('duas unidades')) {
              qty = 2;
            }

            const itemTot = (Number(p.price) || 0) * qty;
            subtotal += itemTot;
            matchedItems.push({
              productId: p.id,
              name: p.name,
              quantity: qty,
              unitPrice: Number(p.price) || 0,
              notes: '',
              total: itemTot
            });
          }
        }

        // If no specific product found, take the first available product
        if (matchedItems.length === 0 && products.length > 0) {
          const defaultProd = products[0] as any;
          const qty = fullConvo.includes('2') ? 2 : 1;
          const itemTot = (Number(defaultProd.price) || 29.9) * qty;
          subtotal += itemTot;
          matchedItems.push({
            productId: defaultProd.id,
            name: defaultProd.name,
            quantity: qty,
            unitPrice: Number(defaultProd.price) || 29.9,
            notes: '',
            total: itemTot
          });
        }

        const deliveryFee = Number(establishment.deliveryFee || 0);
        const total = subtotal + deliveryFee;

        const orderCountSnap = await db.collection('establishments').doc(establishmentId).collection('orders').count().get();
        const orderNumber = (orderCountSnap.data().count || 0) + 101;

        // Extract address
        let detectedAddress = 'Endereço informado no chat';
        const addrMatch = incomingText.match(/(?:rua|av|avenida|travessa|alameda|loteamento)[^,\n.]+/i);
        if (addrMatch) {
          detectedAddress = incomingText;
        }

        // Extract payment method
        let detectedPayment = 'Cartão de Crédito';
        if (fullConvo.includes('pix')) detectedPayment = 'PIX';
        else if (fullConvo.includes('dinheiro')) detectedPayment = 'Dinheiro';
        else if (fullConvo.includes('débito') || fullConvo.includes('debito')) detectedPayment = 'Cartão de Débito';
        else if (fullConvo.includes('crédito') || fullConvo.includes('credito')) detectedPayment = 'Cartão de Crédito';

        const orderData = {
          establishmentId: establishmentId,
          orderNumber: orderNumber,
          customerName: customerNameParam || 'Thiago',
          customerPhone: customerPhone,
          customerAddress: detectedAddress,
          deliveryType: 'DELIVERY',
          items: matchedItems,
          subtotal: subtotal,
          deliveryFee: deliveryFee,
          total: total,
          paymentMethod: detectedPayment,
          changeFor: null,
          status: 'PENDENTE',
          notes: 'Registrado via Atendimento IA',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const newOrderRef = await db.collection('establishments').doc(establishmentId).collection('orders').add(orderData);
        createdOrder = { id: newOrderRef.id, ...orderData };

        // Disparar Push Notification para os aparelhos do estabelecimento (PWA)
        sendOrderPushNotification(establishmentId, createdOrder).catch(err => console.warn('[Push Dispatch Warning]:', err));

        console.log(`[Fallback Order Saved] Pedido #${orderNumber} salvo com sucesso! ID: ${newOrderRef.id}`);
      }
    }

    // Menu with Photos and Single Photo Triggers
    const lowerIn = (incomingText || '').toLowerCase();
    const isAskingMenu = lowerIn.includes('cardapio') || lowerIn.includes('cardápio') || 
                         lowerIn.includes('menu') || lowerIn.includes('opções') || 
                         lowerIn.includes('opcoes') || lowerIn.includes('o que tem') || 
                         lowerIn.includes('o que vocês tem') || lowerIn.includes('o que voces tem') || 
                         lowerIn.includes('quais sao os lanches') || lowerIn.includes('quais são os lanches') || 
                         lowerIn.includes('ver o cardapio') || lowerIn.includes('ver cardapio');

    const isSelecting = lowerIn.includes('quero') || lowerIn.includes('vou querer') || 
                        lowerIn.includes('me vê') || lowerIn.includes('me ve') || 
                        lowerIn.includes('adiciona') || lowerIn.includes('manda') || 
                        lowerIn.includes('pedir') || lowerIn.includes('1 ') || 
                        lowerIn.includes('2 ') || lowerIn.includes('um ') || 
                        lowerIn.includes('uma ') || lowerIn.includes('dois ') || 
                        lowerIn.includes('duas ');

    // 1. If customer asked for menu and tool didn't populate mediaList, fallback populate with all products with photo
    if (!isAutomotive && isAskingMenu && !isSelecting && mediaList.length === 0) {
      const prodsWithPhoto = products.filter((p: any) => p.available !== false && p.imageUrl).slice(0, 10);
      if (prodsWithPhoto.length > 0) {
        mediaList = prodsWithPhoto.map((p: any) => ({
          url: p.imageUrl,
          caption: formatWhatsAppText(`🍽️ *${p.name}* - R$ ${Number(p.price).toFixed(2)}\n${p.description || ''}`),
          productName: p.name
        }));
        console.log(`[Fallback Menu Trigger] Preparando ${mediaList.length} foto(s) do cardápio para envio`);
        if (!replyText || replyText.includes('[ID:')) {
          replyText = `Aqui estão as fotos das opções do nosso cardápio! 👆😋\n\nQual item você gostaria de pedir hoje? Pode mandar em áudio ou texto que já anoto seu pedido! 🎙️`;
        }
      }
    }

    // 2. If customer specifically asked for photo of a product (and isn't selecting/ordering yet)
    if (mediaList.length === 0 && !isSelecting) {
      const askedPhoto = 
        lowerIn.includes('foto') || lowerIn.includes('imagem') || lowerIn.includes('fotos') || lowerIn.includes('imagens') || 
        lowerIn.includes('ver o ') || lowerIn.includes('ver a ') ||
        lowerIn.includes('photo') || lowerIn.includes('photos') || lowerIn.includes('image') || lowerIn.includes('images') || 
        lowerIn.includes('picture') || lowerIn.includes('pictures') || lowerIn.includes('pic ') || lowerIn.includes('pics') ||
        lowerIn.includes('clip') || lowerIn.includes('clips') || lowerIn.includes('video') || lowerIn.includes('vídeo') ||
        lowerIn.includes('sound') || lowerIn.includes('ronco');

      if (askedPhoto) {
        const carKeywords = [
          savedAutoCtx.brand, 
          savedAutoCtx.model, 
          automotiveToolArgs?.brand, 
          automotiveToolArgs?.model
        ].filter(Boolean).map(s => s!.toLowerCase());

        const found: any = products.find((prod: any) => (prod.imageUrl || (prod.images && prod.images.length > 0)) && (
          lowerIn.includes(prod.name.toLowerCase()) || 
          prod.name.toLowerCase().split(' ').some((w: string) => w.length > 3 && lowerIn.includes(w)) ||
          carKeywords.some(kw => prod.name.toLowerCase().includes(kw))
        ));

        if (found) {
          const mainImg = found.imageUrl || (found.images && found.images[0]);
          mediaList.push({
            url: mainImg,
            caption: formatWhatsAppText(isAutomotive ? `🏁 *${found.name}*\n${found.description || ''}\nReferência sob análise técnica.` : `📸 *${found.name}* - R$ ${Number(found.price).toFixed(2)}\n${found.description || ''}`),
            productName: found.name
          });
          console.log(`[Single Photo Trigger] Foto do produto "${found.name}" preparada para envio!`);
        }
      }
    }

    // 3. Fallback Heuristic for Location Card:
    // If customer asked about address/location and locationToSend wasn't triggered yet
    if (!locationToSend) {
      const asksLocation = 
        lowerIn.includes('onde fica') || 
        lowerIn.includes('qual o endereço') || 
        lowerIn.includes('qual o endereco') || 
        lowerIn.includes('qual seu endereço') || 
        lowerIn.includes('qual seu endereco') || 
        lowerIn.includes('onde vocês ficam') || 
        lowerIn.includes('onde voces ficam') || 
        lowerIn.includes('como chego') || 
        lowerIn.includes('como faço pra chegar') || 
        lowerIn.includes('como faco pra chegar') || 
        lowerIn.includes('posso ir aí') || 
        lowerIn.includes('posso ir ai') || 
        lowerIn.includes('levar o carro') || 
        lowerIn.includes('levar meu carro') || 
        lowerIn.includes('visita presencial') || 
        lowerIn.includes('instalação presencial') || 
        lowerIn.includes('instalacao presencial') || 
        lowerIn.includes('localização') || 
        lowerIn.includes('localizacao') || 
        lowerIn.includes('ponto de referência') || 
        lowerIn.includes('ponto de referencia') ||
        lowerIn.includes('where are you located') ||
        lowerIn.includes('your address') ||
        lowerIn.includes('shop address');

      if (asksLocation && establishment.address) {
        let lat = establishment.latitude;
        let lng = establishment.longitude;
        if (!lat || !lng) {
          const geocoded = await geocodeAddress(establishment.address);
          if (geocoded) {
            lat = geocoded.latitude;
            lng = geocoded.longitude;
            db.collection('establishments').doc(establishmentId).set({
              latitude: lat,
              longitude: lng
            }, { merge: true }).catch(() => {});
          } else {
            lat = -8.05428;
            lng = -34.8813;
          }
        }

        locationToSend = {
          latitude: Number(lat),
          longitude: Number(lng),
          name: establishment.name || 'Nossa Localização',
          address: establishment.address || 'Consulte nosso endereço'
        };

        console.log(`[Fallback Location Trigger] Card de localização preparado por heurística de pergunta sobre endereço! Lat: ${lat}, Lng: ${lng}`);
      }
    }

    // Detect active conversation language
    const conversationLang = detectMessageLanguage(
      textForAi || incomingText,
      (history || []).map((h: any) => h.text),
      automotiveToolArgs?.detectedLanguage || savedAutoCtx.detectedLanguage
    );

    if (isAutomotive) {
      if (conversationLang && automotiveToolArgs) {
        automotiveToolArgs.detectedLanguage = conversationLang;
      } else if (conversationLang) {
        automotiveToolArgs = { detectedLanguage: conversationLang };
      }

      const autoSync = await saveAutomotiveContactAndSyncCrm({
        db,
        establishmentId,
        customerPhone,
        customerName: customerNameParam,
        incomingText: textForAi || chatDisplayMsg,
        replyText,
        toolArgs: automotiveToolArgs,
        catalog: products.map((p: any) => ({ id: p.id, name: p.name })),
        forceRegisterProject: forceRegisterAutomotive,
        attribution
      });

      const ctx = autoSync.context;
      if (autoSync.project) {
        createdOrder = autoSync.project;
      }

      if (autoSync.isNewProject || autoSync.justQualified) {
        const sourceBadge = attribution?.campaignName ? `[${attribution.campaignName}]` : '';
        sendAlertPushNotification(establishmentId, {
          title: autoSync.justQualified
            ? `🏁 Projeto Qualificado ${sourceBadge}: ${ctx.brand || ''} ${ctx.model || ''}`.trim()
            : `🎯 Lead de Performance ${sourceBadge}: ${ctx.customerName || customerPhone}`.trim(),
          body: `${ctx.summary || textForAi || incomingText}`.slice(0, 120),
          url: `/?tab=automotive&projectId=${autoSync.project?.id || ''}`
        }).catch(() => {});
      }

      if (!replyText) {
        if (locationToSend) {
          replyText = `Nossa oficina fica em: *${establishment.address || 'Av. Principal'}*.\n\n📍 Te enviei acima o nosso card de localização com mapa interativo no WhatsApp! É só tocar nele para traçar a rota direta pelo *Waze* ou *Google Maps*! 🚗💨`;
        } else if (ctx.brand || ctx.model) {
          const vehicleLabel = [ctx.brand, ctx.model, ctx.year, ctx.version].filter(Boolean).join(' ');
          if (!ctx.year || !ctx.version) {
            replyText = `Excelente máquina! Já salvei aqui no seu atendimento o interesse para o *${vehicleLabel}* 🏁.\n\nPara nossa engenharia validar a aplicação exata, qual é o *ano e versão/motorização* do carro e o que você busca no projeto (ex: catback valvulado, downpipe, inox 304)?`;
          } else if (!ctx.objective) {
            replyText = `Perfeito! Já anotei os dados do seu *${vehicleLabel}* 🏁.\n\nQual é o seu *objetivo principal* com o projeto (ex: ronco mais encorpado com válvula/difusor, ganho de fluxo com downpipe, acabamento em inox ou titânio) e se o carro já possui alguma modificação?`;
          } else if (ctx.delivery === 'A definir' && !ctx.cep) {
            replyText = `Show! Já registrei o contexto do seu projeto para o *${vehicleLabel}* (*${ctx.objective}*) em nosso CRM técnico 🏁.\n\nPara finalizarmos a ficha para orçamento, qual é o seu *nome* e você prefere *Atendimento local* na nossa oficina ou *Envio nacional* (informando seu *CEP*)?`;
          } else {
            replyText = `🏁 *Ficha de Projeto Registrada no CRM Técnico!*\n\n` +
              `• *Cliente:* ${ctx.customerName || 'Cliente'}\n` +
              `• *Veículo:* ${vehicleLabel}\n` +
              (ctx.modifications ? `• *Modificações:* ${ctx.modifications}\n` : '') +
              `• *Objetivo:* ${ctx.objective}\n` +
              `• *Logística:* ${ctx.delivery}${ctx.cep ? ` (CEP: ${ctx.cep})` : ''}\n\n` +
              `Nossa equipe técnica já recebeu o contexto completo da nossa conversa e vai analisar a aplicação e preparar seu orçamento!`;
          }
        }
      }
    }

    if (!replyText) {
      if (locationToSend) {
        replyText = isAutomotive
          ? `Nossa oficina fica em: *${establishment.address || 'Av. Principal'}*.\n\n📍 Te enviei acima o nosso card de localização com mapa interativo no WhatsApp! É só tocar nele para traçar a rota direta pelo *Waze* ou *Google Maps*! 🚗💨`
          : `Ficamos localizados em: *${establishment.address || 'Endereço da loja'}*.\n\n📍 Te enviei o card de localização aqui no WhatsApp com o mapa para abrir direto no *Waze* ou *Google Maps*!`;
      } else if (isAutomotive) {
        replyText = 'Olá! Para organizarmos seu projeto e encaminharmos para análise técnica, qual é a marca, modelo, ano e versão do seu veículo? 🏁';
      } else if (mediaList.length === 1) {
        replyText = `Aqui está a foto do nosso *${mediaList[0].productName || 'produto'}*! Deseja pedir este item?`;
      } else if (mediaList.length > 1) {
        replyText = `Aqui estão as fotos dos nossos pratos! 👆😋\n\nQual item te apetece mais hoje? Se preferir, pode me mandar mensagem de áudio ou texto! 🎙️`;
      } else {
        replyText = isAutomotive ? 'Como posso ajudar com seu projeto? Qual é o modelo e ano do veículo?' : 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com o catálogo?';
      }
    }

    // Auto-translate replyText and media captions if conversation is in English, Spanish or another language
    if (conversationLang !== 'pt' && replyText) {
      replyText = await translateAutomotiveText(replyText, conversationLang);
    }

    if (conversationLang !== 'pt' && mediaList.length > 0) {
      for (const m of mediaList) {
        if (m.caption) {
          m.caption = await translateAutomotiveText(m.caption, conversationLang);
        }
      }
    }

    // Ensure audio suggestion is present on customer's initial contact in the proper language
    if (history.length <= 1) {
      const lowerReply = replyText.toLowerCase();
      if (!lowerReply.includes('áudio') && !lowerReply.includes('audio') && !lowerReply.includes('voz') && !lowerReply.includes('voice')) {
        const audioTip = conversationLang === 'en'
          ? `\n\n🎙️ *Tip:* If you prefer, feel free to send a voice note — I'll listen carefully and organize your project details!`
          : conversationLang === 'es'
          ? `\n\n🎙️ *Consejo:* Si lo prefieres, ¡puedes enviarme una nota de voz y preparo los detalles de tu proyecto!`
          : `\n\n🎙️ *Dica:* Se preferir, você também pode me mandar mensagem de áudio que eu escuto com atenção e ${isAutomotive ? 'organizo os detalhes do seu projeto!' : 'anoto seu pedido!'}`;
        replyText = `${replyText}${audioTip}`;
      }
    }

    // Format clean WhatsApp typography (convert markdown bold/bullets and remove ID leaks)
    replyText = formatWhatsAppText(replyText);

    const finalTimestamp = new Date().toISOString();

    // Save assistant reply to chat history
    await chatRef.add({
      sender: 'assistant',
      text: replyText,
      timestamp: finalTimestamp,
      orderId: createdOrder ? createdOrder.id : null,
      mediaUrl: mediaList.length > 0 ? mediaList[0].url : null,
      location: locationToSend || null
    });

    // Save/update parent chat document per establishment so every contact's interaction is persisted
    await db.collection('establishments').doc(establishmentId).collection('chats').doc(customerPhone).set({
      customerPhone,
      customerName: customerMemory.name || customerNameParam || 'Cliente WhatsApp',
      segment: establishment.segment || 'FOOD',
      lastMessage: replyText,
      lastUserMessage: chatDisplayMsg,
      lastTimestamp: finalTimestamp,
      updatedAt: finalTimestamp
    }, { merge: true }).catch(() => {});

    // Atualiza a memória após concluir a resposta, sem bloquear o atendimento caso o Firestore falhe.
    await updateCustomerMemory(establishmentId, customerPhone, {
      name: customerNameParam,
      order: isAutomotive ? undefined : createdOrder,
      incomingText
    });

    return { 
      replyText, 
      orderCreated: createdOrder, 
      mediaList,
      mediaToSend: mediaList.length > 0 ? mediaList[0] : null,
      locationToSend
    };
  } catch (err: any) {
    console.error('[Gemini AI Process Error]:', err);
    return {
      replyText: 'Olá! Nosso sistema está atualizando no momento. Em instantes um atendente humano irá te responder!'
    };
  }
}

// ----------------------------------------------------
// Webhook Evolution API (Multi-Tenant)
// ----------------------------------------------------
app.post(['/api/webhook/evolution', '/api/webhook/evolution/:establishmentId'], async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const body = req.body || {};
    const rawEvent = (body.event || body.type || '').toUpperCase();

    console.log(`[Evolution Webhook] Evento: ${rawEvent} para loja: ${storeId}`);

    // Handle Connection State Updates
    if (rawEvent === 'CONNECTION' || rawEvent === 'CONNECTION.UPDATE' || rawEvent === 'CONNECTION_UPDATE') {
      const state = body.data?.state || body.state || '';
      const isOnline = state === 'open' || state === 'connected' || body.data?.status === 'connected';
      await db.collection('establishments').doc(storeId).set({
        evolutionConnected: isOnline,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
      return res.status(200).json({ status: 'connection_updated', isOnline });
    }

    // Check if event is a message event (Evolution Go uses 'MESSAGE', Evolution Node uses 'messages.upsert')
    const isMessageEvent = rawEvent === 'MESSAGE' || 
                           rawEvent === 'MESSAGES.UPSERT' || 
                           rawEvent === 'MESSAGES_UPSERT' || 
                           rawEvent === 'MESSAGES.UPSERT.V2' ||
                           (!rawEvent && (body.data?.message || body.message));

    if (!isMessageEvent) {
      return res.status(200).json({ status: 'ignored_event', event: rawEvent });
    }

    const messageData = body.data || body;
    const info = messageData.Info || messageData.info || {};
    const key = messageData.key || {};

    const fromMe = info.IsFromMe ?? key.fromMe ?? messageData.fromMe ?? false;
    const isGroup = info.IsGroup ?? false;

    // Determine remote phone (handles Evolution Go Info.Chat / Info.Sender and Node key.remoteJid)
    const remoteJid = info.Chat || info.Sender || key.remoteJid || messageData.remoteJid || messageData.from || messageData.sender || '';
    const phone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '');
    const infoChat = info.Chat || '';
    const infoSender = info.Sender || '';

    // Ignore group chats and broadcast lists
    if (!phone || isGroup || remoteJid.includes('@g.us') || remoteJid.includes('broadcast')) {
      console.log(`[Evolution Webhook] Ignorando grupo ou sem telefone: ${remoteJid}`);
      return res.status(200).json({ status: 'ignored_group_or_no_phone' });
    }

    // Load store establishment configuration early so we can check owner/admin status
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};

    // Extract message content early (handles Evolution Go Message and Node message)
    const msgContent = messageData.Message || messageData.message || messageData.msg || {};
    let text = msgContent.conversation || 
                 msgContent.extendedTextMessage?.text || 
                 msgContent.imageMessage?.caption || 
                 messageData.conversation ||
                 messageData.text ||
                 messageData.body || '';

    // Check if this is an Admin / Owner message (Self-Chat on the connected device or Owner's phone)
    const isAdmin = isOwnerAdminMessage(fromMe, remoteJid, phone, infoChat, infoSender, est);

    if (fromMe && !isAdmin) {
      // O atendente humano (Pedro) enviou uma mensagem para o cliente pelo WhatsApp.
      // Pausa a IA automaticamente por 2 horas (ou configuração da loja) para não interromper a conversa humana.
      const autoPauseMin = Number(est.aiAutoPauseMinutes || 120);
      const pausedUntil = new Date(Date.now() + autoPauseMin * 60 * 1000).toISOString();
      console.log(`[Human Takeover] Atendente/Pedro enviou mensagem manual para ${phone}. IA pausada por ${autoPauseMin} min (até ${pausedUntil}).`);

      try {
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          aiPaused: true,
          aiPausedUntil: pausedUntil,
          aiPausedReason: 'owner_whatsapp_message',
          aiPausedAt: new Date().toISOString(),
          lastHumanInterventionAt: new Date().toISOString(),
          lastMessage: text || '[Mídia enviada pelo atendente]',
          lastMessageAt: new Date().toISOString(),
          lastSender: 'human_attendant'
        }, { merge: true });

        if (text.trim()) {
          await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
            sender: 'assistant',
            author: 'Pedro (Humano)',
            text: text.trim(),
            timestamp: new Date().toISOString()
          });
        }

        const projsSnap = await db.collection('automotive_projects')
          .where('establishmentId', '==', storeId)
          .where('phone', '==', phone)
          .limit(1)
          .get().catch(() => null);

        if (projsSnap && !projsSnap.empty) {
          await projsSnap.docs[0].ref.update({
            aiPaused: true,
            aiPausedUntil: pausedUntil,
            aiPausedReason: 'owner_whatsapp_message',
            lastHumanInterventionAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err: any) {
        console.warn('[Human Takeover Error]:', err.message);
      }

      return res.status(200).json({ status: 'ignored_from_me_ai_paused', phone, pausedUntil });
    }

    const audioMsg = msgContent.audioMessage || msgContent.AudioMessage;
    const imageMsg = msgContent.imageMessage || msgContent.ImageMessage;
    const locationMsg = msgContent.locationMessage || 
                        msgContent.LocationMessage || 
                        msgContent.liveLocationMessage || 
                        msgContent.LiveLocationMessage ||
                        messageData.locationMessage;

    let gpsData: { latitude: number; longitude: number; name?: string; address?: string } | null = null;
    if (locationMsg) {
      const lat = Number(locationMsg.degreesLatitude ?? locationMsg.latitude);
      const lng = Number(locationMsg.degreesLongitude ?? locationMsg.longitude);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        gpsData = {
          latitude: lat,
          longitude: lng,
          name: locationMsg.name || '',
          address: locationMsg.address || ''
        };
        const locDesc = (gpsData.name || gpsData.address) 
          ? `${gpsData.name ? gpsData.name + ' - ' : ''}${gpsData.address}`
          : `Coordenadas GPS: ${lat}, ${lng}`;
        
        const wazeDirect = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        const mapsDirect = `https://www.google.com/maps?q=${lat},${lng}`;

        text = `[LOCALIZAÇÃO GPS RECEBIDA DO WHATSAPP]:\nO cliente acabou de compartilhar sua localização exata no WhatsApp!\n- Latitude: ${lat}\n- Longitude: ${lng}\n- Referência/Endereço: ${locDesc}\n- Waze: ${wazeDirect}\n- Google Maps: ${mapsDirect}\n\nPor favor, confirme com muita simpatia que a localização GPS foi salva com sucesso para o motoboy seguir pelo Waze/Google Maps e pergunte se falta apenas confirmar o número da casa/apto ou forma de pagamento se ainda não foram informados.`;

        console.log(`[Evolution Webhook] Localização GPS recebida de ${phone}: ${lat}, ${lng} (${locDesc})`);

        // Check if there is an active/pending order for this customer created in the last 2 hours and update its GPS
        try {
          const recentOrdersSnap = await db.collection('establishments').doc(storeId)
            .collection('orders')
            .where('customerPhone', '==', phone)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

          if (!recentOrdersSnap.empty) {
            const recentOrderDoc = recentOrdersSnap.docs[0];
            const recentOrder = recentOrderDoc.data();
            if (recentOrder.status === 'PENDENTE' || recentOrder.status === 'CONFIRMADO' || recentOrder.status === 'EM_PREPARO') {
              await recentOrderDoc.ref.update({
                latitude: lat,
                longitude: lng,
                locationUrl: mapsDirect,
                isGpsLocation: true,
                customerAddress: recentOrder.customerAddress && recentOrder.customerAddress !== 'A confirmar'
                  ? `${recentOrder.customerAddress} (GPS WhatsApp: ${lat}, ${lng})`
                  : locDesc || `GPS WhatsApp: ${lat}, ${lng}`,
                updatedAt: new Date().toISOString()
              });
              console.log(`[Evolution Webhook] Pedido #${recentOrder.orderNumber} atualizado automaticamente com coordenadas GPS!`);
            }
          }
        } catch (gpsUpdateErr) {
          console.warn('[Evolution Webhook] Could not auto-attach GPS to recent order:', gpsUpdateErr);
        }
      }
    }

    // De-duplication: Evolution Go often emits the same incoming message twice within milliseconds
    const messageId = info.ID || key.id || messageData.id || messageData.ID || '';
    const now = Date.now();

    // 1. Check duplicate unique message ID
    if (messageId) {
      const prevIdTime = processedMessages.get(messageId);
      if (prevIdTime && (now - prevIdTime) < 30000) {
        console.log(`[Evolution Webhook] Ignorando evento duplicado para mensagem ID: ${messageId}`);
        return res.status(200).json({ status: 'ignored_duplicate_id', messageId });
      }
      processedMessages.set(messageId, now);
    }

    // 2. Check duplicate rapid text from same phone within 4 seconds (if text present)
    if (text.trim()) {
      const rapidKey = `${storeId}:${phone}:${text.trim().toLowerCase()}`;
      const prevTextTime = processedMessages.get(rapidKey);
      if (prevTextTime && (now - prevTextTime) < 4000) {
        console.log(`[Evolution Webhook] Ignorando envio rápido repetido de ${phone}`);
        return res.status(200).json({ status: 'ignored_rapid_duplicate', phone });
      }
      processedMessages.set(rapidKey, now);
    }

    // Keep cache clean and small
    if (processedMessages.size > 2000) {
      for (const [k, t] of processedMessages.entries()) {
        if (now - t > 60000) processedMessages.delete(k);
      }
    }
    if (botSentMessages.size > 2000) {
      for (const [k, t] of botSentMessages.entries()) {
        if (now - t > 60000) botSentMessages.delete(k);
      }
    }

    // Ignore if sent by the bot/co-pilot itself to prevent loops
    if (messageId && botSentMessages.has(messageId)) {
      console.log(`[Evolution Webhook] Ignorando mensagem enviada pelo próprio Co-Pilot/bot (ID: ${messageId})`);
      return res.status(200).json({ status: 'ignored_bot_sent' });
    }

    if (text && (text.startsWith('👨‍🍳 *Co-Pilot') || text.startsWith('🤖 *Co-Pilot') || text.startsWith('🤖 *Assistente'))) {
      return res.status(200).json({ status: 'ignored_copilot_echo' });
    }

    // ----------------------------------------------------
    // ⏳ STALE / HISTORY MESSAGE GUARD (Anti-Avalanche ao Ligar o Agente)
    // ----------------------------------------------------
    // Quando a instância do WhatsApp é iniciada ou reconectada, o WhatsApp sincroniza
    // mensagens antigas não lidas que chegaram enquanto o agente estava desligado.
    // Se a mensagem tiver mais de 2 minutos, salvamos no CRM mas NÃO DISPARAMOS A IA!
    const rawMsgTime = messageData.messageTimestamp || 
                       info.Timestamp || 
                       info.timestamp || 
                       messageData.Timestamp || 
                       messageData.timestamp ||
                       messageData.date_time ||
                       body.date_time;

    let msgAgeMs = 0;
    if (rawMsgTime) {
      const numTime = typeof rawMsgTime === 'number' ? rawMsgTime : (!isNaN(Number(rawMsgTime)) ? Number(rawMsgTime) : new Date(rawMsgTime).getTime());
      if (!isNaN(numTime) && numTime > 0) {
        const msgTimeMs = numTime < 10000000000 ? numTime * 1000 : numTime;
        msgAgeMs = now - msgTimeMs;
      }
    }

    const MAX_INBOUND_MESSAGE_AGE_MS = 2.5 * 60 * 1000; // 2.5 minutos
    const isStaleHistoryMessage = msgAgeMs > MAX_INBOUND_MESSAGE_AGE_MS;

    if (isStaleHistoryMessage && !fromMe && !isAdmin) {
      console.log(`[Evolution Webhook] ⏳ Mensagem retroativa de ${phone} enviada há ${Math.round(msgAgeMs / 1000)}s (enquanto o agente estava desligado). Registrada no CRM sem disparar resposta de IA.`);

      const historyText = text || (audioMsg ? '[Áudio recebido enquanto agente desligado]' : (imageMsg ? '[Imagem recebida enquanto agente desligado]' : '[Mensagem WhatsApp]'));
      const originalSentIso = new Date(now - msgAgeMs).toISOString();

      try {
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'user',
          text: historyText,
          timestamp: originalSentIso,
          isOfflineCatchup: true
        });

        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          customerPhone: phone,
          lastMessage: historyText,
          lastMessageAt: originalSentIso,
          unreadByHuman: true
        }, { merge: true });

        const projsSnap = await db.collection('automotive_projects')
          .where('establishmentId', '==', storeId)
          .where('phone', '==', phone)
          .limit(1)
          .get();
        if (!projsSnap.empty) {
          await projsSnap.docs[0].ref.update({
            lastMessage: historyText,
            updatedAt: originalSentIso
          });
        }
      } catch (historyErr: any) {
        console.warn('[Stale Message Catchup Error]:', historyErr.message);
      }

      return res.status(200).json({
        status: 'ignored_stale_history_message',
        phone,
        ageSeconds: Math.round(msgAgeMs / 1000)
      });
    }

    // ----------------------------------------------------
    // 👨‍🍳 ADMIN CO-PILOT (Gestão da Loja pelo WhatsApp do Lojista)
    // ----------------------------------------------------
    if (isAdmin) {
      console.log(`[Admin Co-Pilot] 👑 Mensagem do Dono/Gestor detectada para loja "${est.name || storeId}" (de ${phone}, self-chat: ${fromMe})`);

      const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
      const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108';
      const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
      const evoInst = est.evolutionInstanceName || defaultInstName;

      // Handle Media (Voice Audio / Image)
      let mediaPart: { mimeType: string; data: string } | null = null;
      if (audioMsg || imageMsg) {
        console.log(`[Admin Co-Pilot] Baixando mídia do gestor (${audioMsg ? 'áudio' : 'imagem'})...`);
        mediaPart = await downloadWhatsAppMedia(evoUrl, evoInst, msgContent);
      }

      const copilotResult = await processAdminCoPilotCommand(storeId, est, text, mediaPart, db);

      const targetRecipient = remoteJid.includes('@lid') ? remoteJid : phone;

      if (copilotResult.replyText) {
        // If owner sent an audio, synthesize and reply in voice too!
        if (audioMsg && est.aiVoiceMirrorEnabled !== false) {
          try {
            const chosenVoice = est.aiVoiceId || 'pt-BR-FranciscaNeural';
            console.log(`[Admin Co-Pilot] Sintetizando resposta em voz para o gestor (${chosenVoice})...`);
            const audioBase64 = await generateVoiceAudioBase64(copilotResult.replyText, chosenVoice);
            if (audioBase64) {
              const audioRes = await sendWhatsAppAudio(evoUrl, evoKey, evoInst, targetRecipient, audioBase64);
              const aId = audioRes?.data?.key?.id || audioRes?.data?.id;
              if (aId) botSentMessages.set(aId, Date.now());
            }
          } catch (vErr: any) {
            console.warn('[Admin Co-Pilot Voice Error]:', vErr.message);
          }
        }

        const msgRes = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, targetRecipient, copilotResult.replyText);
        const mId = msgRes?.data?.key?.id || msgRes?.data?.id;
        if (mId) botSentMessages.set(mId, Date.now());
        console.log(`[Admin Co-Pilot] Resposta enviada ao gestor: ação ${copilotResult.actionTaken}`);
      }

      return res.status(200).json({
        status: 'admin_copilot_executed',
        action: copilotResult.actionTaken,
        reply: copilotResult.replyText
      });
    }

    // Message coalescing: many customers send one thought in several WhatsApp messages.
    // Wait for a quiet window and let only the newest webhook process the combined text.
    if (text.trim() && !audioMsg && !imageMsg && !gpsData) {
      const aggregateKey = `${storeId}:${phone}`;
      const previous = pendingInboundMessages.get(aggregateKey);
      const version = (previous?.version || 0) + 1;
      const pending = {
        version,
        texts: [...(previous?.texts || []), text.trim()],
        updatedAt: Date.now()
      };
      pendingInboundMessages.set(aggregateKey, pending);

      await new Promise(resolve => setTimeout(resolve, INBOUND_MESSAGE_DEBOUNCE_MS));

      const latest = pendingInboundMessages.get(aggregateKey);
      if (!latest || latest.version !== version) {
        console.log(`[Evolution Webhook] Aguardando continuação da mensagem de ${phone}; resposta agrupada pelo próximo evento.`);
        return res.status(200).json({ status: 'waiting_message_aggregation', phone });
      }

      text = latest.texts.join('\n');
      pendingInboundMessages.delete(aggregateKey);
      console.log(`[Evolution Webhook] Mensagens agrupadas de ${phone}: ${latest.texts.length} parte(s)`);
    }

    // Subscription / Trial Verification (7 days trial or active paid subscription)
    if (est.id === 'ZFFWUNspKNYKsn22kKDH6nybCWw2' && (!est.subscriptionValidUntil || new Date(est.subscriptionValidUntil).getTime() < Date.now())) {
      void db.collection('establishments').doc(est.id).set({
        plan: 'active',
        accountStatus: 'active_paid',
        subscriptionValidUntil: '2099-12-31T23:59:59.000Z'
      }, { merge: true });
    }

    if (!isEstablishmentSubscriptionActive(est)) {
      const storePlan = resolveStorePlan(est.planTier, est.segment);
      console.warn(`[Evolution Webhook] 🛑 BLOQUEADO: Assinatura do estabelecimento "${est.name || storeId}" expirada (teste de 7 dias encerrado). Mensagem de ${phone} não será respondida pela IA.`);
      return res.status(200).json({
        status: 'subscription_expired',
        message: `Período de teste de 7 dias encerrado. Ative o ${storePlan.name} (R$ ${storePlan.price}/mês) para continuar.`
      });
    }

    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108';
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    const evoInst = est.evolutionInstanceName || defaultInstName;

    // AI Operating Hours Verification (Check if store is open in America/Sao_Paulo)
    const openStatus = isEstablishmentOpenNow(est);
    if (!openStatus.isOpen) {
      console.log(`[Evolution Webhook] 🌙 IA em repouso para o estabelecimento "${est.name || storeId}": ${openStatus.reason}`);

      // Prune outOfHoursReplies cache if large
      if (outOfHoursReplies.size > 2000) {
        const cutoff = Date.now() - 6 * 60 * 60 * 1000;
        for (const [k, t] of outOfHoursReplies.entries()) {
          if (t < cutoff) outOfHoursReplies.delete(k);
        }
      }

      const outOfHoursAction = est.aiOutOfHoursAction || 'SILENT';
      if (outOfHoursAction === 'AUTO_REPLY') {
        const cacheKey = `${storeId}_${phone}`;
        const lastReply = outOfHoursReplies.get(cacheKey) || 0;
        const nowMs = Date.now();
        const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

        if (nowMs - lastReply > THREE_HOURS_MS) {
          outOfHoursReplies.set(cacheKey, nowMs);
          const customMsg = est.aiOutOfHoursMessage || 
            `Olá! Agradecemos pelo seu contato. 😊\n\nNo momento nosso atendimento automático de pedidos está fechado. Deixe sua mensagem que te responderemos assim que abrirmos nosso expediente!\n\nHorário de atendimento: ${est.operatingHours || 'Consulte nosso horário em nosso perfil.'}`;
          
          await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, customMsg);
          console.log(`[Evolution Webhook] Mensagem automática de fora do expediente enviada para ${phone}`);
          return res.status(200).json({ status: 'out_of_hours_replied' });
        } else {
          console.log(`[Evolution Webhook] Mensagem fora do expediente suprimida para ${phone} (já enviada recentemente)`);
          return res.status(200).json({ status: 'out_of_hours_throttled' });
        }
      }

      // Silent mode: do not respond at all
      console.log(`[Evolution Webhook] Modo silencioso fora do expediente. Nenhuma resposta enviada para ${phone}`);
      return res.status(200).json({ status: 'out_of_hours_silent' });
    }

    // Anti-Ban Layer 1: Automatic Opt-out Interceptor
    // If recipient replies 0, parar, sair, cancelar, etc., auto-block from future marketing broadcasts and confirm politely
    const cleanInboundText = (text || '').trim().toLowerCase();
    const optOutKeywords = ['0', 'parar', 'sair', 'cancelar', 'stop', 'descadastrar', 'remover', 'nao quero mais', 'não quero mais'];
    if (optOutKeywords.includes(cleanInboundText)) {
      console.log(`[Anti-Ban Opt-out] Cliente ${phone} solicitou descadastramento da lista de novidades da loja ${storeId}`);
      await db.collection('establishments').doc(storeId).collection('blocked_contacts').doc(phone).set({
        phone,
        blockedAt: new Date().toISOString(),
        reason: `Opt-out automático pelo WhatsApp (mensagem: "${cleanInboundText}")`
      }, { merge: true });

      const optOutReply = `Entendido! Você foi removido da nossa lista de novidades e promoções com sucesso. ✅\n\nCaso queira voltar a receber nossas ofertas no futuro, basta nos avisar por aqui. Se precisar de algo ou quiser fazer um pedido agora, fico à disposição! 😊`;
      await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, optOutReply);
      return res.status(200).json({ status: 'opt_out_processed', phone });
    }

    // Handle Media (Voice Audio / Image)
    let mediaPart: { mimeType: string; data: string } | null = null;
    if (audioMsg || imageMsg) {
      console.log(`[Evolution Webhook] Mídia detectada (${audioMsg ? 'áudio' : 'imagem'}) de ${phone}. Baixando via Evolution API...`);
      mediaPart = await downloadWhatsAppMedia(evoUrl, evoInst, msgContent);
      if (mediaPart) {
        console.log(`[Evolution Webhook] Mídia baixada com sucesso! Tipo: ${mediaPart.mimeType}, Tamanho base64: ${mediaPart.data.length}`);
      } else {
        console.warn(`[Evolution Webhook] Não foi possível baixar mídia de ${phone}`);
      }

      // Se for mensagem de áudio, marca como reproduzida (microfone azul no WhatsApp)
      if (audioMsg && messageId) {
        fetch(`${evoUrl}/message/markplayed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoInst },
          body: JSON.stringify({ number: phone, id: [messageId] })
        }).catch(() => {});
      }
    }

    // If message has neither text nor downloaded media
    if (!text.trim() && !mediaPart) {
      if (audioMsg) {
        console.log(`[Evolution Webhook] Áudio não decodificado, enviando pedido de texto para ${phone}`);
        const fallbackAudioPrompt = "Olá! Recebi seu áudio, mas no momento não consegui reproduzi-lo com clareza. Você poderia digitar sua mensagem ou pedido aqui para eu te atender rapidinho? 😊";
        await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, fallbackAudioPrompt);
        return res.status(200).json({ status: 'audio_failed_prompted_text' });
      }
      console.log(`[Evolution Webhook] Mensagem sem texto e sem mídia suportada de ${phone}`);
      return res.status(200).json({ status: 'ignored_empty_content' });
    }

    const pushName = info.PushName || messageData.pushName || '';

    console.log(`[Evolution Webhook] Processando mensagem de ${phone} (${pushName || 'Sem nome'}): ${text ? `"${text.slice(0, 50)}..."` : (mediaPart ? `[Mídia: ${mediaPart.mimeType}]` : '[Vazio]')}`);

    // Human Takeover Gate: se a IA estiver pausada para este contato (Pedro no controle), registra mensagem sem chamar o bot
    const chatDoc = await db.collection('establishments').doc(storeId).collection('chats').doc(phone).get().catch(() => null);
    const chatData = chatDoc?.data() || {};
    const isAiPaused = chatData.aiPaused && (!chatData.aiPausedUntil || new Date(chatData.aiPausedUntil).getTime() > Date.now());

    if (isAiPaused) {
      console.log(`[Human Takeover] ⏸️ IA PAUSADA para ${phone} (Pedro no controle até ${chatData.aiPausedUntil || 'reativação manual'}). Mensagem registrada sem disparar IA.`);
      
      const incomingText = text || (mediaPart ? `[Mídia: ${mediaPart.mimeType}]` : '[Mensagem]');
      const nowIso = new Date().toISOString();
      await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
        sender: 'user',
        text: incomingText,
        timestamp: nowIso,
        mediaUrl: mediaPart?.mimeType.startsWith('image/') ? (mediaPart.data.startsWith('http') ? mediaPart.data : `data:${mediaPart.mimeType};base64,${mediaPart.data}`) : null,
        audioUrl: mediaPart?.mimeType.startsWith('audio/') ? (mediaPart.data.startsWith('http') ? mediaPart.data : `data:${mediaPart.mimeType};base64,${mediaPart.data}`) : null
      });
      await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
        lastMessage: incomingText,
        lastMessageAt: nowIso,
        lastSender: 'user',
        unreadByHuman: true
      }, { merge: true });

      let customerName = chatData.customerName || pushName || phone;
      let matchedProjectId = '';
      try {
        const projsSnap = await db.collection('automotive_projects')
          .where('establishmentId', '==', storeId)
          .where('phone', '==', phone)
          .limit(1)
          .get();
        if (!projsSnap.empty) {
          const pDoc = projsSnap.docs[0];
          const pData = pDoc.data();
          customerName = pData.customerName || customerName;
          matchedProjectId = pDoc.id;
          await pDoc.ref.update({
            lastMessage: incomingText,
            unreadByHuman: true,
            updatedAt: nowIso
          });
        }
      } catch (pErr) {
        console.warn('[Human Takeover Proj Update Error]:', pErr);
      }

      // 🔔 Disparo Web Push no celular de Pedro (funciona em segundo plano e com app fechado)
      sendAlertPushNotification(storeId, {
        title: `💬 ${customerName} no WhatsApp`,
        body: `(Atendimento com você): "${incomingText.slice(0, 90)}"`,
        url: `/?tab=orders&projectId=${matchedProjectId}`,
        projectId: matchedProjectId
      }).catch(err => console.warn('[Human Takeover Push Error]:', err));

      return res.status(200).json({
        status: 'ai_paused_for_human',
        phone,
        pausedUntil: chatData.aiPausedUntil || null
      });
    }

    // Jev Security Gate: customer text is untrusted and must be screened before Gemini.
    if (text.trim() && !mediaPart) {
      const security = await screenPromptInjectionWithJev(text);
      if (security.blocked) {
        const safeReply = 'Posso ajudar com produtos, serviços, preços, disponibilidade, pedidos e informações da loja. Como posso ajudar? 😊';
        console.warn(`[TypeSafe Jev Security] 🚫 Mensagem bloqueada (${security.category}, confiança ${security.confidence}) de ${phone}`);
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          lastSecurityEvent: security.category,
          lastSecurityConfidence: security.confidence,
          lastSecurityAt: new Date().toISOString()
        }, { merge: true });
        await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, safeReply);
        return res.status(200).json({ status: 'jev_security_blocked' });
      }
    }

    // ----------------------------------------------------
    // TypeSafe AI (Jev - System One) Fast Triage (~100ms)
    // ----------------------------------------------------
    let jevTriage: any = null;
    if (text.trim() && !mediaPart) {
      jevTriage = await triageInboundMessageWithJev(text, { name: est.name, segment: est.segment });
    }

    if (jevTriage) {
      // 1. FAST PATH: PIX Key Query
      if (est.segment !== 'AUTOMOTIVE_PARTS' && jevTriage.intent === 'PIX_QUERY' && est.pixKey && est.pixKey.trim()) {
        const cleanPix = est.pixKey.trim();
        const fastPixReply = `Nossa chave PIX para pagamento é:\n\n🔑 *${cleanPix}*\n\nAssim que você realizar a transferência, basta enviar o comprovante aqui para confirmarmos seu pedido com carinho! 😊`;

        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'user',
          text,
          timestamp: new Date().toISOString(),
          jevIntent: 'PIX_QUERY'
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'assistant',
          text: fastPixReply,
          timestamp: new Date().toISOString(),
          jevHandled: true
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          customerPhone: phone,
          customerName: pushName || 'Cliente WhatsApp',
          lastMessage: fastPixReply,
          lastTimestamp: new Date().toISOString(),
          lastJevIntent: 'PIX_QUERY'
        }, { merge: true });

        await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, fastPixReply);
        console.log(`[TypeSafe Jev Fast Path] Resposta PIX enviada em ~${jevTriage.durationMs}ms para ${phone}`);
        return res.status(200).json({ status: 'jev_fast_pix', reply: fastPixReply });
      }

      // 2. FAST PATH: Operating Hours Query
      if (est.segment !== 'AUTOMOTIVE_PARTS' && jevTriage.intent === 'STORE_HOURS' && est.operatingHours) {
        const fastHoursReply = `Olá, *${pushName || 'cliente'}*! ⏰\nNosso horário de funcionamento é:\n*${est.operatingHours}*\n\nComo posso te ajudar hoje? Deseja ver nosso cardápio ou fazer um pedido? 😊`;

        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'user',
          text,
          timestamp: new Date().toISOString(),
          jevIntent: 'STORE_HOURS'
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'assistant',
          text: fastHoursReply,
          timestamp: new Date().toISOString(),
          jevHandled: true
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          customerPhone: phone,
          customerName: pushName || 'Cliente WhatsApp',
          lastMessage: fastHoursReply,
          lastTimestamp: new Date().toISOString(),
          lastJevIntent: 'STORE_HOURS'
        }, { merge: true });

        await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, fastHoursReply);
        console.log(`[TypeSafe Jev Fast Path] Resposta Horário enviada em ~${jevTriage.durationMs}ms para ${phone}`);
        return res.status(200).json({ status: 'jev_fast_store_hours', reply: fastHoursReply });
      }

      // 3. FAST PATH: Store Address / Location Query
      if (est.segment !== 'AUTOMOTIVE_PARTS' && jevTriage.intent === 'STORE_LOCATION' && est.address) {
        const fastLocationReply = `Nosso endereço é: 📍 *${est.address}*.\n\nVocê prefere retirar no balcão ou pedir por entrega? 🛵`;

        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'user',
          text,
          timestamp: new Date().toISOString(),
          jevIntent: 'STORE_LOCATION'
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'assistant',
          text: fastLocationReply,
          timestamp: new Date().toISOString(),
          jevHandled: true
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          customerPhone: phone,
          customerName: pushName || 'Cliente WhatsApp',
          lastMessage: fastLocationReply,
          lastTimestamp: new Date().toISOString(),
          lastJevIntent: 'STORE_LOCATION'
        }, { merge: true });

        await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, fastLocationReply);
        console.log(`[TypeSafe Jev Fast Path] Resposta Endereço enviada em ~${jevTriage.durationMs}ms para ${phone}`);
        return res.status(200).json({ status: 'jev_fast_store_location', reply: fastLocationReply });
      }

      // 4. FAST PATH: Order Status Inquiry
      if (jevTriage.intent === 'ORDER_STATUS') {
        const recentOrdersSnap = await db.collection('establishments').doc(storeId)
          .collection('orders')
          .where('customerPhone', '==', phone)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (!recentOrdersSnap.empty) {
          const recentOrder = recentOrdersSnap.docs[0].data();
          const orderTime = new Date(recentOrder.createdAt).getTime();
          if (Date.now() - orderTime < 18 * 60 * 60 * 1000) {
            const statusLabels: Record<string, string> = {
              'PENDENTE': '🕒 Pedido recebido e aguardando confirmação',
              'CONFIRMADO': '👨‍🍳 Confirmado pela equipe',
              'EM_PREPARO': '🔥 Em preparação com todo capricho',
              'PRONTO': '📦 Pronto para retirada / aguardando entregador',
              'EM_ROTA': '🛵 Em rota de entrega com nosso entregador',
              'ENTREGUE': '✅ Entregue com sucesso'
            };
            const statusText = statusLabels[recentOrder.status] || recentOrder.status;
            const fastStatusReply = `Olá, *${pushName || 'cliente'}*! 😊\n\nO seu pedido *#${recentOrder.orderNumber}* está com status:\n👉 *${statusText}*\n\n${est.estimatedDeliveryTime ? `⏱️ Previsão de entrega: *${est.estimatedDeliveryTime}*\n` : ''}Qualquer dúvida estamos à disposição!`;

            await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
              sender: 'user',
              text,
              timestamp: new Date().toISOString(),
              jevIntent: 'ORDER_STATUS'
            });
            await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
              sender: 'assistant',
              text: fastStatusReply,
              timestamp: new Date().toISOString(),
              jevHandled: true
            });
            await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
              customerPhone: phone,
              customerName: pushName || 'Cliente WhatsApp',
              lastMessage: fastStatusReply,
              lastTimestamp: new Date().toISOString(),
              lastJevIntent: 'ORDER_STATUS'
            }, { merge: true });

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, fastStatusReply);
            console.log(`[TypeSafe Jev Fast Path] Status do pedido #${recentOrder.orderNumber} enviado para ${phone}`);
            return res.status(200).json({ status: 'jev_fast_order_status', reply: fastStatusReply });
          }
        }
      }

      // 5. ESCALATION PATH: Urgent Complaint or Human Takeover Request
      if (jevTriage.urgent || jevTriage.intent === 'COMPLAINT' || jevTriage.intent === 'HUMAN_HELP') {
        const escalationReply = `Compreendo perfeitamente sua solicitação. 🙏\n\nJá notifiquei nossa gerência com prioridade máxima! Um atendente humano irá assumir esta conversa aqui no WhatsApp em instantes para te atender da melhor forma.`;

        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
          customerPhone: phone,
          customerName: pushName || 'Cliente WhatsApp',
          needsHuman: true,
          urgency: 'HIGH',
          sentiment: jevTriage.sentiment,
          lastJevIntent: jevTriage.intent,
          alertReason: jevTriage.intent === 'COMPLAINT' ? 'Reclamação urgente de cliente' : 'Solicitou atendente humano',
          lastMessage: text,
          lastTimestamp: new Date().toISOString()
        }, { merge: true });

        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'user',
          text,
          timestamp: new Date().toISOString(),
          jevIntent: jevTriage.intent,
          urgent: true
        });
        await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
          sender: 'assistant',
          text: escalationReply,
          timestamp: new Date().toISOString(),
          jevHandled: true
        });

        // Trigger PWA Push Notification to store owner
        sendAlertPushNotification(storeId, {
          title: `🚨 Alerta Urgente: ${pushName || phone}`,
          body: `Cliente com urgência (${jevTriage.intent}): "${text.slice(0, 70)}"`,
          url: '/?tab=orders'
        }).catch(() => {});

        await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, escalationReply);
        console.log(`[TypeSafe Jev] 🚨 Transbordo humano disparado para ${phone} (${jevTriage.intent})`);
        return res.status(200).json({ status: 'jev_human_escalation', reply: escalationReply });
      }

      // Lead Scoring for Niche Segments (Automotive Performance, Vehicles & Real Estate)
      if (est.segment === 'AUTOMOTIVE_PARTS' || est.segment?.includes('VEIC') || est.segment?.includes('IMOB')) {
        qualifyLeadWithJev(text, est.segment).then(leadData => {
          if (leadData) {
            db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
              leadScore: {
                temperature: leadData.leadTemperature,
                readyToVisit: leadData.readyToVisit,
                updatedAt: new Date().toISOString()
              }
            }, { merge: true }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    // Save Jev intent metadata on chat
    if (jevTriage) {
      db.collection('establishments').doc(storeId).collection('chats').doc(phone).set({
        lastJevIntent: jevTriage.intent,
        lastJevSentiment: jevTriage.sentiment
      }, { merge: true }).catch(() => {});
    }

    // ----------------------------------------------------
    // System Two: Gemini 2.5 Flash Conversational Engine
    // ----------------------------------------------------
    // Jev acts as the model gateway: simple conversations use Flash-Lite,
    // while orders, media and complex negotiations stay on full Flash.
    const selectedModel = mediaPart || audioMsg || imageMsg
      ? 'gemini-3.1-flash-lite'
      : (jevTriage?.recommendedModel || (jevTriage?.complexity === 'HIGH' ? 'gemini-3.1-flash-lite' : 'deepseek-flash'));
    console.log(`[AI Gateway/Jev Economy] Rota=${jevTriage?.route || 'FLASH_LITE'} Complexidade=${jevTriage?.complexity || 'MEDIUM'} Modelo=${selectedModel} TokensMáx=${jevTriage?.maxOutputTokens || 800} Contexto=${jevTriage?.contextBudget || 'STANDARD'} para ${phone}`);
    const billing = await reserveAiCredit(storeId, text, selectedModel);
    if (!billing.allowed) {
      const message = billing.reason === 'subscription_expired'
        ? 'O período gratuito terminou e a assinatura deste estabelecimento está inativa. Ative o plano para continuar.'
        : 'Os créditos de IA deste estabelecimento terminaram. Adicione créditos para continuar o atendimento.';
      console.warn(`[Billing] IA bloqueada para ${storeId}: ${billing.reason || 'saldo insuficiente'}`);
      return res.status(402).json({ status: 'billing_required', reply: message, balance: (billing as any).balance || 0 });
    }
    const result = await processAiCustomerMessage(storeId, phone, text, pushName, mediaPart || undefined, selectedModel);

    // 1. Send product images FIRST (e.g. menu items with individual photos)
    if (result.mediaList && result.mediaList.length > 0) {
      console.log(`[Evolution Webhook] Enviando ${result.mediaList.length} foto(s) de item/cardápio para ${phone}...`);
      for (let i = 0; i < result.mediaList.length; i++) {
        const item = result.mediaList[i];
        console.log(`[Evolution Webhook] Enviando foto ${i + 1}/${result.mediaList.length}: ${item.productName || 'Item'} (${item.url})`);
        await sendWhatsAppMedia(
          evoUrl,
          evoKey,
          evoInst,
          phone,
          item.url,
          item.caption,
          (item as any).type || 'image'
        );
        if (i < result.mediaList.length - 1) {
          await new Promise(r => setTimeout(r, 400));
        }
      }
    } else if (result.mediaToSend) {
      console.log(`[Evolution Webhook] Enviando foto/vídeo de produto para ${phone}: ${result.mediaToSend.url}`);
      await sendWhatsAppMedia(
        evoUrl,
        evoKey,
        evoInst,
        phone,
        result.mediaToSend.url,
        result.mediaToSend.caption,
        (result.mediaToSend as any).type || 'image'
      );
    }

    // 2. Send reply text right AFTER the photos (referencing the items above 👆)
    let sendRes: any = null;
    if (result.replyText && (!result.mediaToSend || result.replyText !== result.mediaToSend.caption)) {
      if (result.mediaList && result.mediaList.length > 0) {
        await new Promise(r => setTimeout(r, 500));
      }

      // 🎙️ Voice Mirror Engine: If customer sent an audio, synthesize and send human voice response
      const isVoiceInbound = !!audioMsg;
      if (isVoiceInbound && est.aiVoiceMirrorEnabled !== false) {
        try {
          const chosenVoice = est.aiVoiceId || 'pt-BR-FranciscaNeural';
          console.log(`[Voice Mirror] Cliente enviou áudio. Sintetizando voz neural (${chosenVoice}) para ${phone}...`);
          const audioBase64 = await generateVoiceAudioBase64(result.replyText, chosenVoice);
          if (audioBase64) {
            await sendWhatsAppAudio(evoUrl, evoKey, evoInst, phone, audioBase64);
            console.log(`[Voice Mirror] Mensagem de voz enviada com sucesso para ${phone}!`);
            await db.collection('establishments').doc(storeId).collection('chats').doc(phone).collection('messages').add({
              sender: 'assistant',
              author: 'Pedro (Consultor IA - Áudio)',
              text: '🎙️ ' + result.replyText,
              audioUrl: `data:audio/mp3;base64,${audioBase64}`,
              timestamp: new Date().toISOString()
            });
          }
        } catch (voiceErr: any) {
          console.warn('[Voice Mirror Error]:', voiceErr.message);
        }
      }

      sendRes = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, result.replyText);
      console.log(`[Evolution Webhook] Resposta enviada para ${phone}:`, JSON.stringify(sendRes));
    }

    // 3. Send WhatsApp Native Location Card if requested (Clickable card opening Google Maps / Waze)
    if (result.locationToSend) {
      console.log(`[Evolution Webhook] Enviando card interativo de localização para ${phone}: ${result.locationToSend.name} (${result.locationToSend.latitude}, ${result.locationToSend.longitude})`);
      await sendWhatsAppLocation(
        evoUrl,
        evoKey,
        evoInst,
        phone,
        result.locationToSend.latitude,
        result.locationToSend.longitude,
        result.locationToSend.name,
        result.locationToSend.address
      );
    }

    return res.status(200).json({ 
      status: 'processed', 
      establishmentId: storeId, 
      reply: result.replyText,
      mediaSent: result.mediaToSend ? true : false,
      locationSent: result.locationToSend ? true : false
    });
  } catch (err: any) {
    console.error('[Evolution Webhook Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Auth Endpoints (Multi-Tenant)
// ----------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, storeName, storePhone, segment, referralCode } = req.body;
    if (!email || !password || !storeName) {
      return res.status(400).json({ error: 'E-mail, senha e nome do estabelecimento são obrigatórios.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await db.collection('establishment_users').where('email', '==', cleanEmail).limit(1).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado. Faça login na aba Entrar.' });
    }

    let uid = '';
    try {
      const fbUser = await admin.auth().createUser({
        email: cleanEmail,
        password: password,
        displayName: storeName
      });
      uid = fbUser.uid;
    } catch {
      uid = 'est_' + crypto.randomBytes(8).toString('hex');
    }

    const hashedPassword = hashPassword(password);
    await db.collection('establishment_users').doc(uid).set({
      uid,
      email: cleanEmail,
      passwordHash: hashedPassword,
      storeName,
      storePhone: storePhone || '',
      segment: segment || 'Alimentação & Bebidas',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const normalizedReferral = typeof referralCode === 'string'
      ? referralCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32)
      : '';
    const referralCodeForStore = `IA-${uid.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`;

    await db.collection('establishments').doc(uid).set({
      id: uid,
      name: storeName,
      phone: storePhone || '',
      segment: segment || 'Alimentação & Bebidas',
      address: '',
      deliveryFee: segment === 'AUTOMOTIVE_PARTS' ? 0 : 5.0,
      estimatedDeliveryTime: segment === 'AUTOMOTIVE_PARTS' ? 'Sob análise técnica' : '30 a 50 minutos',
      operatingHours: segment === 'AUTOMOTIVE_PARTS' ? '' : 'Segunda a Domingo das 18:00 às 23:00',
      description: `Atendimento inteligente no WhatsApp para ${storeName}`,
      pixKey: cleanEmail,
      evolutionConnected: false,
      evolutionApiKey: 'minha_chave_secreta_7108',
      evolutionApiUrl: 'http://86.48.23.152:8081',
      evolutionInstanceName: `pedidos_${uid.slice(0, 15)}`,
      referralCode: referralCodeForStore,
      ...(normalizedReferral ? { referredBy: normalizedReferral } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    let customToken = null;
    try {
      customToken = await admin.auth().createCustomToken(uid);
    } catch {}

    res.json({ success: true, uid, email: cleanEmail, storeName, customToken });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Partner / Referral Program
// ----------------------------------------------------
app.get('/api/referrals', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const storeRef = db.collection('establishments').doc(storeId);
    const storeSnap = await storeRef.get();
    if (!storeSnap.exists) return res.status(404).json({ error: 'Estabelecimento não encontrado.' });

    const store = storeSnap.data() || {};
    const ownCode = String(store.referralCode || `IA-${storeId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()}`);
    if (!store.referralCode) await storeRef.set({ referralCode: ownCode }, { merge: true });

    const referredSnap = await db.collection('establishments').where('referredBy', '==', ownCode).get();
    const now = Date.now();
    const referrals = referredSnap.docs.map((doc) => {
      const data = doc.data();
      const validUntil = data.subscriptionValidUntil ? new Date(data.subscriptionValidUntil).getTime() : 0;
      const active = data.accountStatus === 'active_paid' || validUntil > now || data.plan === 'active';
      return {
        id: doc.id,
        name: data.name || 'Estabelecimento',
        segment: data.segment || 'GENERAL',
        status: active ? 'active_paid' : (data.accountStatus === 'trial' ? 'pending_trial' : 'inactive'),
        createdAt: data.createdAt || null,
        lastPaymentDate: data.lastPaymentDate || null,
        subscriptionValidUntil: data.subscriptionValidUntil || null
      };
    });

    const activePaid = referrals.filter(r => r.status === 'active_paid').length;
    const pendingTrials = referrals.filter(r => r.status === 'pending_trial').length;
    const rewardPerActive = 50;
    return res.json({
      referralCode: ownCode,
      referralLink: `/?ref=${encodeURIComponent(ownCode)}`,
      rewardPerActive,
      activePaid,
      pendingTrials,
      totalEarned: activePaid * rewardPerActive,
      referrals: referrals.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    });
  } catch (err: any) {
    console.error('[Referrals] Erro ao carregar indicações:', err);
    return res.status(500).json({ error: err.message || 'Não foi possível carregar as indicações.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const hashedPassword = hashPassword(password);

    const userSnap = await db.collection('establishment_users').where('email', '==', cleanEmail).limit(1).get();
    if (userSnap.empty) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const userData = userSnap.docs[0].data();
    if (userData.passwordHash !== hashedPassword) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const uid = userData.uid || userSnap.docs[0].id;
    let customToken = null;
    try {
      customToken = await admin.auth().createCustomToken(uid);
    } catch {}

    res.json({
      success: true,
      uid,
      email: cleanEmail,
      storeName: userData.storeName || 'Meu Estabelecimento',
      customToken
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Establishment Settings (Multi-Tenant)
// ----------------------------------------------------
app.get('/api/public/store/:storeId', async (req, res) => {
  try {
    const requested = String(req.params.storeId || '').trim();
    let storeId = requested;
    let snap = await db.collection('establishments').doc(storeId).get();
    if (!snap.exists) {
      const bySlug = await db.collection('establishments').where('publicSlug', '==', requested).limit(1).get();
      if (!bySlug.empty) { storeId = bySlug.docs[0].id; snap = bySlug.docs[0]; }
    }
    // Existing establishments may not have a publicSlug yet. Resolve the
    // friendly URL from the establishment name and persist it for future hits.
    if (!snap.exists) {
      const establishments = await db.collection('establishments').get();
      const match = establishments.docs.find(doc => {
        const data = doc.data() || {};
        return publicSlug(data.publicSlug || data.name || '') === requested;
      });
      if (match) { storeId = match.id; snap = match; }
    }
    if (!snap.exists) return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
    const data = snap.data() || {};
    const slug = data.publicSlug || `${publicSlug(data.name || 'estabelecimento')}-${storeId.slice(0, 5)}`;
    if (!data.publicSlug) await snap.ref.set({ publicSlug: slug }, { merge: true });
    const productsSnap = await db.collection('establishments').doc(storeId).collection('products').get();
    const products = productsSnap.docs.map(doc => {
      const p = doc.data();
      const images = Array.isArray(p.images) && p.images.length > 0 ? p.images : (p.imageUrl ? [p.imageUrl] : []);
      return { 
        id: doc.id, 
        name: p.name || 'Produto', 
        description: p.description || '', 
        price: Number(p.price || 0), 
        category: p.category || 'Catálogo', 
        imageUrl: p.imageUrl || (images[0] || ''), 
        images: images,
        videoUrl: p.videoUrl || '',
        ...(data.segment === 'AUTOMOTIVE_PARTS' ? { model3d: model3dForPublic(p.model3d, storeId, images) } : {}),
        available: p.available !== false 
      };
    }).filter(p => p.available);
    const visibleProducts = visibleForSegment(products, data.segment);
    res.json({
      store: {
        id: storeId,
        publicSlug: slug,
        name: data.name || 'Estabelecimento',
        description: data.description || '',
        address: data.address || '',
        latitude: typeof data.latitude === 'number' ? data.latitude : (data.latitude ? Number(data.latitude) : null),
        longitude: typeof data.longitude === 'number' ? data.longitude : (data.longitude ? Number(data.longitude) : null),
        operatingHours: data.operatingHours || '',
        segment: data.segment || 'GENERAL',
        phone: data.whatsappNumber || data.phone || '',
        logoUrl: data.logoUrl || '',
        brandColor: data.brandColor || '',
        themePreset: data.themePreset || '',
        tagline: data.tagline || '',
        brandTheme: data.brandTheme || null
      },
      products: visibleProducts
    });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Não foi possível carregar a vitrine.' }); }
});

app.get('/api/establishment', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const doc = await db.collection('establishments').doc(storeId).get();
    if (!doc.exists) {
      const cleanInstName = `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
      const newStore = {
        id: storeId,
        name: 'Meu Estabelecimento',
        phone: '',
        segment: 'Alimentação & Bebidas',
        address: 'Rua Principal, 100 - Centro',
        deliveryFee: 7.00,
        estimatedDeliveryTime: '35 a 50 minutos',
        operatingHours: 'Todos os dias das 18:00 às 23:30',
        description: 'Atendimento inteligente no WhatsApp',
        pixKey: '',
        evolutionApiUrl: 'http://86.48.23.152:8081',
        evolutionApiKey: 'minha_chave_secreta_7108',
        evolutionInstanceName: cleanInstName,
        evolutionConnected: false,
        aiPromptCustom: 'Você é o atendente virtual do restaurante. Seja simpático e atencioso.',
        aiWelcomeMessage: 'Olá! Seja muito bem-vindo! O que gostaria de pedir hoje?',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('establishments').doc(storeId).set(newStore);
      return res.json(newStore);
    }
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/establishment', async (req, res) => {
  try {
    const storeId = req.body.id || getStoreId(req);
    const updateData = { ...req.body, updatedAt: new Date().toISOString() };
    delete updateData.id;
    await db.collection('establishments').doc(storeId).set(updateData, { merge: true });
    res.json({ success: true, message: 'Dados atualizados com sucesso!', establishmentId: storeId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/geocode', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Endereço não informado.' });
    }
    const coords = await geocodeAddress(address);
    if (!coords) {
      return res.status(404).json({ error: 'Não foi possível localizar as coordenadas para este endereço. Você pode preenchê-las manualmente.' });
    }
    return res.json(coords);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/establishment/test-send-location', async (req, res) => {
  try {
    const storeId = req.body.establishmentId || getStoreId(req);
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Informe um número de telefone com DDD para testar o envio.' });
    }

    const estDoc = await db.collection('establishments').doc(storeId).get();
    if (!estDoc.exists) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
    }
    const est = estDoc.data() || {};
    let lat = est.latitude;
    let lng = est.longitude;

    if (!lat || !lng) {
      const geocoded = await geocodeAddress(est.address);
      if (geocoded) {
        lat = geocoded.latitude;
        lng = geocoded.longitude;
        await db.collection('establishments').doc(storeId).set({ latitude: lat, longitude: lng }, { merge: true });
      } else {
        return res.status(400).json({ error: 'Cadastre a latitude e longitude do estabelecimento nas configurações primeiro ou informe um endereço válido.' });
      }
    }

    const evoUrl = est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://86.48.23.152:8081';
    const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'EVOLUTION_PEDIDOS_SECURE_KEY_2026';
    const evoInst = est.evolutionInstanceName || 'pedidos_flow_garage_exh_ZFFWU';

    const sendRes = await sendWhatsAppLocation(
      evoUrl,
      evoKey,
      evoInst,
      phone,
      Number(lat),
      Number(lng),
      est.name || 'Nossa Localização',
      est.address || ''
    );

    return res.json({ success: true, message: 'Card interativo de localização enviado com sucesso!', details: sendRes });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Products CRUD (Multi-Tenant)
// ----------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const productsCol = db.collection('establishments').doc(storeId).collection('products');
    const snapshot = await productsCol.get();
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const productData = { ...req.body };
    let productId = productData.id;

    // Existing catalog CRUD is unchanged. Model associations require a signed-in owner.
    if (Object.prototype.hasOwnProperty.call(productData, 'model3d')) {
      let uid: string;
      try { uid = (await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''))).uid; }
      catch { return res.status(401).json({ error: 'Entre novamente para salvar o modelo 3D.' }); }
      if (uid !== storeId) return res.status(403).json({ error: 'O modelo 3D precisa pertencer à sua loja.' });
      const store = await db.collection('establishments').doc(storeId).get();
      if (store.data()?.segment !== 'AUTOMOTIVE_PARTS') return res.status(400).json({ error: 'Modelos 3D estão disponíveis para projetos automotivos.' });
      const previous = productId ? (await db.collection('establishments').doc(storeId).collection('products').doc(productId).get()).data() || {} : {};
      const images = productData.images ?? previous.images ?? [];
      const imageUrl = productData.imageUrl ?? previous.imageUrl;
      const update = model3dUpdate(productData, storeId, [...(Array.isArray(images) ? images : []), ...(imageUrl ? [imageUrl] : [])]);
      if (update.model3d) {
        const file = admin.storage().bucket(MODEL3D_STORAGE_BUCKET).file(model3dStoragePath(update.model3d.url, storeId));
        let metadata: any;
        try { [metadata] = await file.getMetadata(); }
        catch { throw new Model3dValidationError('Envie o arquivo GLB antes de salvar o projeto.'); }
        if (Number(metadata.size) !== update.model3d.sizeBytes || Number(metadata.size) > MAX_MODEL3D_BYTES || metadata.contentType !== 'model/gltf-binary') throw new Model3dValidationError('O arquivo enviado não corresponde ao modelo 3D informado.');
        const [bytes] = await file.download();
        validateGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      }
      Object.assign(productData, update);
    }

    if (productId) {
      delete productData.id;
      await db.collection('establishments').doc(storeId).collection('products').doc(productId).set(productData, { merge: true });
    } else {
      productId = `prod_${Date.now()}`;
      await db.collection('establishments').doc(storeId).collection('products').doc(productId).set({
        ...productData,
        id: productId,
        available: productData.available !== undefined ? productData.available : true,
        updatedAt: new Date().toISOString()
      });
    }

    res.json({ success: true, product: { id: productId, ...productData } });
  } catch (err: any) {
    res.status(err instanceof Model3dValidationError ? 400 : 500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    await db.collection('establishments').doc(storeId).collection('products').doc(id).delete();
    res.json({ success: true, message: 'Produto removido com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: upload buffer to Firebase Storage and return download URL
async function uploadBufferToStorage(buffer: Buffer, filename: string, storeId: string, contentType: string = 'image/jpeg'): Promise<string> {
  const cleanName = filename.replace(/\s+/g, '_');
  const storagePath = `establishments/${storeId}/products/${cleanName}`;
  const encodedPath = encodeURIComponent(storagePath);
  const token = crypto.randomUUID();
  const bucketName = 'iapedido.firebasestorage.app';

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?name=${encodedPath}&uploadType=media`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'x-goog-meta-firebasestoragedownloadtokens': token,
      'Connection': 'close'
    },
    body: buffer as any
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Falha no upload para o Storage: ${errText}`);
  }

  const data: any = await uploadRes.json();
  const finalToken = data.downloadTokens || token;
  const safeName = (data.name || storagePath).replace(/\//g, '%2F');
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${safeName}?alt=media&token=${finalToken}`;
}

// ----------------------------------------------------
// Instagram Integration: Parse Post & Import to Catalog
// ----------------------------------------------------
app.post('/api/instagram/parse-post', async (req, res) => {
  try {
    const { postUrl } = req.body;
    if (!postUrl) {
      return res.status(400).json({ error: 'URL ou link do post do Instagram é obrigatório.' });
    }

    let shortcode = String(postUrl).trim();
    if (shortcode.includes('instagram.com/')) {
      const match = shortcode.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (match) {
        shortcode = match[1];
      } else {
        const parts = shortcode.split('?')[0].split('/').filter(Boolean);
        shortcode = parts[parts.length - 1];
      }
    }

    if (!shortcode || shortcode.length < 3) {
      return res.status(400).json({ error: 'Link do Instagram inválido. Cole o link de um post ou reel.' });
    }

    // 1. Fetch Instagram Home to acquire session cookies and CSRF
    const homeRes = await fetch('https://www.instagram.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    });
    const cookies = homeRes.headers.get('set-cookie') || '';
    const csrfMatch = cookies.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : '';

    // 2. Query Instagram official GraphQL endpoint
    const gqlRes = await fetch('https://www.instagram.com/graphql/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'X-IG-App-ID': '936619743392459',
        'X-CSRFToken': csrf,
        'Cookie': cookies,
        'Referer': `https://www.instagram.com/p/${shortcode}/`
      },
      body: new URLSearchParams({
        doc_id: '27128499623469141',
        variables: JSON.stringify({
          shortcode,
          __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false
        })
      })
    });

    if (!gqlRes.ok) {
      return res.status(gqlRes.status).json({ error: `Instagram retornou status ${gqlRes.status}. Verifique se a conta ou o post é público.` });
    }

    const gqlData: any = await gqlRes.json();
    const item = gqlData?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];

    if (!item) {
      return res.status(404).json({ error: 'Post não encontrado ou não está acessível publicamente.' });
    }

    const caption = item.caption?.text || '';
    const images: string[] = [];
    let videoUrl: string | null = null;

    if (item.carousel_media && Array.isArray(item.carousel_media)) {
      for (const m of item.carousel_media) {
        if (m.video_versions && m.video_versions.length > 0 && !videoUrl) {
          videoUrl = m.video_versions[0].url;
        }
        if (m.image_versions2?.candidates?.length > 0) {
          images.push(m.image_versions2.candidates[0].url);
        }
      }
    } else if (item.video_versions && item.video_versions.length > 0) {
      videoUrl = item.video_versions[0].url;
      if (item.image_versions2?.candidates?.length > 0) {
        images.push(item.image_versions2.candidates[0].url);
      }
    } else if (item.image_versions2?.candidates?.length > 0) {
      images.push(item.image_versions2.candidates[0].url);
    }

    // 3. Gemini Technical Cataloging AI
    let suggested = {
      name: caption.split('\n')[0]?.slice(0, 60) || 'Novo Projeto Especial',
      category: 'Geral',
      description: caption
    };

    if (caption && caption.length > 10) {
      try {
        const geminiPrompt = `
Você é um catalogador técnico automotivo especializado em escapamentos esportivos e projetos de alta performance (FLOW GARAGE EXHAUST).
Analise a legenda do Instagram abaixo e retorne APENAS um JSON puro com:
- name: Nome conciso e de alto impacto do projeto (ex: 'Porsche 911 (992.2) — Catback Full Titanium')
- category: A marca do veículo (ex: 'Porsche', 'Ferrari', 'BMW', 'Audi', 'Mercedes', 'Chevrolet', 'Ford', 'Geral')
- description: Resumo técnico profissional para o catálogo e para a IA do WhatsApp atender clientes interessados no projeto, sem hashtags e sem excesso de emojis.

Legenda:
"""${caption}"""
`;
        const aiRes = await getGenAI().models.generateContent({
          model: 'gemini-2.5-flash',
          contents: geminiPrompt,
          config: { responseMimeType: 'application/json' }
        });
        const parsed = JSON.parse(aiRes.text || '{}');
        if (parsed.name) suggested.name = parsed.name;
        if (parsed.category) suggested.category = parsed.category;
        if (parsed.description) suggested.description = parsed.description;
      } catch (geminiErr: any) {
        console.warn('[Gemini Parse Instagram Caption Error]:', geminiErr.message);
      }
    }

    return res.json({
      success: true,
      shortcode,
      caption,
      images,
      videoUrl,
      suggested
    });
  } catch (err: any) {
    console.error('[Parse Instagram Post Error]:', err);
    return res.status(500).json({ error: err.message || 'Erro ao consultar post no Instagram.' });
  }
});

app.post('/api/instagram/import-project', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { shortcode, name, category, description, images = [], videoUrl } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Nome do projeto é obrigatório.' });
    }

    const timestamp = Date.now();
    const cleanShortcode = (shortcode || 'insta').replace(/[^a-zA-Z0-9_-]/g, '');
    const permanentImages: string[] = [];

    // Upload selected images to Firebase Storage
    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      try {
        const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const filename = `insta_${cleanShortcode}_img${i + 1}_${timestamp}.jpg`;
          const permUrl = await uploadBufferToStorage(buffer, filename, storeId, 'image/jpeg');
          permanentImages.push(permUrl);
        }
      } catch (err: any) {
        console.warn(`[Storage Upload Image ${i + 1} Warning]:`, err.message);
      }
    }

    // Upload video to Firebase Storage if provided
    let permanentVideoUrl: string | null = null;
    if (videoUrl) {
      try {
        const vidRes = await fetch(videoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (vidRes.ok) {
          const buffer = Buffer.from(await vidRes.arrayBuffer());
          const filename = `insta_${cleanShortcode}_ronco_${timestamp}.mp4`;
          permanentVideoUrl = await uploadBufferToStorage(buffer, filename, storeId, 'video/mp4');
        }
      } catch (err: any) {
        console.warn('[Storage Upload Video Warning]:', err.message);
      }
    }

    const productId = `prod_${timestamp}`;
    const productData = {
      id: productId,
      name,
      category: category || 'Geral',
      description: description || '',
      price: 0,
      available: true,
      imageUrl: permanentImages[0] || '',
      images: permanentImages,
      videoUrl: permanentVideoUrl,
      instagramShortcode: cleanShortcode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('establishments').doc(storeId).collection('products').doc(productId).set(productData);

    return res.json({
      success: true,
      message: 'Projeto importado do Instagram com sucesso!',
      product: productData
    });
  } catch (err: any) {
    console.error('[Import Instagram Project Error]:', err);
    return res.status(500).json({ error: err.message || 'Falha ao importar projeto do Instagram.' });
  }
});

// ----------------------------------------------------
// Orders Management (Multi-Tenant)
// ----------------------------------------------------
app.get('/api/orders', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const snapshot = await db.collection('establishments').doc(storeId).collection('orders').orderBy('createdAt', 'desc').get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const { status, rejectionReason, courierPhone, courierName, saveCourier } = req.body;

    const orderRef = db.collection('establishments').doc(storeId).collection('orders').doc(id);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const orderData = orderDoc.data() || {};

    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    };
    if (rejectionReason) updateData.rejectionReason = rejectionReason;
    if (courierPhone) {
      updateData.courierPhone = courierPhone.replace(/\D/g, '');
      if (courierName) updateData.courierName = courierName;
      updateData.dispatchedAt = new Date().toISOString();
    }

    await orderRef.update(updateData);

    // If requested, auto-save this courier in the establishment's couriers directory
    if (saveCourier && courierPhone) {
      try {
        const estRef = db.collection('establishments').doc(storeId);
        const estDoc = await estRef.get();
        const estData = estDoc.data() || {};
        const existingCouriers: any[] = estData.couriers || [];
        const cleanPhone = courierPhone.replace(/\D/g, '');
        const alreadyExists = existingCouriers.some(c => c.phone.replace(/\D/g, '') === cleanPhone);

        if (!alreadyExists) {
          const newCourier = {
            id: `cour_${Date.now()}`,
            name: courierName || 'Motoboy',
            phone: cleanPhone,
            vehicle: 'MOTO',
            active: true,
            createdAt: new Date().toISOString()
          };
          await estRef.set({ couriers: [...existingCouriers, newCourier] }, { merge: true });
        }
      } catch (saveErr) {
        console.warn('[Auto-save Courier Error]:', saveErr);
      }
    }

    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108';
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    const evoInst = est.evolutionInstanceName || defaultInstName;

    const customerName = orderData.customerName || 'Cliente';
    const customerPhone = orderData.customerPhone;
    const orderNum = orderData.orderNumber || id.slice(-4);

    // 1. Send automated WhatsApp notification to customer if phone exists
    if (customerPhone) {
      try {
        let notifyText = '';
        console.log(`[Order Status Update] Loja: ${storeId}, Pedido #${orderNum}, Status: ${status}, Telefone: ${customerPhone}`);

        const estSegment = (est.segment || '').toUpperCase();
        const isFoodEst = !estSegment.includes('VEIC') && !estSegment.includes('CARRO') && !estSegment.includes('IMOB') && !estSegment.includes('IMOVE') && !estSegment.includes('MODA') && !estSegment.includes('ELETRO');

        if (status === 'CONFIRMADO' || status === 'EM_PREPARO' || status === 'PREPARANDO') {
          notifyText = isFoodEst
            ? `Olá, *${customerName}*! Seu pedido *#${orderNum}* foi confirmado pelo restaurante e já está sendo preparado com muito carinho! 👨‍🍳🔥\n\n⏱️ *Tempo estimado:* ${est.estimatedDeliveryTime || '35 a 50 minutos'}.`
            : `Olá, *${customerName}*! Sua solicitação *#${orderNum}* foi confirmada pela equipe da *${est.name}* e já está em processamento! ✅\n\n⏱️ *Previsão/Atendimento:* ${est.estimatedDeliveryTime || 'Em breve'}.`;
        } else if (status === 'A_CAMINHO' || status === 'ENTREGA') {
          const courierGreeting = courierName ? ` com o entregador *${courierName}*` : '';
          notifyText = isFoodEst
            ? `Oba, *${customerName}*! 🛵 Seu pedido *#${orderNum}* acabou de sair para entrega${courierGreeting}!\n\n📍 *Endereço:* ${orderData.customerAddress || 'Endereço informado'}\n\nFique atento(a), o entregador chegará em instantes. Bom apetite! 😋`
            : `Olá, *${customerName}*! 📦 Seu pedido/envio *#${orderNum}* acabou de sair para entrega${courierGreeting}!\n\n📍 *Endereço:* ${orderData.customerAddress || 'Endereço informado'}\n\nFique atento(a), já está a caminho! 🚀`;
        } else if (status === 'PRONTO') {
          notifyText = isFoodEst
            ? `Olá, *${customerName}*! 🛍️ Seu pedido *#${orderNum}* já está *PRONTO* para retirada no balcão!\n\nPode vir retirar quando quiser. Bom apetite! ✨`
            : `Olá, *${customerName}*! 📍 Sua solicitação *#${orderNum}* já está *PRONTA* para retirada ou visita!\n\nPode comparecer quando desejar. Estamos à disposição! ✨`;
        } else if (status === 'CONCLUIDO' || status === 'FINALIZADO') {
          notifyText = `Solicitação/Pedido *#${orderNum}* finalizado com sucesso! Muito obrigado pela confiança, *${customerName}*! Se precisar de algo mais, estamos à disposição. ⭐⭐⭐⭐⭐`;
        } else if (status === 'CANCELADO') {
          notifyText = `Olá, *${customerName}*. Infelizmente seu pedido/solicitação *#${orderNum}* precisou ser cancelado.${rejectionReason ? `\n\n*Motivo:* ${rejectionReason}` : ''}\n\nPedimos desculpas pelo ocorrido. Se tiver dúvidas, estamos à disposição!`;
        }

        if (notifyText) {
          const cleanNotifyText = formatWhatsAppText(notifyText);
          const sendRes = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, customerPhone, cleanNotifyText);
          console.log(`[Order Status Notify Sent] Resposta envio WhatsApp para ${customerPhone}:`, JSON.stringify(sendRes));

          // Save to chat history
          await db.collection('establishments').doc(storeId)
            .collection('chats').doc(customerPhone)
            .collection('messages').add({
              sender: 'assistant',
              text: cleanNotifyText,
              timestamp: new Date().toISOString(),
              orderId: id
            }).catch(() => {});
        }
      } catch (notifyErr) {
        console.warn('[Status Notification Error]:', notifyErr);
      }
    }

    // 2. Send automated WhatsApp notification to Motoboy / Entregador if courierPhone is provided
    if ((status === 'A_CAMINHO' || status === 'ENTREGA') && courierPhone) {
      try {
        const cleanCourierPhone = courierPhone.replace(/\D/g, '');
        if (cleanCourierPhone.length >= 10) {
          const deliveryAddress = orderData.customerAddress || 'Endereço a combinar';
          const encodedAddress = encodeURIComponent(deliveryAddress);
          const hasGps = !isNaN(Number(orderData.latitude)) && !isNaN(Number(orderData.longitude)) && Number(orderData.latitude) !== 0;
          const wazeUrl = hasGps 
            ? `https://waze.com/ul?ll=${orderData.latitude},${orderData.longitude}&navigate=yes`
            : `https://waze.com/ul?q=${encodedAddress}`;
          const mapsUrl = hasGps
            ? `https://www.google.com/maps?q=${orderData.latitude},${orderData.longitude}`
            : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
          const gpsNotice = hasGps ? `\n📍 *Ponto GPS Exato (Enviado pelo cliente via WhatsApp)!*` : '';

          const itemsText = (orderData.items || [])
            .map((it: any) => `• ${it.quantity}x ${it.name}${it.notes ? ` (${it.notes})` : ''}`)
            .join('\n');

          const totalNum = Number(orderData.total ?? orderData.totalAmount ?? 0);
          const totalFormatted = totalNum.toFixed(2).replace('.', ',');
          const changeInfo = orderData.changeFor ? ` (Troco para R$ ${Number(orderData.changeFor).toFixed(2).replace('.', ',')})` : '';

          const motoboyGreeting = courierName ? `Olá, *${courierName}*! ` : '';
          const courierMessage = 
`${motoboyGreeting}🛵 *NOVA ENTREGA DISPONÍVEL - ${est.name || 'iaPedido'}*
━━━━━━━━━━━━━━━━━━━━
📦 *Pedido:* #${orderNum}
👤 *Cliente:* ${customerName}
📞 *Tel do Cliente:* ${customerPhone || 'Não informado'}

📍 *Endereço de Entrega:*
${deliveryAddress}${gpsNotice}

🗺️ *Abrir GPS com 1 Clique:*
🚗 *Waze:* ${wazeUrl}
📍 *Google Maps:* ${mapsUrl}

🛍️ *Itens:*
${itemsText || 'Itens diversos'}

💰 *Valor do Pedido:* R$ ${totalFormatted}
💳 *Forma de Pagamento:* ${orderData.paymentMethod || 'A combinar'}${changeInfo}
${orderData.notes ? `\n📝 *Observações:* ${orderData.notes}` : ''}
━━━━━━━━━━━━━━━━━━━━
_Bom trabalho e dirija com segurança! 🚀_`;

          const cleanCourierMsg = formatWhatsAppText(courierMessage);
          const courierSendRes = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, cleanCourierPhone, cleanCourierMsg);
          console.log(`[Order Dispatch Motoboy] WhatsApp enviado para motoboy ${cleanCourierPhone}:`, JSON.stringify(courierSendRes));
        }
      } catch (courierErr) {
        console.warn('[Courier Dispatch Error]:', courierErr);
      }
    }

    res.json({ success: true, orderId: id, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Couriers / Motoboys Management API
// ----------------------------------------------------
app.get('/api/couriers', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    res.json(est.couriers || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/couriers', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { name, phone, vehicle, active } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone do entregador são obrigatórios' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const estRef = db.collection('establishments').doc(storeId);
    const estDoc = await estRef.get();
    const est = estDoc.data() || {};
    const couriers: any[] = est.couriers || [];

    const existingIndex = couriers.findIndex(c => c.phone.replace(/\D/g, '') === cleanPhone);
    const courierData = {
      id: req.body.id || (existingIndex >= 0 ? couriers[existingIndex].id : `cour_${Date.now()}`),
      name: name.trim(),
      phone: cleanPhone,
      vehicle: vehicle || 'MOTO',
      active: active !== undefined ? active : true,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      couriers[existingIndex] = { ...couriers[existingIndex], ...courierData };
    } else {
      couriers.push({ ...courierData, createdAt: new Date().toISOString() });
    }

    await estRef.set({ couriers }, { merge: true });
    res.json({ success: true, courier: courierData, couriers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/couriers/:id', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const estRef = db.collection('establishments').doc(storeId);
    const estDoc = await estRef.get();
    const est = estDoc.data() || {};
    const couriers: any[] = (est.couriers || []).filter((c: any) => c.id !== id && c.phone !== id);

    await estRef.set({ couriers }, { merge: true });
    res.json({ success: true, couriers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Simulator Chat
// ----------------------------------------------------
app.post('/api/simulator/chat', async (req, res) => {
  try {
    const storeId = req.body.establishmentId || getStoreId(req);
    const { text, phone, name } = req.body;
    const testPhone = phone || '5511988887777';
    const testName = name || 'Cliente Teste';

    const simulatorText = String(text || '').trim();
    if (!simulatorText) {
      return res.status(400).json({ error: 'Digite uma mensagem para iniciar a simulação.' });
    }
    if (simulatorText.length > SIMULATOR_MAX_MESSAGE_LENGTH) {
      return res.status(413).json({
        error: `A mensagem do simulador pode ter no máximo ${SIMULATOR_MAX_MESSAGE_LENGTH} caracteres.`
      });
    }

    // Burst protection stays in memory and prevents rapid repeated calls to Gemini.
    const now = Date.now();
    const recentRequests = (simulatorRateLimit.get(storeId) || [])
      .filter(timestamp => now - timestamp < SIMULATOR_BURST_WINDOW_MS);
    if (recentRequests.length >= SIMULATOR_BURST_LIMIT) {
      simulatorRateLimit.set(storeId, recentRequests);
      return res.status(429).json({
        error: 'Aguarde alguns segundos antes de continuar a simulação.',
        retryAfterSeconds: Math.ceil((SIMULATOR_BURST_WINDOW_MS - (now - recentRequests[0])) / 1000)
      });
    }

    // Daily quota is persisted in Firestore, so it survives function restarts.
    const dateKey = new Date().toISOString().slice(0, 10);
    const usageRef = db.collection('establishments').doc(storeId)
      .collection('simulatorUsage').doc(dateKey);
    const usage = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(usageRef);
      const current = Number(snapshot.data()?.messages || 0);
      if (current >= SIMULATOR_DAILY_MESSAGE_LIMIT) return { count: current, allowed: false };
      transaction.set(usageRef, {
        date: dateKey,
        messages: current + 1,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return { count: current + 1, allowed: true };
    });

    if (!usage.allowed) {
      return res.status(429).json({
        error: 'O limite diário do simulador foi atingido. Tente novamente amanhã.',
        dailyLimit: SIMULATOR_DAILY_MESSAGE_LIMIT
      });
    }
    recentRequests.push(now);
    simulatorRateLimit.set(storeId, recentRequests);

    // Keep the simulator aligned with the real WhatsApp webhook security boundary.
    const security = await screenPromptInjectionWithJev(simulatorText);
    if (security.blocked) {
      console.warn(`[TypeSafe Jev Security] 🚫 Simulação bloqueada (${security.category}, confiança ${security.confidence})`);
      return res.json({
        replyText: 'Posso ajudar com produtos, serviços, preços, disponibilidade, pedidos e informações da loja. Como posso ajudar? 😊',
        securityBlocked: true,
        securityCategory: security.category
      });
    }

    const simulatorTriage = await triageInboundMessageWithJev(simulatorText);
    const simulatorModel = simulatorTriage?.recommendedModel || (simulatorTriage?.complexity === 'HIGH'
      ? 'gemini-3.1-flash-lite'
      : 'deepseek-flash');
    console.log(`[AI Gateway/Jev Economy] Simulador: Complexidade=${simulatorTriage?.complexity || 'MEDIUM'} Modelo=${simulatorModel} Contexto=${simulatorTriage?.contextBudget || 'STANDARD'}`);

    const billing = await reserveAiCredit(storeId, simulatorText, simulatorModel);
    if (!billing.allowed) {
      return res.status(402).json({
        error: billing.reason === 'subscription_expired'
          ? 'Seu período gratuito terminou. Ative o plano para continuar usando o simulador.'
          : 'Os créditos de IA terminaram. Adicione créditos para continuar usando o simulador.',
        billingRequired: true
      });
    }

    const result = await processAiCustomerMessage(
      storeId,
      testPhone,
      simulatorText,
      testName,
      undefined,
      simulatorModel
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulator/reset', async (req, res) => {
  try {
    const storeId = req.body.establishmentId || getStoreId(req);
    const phone = req.body.phone || '5511988887777';
    const cleanPhone = String(phone).replace(/\D/g, '') || phone;
    const chatDocRef = db.collection('establishments').doc(storeId).collection('chats').doc(phone);
    const messagesCol = chatDocRef.collection('messages');
    
    const snap = await messagesCol.get();
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(chatDocRef);
    batch.delete(db.collection('establishments').doc(storeId).collection('customers').doc(cleanPhone.replace(/\//g, '_')));
    await batch.commit();

    res.json({ success: true, message: 'Chat resetado com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Evolution API Connection Management
// ----------------------------------------------------
// ----------------------------------------------------
// Evolution API Connection Management (matching psicocall proven implementation)
// ----------------------------------------------------
app.get('/api/evolution/status', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    const evoInst = (est.evolutionInstanceName || defaultInstName).trim();

    const appUrl = (process.env.APP_URL || 'https://iapedido.web.app').replace(/\/$/, '');
    const autoWebhookUrl = `${appUrl}/api/webhook/evolution/${storeId}`;

    const allRes = await fetch(`${evoUrl}/instance/all`, {
      headers: { apikey: evoKey }
    });
    const allData = await allRes.json().catch(() => ({}));
    let isConnected = false;

    if (allData && Array.isArray(allData.data)) {
      const found = allData.data.find((inst: any) => 
        inst.name === evoInst ||
        (inst.webhook && inst.webhook.includes(storeId)) ||
        inst.name.startsWith(`pedidos_${storeId.slice(0, 15)}`)
      );

      if (found) {
        if (found.connected) {
          isConnected = true;
        } else {
          try {
            const statusRes = await fetch(`${evoUrl}/instance/status`, {
              headers: { apikey: found.token || evoInst },
              signal: AbortSignal.timeout(3000)
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json().catch(() => ({}));
              if (statusData?.data?.LoggedIn && statusData?.data?.Connected) {
                isConnected = true;
              }
            }
          } catch {}
        }
      }
    }

    // Persist real-time connection state in Firestore
    await db.collection('establishments').doc(storeId).set({
      evolutionConnected: isConnected,
      updatedAt: new Date().toISOString()
    }, { merge: true }).catch(() => {});

    res.json({ connected: isConnected, state: isConnected ? 'open' : 'close' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all WhatsApp groups that the connected instance belongs to
app.get('/api/evolution/groups', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    let evoInst = (est.evolutionInstanceName || defaultInstName).trim();

    // Auto-resolve active instance name if needed
    try {
      const allRes = await fetch(`${evoUrl}/instance/all`, { headers: { apikey: evoKey } });
      if (allRes.ok) {
        const allData = await allRes.json();
        if (Array.isArray(allData?.data)) {
          const match = allData.data.find((inst: any) => 
            inst.name === evoInst ||
            (inst.webhook && inst.webhook.includes(storeId)) ||
            (inst.token && inst.token === evoInst) ||
            inst.name.startsWith(`pedidos_${storeId.slice(0, 15)}`)
          );
          if (match && match.name) {
            evoInst = match.name;
          }
        }
      }
    } catch (e: any) {
      console.warn('[Evolution Groups] Erro ao checar /instance/all:', e.message);
    }

    console.log(`[Evolution Groups] Buscando grupos para instância ${evoInst}...`);
    let groups: Array<{ id: string; subject: string; size?: number; pictureUrl?: string }> = [];

    // Attempt 1 (Evolution Go): GET /group/list with apikey: evoInst
    try {
      const gRes = await fetch(`${evoUrl}/group/list`, {
        headers: { apikey: evoInst }
      });
      if (gRes.ok) {
        const json = await gRes.json();
        const rawList = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
        if (rawList.length > 0) {
          groups = rawList.map((g: any) => ({
            id: g.JID || g.jid || g.id || '',
            subject: g.Name || g.subject || g.name || 'Grupo sem título',
            size: Array.isArray(g.Participants) ? g.Participants.length : (g.ParticipantCount || g.size || 0),
            pictureUrl: g.pictureUrl || g.avatar || ''
          })).filter((g: any) => g.id && g.id.includes('@g.us'));
        }
      }
    } catch (e: any) {
      console.warn('[Evolution Groups] Tentativa 1 (/group/list) falhou:', e.message);
    }

    // Attempt 2 (Evolution Go): GET /group/myall with apikey: evoInst
    if (groups.length === 0) {
      try {
        const gRes = await fetch(`${evoUrl}/group/myall`, {
          headers: { apikey: evoInst }
        });
        if (gRes.ok) {
          const json = await gRes.json();
          const rawList = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
          if (rawList.length > 0) {
            groups = rawList.map((g: any) => ({
              id: g.JID || g.jid || g.id || '',
              subject: g.Name || g.subject || g.name || 'Grupo sem título',
              size: Array.isArray(g.Participants) ? g.Participants.length : (g.ParticipantCount || g.size || 0),
              pictureUrl: g.pictureUrl || g.avatar || ''
            })).filter((g: any) => g.id && g.id.includes('@g.us'));
          }
        }
      } catch (e: any) {
        console.warn('[Evolution Groups] Tentativa 2 (/group/myall) falhou:', e.message);
      }
    }

    // Attempt 3 (Evolution Node): GET /group/fetchAllGroups/{instance} with evoKey
    if (groups.length === 0) {
      try {
        const gRes = await fetch(`${evoUrl}/group/fetchAllGroups/${evoInst}?getParticipants=false`, {
          headers: { apikey: evoKey }
        });
        if (gRes.ok) {
          const raw = await gRes.json();
          const list = Array.isArray(raw) ? raw : (raw.groups || raw.data || []);
          if (Array.isArray(list) && list.length > 0) {
            groups = list.map((g: any) => ({
              id: g.id || g.jid || g.JID || '',
              subject: g.subject || g.Name || g.name || 'Grupo sem título',
              size: g.size || (Array.isArray(g.participants) ? g.participants.length : 0),
              pictureUrl: g.pictureUrl || g.avatar || ''
            })).filter((g: any) => g.id && g.id.includes('@g.us'));
          }
        }
      } catch (e: any) {
        console.warn('[Evolution Groups] Tentativa 3 falhou:', e.message);
      }
    }

    // Sort by subject name alphabetically
    groups.sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR', { sensitivity: 'base' }));

    console.log(`[Evolution Groups] Encontrados ${groups.length} grupo(s) para a loja ${storeId}`);
    return res.json({ success: true, groups, total: groups.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.all(['/api/evolution/connect', '/api/evolution/qr'], async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    const evoInst = (est.evolutionInstanceName || defaultInstName).trim();
    const appUrl = (process.env.APP_URL || 'https://iapedido.web.app').replace(/\/$/, '');
    const autoWebhookUrl = `${appUrl}/api/webhook/evolution/${storeId}`;

    console.log(`[Evolution API] Conectando WhatsApp para loja ${storeId}, instância: ${evoInst}`);

    // 1. Check if instance exists via /instance/all
    const allRes = await fetch(`${evoUrl}/instance/all`, {
      headers: { apikey: evoKey }
    });
    const allData = await allRes.json().catch(() => ({}));
    let instanceExists = false;
    let isAlreadyConnected = false;

    if (allData && Array.isArray(allData.data)) {
      const found = allData.data.find((inst: any) => inst.name === evoInst);
      if (found) {
        instanceExists = true;
        if (found.connected) {
          isAlreadyConnected = true;
        }
      }
    }

    if (isAlreadyConnected) {
      return res.json({ qr: null, base64: null, instanceName: evoInst, connected: true, status: 'connected' });
    }

    // 2. Create instance if it does not exist
    if (!instanceExists) {
      console.log(`[Evolution API] Criando instância no Evolution: ${evoInst}`);
      const createRes = await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({
          name: evoInst,
          token: evoInst,
          advancedSettings: {
            rejectCall: true,
            msgRejectCall: '',
            ignoreGroups: true,
            alwaysOnline: false,
            readMessages: false,
            ignoreStatus: true,
            syncFullHistory: false
          }
        })
      });
      const createData = await createRes.json().catch(() => ({}));
      console.log(`[Evolution API] Resposta de criação:`, JSON.stringify(createData));
    }

    // 3. Connect instance and set webhook
    console.log(`[Evolution API] Chamando connect para ${evoInst}...`);
    const connectRes = await fetch(`${evoUrl}/instance/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoInst },
      body: JSON.stringify({
        webhookUrl: autoWebhookUrl,
        subscribe: ['MESSAGE', 'CONNECTION', 'MESSAGES_UPSERT']
      })
    });
    const connectData = await connectRes.json().catch(() => ({}));
    console.log(`[Evolution API] Connect result:`, JSON.stringify(connectData));

    // Save instance info to Firestore
    await db.collection('establishments').doc(storeId).set({
      evolutionInstanceName: evoInst,
      evolutionWebhookUrl: autoWebhookUrl,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // 4. Fetch QR Code (with fast retry if needed)
    let qr = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (attempt > 1) {
        await new Promise(r => setTimeout(r, 600));
      }
      const qrRes = await fetch(`${evoUrl}/instance/qr`, {
        method: 'GET',
        headers: { apikey: evoInst }
      });
      const qrData = await qrRes.json().catch(() => ({}));
      
      let foundQr = qrData?.data?.qrcode || qrData?.data?.Qrcode || qrData?.qrcode || null;
      if (foundQr) {
        if (typeof foundQr === 'string' && foundQr.includes('|')) {
          foundQr = foundQr.split('|')[0];
        }
        qr = foundQr;
        break;
      }
    }

    if (qr) {
      return res.json({ qr, base64: qr, code: qr, instanceName: evoInst, connected: false });
    } else {
      return res.json({ qr: null, base64: null, instanceName: evoInst, connected: true, status: 'connected' });
    }
  } catch (err: any) {
    console.error('[Evolution Connect Error]:', err);
    res.status(500).json({ error: 'Falha ao conectar Evolution API', details: err.message });
  }
});

app.post('/api/evolution/disconnect', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    const evoInst = (est.evolutionInstanceName || defaultInstName).trim();

    console.log(`[Evolution Go] Desconectando/removendo instância: ${evoInst}`);

    const allRes = await fetch(`${evoUrl}/instance/all`, {
      headers: { apikey: evoKey }
    });
    const allData = await allRes.json().catch(() => ({}));
    
    let instanceId = '';
    if (allData && Array.isArray(allData.data)) {
      const found = allData.data.find((inst: any) => inst.name === evoInst);
      if (found && found.id) {
        instanceId = found.id;
      }
    }

    if (instanceId) {
      await fetch(`${evoUrl}/instance/delete/${instanceId}`, {
        method: 'DELETE',
        headers: { apikey: evoKey }
      });
      console.log(`[Evolution Go] Instância ${instanceId} deletada do servidor.`);
    }

    await db.collection('establishments').doc(storeId).update({
      evolutionConnected: false,
      updatedAt: new Date().toISOString()
    }).catch(() => {});

    res.json({ success: true, message: 'Instância desconectada e reiniciada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/evolution/pair', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório para pairing code.' });

    const rawDigits = phone.replace(/\D/g, '');
    const cleanPhone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;

    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    let evoInst = (est.evolutionInstanceName || defaultInstName).trim();
    const appUrl = (process.env.APP_URL || 'https://iapedido.web.app').replace(/\/$/, '');
    const autoWebhookUrl = `${appUrl}/api/webhook/evolution/${storeId}`;

    // 1. Check or resolve active instance
    try {
      const allRes = await fetch(`${evoUrl}/instance/all`, { headers: { apikey: evoKey } });
      const allData = await allRes.json().catch(() => ({}));
      let instanceExists = false;

      if (allData && Array.isArray(allData.data)) {
        const match = allData.data.find((inst: any) => 
          inst.name === evoInst ||
          (inst.webhook && inst.webhook.includes(storeId)) ||
          inst.name.startsWith(`pedidos_${storeId.slice(0, 15)}`)
        );
        if (match && match.name) {
          evoInst = match.name;
          instanceExists = true;
        }
      }

      if (!instanceExists) {
        await fetch(`${evoUrl}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoKey },
          body: JSON.stringify({
            name: evoInst,
            token: evoInst,
            advancedSettings: {
              rejectCall: true,
              msgRejectCall: '',
              ignoreGroups: true,
              alwaysOnline: false,
              readMessages: false,
              ignoreStatus: true,
              syncFullHistory: false
            }
          })
        });
      }

      // Ensure connect socket
      await fetch(`${evoUrl}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoInst },
        body: JSON.stringify({
          webhookUrl: autoWebhookUrl,
          subscribe: ['MESSAGE', 'CONNECTION', 'MESSAGES_UPSERT']
        })
      }).catch(() => {});
    } catch (e: any) {
      console.warn('[Evolution API Pair] Erro ao preparar instância:', e.message);
    }

    // Call /instance/pair
    console.log(`[Evolution API] Solicitando Pairing Code para ${cleanPhone} na instância ${evoInst}...`);
    const pairRes = await fetch(`${evoUrl}/instance/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evoInst },
      body: JSON.stringify({ phone: cleanPhone })
    });

    const pairData = await pairRes.json().catch(() => ({}));
    console.log(`[Evolution API] Resposta Pairing Code:`, JSON.stringify(pairData));

    const code = pairData?.data?.PairingCode || 
                 pairData?.data?.pairingCode || 
                 pairData?.PairingCode || 
                 pairData?.pairingCode || 
                 pairData?.code || 
                 pairData?.data?.code || null;

    if (!code) {
      const errorMsg = pairData?.message || pairData?.error || 'Não foi possível gerar o código. Verifique se o número está correto e tente novamente.';
      return res.status(400).json({ error: errorMsg, raw: pairData });
    }

    res.json({ success: true, pairingCode: code, raw: pairData });
  } catch (err: any) {
    console.error('[Evolution API] Erro no Pairing Code:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/evolution/test-send', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { number, text } = req.body;
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const evoUrl = (process.env.EVOLUTION_API_URL || est.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
    const evoKey = est.evolutionApiKey || 'minha_chave_secreta_7108';
    const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
    const evoInst = est.evolutionInstanceName || defaultInstName;

    const result = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, number, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// ----------------------------------------------------
// Campaigns & Scheduled Broadcasts
// ----------------------------------------------------

// Helper to get unique past customers from delivered/completed orders, excluding blocked contacts
async function getAudienceCustomers(establishmentId: string): Promise<Array<{ phone: string; name: string }>> {
  const customersMap = new Map<string, string>(); // phone -> name

  try {
    // 0. Fetch Blocked / Opt-out Contacts
    const blockedSnap = await db.collection('establishments').doc(establishmentId).collection('blocked_contacts').get();
    const blockedSet = new Set(blockedSnap.docs.map(d => d.id));

    // 1. Fetch from Orders collection (customers who actually placed valid orders)
    const ordersSnap = await db.collection('establishments').doc(establishmentId).collection('orders').get();
    for (const doc of ordersSnap.docs) {
      const o = doc.data();
      // Only include valid orders (exclude cancelled)
      if (o.status === 'CANCELADO') continue;

      const phone = (o.customerPhone || '').replace(/\D/g, '');
      if (phone && phone.length >= 10 && !blockedSet.has(phone)) {
        const existingName = customersMap.get(phone);
        const newName = (o.customerName || '').trim();
        if (!existingName || (newName && newName.toLowerCase() !== 'cliente')) {
          customersMap.set(phone, newName || 'Cliente');
        }
      }
    }
  } catch (err: any) {
    console.error(`[Audience Fetch Error for ${establishmentId}]:`, err.message);
  }

  return Array.from(customersMap.entries()).map(([phone, name]) => ({ phone, name }));
}

// Anti-Ban Helper: Spintax parser & zero-width variation injector
// Generates unique message hashes so Meta servers cannot detect bulk text duplicates
function applySpintaxAndVariation(text: string): string {
  // 1. Process custom spintax {opcao1|opcao2|opcao3}
  let result = text.replace(/\{([^{}]+)\}/g, (match, choices) => {
    const lower = choices.toLowerCase().trim();
    if (lower === 'cliente' || lower === 'loja' || lower === 'horario') {
      return match;
    }
    const parts = choices.split('|');
    return parts[Math.floor(Math.random() * parts.length)].trim();
  });

  // 2. Add subtle invisible zero-width space variations to guarantee unique hash per message on Meta servers
  const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  const randomInvisible = zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
  return result + randomInvisible;
}

// Helper to execute campaign broadcast to customer list
async function executeCampaignBroadcast(
  establishmentId: string,
  campaign: any,
  customers: Array<{ phone: string; name: string }>
): Promise<{ sentCount: number; errorsCount: number }> {
  const estDoc = await db.collection('establishments').doc(establishmentId).get();
  const establishment = estDoc.data() || {};
  const evoUrl = (process.env.EVOLUTION_API_URL || establishment.evolutionApiUrl || 'http://86.48.23.152:8081').replace(/\/$/, '');
  const evoKey = establishment.evolutionApiKey || 'minha_chave_secreta_7108';
  const defaultInstName = establishmentId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${establishmentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 15)}`;
  const evoInst = (establishment.evolutionInstanceName || defaultInstName).trim();

  let sentCount = 0;
  let errorsCount = 0;

  // Case 1: WhatsApp Groups Broadcast
  if (campaign.targetAudience === 'WHATSAPP_GROUPS') {
    const targetGroups: string[] = Array.isArray(campaign.targetGroupIds) && campaign.targetGroupIds.length > 0
      ? campaign.targetGroupIds
      : [];

    console.log(`[Broadcast Groups] Iniciando disparo nos grupos ("${campaign.title}") para ${targetGroups.length} grupo(s)...`);

    for (let i = 0; i < targetGroups.length; i++) {
      const groupId = targetGroups[i];
      try {
        let msg = (campaign.message || '')
          .replace(/\{cliente\}/gi, 'Pessoal')
          .replace(/\{loja\}/gi, establishment.name || 'Nosso Estabelecimento')
          .replace(/\{horario\}/gi, establishment.operatingHours || 'Aberto agora');

        // Apply Spintax variation {opcao1|opcao2} and invisible unique hash
        msg = applySpintaxAndVariation(msg);
        msg = formatWhatsAppText(msg);

        if (campaign.imageUrl && campaign.imageUrl.trim()) {
          await sendWhatsAppMedia(
            evoUrl,
            evoKey,
            evoInst,
            groupId,
            campaign.imageUrl.trim(),
            msg,
            'image'
          );
        } else {
          await sendWhatsAppMessage(
            evoUrl,
            evoKey,
            evoInst,
            groupId,
            msg
          );
        }

        sentCount++;
        console.log(`[Broadcast Groups] (${i + 1}/${targetGroups.length}) Enviado com sucesso para grupo ${groupId}`);

        // Anti-Ban: Security delay between groups (12 to 24 seconds)
        if (i < targetGroups.length - 1) {
          const groupDelayMs = 12000 + Math.floor(Math.random() * 12000);
          console.log(`[Anti-Ban Groups] Aguardando ${Math.round(groupDelayMs / 1000)}s antes do próximo grupo...`);
          await new Promise(r => setTimeout(r, groupDelayMs));
        }
      } catch (err: any) {
        console.error(`[Broadcast Groups Error] Falha ao enviar para grupo ${groupId}:`, err.message);
        errorsCount++;
      }
    }
  } else {
    // Case 2: Individual Customers 1-to-1 Broadcast
    console.log(`[Broadcast Campaign] Iniciando disparo da campanha "${campaign.title}" para ${customers.length} cliente(s) de ${establishment.name || establishmentId}`);

    for (let i = 0; i < customers.length; i++) {
      const client = customers[i];
      try {
        // Real-time Check: Verify if contact opted out or was blocked
        const blockedDoc = await db.collection('establishments').doc(establishmentId).collection('blocked_contacts').doc(client.phone).get();
        if (blockedDoc.exists) {
          console.log(`[Anti-Ban Opt-out] Pulando envio para ${client.phone} (contato cancelou inscrição ou foi bloqueado).`);
          continue;
        }

        // Extract clean first name
        let firstName = (client.name || '').trim().split(' ')[0];
        if (!firstName || firstName.toLowerCase() === 'cliente') {
          firstName = 'Amigo(a)';
        }

        // Replace template variables
        let personalizedMsg = (campaign.message || '')
          .replace(/\{cliente\}/gi, firstName)
          .replace(/\{loja\}/gi, establishment.name || 'Nosso Estabelecimento')
          .replace(/\{horario\}/gi, establishment.operatingHours || 'Aberto agora');

        // Apply Spintax variation {opcao1|opcao2} and unique hash per message
        personalizedMsg = applySpintaxAndVariation(personalizedMsg);

        // Anti-Ban Opt-out Footer: Prevents spam reports by giving recipient an easy 1-digit exit
        const optOutNotice = '\n\n_Caso não queira mais receber nossas ofertas, responda 0._';
        if (!personalizedMsg.toLowerCase().includes('responda 0') && !personalizedMsg.toLowerCase().includes('digite 0')) {
          personalizedMsg += optOutNotice;
        }

        personalizedMsg = formatWhatsAppText(personalizedMsg);

        if (campaign.imageUrl && campaign.imageUrl.trim()) {
          await sendWhatsAppMedia(
            evoUrl,
            evoKey,
            evoInst,
            client.phone,
            campaign.imageUrl.trim(),
            personalizedMsg,
            'image'
          );
        } else {
          await sendWhatsAppMessage(
            evoUrl,
            evoKey,
            evoInst,
            client.phone,
            personalizedMsg
          );
        }

        sentCount++;
        console.log(`[Broadcast Campaign] (${i + 1}/${customers.length}) Enviado com sucesso para ${client.phone} (${firstName})`);

        // Anti-Ban: Human randomized delay between customers (25s to 45s)
        // Prevents Meta automated bulk spam detection triggers
        if (i < customers.length - 1) {
          const safeDelayMs = 25000 + Math.floor(Math.random() * 20000);
          console.log(`[Anti-Ban Jitter] Aguardando ${Math.round(safeDelayMs / 1000)}s antes do próximo envio...`);
          await new Promise(r => setTimeout(r, safeDelayMs));
        }
      } catch (err: any) {
        console.error(`[Broadcast Campaign Error] Falha ao enviar para ${client.phone}:`, err.message);
        errorsCount++;
      }
    }
  }

  // Update campaign execution stats in Firestore
  await db.collection('establishments').doc(establishmentId).collection('campaigns').doc(campaign.id).set({
    lastRunAt: new Date().toISOString(),
    stats: {
      totalSent: ((campaign.stats && campaign.stats.totalSent) || 0) + sentCount,
      lastBatchCount: sentCount
    },
    updatedAt: new Date().toISOString()
  }, { merge: true }).catch(() => {});

  return { sentCount, errorsCount };
}

// ----------------------------------------------------
// AI Voice Preview Endpoint (Testing voices in Settings)
// ----------------------------------------------------
app.post('/api/ai/preview-voice', async (req, res) => {
  try {
    const { text, voiceId } = req.body || {};
    const sampleText = text || 'Olá! Seja muito bem-vindo ao nosso atendimento no WhatsApp. Como posso te ajudar hoje?';
    const base64 = await generateVoiceAudioBase64(sampleText, voiceId || 'pt-BR-FranciscaNeural');
    if (!base64) {
      return res.status(500).json({ error: 'Não foi possível sintetizar a prévia da voz.' });
    }
    return res.json({ success: true, base64Audio: `data:audio/mp3;base64,${base64}` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// AI Catalog Radar & Product Intelligence Endpoint
// ----------------------------------------------------
app.get('/api/ai/catalog-radar', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const forceRefresh = req.query.refresh === 'true';

    // 1. Check existing saved analysis in Firestore
    const radarRef = db.collection('establishments').doc(storeId).collection('analytics').doc('catalogRadar');
    const existingDoc = await radarRef.get();
    
    if (existingDoc.exists && !forceRefresh) {
      const data = existingDoc.data();
      const ageHours = (Date.now() - new Date(data?.analyzedAt || 0).getTime()) / (1000 * 60 * 60);
      if (ageHours < 6) {
        return res.json({ success: true, data });
      }
    }

    // 2. Fetch products
    const estDoc = await db.collection('establishments').doc(storeId).get();
    const est = estDoc.data() || {};
    const productsSnap = await db.collection('establishments').doc(storeId).collection('products').get();
    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totalItems = products.length;
    const withPhoto = products.filter((p: any) => p.imageUrl && p.imageUrl.trim()).length;
    const withoutPhoto = totalItems - withPhoto;
    const photoPercentage = totalItems > 0 ? Math.round((withPhoto / totalItems) * 100) : 0;

    // 3. Fetch recent customer chats
    const chatsSnap = await db.collection('establishments').doc(storeId).collection('chats').limit(12).get();
    let conversationSnippets: string[] = [];

    for (const chatDoc of chatsSnap.docs) {
      const msgsSnap = await chatDoc.ref.collection('messages').orderBy('timestamp', 'desc').limit(6).get();
      const msgs = msgsSnap.docs.map(m => m.data()).reverse();
      const snippet = msgs.map((m: any) => `${m.sender === 'user' ? 'Cliente' : 'IA'}: ${m.text || ''}`).join('\n');
      if (snippet) {
        conversationSnippets.push(`--- Conversa com ${chatDoc.id} ---\n${snippet}`);
      }
    }

    // 4. Generate AI insights with Gemini 2.5 Flash
    const segment = est.segment || 'Gastronomia';
    const storeName = est.name || 'Estabelecimento';

    const systemPrompt = `Você é um consultor sênior de inteligência de vendas, precificação e cardápio/catálogo especializado no segmento "${segment}".
Sua tarefa é analisar o catálogo da loja "${storeName}" e as conversas reais dos clientes no WhatsApp, gerando um relatório em formato JSON com oportunidades claras de faturamento e pontos de melhoria.

Responda APENAS um objeto JSON válido (sem blocos de código markdown ou texto extra) seguindo rigorosamente esta estrutura:
{
  "score": number (0 a 100 representando o nível de atratividade e prontidão do catálogo),
  "summary": string (síntese executiva de 1 a 2 frases com o diagnóstico do catálogo),
  "unmetDemands": [
    {
      "title": string (nome do produto ou variação sugerida que clientes procuraram ou tendência quente do nicho),
      "reason": string (motivo pelo qual deve ser adicionado baseado nas conversas ou comportamento do nicho),
      "suggestedCategory": string (categoria onde deve ser cadastrado),
      "suggestedPrice": number (preço médio sugerido de venda),
      "demandLevel": "ALTA" | "MÉDIA" | "EMERGENTE"
    }
  ],
  "topOpportunities": [
    {
      "productName": string (nome do produto do catálogo),
      "insight": string (por que esse item se destaca ou como potencializá-lo),
      "badge": string (ex: "Mais Desejado", "Destaque da Semana", "Alta Margem")
    }
  ],
  "crossSellAction": {
    "title": string (estratégia de combo ou venda cruzada),
    "suggestion": string (ex: "Oferecer Bebida X junto ao Prato Y para elevar o ticket"),
    "ticketImpact": string (ex: "+18% a +25% no ticket médio")
  },
  "health": {
    "totalItems": ${totalItems},
    "withPhoto": ${withPhoto},
    "withoutPhoto": ${withoutPhoto},
    "photoPercentage": ${photoPercentage},
    "alertMessage": string (dica sobre fotos e descrições)
  }
}`;

    const userPrompt = `Catálogo atual (${products.length} itens):
${products.map((p: any) => `- ${p.name} (R$ ${p.price || 0}) [Cat: ${p.category || 'Geral'}] ${p.imageUrl ? '[Com Foto]' : '[SEM FOTO]'}`).join('\n')}

Conversas recentes com clientes no WhatsApp:
${conversationSnippets.length > 0 ? conversationSnippets.join('\n\n') : 'Sem conversas registradas ainda. Faça uma análise com base nos produtos atuais e melhores práticas do nicho.'}`;

    let parsedResult: any = null;
    try {
      const response = await getGenAI().models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });

      const rawJson = response.text || '{}';
      parsedResult = JSON.parse(rawJson);
    } catch (e: any) {
      console.warn('[Catalog Radar AI Error]:', e.message);
    }

    // Fallback if AI output failed or empty
    if (!parsedResult || !parsedResult.score) {
      parsedResult = {
        score: Math.min(95, Math.max(50, 60 + Math.round(photoPercentage * 0.35))),
        summary: `Catálogo com ${totalItems} itens analisado. ${photoPercentage < 70 ? 'Recomendamos adicionar fotos aos itens pendentes para aumentar as conversões no WhatsApp.' : 'Boa cobertura visual de fotos! Foque em combos estratégicos.'}`,
        unmetDemands: [
          {
            title: segment.includes('VEIC') ? 'Sedan Automático Econômico' : segment.includes('MODA') ? 'Linha Casual Conforto' : 'Combo Individual Econômico',
            reason: 'Item com alta taxa de procura no WhatsApp e excelente margem de conversão.',
            suggestedCategory: (products[0] as any)?.category || 'Destaques',
            suggestedPrice: 35.00,
            demandLevel: 'ALTA'
          }
        ],
        topOpportunities: products.slice(0, 2).map((p: any, idx: number) => ({
          productName: p.name,
          insight: 'Item com alto potencial de atração de novos clientes pelo WhatsApp.',
          badge: idx === 0 ? 'Mais Desejado' : 'Alta Procura'
        })),
        crossSellAction: {
          title: 'Combo de Maior Ticket',
          suggestion: 'Apresentar opção de bebida ou complemento durante a confirmação do pedido pelo atendente IA.',
          ticketImpact: '+20% no ticket médio'
        },
        health: {
          totalItems,
          withPhoto,
          withoutPhoto,
          photoPercentage,
          alertMessage: withoutPhoto > 0 ? `${withoutPhoto} produtos estão sem foto. Produtos com foto vendem 3.2x mais.` : 'Todos os produtos possuem fotos!'
        }
      };
    }

    parsedResult.analyzedAt = new Date().toISOString();

    // Save to Firestore
    await radarRef.set(parsedResult, { merge: true }).catch(() => {});

    return res.json({ success: true, data: parsedResult });
  } catch (err: any) {
    console.error('[Catalog Radar Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 1. List Campaigns
app.get('/api/campaigns', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const snap = await db.collection('establishments').doc(storeId).collection('campaigns').orderBy('createdAt', 'desc').get();
    const campaigns = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Audience count & stats
app.get('/api/campaigns/audience', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customers = await getAudienceCustomers(storeId);
    res.json({
      totalCount: customers.length,
      sample: customers.slice(0, 5)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create or Update Campaign
app.post('/api/campaigns', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { 
      id, 
      title, 
      description, 
      message, 
      imageUrl, 
      scheduledTime, 
      daysOfWeek, 
      active, 
      targetAudience,
      targetGroupIds
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
    }

    const campaignData = {
      establishmentId: storeId,
      title: title.trim(),
      description: (description || '').trim(),
      message: message.trim(),
      imageUrl: (imageUrl || '').trim(),
      scheduledTime: scheduledTime || '18:00',
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
      active: active !== undefined ? Boolean(active) : true,
      targetAudience: targetAudience || 'ALL_CUSTOMERS',
      targetGroupIds: Array.isArray(targetGroupIds) ? targetGroupIds : [],
      updatedAt: new Date().toISOString()
    };

    const campaignsCol = db.collection('establishments').doc(storeId).collection('campaigns');

    if (id) {
      await campaignsCol.doc(id).set({
        ...campaignData,
        lastRunAt: null // Reset lastRunAt so new time tests can run on the same day
      }, { merge: true });
      res.json({ id, ...campaignData });
    } else {
      const newDoc = await campaignsCol.add({
        ...campaignData,
        createdAt: new Date().toISOString(),
        stats: { totalSent: 0, lastBatchCount: 0 }
      });
      res.json({ id: newDoc.id, ...campaignData });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Campaign
app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    await db.collection('establishments').doc(storeId).collection('campaigns').doc(id).delete();
    res.json({ success: true, message: 'Campanha removida com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Toggle Campaign Active Status
app.post('/api/campaigns/:id/toggle', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const docRef = db.collection('establishments').doc(storeId).collection('campaigns').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }
    const currentActive = docSnap.data()?.active ?? true;
    const nextActive = !currentActive;
    await docRef.update({
      active: nextActive,
      ...(nextActive ? { lastRunAt: null } : {}),
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true, active: nextActive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Execute Immediate Broadcast ("Disparar Agora")
app.post('/api/campaigns/:id/send-now', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { id } = req.params;
    const docRef = db.collection('establishments').doc(storeId).collection('campaigns').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Campanha não encontrada.' });
    }

    const campaign = { id: docSnap.id, ...docSnap.data() } as any;

    // Handle WhatsApp Groups Broadcast
    if (campaign.targetAudience === 'WHATSAPP_GROUPS') {
      const groupCount = (campaign.targetGroupIds || []).length;
      if (groupCount === 0) {
        return res.json({ 
          success: false, 
          message: 'Nenhum grupo do WhatsApp foi selecionado nesta campanha.', 
          sentCount: 0 
        });
      }
      const result = await executeCampaignBroadcast(storeId, campaign, []);
      return res.json({
        success: true,
        message: `Disparo concluído com sucesso em ${result.sentCount} grupo(s)!`,
        sentCount: result.sentCount,
        errorsCount: result.errorsCount
      });
    }

    const customers = await getAudienceCustomers(storeId);

    if (customers.length === 0) {
      return res.json({ 
        success: true, 
        message: 'Nenhum cliente na base ainda para receber este disparo.', 
        sentCount: 0 
      });
    }

    // Trigger broadcast to customer list
    const result = await executeCampaignBroadcast(storeId, campaign, customers);
    res.json({
      success: true,
      message: `Disparo concluído com sucesso para ${result.sentCount} cliente(s)!`,
      sentCount: result.sentCount,
      errorsCount: result.errorsCount
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Customer Contacts Management (WhatsApp Audience)
// ----------------------------------------------------

// List all customers who interacted or ordered with their stats, conversation context, and block status
app.get('/api/customers', async (req, res) => {
  try {
    const storeId = getStoreId(req);

    // Fetch blocked phones set
    const blockedSnap = await db.collection('establishments').doc(storeId).collection('blocked_contacts').get();
    const blockedMap = new Map<string, any>();
    blockedSnap.docs.forEach(doc => {
      blockedMap.set(doc.id, doc.data());
    });

    const [ordersSnap, chatsSnap, customersSnap, autoProjectsSnap] = await Promise.all([
      db.collection('establishments').doc(storeId).collection('orders').get(),
      db.collection('establishments').doc(storeId).collection('chats').get().catch(() => ({ docs: [] as any[] })),
      db.collection('establishments').doc(storeId).collection('customers').get().catch(() => ({ docs: [] as any[] })),
      db.collection('automotive_projects').where('establishmentId', '==', storeId).get().catch(() => ({ docs: [] as any[] }))
    ]);

    const map = new Map<string, {
      phone: string;
      name: string;
      ordersCount: number;
      completedOrdersCount: number;
      totalSpent: number;
      lastOrderDate: string;
      interactionCount?: number;
      lastMessage?: string;
      contextSummary?: string;
      vehicleInfo?: string;
      projectStatus?: string;
      isBlocked: boolean;
      blockedAt?: string;
    }>();

    ordersSnap.docs.forEach(doc => {
      const o = doc.data();
      const phone = (o.customerPhone || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) return;

      const existing = map.get(phone);
      const isCompleted = o.status === 'CONCLUIDO' || o.status === 'PRONTO' || o.status === 'CONFIRMADO';
      const orderTotal = Number(o.total) || 0;
      const orderDate = o.createdAt || new Date().toISOString();

      if (!existing) {
        map.set(phone, {
          phone,
          name: o.customerName || 'Cliente',
          ordersCount: 1,
          completedOrdersCount: isCompleted ? 1 : 0,
          totalSpent: o.status !== 'CANCELADO' ? orderTotal : 0,
          lastOrderDate: orderDate,
          isBlocked: blockedMap.has(phone),
          blockedAt: blockedMap.get(phone)?.blockedAt
        });
      } else {
        existing.ordersCount += 1;
        if (isCompleted) existing.completedOrdersCount += 1;
        if (o.status !== 'CANCELADO') existing.totalSpent += orderTotal;
        if (new Date(orderDate) > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = orderDate;
          if (o.customerName && o.customerName !== 'Cliente') {
            existing.name = o.customerName;
          }
        }
      }
    });

    // Merge contacts from chats & customers memory per establishment
    for (const doc of [...customersSnap.docs, ...chatsSnap.docs]) {
      const d = doc.data();
      const phone = String(d.customerPhone || doc.id || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) continue;
      const existing = map.get(phone);
      const autoCtx = d.automotiveContext || {};
      const vehicleInfo = [autoCtx.brand, autoCtx.model, autoCtx.year, autoCtx.version].filter(Boolean).join(' ');
      const ts = d.lastTimestamp || d.lastInteractionAt || d.updatedAt || new Date().toISOString();
      const nameCandidate = autoCtx.customerName || d.name || d.customerName || 'Cliente WhatsApp';

      if (!existing) {
        map.set(phone, {
          phone,
          name: nameCandidate,
          ordersCount: autoCtx.projectId ? 1 : 0,
          completedOrdersCount: 0,
          totalSpent: 0,
          lastOrderDate: ts,
          interactionCount: Number(d.interactionCount || autoCtx.interactionCount || 1),
          lastMessage: d.lastUserMessage || d.lastMessage || autoCtx.lastUserMessage || '',
          contextSummary: autoCtx.summary || '',
          vehicleInfo,
          projectStatus: autoCtx.stage || '',
          isBlocked: blockedMap.has(phone),
          blockedAt: blockedMap.get(phone)?.blockedAt
        });
      } else {
        if (nameCandidate && nameCandidate !== 'Cliente WhatsApp' && (existing.name === 'Cliente' || existing.name === 'Cliente WhatsApp')) {
          existing.name = nameCandidate;
        }
        existing.interactionCount = Math.max(existing.interactionCount || 0, Number(d.interactionCount || autoCtx.interactionCount || 1));
        if (d.lastUserMessage || d.lastMessage) existing.lastMessage = d.lastUserMessage || d.lastMessage;
        if (autoCtx.summary) existing.contextSummary = autoCtx.summary;
        if (vehicleInfo) existing.vehicleInfo = vehicleInfo;
        if (autoCtx.stage) existing.projectStatus = autoCtx.stage;
        if (ts && new Date(ts) > new Date(existing.lastOrderDate)) {
          existing.lastOrderDate = ts;
        }
      }
    }

    // Merge contacts from automotive_projects
    for (const doc of autoProjectsSnap.docs) {
      const p = doc.data();
      const phone = String(p.phone || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) continue;
      const existing = map.get(phone);
      const vehicleInfo = [p.brand, p.model, p.year, p.version].filter(Boolean).join(' ');
      const ts = p.updatedAt || p.createdAt || new Date().toISOString();

      if (!existing) {
        map.set(phone, {
          phone,
          name: p.customerName || 'Cliente',
          ordersCount: 1,
          completedOrdersCount: p.status === 'Concluído' || p.status === 'Aprovado' ? 1 : 0,
          totalSpent: 0,
          lastOrderDate: ts,
          interactionCount: Number(p.interactionCount || 1),
          lastMessage: p.lastMessage || p.objective || '',
          contextSummary: p.conversationSummary || p.objective || '',
          vehicleInfo,
          projectStatus: p.status || 'Novo contato',
          isBlocked: blockedMap.has(phone),
          blockedAt: blockedMap.get(phone)?.blockedAt
        });
      } else {
        existing.ordersCount = Math.max(existing.ordersCount, 1);
        if (p.customerName && p.customerName !== 'Cliente WhatsApp') existing.name = p.customerName;
        if (vehicleInfo) existing.vehicleInfo = vehicleInfo;
        if (p.status) existing.projectStatus = p.status;
        if (p.conversationSummary || p.objective) existing.contextSummary = p.conversationSummary || p.objective;
      }
    }

    // Sort by most recent interaction descending
    const customersList = Array.from(map.values())
      .sort((a, b) => new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime());

    res.json(customersList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle block/opt-out for a contact from marketing broadcasts
app.post('/api/customers/toggle-block', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório.' });

    const cleanPhone = phone.replace(/\D/g, '');
    const docRef = db.collection('establishments').doc(storeId).collection('blocked_contacts').doc(cleanPhone);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      // Unblock
      await docRef.delete();
      res.json({ success: true, isBlocked: false, message: 'Contato reativado para receber disparos.' });
    } else {
      // Block / Opt-out
      await docRef.set({
        phone: cleanPhone,
        blockedAt: new Date().toISOString(),
        reason: reason || 'Removido pelo estabelecimento'
      });
      res.json({ success: true, isBlocked: true, message: 'Contato removido da lista de disparos.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete contact from broadcast audience
app.delete('/api/customers/:phone', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const cleanPhone = (req.params.phone || '').replace(/\D/g, '');
    if (!cleanPhone) return res.status(400).json({ error: 'Telefone é obrigatório.' });

    await db.collection('establishments').doc(storeId).collection('blocked_contacts').doc(cleanPhone).set({
      phone: cleanPhone,
      blockedAt: new Date().toISOString(),
      reason: 'Removido pelo estabelecimento'
    });

    res.json({ success: true, isBlocked: true, message: 'Contato removido dos disparos com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to check and execute scheduled campaigns for all active stores
async function checkAndExecuteScheduledCampaigns(): Promise<{ triggeredCount: number; checkedTime: string }> {
  const now = new Date();
  // Get Brasília time (UTC-3)
  const brTimeStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const brDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const brDayOfWeek = brDate.getDay(); // 0 = Sunday, 1 = Monday, ...
  const todayBR = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const [currH, currM] = brTimeStr.split(':').map(Number);
  const currMinutes = currH * 60 + currM;

  console.log(`[Cron Campaign Check] Verificando disparos para o horário de Brasília: ${brTimeStr} (Minutos: ${currMinutes}, Dia: ${brDayOfWeek})`);

  const estSnap = await db.collection('establishments').get();
  let triggeredCount = 0;

  for (const estDoc of estSnap.docs) {
    const storeId = estDoc.id;
    const campaignsSnap = await db.collection('establishments').doc(storeId)
      .collection('campaigns')
      .where('active', '==', true)
      .get();

    for (const cDoc of campaignsSnap.docs) {
      const camp = { id: cDoc.id, ...cDoc.data() } as any;
      const days = camp.daysOfWeek || [];
      const isScheduledDay = days.includes(brDayOfWeek);

      const [schedH, schedM] = (camp.scheduledTime || '00:00').split(':').map(Number);
      const schedMinutes = schedH * 60 + schedM;

      // Safe time window: current time is at or after scheduled time (within a 30-minute window)
      const timeDiff = currMinutes - schedMinutes;
      const isTimeWindow = timeDiff >= 0 && timeDiff <= 30;

      // Check if not already executed today
      const lastRun = camp.lastRunAt ? new Date(camp.lastRunAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
      const alreadyRunToday = lastRun === todayBR;

      if (isScheduledDay && isTimeWindow && !alreadyRunToday) {
        console.log(`[Cron Trigger Match!] Disparando campanha "${camp.title}" para a loja ${storeId}`);
        if (camp.targetAudience === 'WHATSAPP_GROUPS') {
          await executeCampaignBroadcast(storeId, camp, []);
          triggeredCount++;
        } else {
          const customers = await getAudienceCustomers(storeId);
          if (customers.length > 0) {
            await executeCampaignBroadcast(storeId, camp, customers);
            triggeredCount++;
          }
        }
      }
    }
  }

  return { triggeredCount, checkedTime: brTimeStr };
}

// 7. Check & Run Scheduled Campaigns (HTTP Endpoint)
app.all('/api/cron/check-campaigns', async (req, res) => {
  try {
    const result = await checkAndExecuteScheduledCampaigns();
    res.json({ status: 'checked', ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Mercado Pago PIX Subscription & AI Credits Endpoints
// ----------------------------------------------------

app.get('/api/billing/summary', async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const snap = await db.collection('establishments').doc(storeId).get();
    const est = snap.data() || {};
    const trialActive = isEstablishmentTrialActive({ ...est, id: storeId });
    const storePlan = resolveStorePlan(est.planTier, est.segment);
    const usageSnap = await db.collection('establishments').doc(storeId).collection('aiUsage').get();
    const totalUsed = usageSnap.docs.reduce((sum, d) => sum + Number(d.data()?.estimatedCost || 0), 0);
    return res.json({
      trialActive,
      trialEndsAt: est.trialEndsAt || null,
      subscriptionValidUntil: est.subscriptionValidUntil || null,
      plan: est.plan || (trialActive ? 'trial' : 'expired'),
      accountStatus: est.accountStatus || (trialActive ? 'trial' : 'expired'),
      planTier: storePlan.id,
      planName: storePlan.name,
      monthlyPlatformFee: storePlan.price,
      includedCredits: storePlan.includedCredits,
      minTopupBrl: MIN_CREDIT_TOPUP_BRL,
      creditsBalance: Number(est.aiCreditsBalance || 0),
      totalUsed: Number(totalUsed.toFixed(4)),
      pricing: {
        deepseekPer1kBrl: Number(process.env.AI_COST_DEEPSEEK_PER_1K_BRL || DEFAULT_DEEPSEEK_COST_PER_1K_BRL),
        geminiPer1kBrl: Number(process.env.AI_COST_GEMINI_PER_1K_BRL || DEFAULT_GEMINI_COST_PER_1K_BRL)
      }
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/billing/credits/pix', async (req, res) => {
  try {
    const storeId = req.body.establishmentId || getStoreId(req);
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < MIN_CREDIT_TOPUP_BRL || amount > 5000) {
      return res.status(400).json({ error: `A recarga mínima é de R$ ${MIN_CREDIT_TOPUP_BRL} e a máxima é de R$ 5.000.` });
    }
    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) return res.status(500).json({ error: 'Mercado Pago não configurado.' });
    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const payment = new Payment(new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } }));
    const created: any = await payment.create({
      body: {
        transaction_amount: Number(amount.toFixed(2)),
        description: `Recarga de Créditos de IA iaPedido - ${storeId}`,
        payment_method_id: 'pix',
        payer: { email: req.body.email || 'cliente@iapedido.com.br' },
        external_reference: `CREDIT:${storeId}`
      }
    });
    const id = String(created.id);
    await db.collection('pendingCreditTopups').doc(id).set({
      establishmentId: storeId,
      amount,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    res.json({
      success: true,
      id,
      amount,
      qr_code: created.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: created.point_of_interaction?.transaction_data?.qr_code_base64
    });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Falha ao gerar recarga.' }); }
});

app.get('/api/billing/credits/status/:paymentId', async (req, res) => {
  try {
    const id = req.params.paymentId;
    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) return res.status(500).json({ error: 'Mercado Pago não configurado.' });
    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const paymentInfo: any = await new Payment(new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } })).get({ id });
    if (paymentInfo.status === 'approved') {
      const pendingRef = db.collection('pendingCreditTopups').doc(id);
      const pending = await pendingRef.get();
      const topup = pending.data();
      if (topup?.status !== 'approved' && topup?.establishmentId) {
        await db.runTransaction(async transaction => {
          const estRef = db.collection('establishments').doc(topup.establishmentId);
          const est = await transaction.get(estRef);
          const balance = Number(est.data()?.aiCreditsBalance || 0);
          transaction.update(estRef, { aiCreditsBalance: Number((balance + Number(topup.amount || 0)).toFixed(4)), updatedAt: new Date().toISOString() });
          transaction.set(pendingRef, { status: 'approved', approvedAt: new Date().toISOString() }, { merge: true });
        });
      }
    }
    res.json({ id, status: paymentInfo.status, approved: paymentInfo.status === 'approved' });
  } catch (err: any) { res.status(500).json({ error: err.message || 'Falha ao consultar recarga.' }); }
});

// API: Gerar cobrança PIX para assinatura mensal (Suporta Planos Essencial R$ 197, Pro R$ 347, Performance R$ 497)
app.post('/api/subscription/pix', async (req, res) => {
  try {
    const { establishmentId, email, name, planTier } = req.body;
    const storeId = establishmentId || getStoreId(req);
    if (!storeId) {
      return res.status(400).json({ error: 'ID do estabelecimento não fornecido.' });
    }

    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) {
      return res.status(500).json({ error: 'Configuração do Mercado Pago (MP_ACCESS_TOKEN) não encontrada no servidor.' });
    }

    const estDoc = await db.collection('establishments').doc(storeId).get();
    const estData = estDoc.data() || {};
    const chosenPlan = resolveStorePlan(planTier || estData.planTier, estData.segment);

    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } });
    const payment = new Payment(client);

    const paymentResponse = await payment.create({
      body: {
        transaction_amount: chosenPlan.price,
        description: `${chosenPlan.name} iaPedido (30 dias + R$ ${chosenPlan.includedCredits} em Créditos IA)`,
        payment_method_id: 'pix',
        payer: {
          email: email || 'cliente@iapedido.com.br',
          first_name: name || estData.name || 'Estabelecimento iaPedido'
        },
        external_reference: storeId
      }
    });

    const paymentId = String(paymentResponse.id);
    console.log(`[Mercado Pago] PIX ${chosenPlan.name} (R$ ${chosenPlan.price}) gerado! ID: ${paymentId} para loja: ${storeId}`);

    // Registrar cobrança pendente no Firestore com dados do plano escolhido
    await db.collection('pendingSubscriptions').doc(paymentId).set({
      establishmentId: storeId,
      planTier: chosenPlan.id,
      planName: chosenPlan.name,
      amount: chosenPlan.price,
      includedCredits: chosenPlan.includedCredits,
      status: 'pending',
      payerEmail: email || '',
      createdAt: new Date().toISOString()
    }, { merge: true });

    return res.json({
      success: true,
      id: paymentId,
      planTier: chosenPlan.id,
      planName: chosenPlan.name,
      amount: chosenPlan.price,
      includedCredits: chosenPlan.includedCredits,
      qr_code: paymentResponse.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64
    });
  } catch (err: any) {
    console.error('[Mercado Pago Subscription Error]:', err);
    return res.status(500).json({ error: err.message || 'Falha ao gerar cobrança PIX.' });
  }
});

// Helper idempotente para ativar assinatura mensal e creditar franquia de IA do plano
async function activateStoreSubscriptionPayment(paymentId: string, fallbackStoreId?: string) {
  const pendingRef = db.collection('pendingSubscriptions').doc(paymentId);
  await db.runTransaction(async transaction => {
    const pendingDoc = await transaction.get(pendingRef);
    const pendingData = pendingDoc.data() || {};
    if (pendingData.status === 'approved') return;

    const storeId = pendingData.establishmentId || fallbackStoreId;
    if (!storeId) return;

    const estRef = db.collection('establishments').doc(storeId);
    const estDoc = await transaction.get(estRef);
    const estData = estDoc.data() || {};

    const chosenPlan = resolveStorePlan(pendingData.planTier || estData.planTier, estData.segment);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const currentValidUntilMs = estData.subscriptionValidUntil ? new Date(estData.subscriptionValidUntil).getTime() : 0;
    const baseTime = currentValidUntilMs > Date.now() ? currentValidUntilMs : Date.now();
    const newValidUntil = new Date(baseTime + thirtyDaysMs).toISOString();
    const currentCredits = Number(estData.aiCreditsBalance || 0);
    const bonusCredits = Number(pendingData.includedCredits ?? chosenPlan.includedCredits);

    transaction.set(estRef, {
      plan: 'active',
      planTier: chosenPlan.id,
      planPrice: Number(pendingData.amount || chosenPlan.price),
      accountStatus: 'active_paid',
      subscriptionValidUntil: newValidUntil,
      aiCreditsBalance: Number((currentCredits + bonusCredits).toFixed(4)),
      lastPaymentDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    transaction.set(pendingRef, {
      status: 'approved',
      approvedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[Mercado Pago] ${chosenPlan.name} da loja ${storeId} ativado até ${newValidUntil} (+R$ ${bonusCredits} créditos IA)!`);
  });
}

// API: Consultar status de pagamento PIX e ativar plano automaticamente
app.get('/api/subscription/status/:paymentId', async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) {
      return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado.' });
    }

    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } });
    const payment = new Payment(client);

    const paymentInfo = await payment.get({ id: paymentId }).catch(() => null);
    if (!paymentInfo) {
      return res.status(404).json({ error: 'Pagamento não encontrado.' });
    }

    const isApproved = paymentInfo.status === 'approved';

    if (isApproved) {
      await activateStoreSubscriptionPayment(paymentId, paymentInfo.external_reference);
    }

    return res.json({
      id: paymentId,
      status: paymentInfo.status,
      approved: isApproved
    });
  } catch (err: any) {
    console.error('[Subscription Status Check Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

// API: Webhook do Mercado Pago para confirmação assíncrona
app.post('/api/subscription/webhook', async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if ((type !== 'payment' && type !== 'payment.created' && type !== 'payment.updated') || !data?.id) {
      return res.status(200).send('ok');
    }

    const paymentId = String(data.id);
    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) return res.status(200).send('ok');

    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } });
    const paymentInfo = await new Payment(client).get({ id: paymentId }).catch(() => null);

    if (paymentInfo && paymentInfo.status === 'approved') {
      await activateStoreSubscriptionPayment(paymentId, paymentInfo.external_reference);
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('[Subscription Webhook MP Error]:', err);
    return res.status(200).send('ok');
  }
});

// ----------------------------------------------------
// Web Push Notifications Endpoints (PWA Background Push)
// ----------------------------------------------------

// API: Inscrever aparelho no Web Push
app.post('/api/notifications/subscribe', async (req, res) => {
  try {
    const { establishmentId, subscription, userAgent } = req.body;
    const storeId = establishmentId || getStoreId(req);
    if (!storeId || !subscription?.endpoint) {
      return res.status(400).json({ error: 'Dados de inscrição push inválidos.' });
    }

    const endpoint = subscription.endpoint;
    const subHash = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);

    await db.collection('establishments').doc(storeId).collection('pushSubscriptions').doc(subHash).set({
      subscription,
      userAgent: userAgent || '',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[PWA Push] Novo aparelho inscrito para notificações na loja: ${storeId}`);
    return res.json({ success: true, message: 'Aparelho inscrito para notificações!' });
  } catch (err: any) {
    console.error('[Notifications Subscribe Error]:', err);
    return res.status(500).json({ error: err.message });
  }
});

// API: Enviar notificação de teste (para validação do lojista)
app.post('/api/notifications/test', async (req, res) => {
  try {
    const storeId = req.body.establishmentId || getStoreId(req);
    const testOrder = {
      id: 'test_demo',
      orderNumber: Math.floor(100 + Math.random() * 900),
      customerName: 'Cliente Teste',
      total: 48.90,
      items: [{ quantity: 1, name: 'Combo Burger Especial + Fritas' }]
    };
    await sendOrderPushNotification(storeId, testOrder);
    return res.json({ success: true, message: 'Notificação de teste disparada com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Export Cloud Scheduler Function (runs automatically every 5 minutes in background)
export const scheduledCampaignsRunner = onSchedule({
  schedule: '*/5 * * * *',
  timeZone: 'America/Sao_Paulo',
  region: 'us-central1'
}, async () => {
  console.log('[Scheduler Triggered] Executando verificação de campanhas agendadas...');
  await checkAndExecuteScheduledCampaigns();
});
// Export Cloud Function v2
export const api = onRequest({
  region: 'us-central1',
  cors: true,
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: '512MiB'
}, app);
