import { affiliateDirectReply, AFFILIATE_SEGMENT } from './functions/src/affiliate';
import {registerInboxRoutes} from './functions/src/inbox';
import { registerInstagramWebhookRoutes } from './functions/src/instagramWebhook';
import express from 'express';
import { registerAutomotiveRoutes, saveAutomotiveContactAndSyncCrm, AutomotiveConversationContext } from './functions/src/automotive';
import { extractTrafficAttribution } from './functions/src/metaCapi';
import { MAX_MODEL3D_BYTES, MODEL3D_STORAGE_BUCKET, Model3dValidationError, model3dStoragePath, model3dUpdate, validateGlb } from './functions/src/automotiveModel3d';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { triageInboundMessageWithJev, qualifyLeadWithJev } from './src/utils/typesafeJev.js';
import { generateVoiceAudioBase64 } from './src/server/voiceGenerator.js';
import { isOwnerAdminMessage, processAdminCoPilotCommand } from './src/server/adminCoPilot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase Config
const configPath = path.join(__dirname, 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Force environment variables for Google SDKs
if (firebaseConfig.projectId) {
  process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
  process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
  process.env.FIREBASE_CONFIG = JSON.stringify(firebaseConfig);
}

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  const serviceAccountPath = path.join(__dirname, 'service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    console.log('[Firebase Admin] Usando service-account.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath),
      projectId: firebaseConfig.projectId
    });
  } else {
    console.warn('[Firebase Admin] service-account.json não encontrado. Usando credenciais padrão.');
    admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
  }
}

const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId) {
  db.settings({
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId
  });
}

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genai = new GoogleGenAI({ apiKey: geminiApiKey });

const DEFAULT_ESTABLISHMENT_ID = 'default_store';

// Helper to seed initial sample data if empty
async function seedDefaultDataIfNeeded() {
  try {
    const estRef = db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID);
    const estSnap = await estRef.get();
    if (!estSnap.exists) {
      await estRef.set({
        id: DEFAULT_ESTABLISHMENT_ID,
        name: 'Burger & Cia Gourmet',
        phone: '5511999999999',
        address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
        deliveryFee: 7.50,
        estimatedDeliveryTime: '35 a 50 minutos',
        operatingHours: 'Terça a Domingo das 18:00 às 23:30',
        pixKey: 'contato@burgercia.com.br',
        evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081',
        evolutionApiKey: process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108',
        evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME || 'pedidos_zap',
        evolutionConnected: false,
        aiPromptCustom: 'Você é o atendente virtual do Burger & Cia Gourmet. Seja simpático, acolhedor, rápido e use emojis moderados. Tire dúvidas sobre o cardápio e quando o cliente decidir, monte o pedido perguntando: nome do cliente, se é delivery ou retirada, endereço (se delivery) e forma de pagamento (PIX, Cartão na entrega ou Dinheiro com troco). Sempre confirme os itens antes de registrar.',
        aiWelcomeMessage: 'Olá! Seja muito bem-vindo ao Burger & Cia Gourmet 🍔! O que você gostaria de pedir hoje?',
        createdAt: new Date().toISOString()
      });
      console.log('[Seed] Estabelecimento padrão criado com sucesso!');

      // Add default products
      const defaultProducts = [
        {
          id: 'prod_1',
          name: 'Smash Bacon Salad',
          description: 'Pão brioche selado, 2 carnes smash de 90g, queijo cheddar derretido, fatias de bacon crocante, alface, tomate e maionese da casa.',
          price: 32.90,
          category: 'Hambúrgueres',
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
          available: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'prod_2',
          name: 'Duplo Cheddar Melt',
          description: 'Pão australiano macio, 2 hambúrgueres bovinos de 150g, muito creme de cheddar cremoso e cebola caramelizada.',
          price: 38.00,
          category: 'Hambúrgueres',
          imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
          available: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'prod_3',
          name: 'Batata Rústica com Alecrim & Páprica',
          description: 'Batatas rústicas com casca, douradas e crocantes, temperadas com alecrim fresco e páprica defumada. Acompanha maionese verde.',
          price: 18.50,
          category: 'Porções',
          imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
          available: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'prod_4',
          name: 'Coca-Cola Zero 350ml',
          description: 'Lata 350ml bem gelada.',
          price: 6.50,
          category: 'Bebidas',
          imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
          available: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'prod_5',
          name: 'Milkshake de Nutella com Ninho (400ml)',
          description: 'Feito com sorvete artesanal de baunilha, farta calda de Nutella original e leite Ninho polvilhado.',
          price: 22.00,
          category: 'Sobremesas',
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
          available: true,
          createdAt: new Date().toISOString()
        }
      ];

      for (const p of defaultProducts) {
        await estRef.collection('products').doc(p.id).set(p);
      }
      console.log('[Seed] Produtos padrão cadastrados!');
    }
  } catch (err) {
    console.error('[Seed Error]:', err);
  }
}

// Helper to verify if an establishment has active access (7-day free trial or active paid subscription)
function isEstablishmentSubscriptionActive(est: any): boolean {
  if (!est) return true;
  // Demo store always allowed for previewing
  if (est.id === DEFAULT_ESTABLISHMENT_ID) return true;

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

async function sendAlertPushNotification(establishmentId: string, alertData: { title: string; body: string; url?: string }) {
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
        url: alertData.url || '/?tab=orders'
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

const evoServerTokenCache = new Map<string, string>();

async function findEvolutionServerToken(evoUrl: string, evoKey: string, evoInst: string): Promise<string | null> {
  const cacheKey = `${evoUrl}:${evoInst}`;
  if (evoServerTokenCache.has(cacheKey)) return evoServerTokenCache.get(cacheKey)!;
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
          evoServerTokenCache.set(cacheKey, token);
          return token;
        }
      }
    }
  } catch (e: any) {
    console.warn('[findEvolutionServerToken Error]:', e.message);
  }
  return null;
}

// Evolution API helper: Send WhatsApp Message (Supports Evolution Go and Evolution API v1/v2)
async function sendWhatsAppMessage(
  evolutionUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const isGroup = number.includes('@g.us');
    const isLid = number.includes('@lid');
    let cleanNumber = number;
    if (!isGroup && !isLid) {
      const numeric = number.replace(/\D/g, '');
      cleanNumber = numeric.startsWith('55') ? numeric : `55${numeric}`;
    }
    const cleanUrl = evolutionUrl.replace(/\/$/, '');

    let activeToken = instanceName;
    console.log(`[Evolution API] Enviando mensagem para ${cleanNumber} (instância ${activeToken})...`);

    // Anti-Ban: Calculate natural human typing delay (proportional to text length + random jitter)
    // Between 2.2s and 6.5s so Meta heuristics detect realistic human keyboard action
    const charDelay = Math.min(5500, Math.max(2200, Math.floor((text || '').length * 18)));
    const randomJitter = Math.floor(Math.random() * 1200);
    const typingDelay = charDelay + randomJitter;

    // Send presence 'composing' (digitando...) via Evolution Go /message/presence
    try {
      fetch(`${cleanUrl}/message/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: activeToken },
        body: JSON.stringify({ number: cleanNumber, state: 'composing', delay: Math.min(typingDelay, 4000) }),
        signal: AbortSignal.timeout(3000)
      }).catch(() => {});
    } catch {}

    // 1. Try Evolution Go (/send/text with token as apikey)
    try {
      const respGo = await fetch(`${cleanUrl}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': activeToken
        },
        body: JSON.stringify({
          number: cleanNumber,
          text: text,
          delay: typingDelay
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (respGo.ok) {
        const dataGo = await respGo.json();
        console.log(`[Evolution API Go] Mensagem enviada com sucesso para ${cleanNumber}!`);
        return { success: true, data: dataGo };
      }

      if (respGo.status === 401) {
        const discovered = await findEvolutionServerToken(cleanUrl, apiKey, instanceName);
        if (discovered && discovered !== activeToken) {
          activeToken = discovered;
          console.log(`[Evolution API Go] Retentando envio com token descoberto: ${activeToken}`);
          const retryGo = await fetch(`${cleanUrl}/send/text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': activeToken
            },
            body: JSON.stringify({
              number: cleanNumber,
              text: text,
              delay: typingDelay
            }),
            signal: AbortSignal.timeout(12000)
          });
          if (retryGo.ok) {
            const dataGo = await retryGo.json();
            return { success: true, data: dataGo };
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Evolution API Go] Falha ao tentar /send/text:`, e.message);
    }

    // 2. Fallback to Evolution API v1/v2 (/message/sendText/{instance})
    const url = `${cleanUrl}/message/sendText/${activeToken}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        number: cleanNumber,
        options: {
          delay: typingDelay,
          presence: 'composing',
          linkPreview: false
        },
        textMessage: {
          text: text
        }
      })
    });

    const rawText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { message: rawText };
    }

    if (!response.ok) {
      console.warn('[Evolution API Response Warning]:', data.message || rawText);
      return { success: false, error: data.message || rawText };
    }

    console.log(`[Evolution API] Mensagem enviada com sucesso para ${cleanNumber}!`);
    return { success: true, data };
  } catch (err: any) {
    console.error('[Evolution API Network Error]:', err.message);
    return { success: false, error: err.message };
  }
}

// Evolution API helper: Send Humanized WhatsApp Voice Message (PTT Audio)
async function sendWhatsAppAudio(
  evolutionUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  base64Audio: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const isGroup = number.includes('@g.us');
    const isLid = number.includes('@lid');
    let cleanNumber = number;
    if (!isGroup && !isLid) {
      const numeric = number.replace(/\D/g, '');
      cleanNumber = numeric.startsWith('55') ? numeric : `55${numeric}`;
    }
    const cleanUrl = evolutionUrl.replace(/\/$/, '');
    let activeToken = instanceName;

    console.log(`[SendAudio] Enviando áudio de voz para ${cleanNumber} via ${cleanUrl}/send/media (tamanho: ${base64Audio.length})`);
    let res = await fetch(`${cleanUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: activeToken
      },
      body: JSON.stringify({
        number: cleanNumber,
        type: 'audio',
        url: base64Audio,
        delay: 500
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok && res.status === 401) {
      const discovered = await findEvolutionServerToken(cleanUrl, apiKey, instanceName);
      if (discovered && discovered !== activeToken) {
        activeToken = discovered;
        res = await fetch(`${cleanUrl}/send/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: activeToken
          },
          body: JSON.stringify({
            number: cleanNumber,
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

// Process conversation with Google Gemini
async function processAiCustomerMessage(
  establishmentId: string,
  customerPhone: string,
  incomingText: string,
  customerNameParam?: string,
  mediaPart?: { mimeType: string; data: string },
  _model?: string,
  channel: 'whatsapp' | 'instagram' = 'whatsapp'
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

  const safePhone = channel === 'instagram' ? customerPhone : customerPhone.replace(/\D/g, '') || customerPhone;
  const customerMemorySnap = await db.collection('establishments').doc(establishmentId).collection('customers').doc(safePhone).get().catch(() => null);
  const customerMemory = customerMemorySnap?.data() || {};
  const savedAutoCtx: AutomotiveConversationContext = customerMemory.automotiveContext || {};

  // Fetch active products
  const productsSnap = await db.collection('establishments').doc(establishmentId).collection('products').where('available', '==', true).get();
  const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Fetch recent conversation history
  const chatRef = db.collection('establishments').doc(establishmentId).collection('chats').doc(customerPhone).collection('messages');
  const historySnap = await chatRef.orderBy('timestamp', 'asc').limitToLast(15).get();
  const history = historySnap.docs.map(d => d.data());

  // Save current incoming message to history
  await chatRef.add({
    sender: 'user',
    text: incomingText,
    timestamp: new Date().toISOString()
  });

  if (establishment.segment === AFFILIATE_SEGMENT) return affiliateDirectReply(db, establishmentId, customerPhone, textForAi, channel);

  const menuText = products.map((p: any) => 
    `- [ID: ${p.id}] ${p.name} (R$ ${Number(p.price).toFixed(2)}) [Categoria: ${p.category}]: ${p.description || ''}`
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
Seu objetivo é atender os clientes pelo WhatsApp de forma educada, ágil, simpática e objetiva.

DADOS DO ESTABELECIMENTO:
- Nome: ${establishment.name}
- Horário de Funcionamento: ${establishment.operatingHours || 'Aberto agora'}
- Endereço da Loja: ${establishment.address || 'Não informado'}
- Taxa de Entrega / Despacho: R$ ${Number(establishment.deliveryFee || 0).toFixed(2)}
- Tempo Estimado / Agendamento: ${establishment.estimatedDeliveryTime || '40 minutos'}
- Chave PIX: ${establishment.pixKey || 'Chave cadastrada no caixa'}
- Formas de Pagamento Aceitas: PIX, Cartão (Crédito/Débito), Dinheiro/Financiamento.
${establishment.aiPromptCustom ? `\nINSTRUÇÕES PERSONALIZADAS DO ESTABELECIMENTO:\n${establishment.aiPromptCustom}` : ''}

${catalogHeader}:
${menuText || 'Nenhum item cadastrado no momento.'}

COMO VOCÊ DEVE AGIR:
1. Responda dúvidas sobre especificações, preços e categorias com base estritamente no catálogo acima.
2. Seja proativo em sugerir opções ou adicionais que combinem com a busca do cliente.
3. FLUXO DE PEDIDO / PROPOSTA:
   Quando o cliente quiser fechar um pedido ou proposta, certifique-se de ter:
   - Nome do cliente
   - Itens escolhidos e quantidades (e observações ou condições)
   - Se é ENTREGA/ENVIO ou RETIRADA/VISITA na loja
   - Se for entrega: Endereço completo
   - Forma de pagamento (PIX, Cartão, Dinheiro ou Financiamento).
4. QUANDO TODOS OS DADOS ESTIVEREM COMPLETOS:
   Você DEVE acionar a ferramenta/função 'registrar_pedido' para registrar no sistema da loja.
   Após chamar a ferramenta com sucesso, informe ao cliente de maneira acolhedora que o pedido foi enviado e que ele receberá a confirmação da equipe!
  `;

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
   - Use formatação limpa de WhatsApp: negrito com um asterisco (*texto*) e listas com '• '.`;

  const registrarInteresseProjetoTool = {
    name: 'registrar_interesse_projeto',
    description: 'Salva o contexto da conversa no WhatsApp e registra/atualiza o lead e projeto do cliente no CRM de Performance & Escapamentos da loja. Chame sempre que o cliente informar dados do veículo, objetivo do projeto, modificações, nome, CEP ou interesse em orçamento.',
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
        cep: { type: 'string', description: 'CEP do cliente para envio nacional' },
        delivery: { type: 'string', enum: ['Envio nacional', 'Atendimento local', 'A definir'], description: 'Modalidade escolhida: Envio nacional ou Atendimento local na oficina' },
        referenceNames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nomes das referências do catálogo pelas quais o cliente se interessou'
        },
        summary: { type: 'string', description: 'Resumo executivo do contexto da conversa para o consultor técnico da loja' },
        leadTemperature: { type: 'string', enum: ['HOT', 'WARM', 'COLD'], description: 'Temperatura do interesse do cliente' }
      }
    }
  };

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

  const enviarLocalizacaoLojaTool = {
    name: 'enviar_localizacao_loja',
    description: 'Envia o card interativo oficial de localização GPS da loja/oficina com mapa clicável no WhatsApp quando o cliente perguntar o endereço, onde fica a oficina/loja, como chegar ou optar por atendimento local.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo do envio da localização' }
      }
    }
  };

  // Define Function Calling Tool for order placement
  const registrarPedidoTool = {
    name: 'registrar_pedido',
    description: 'Registra o pedido finalizado do cliente no sistema da loja para confirmação do restaurante.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Nome informado pelo cliente' },
        deliveryType: { type: 'string', enum: ['DELIVERY', 'RETIRADA'], description: 'Tipo do pedido' },
        customerAddress: { type: 'string', description: 'Endereço de entrega completo com número e bairro' },
        paymentMethod: { type: 'string', description: 'Forma de pagamento (ex: PIX, Cartão Débito na entrega, Dinheiro troco para 50)' },
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
      required: ['customerName', 'deliveryType', 'paymentMethod', 'items']
    }
  };

  try {
    // Format conversation history for Gemini
    if (channel === 'instagram') {
      systemInstruction = systemInstruction.replace(/WhatsApp/gi, 'Instagram Direct');
      systemInstruction += '\nCANAL INSTAGRAM: Responda no Direct em texto simples. Não sugira recursos exclusivos do WhatsApp. Para localização use endereço e link de mapa. Não trate o identificador ig_ como telefone.';
      systemInstruction += '\nESTILO DO DIRECT: Prefira respostas curtas, em geral de 2 a 4 frases e até cerca de 600 caracteres, sem omitir informações essenciais. Use 1 ou 2 parágrafos naturais, sem quebrar linha depois de cada frase. Faça no máximo uma pergunta por resposta. Evite repetir apresentações, elogios longos e explicações já dadas. Use listas apenas quando ajudarem ou forem solicitadas. Não divida a resposta em várias mensagens por conta própria; o envio organiza os blocos quando necessário.';
    }
    const contents: any[] = [];
    
    // Add past messages
    for (const h of history) {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    }

    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: textForAi }, ...(mediaPart ? [{ inlineData: mediaPart }] : [])]
    });

    const activeTools = isAutomotive
      ? [registrarInteresseProjetoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool, enviarLocalizacaoLojaTool]
      : [registrarPedidoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool, enviarLocalizacaoLojaTool];

    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [{ functionDeclarations: activeTools as any }],
        temperature: 0.3
      }
    });

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
          automotiveToolArgs = { ...(automotiveToolArgs || {}), ...(call.args as any) };
          forceRegisterAutomotive = true;
        }
        if (call.name === 'enviar_cardapio_com_fotos') {
          const prodsToSend = products.filter((p: any) => p.available !== false && p.imageUrl).slice(0, 10);
          mediaList = prodsToSend.map((p: any) => ({
            url: p.imageUrl,
            caption: isAutomotive
              ? `🏁 *${p.name}*\n${p.description || ''}\nReferência: aplicação e orçamento sob análise técnica.`
              : `🍽️ *${p.name}* - R$ ${Number(p.price).toFixed(2)}\n${p.description || ''}`,
            productName: p.name
          }));
        }
        if (call.name === 'enviar_foto_produto') {
          const args: any = call.args;
          const searchName = String(args.productName || '').toLowerCase().trim();
          const found: any = products.find((prod: any) =>
            (args.productId && prod.id === args.productId) ||
            String(prod.name || '').toLowerCase().includes(searchName) ||
            searchName.includes(String(prod.name || '').toLowerCase())
          );
          if (found) {
            if (found.imageUrl) {
              mediaList.push({
                url: found.imageUrl,
                caption: isAutomotive
                  ? `🏁 *${found.name}*\n${found.description || ''}\nAplicação e orçamento sob análise técnica.`
                  : `*${found.name}* - R$ ${Number(found.price).toFixed(2)}\n${found.description || ''}`,
                productName: found.name,
                type: 'image'
              });
            }
            if ((args.mediaType === 'video' || args.mediaType === 'all') && found.videoUrl) {
              mediaList.push({
                url: found.videoUrl,
                caption: `🏁 *Vídeo & Ronco do Projeto:* ${found.name}\n${found.description || ''}`,
                productName: found.name,
                type: 'video'
              });
            }
          }
        }
        if (call.name === 'enviar_localizacao_loja') {
          locationToSend = {
            latitude: Number(establishment.latitude || -8.05428),
            longitude: Number(establishment.longitude || -34.8813),
            name: establishment.name || 'Nossa Localização',
            address: establishment.address || 'Consulte nosso endereço'
          };
        }
        if (call.name === 'registrar_pedido') {
          if (isAutomotive) {
            forceRegisterAutomotive = true;
            continue;
          }
          const args: any = call.args;
          
          // Calculate subtotals
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

          // Generate sequential-like order number
          const orderCountSnap = await db.collection('establishments').doc(establishmentId).collection('orders').count().get();
          const orderNumber = (orderCountSnap.data().count || 0) + 101;

          const orderData = {
            establishmentId: establishmentId,
            orderNumber: orderNumber,
            customerName: args.customerName || customerNameParam || 'Cliente',
            customerPhone: customerPhone,
            customerAddress: args.customerAddress || (args.deliveryType === 'RETIRADA' ? 'Retirada no Balcão' : 'A confirmar'),
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

          // Disparar Push Notification em segundo plano para o lojista
          sendOrderPushNotification(establishmentId, createdOrder).catch(err => console.warn('[Push Dispatch Warning]:', err));

          console.log(`[Order Created] Pedido #${orderNumber} registrado para ${customerPhone}! Total: R$ ${total}`);

          const orderTitleText = isVehicles ? `Proposta / Pedido #${orderNumber}` : isRealEstate ? `Proposta / Agendamento #${orderNumber}` : `Pedido #${orderNumber}`;
          const approvalText = isVehicles
            ? `Assim que nossa equipe de consultores aprovar sua solicitação, entraremos em contato para finalizar os detalhes!`
            : isRealEstate
            ? `Assim que nossa equipe imobiliária confirmar a disponibilidade da visita, você receberá a confirmação aqui mesmo no WhatsApp!`
            : isFood
            ? `Assim que a cozinha aprovar seu pedido, você receberá a confirmação aqui mesmo no WhatsApp!`
            : `Assim que nossa equipe confirmar sua solicitação, você receberá a confirmação aqui mesmo no WhatsApp!`;

          // Give model output or default confirmation
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

    if (isAutomotive) {
      const autoSync = await saveAutomotiveContactAndSyncCrm({
        db,
        establishmentId,
        customerPhone,
        customerName: customerNameParam,
        incomingText: textForAi,
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
          body: `${ctx.summary || textForAi}`.slice(0, 120),
          url: '/?tab=orders'
        }).catch(() => {});
      }

      if (!replyText && (ctx.brand || ctx.model)) {
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

    if (!replyText) {
      replyText = isAutomotive
        ? 'Olá! Para organizarmos seu projeto e encaminharmos para análise técnica, qual é a marca, modelo, ano e versão do seu veículo? 🏁'
        : isVehicles
        ? 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com os veículos disponíveis?'
        : isRealEstate
        ? 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com nossos imóveis?'
        : isFashion
        ? 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com a nossa coleção?'
        : isElectronics
        ? 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com nosso catálogo de produtos?'
        : 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com o cardápio?';
    }

    const finalTs = new Date().toISOString();

    // Save assistant reply to chat history
    await chatRef.add({
      sender: 'assistant',
      text: replyText,
      timestamp: finalTs,
      orderId: createdOrder ? createdOrder.id : null,
      mediaUrl: mediaList.length > 0 ? mediaList[0].url : null,
      location: locationToSend || null
    });

    await db.collection('establishments').doc(establishmentId).collection('chats').doc(customerPhone).set({
      customerPhone,
      customerName: customerMemory.name || customerNameParam || 'Cliente WhatsApp',
      segment: establishment.segment || 'FOOD',
      lastMessage: replyText,
      lastUserMessage: incomingText,
      lastTimestamp: finalTs,
      updatedAt: finalTs
    }, { merge: true }).catch(() => {});

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
      replyText: 'Olá! Nosso sistema está atualizando no momento. Já chamei um atendente humano para te responder em instantes!'
    };
  }
}

async function startServer() {
  await seedDefaultDataIfNeeded();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

  app.use(express.json({ limit:'28mb', verify: (req, _res, buffer) => { (req as any).rawBody = buffer; } }));
  registerInstagramWebhookRoutes(app, db, processAiCustomerMessage, { inlineWorker: true });
  registerAutomotiveRoutes(app, db);
registerInboxRoutes(app, db);

  // Helper to resolve establishmentId in multi-tenant requests
  function getStoreId(req: express.Request): string {
    return (
      (req.params && req.params.establishmentId) ||
      (req.query && (req.query.establishmentId as string)) ||
      (req.headers && (req.headers['x-establishment-id'] as string)) ||
      (req.body && req.body.establishmentId) ||
      DEFAULT_ESTABLISHMENT_ID
    );
  }

  // ----------------------------------------------------
  // API: Evolution API Webhook Receiver (Multi-Tenant)
  // ----------------------------------------------------
  app.post(['/api/webhook/evolution', '/api/webhook/evolution/:establishmentId'], async (req, res) => {
    try {
      const payload = req.body;
      console.log('[Webhook Evolution] Evento recebido:', payload.event || payload.type);

      // We handle messages.upsert
      const eventType = payload.event || payload.type;
      if (eventType === 'messages.upsert' || payload.data?.message) {
        const messageData = payload.data || payload;
        const key = messageData.key || {};
        
        const remoteJid = key.remoteJid || '';
        if (remoteJid.includes('@g.us')) {
          // Ignore groups
          return res.status(200).json({ status: 'ignored_group' });
        }

        const senderPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        
        // Extract text or location message content
        const msg = messageData.message || {};
        let textContent = 
          msg.conversation || 
          msg.extendedTextMessage?.text || 
          msg.imageMessage?.caption || 
          '';

        const locationMsg = msg.locationMessage || 
                            msg.LocationMessage || 
                            msg.liveLocationMessage || 
                            messageData.locationMessage;

        const audioMsg = msg.audioMessage || messageData.audioMessage || msg.voiceMessage;

        if (locationMsg) {
          const lat = Number(locationMsg.degreesLatitude ?? locationMsg.latitude);
          const lng = Number(locationMsg.degreesLongitude ?? locationMsg.longitude);
          if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
            const locDesc = (locationMsg.name || locationMsg.address)
              ? `${locationMsg.name ? locationMsg.name + ' - ' : ''}${locationMsg.address}`
              : `Coordenadas GPS: ${lat}, ${lng}`;
            const wazeDirect = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
            const mapsDirect = `https://www.google.com/maps?q=${lat},${lng}`;
            textContent = `[LOCALIZAÇÃO GPS RECEBIDA DO WHATSAPP]:\nO cliente compartilhou a localização exata no WhatsApp!\n- Latitude: ${lat}\n- Longitude: ${lng}\n- Referência: ${locDesc}\n- Waze: ${wazeDirect}\n- Google Maps: ${mapsDirect}`;
          }
        } else if (audioMsg && !textContent.trim()) {
          textContent = 'Olá! Te enviei uma mensagem de áudio pelo WhatsApp. Pode me responder?';
        }

        // Resolve target establishment
        let targetStoreId = req.params.establishmentId;
        const instanceName = payload.instance || payload.data?.instance || '';

        if (!targetStoreId && instanceName) {
          const querySnap = await db.collection('establishments')
            .where('evolutionInstanceName', '==', instanceName)
            .limit(1)
            .get();
          if (!querySnap.empty) {
            targetStoreId = querySnap.docs[0].id;
          }
        }

        if (!targetStoreId) {
          targetStoreId = DEFAULT_ESTABLISHMENT_ID;
        }

        const estDoc = await db.collection('establishments').doc(targetStoreId).get();
        const est = estDoc.data() || {};

        const info = messageData.Info || messageData.info || payload.Info || payload.info || {};
        const infoChat = info.Chat || '';
        const infoSender = info.Sender || '';
        const fromMe = info.IsFromMe ?? key.fromMe ?? messageData.fromMe ?? false;

        // Check if this message is from the Store Owner (Self-Chat only)
        const isAdmin = isOwnerAdminMessage(fromMe, remoteJid, senderPhone, infoChat, infoSender, est);

        // Ignore messages sent by the owner to contacts/customers (fromMe)
        if (fromMe && !isAdmin) {
          return res.status(200).json({ status: 'ignored_from_me' });
        }

        // Loop check for Co-Pilot
        if (textContent && (textContent.startsWith('👨‍🍳 *Co-Pilot') || textContent.startsWith('🤖 *Co-Pilot') || textContent.startsWith('🤖 *Assistente'))) {
          return res.status(200).json({ status: 'ignored_copilot_echo' });
        }

        // ----------------------------------------------------
        // 👨‍🍳 ADMIN CO-PILOT (Gestão da Loja pelo WhatsApp do Dono)
        // ----------------------------------------------------
        if (isAdmin) {
          console.log(`[Admin Co-Pilot] 👑 Mensagem do Dono/Gestor detectada para loja "${est.name || targetStoreId}" (de ${senderPhone}, self-chat: ${key.fromMe})`);

          let evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
          if (evoUrl.includes('localhost:8080') || !evoUrl) {
            evoUrl = (process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
          }
          let evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
          if (!evoKey) evoKey = 'minha_chave_secreta_7108';
          const evoInst = (est.evolutionInstanceName || instanceName || 'pedidos_zap').trim();

          const copilotResult = await processAdminCoPilotCommand(targetStoreId, est, textContent, null, db);
          const targetRecipient = remoteJid.includes('@lid') ? remoteJid : senderPhone;

          if (copilotResult.replyText) {
            if (audioMsg && est.aiVoiceMirrorEnabled !== false) {
              try {
                const chosenVoice = est.aiVoiceId || 'pt-BR-FranciscaNeural';
                const audioBase64 = await generateVoiceAudioBase64(copilotResult.replyText, chosenVoice);
                if (audioBase64) {
                  await sendWhatsAppAudio(evoUrl, evoKey, evoInst, targetRecipient, audioBase64);
                }
              } catch (vErr: any) {
                console.warn('[Admin Co-Pilot Voice Error]:', vErr.message);
              }
            }

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, targetRecipient, copilotResult.replyText);
          }

          return res.status(200).json({
            status: 'admin_copilot_executed',
            action: copilotResult.actionTaken,
            reply: copilotResult.replyText
          });
        }

        if (!textContent.trim()) {
          return res.status(200).json({ status: 'no_text' });
        }

        console.log(`[WhatsApp Inbound] De: ${senderPhone} | Mensagem: "${textContent}"`);
        console.log(`[WhatsApp Multi-Tenant] Roteado para o Estabelecimento: ${targetStoreId}`);

        // Subscription / Trial Verification (7 days trial or paid subscription)
        if (!isEstablishmentSubscriptionActive(est)) {
          console.warn(`[WhatsApp Multi-Tenant] 🛑 BLOQUEADO: Assinatura do estabelecimento "${est.name || targetStoreId}" expirada (teste de 7 dias encerrado). Mensagem de ${senderPhone} não será respondida pela IA.`);
          return res.status(200).json({
            status: 'subscription_expired',
            message: 'Período de teste de 7 dias encerrado. Ative seu plano mensal (a partir de R$ 197/mês) para continuar.'
          });
        }

        // Resolve Evolution credentials
        let evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        if (evoUrl.includes('localhost:8080') || !evoUrl) {
          evoUrl = (process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        }
        let evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
        if (!evoKey) evoKey = 'minha_chave_secreta_7108';
        const evoInst = (est.evolutionInstanceName || instanceName || 'pedidos_zap').trim();

        // AI Operating Hours Verification (Check if store is open in America/Sao_Paulo)
        const openStatus = isEstablishmentOpenNow(est);
        if (!openStatus.isOpen) {
          console.log(`[WhatsApp Multi-Tenant] 🌙 IA em repouso para o estabelecimento "${est.name || targetStoreId}": ${openStatus.reason}`);

          // Prune outOfHoursReplies cache if large
          if (outOfHoursReplies.size > 2000) {
            const cutoff = Date.now() - 6 * 60 * 60 * 1000;
            for (const [k, t] of outOfHoursReplies.entries()) {
              if (t < cutoff) outOfHoursReplies.delete(k);
            }
          }

          const outOfHoursAction = est.aiOutOfHoursAction || 'SILENT';
          if (outOfHoursAction === 'AUTO_REPLY') {
            const cacheKey = `${targetStoreId}_${senderPhone}`;
            const lastReply = outOfHoursReplies.get(cacheKey) || 0;
            const nowMs = Date.now();
            const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

            if (nowMs - lastReply > THREE_HOURS_MS) {
              outOfHoursReplies.set(cacheKey, nowMs);
              const customMsg = est.aiOutOfHoursMessage || 
                `Olá! Agradecemos pelo seu contato. 😊\n\nNo momento nosso atendimento automático de pedidos está fechado. Deixe sua mensagem que te responderemos assim que abrirmos nosso expediente!\n\nHorário de atendimento: ${est.operatingHours || 'Consulte nosso horário em nosso perfil.'}`;
              
              await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, customMsg);
              console.log(`[WhatsApp Multi-Tenant] Mensagem automática de fora do expediente enviada para ${senderPhone}`);
              return res.status(200).json({ status: 'out_of_hours_replied' });
            } else {
              console.log(`[WhatsApp Multi-Tenant] Mensagem fora do expediente suprimida para ${senderPhone} (já enviada recentemente)`);
              return res.status(200).json({ status: 'out_of_hours_throttled' });
            }
          }

          // Silent mode: do not respond at all
          console.log(`[WhatsApp Multi-Tenant] Modo silencioso fora do expediente. Nenhuma resposta enviada para ${senderPhone}`);
          return res.status(200).json({ status: 'out_of_hours_silent' });
        }

        // Anti-Ban Layer 1: Automatic Opt-out Interceptor
        // If recipient replies 0, parar, sair, cancelar, etc., auto-block from future marketing broadcasts and confirm politely
        const cleanInboundText = (textContent || '').trim().toLowerCase();
        const optOutKeywords = ['0', 'parar', 'sair', 'cancelar', 'stop', 'descadastrar', 'remover', 'nao quero mais', 'não quero mais'];
        if (optOutKeywords.includes(cleanInboundText)) {
          console.log(`[Anti-Ban Opt-out] Cliente ${senderPhone} solicitou descadastramento da loja ${targetStoreId}`);
          await db.collection('establishments').doc(targetStoreId).collection('blocked_contacts').doc(senderPhone).set({
            phone: senderPhone,
            blockedAt: new Date().toISOString(),
            reason: `Opt-out automático pelo WhatsApp (mensagem: "${cleanInboundText}")`
          }, { merge: true });

          const optOutReply = `Entendido! Você foi removido da nossa lista de novidades e promoções com sucesso. ✅\n\nCaso queira voltar a receber nossas ofertas no futuro, basta nos avisar por aqui. Se precisar de algo ou quiser fazer um pedido agora, fico à disposição! 😊`;
          await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, optOutReply);
          return res.status(200).json({ status: 'opt_out_processed', phone: senderPhone });
        }

        // ----------------------------------------------------
        // TypeSafe AI (Jev - System One) Fast Triage (~100ms)
        // ----------------------------------------------------
        let jevTriage: any = null;
        if (textContent.trim()) {
          jevTriage = await triageInboundMessageWithJev(textContent, { name: est.name, segment: est.segment });
        }

        if (jevTriage) {
          // 1. FAST PATH: PIX Key Query
          if (jevTriage.intent === 'PIX_QUERY' && est.pixKey && est.pixKey.trim()) {
            const cleanPix = est.pixKey.trim();
            const fastPixReply = `Nossa chave PIX para pagamento é:\n\n🔑 *${cleanPix}*\n\nAssim que você realizar a transferência, basta enviar o comprovante aqui para confirmarmos seu pedido com carinho! 😊`;

            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'user',
              text: textContent,
              timestamp: new Date().toISOString(),
              jevIntent: 'PIX_QUERY'
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'assistant',
              text: fastPixReply,
              timestamp: new Date().toISOString(),
              jevHandled: true
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
              customerPhone: senderPhone,
              customerName: messageData.pushName || 'Cliente WhatsApp',
              lastMessage: fastPixReply,
              lastTimestamp: new Date().toISOString(),
              lastJevIntent: 'PIX_QUERY'
            }, { merge: true });

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, fastPixReply);
            console.log(`[TypeSafe Jev Fast Path] Resposta PIX enviada em ~${jevTriage.durationMs}ms para ${senderPhone}`);
            return res.status(200).json({ status: 'jev_fast_pix', reply: fastPixReply });
          }

          // 2. FAST PATH: Operating Hours Query
          if (jevTriage.intent === 'STORE_HOURS' && est.operatingHours) {
            const fastHoursReply = `Olá, *${messageData.pushName || 'cliente'}*! ⏰\nNosso horário de funcionamento é:\n*${est.operatingHours}*\n\nComo posso te ajudar hoje? Deseja ver nosso cardápio ou fazer um pedido? 😊`;

            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'user',
              text: textContent,
              timestamp: new Date().toISOString(),
              jevIntent: 'STORE_HOURS'
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'assistant',
              text: fastHoursReply,
              timestamp: new Date().toISOString(),
              jevHandled: true
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
              customerPhone: senderPhone,
              customerName: messageData.pushName || 'Cliente WhatsApp',
              lastMessage: fastHoursReply,
              lastTimestamp: new Date().toISOString(),
              lastJevIntent: 'STORE_HOURS'
            }, { merge: true });

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, fastHoursReply);
            console.log(`[TypeSafe Jev Fast Path] Resposta Horário enviada em ~${jevTriage.durationMs}ms para ${senderPhone}`);
            return res.status(200).json({ status: 'jev_fast_store_hours', reply: fastHoursReply });
          }

          // 3. FAST PATH: Store Address / Location Query
          if (jevTriage.intent === 'STORE_LOCATION' && est.address) {
            const fastLocationReply = `Nosso endereço é: 📍 *${est.address}*.\n\nVocê prefere retirar no balcão ou pedir por entrega? 🛵`;

            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'user',
              text: textContent,
              timestamp: new Date().toISOString(),
              jevIntent: 'STORE_LOCATION'
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'assistant',
              text: fastLocationReply,
              timestamp: new Date().toISOString(),
              jevHandled: true
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
              customerPhone: senderPhone,
              customerName: messageData.pushName || 'Cliente WhatsApp',
              lastMessage: fastLocationReply,
              lastTimestamp: new Date().toISOString(),
              lastJevIntent: 'STORE_LOCATION'
            }, { merge: true });

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, fastLocationReply);
            console.log(`[TypeSafe Jev Fast Path] Resposta Endereço enviada em ~${jevTriage.durationMs}ms para ${senderPhone}`);
            return res.status(200).json({ status: 'jev_fast_store_location', reply: fastLocationReply });
          }

          // 4. FAST PATH: Order Status Inquiry
          if (jevTriage.intent === 'ORDER_STATUS') {
            const recentOrdersSnap = await db.collection('establishments').doc(targetStoreId)
              .collection('orders')
              .where('customerPhone', '==', senderPhone)
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
                const fastStatusReply = `Olá, *${messageData.pushName || 'cliente'}*! 😊\n\nO seu pedido *#${recentOrder.orderNumber}* está com status:\n👉 *${statusText}*\n\n${est.estimatedDeliveryTime ? `⏱️ Previsão de entrega: *${est.estimatedDeliveryTime}*\n` : ''}Qualquer dúvida estamos à disposição!`;

                await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
                  sender: 'user',
                  text: textContent,
                  timestamp: new Date().toISOString(),
                  jevIntent: 'ORDER_STATUS'
                });
                await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
                  sender: 'assistant',
                  text: fastStatusReply,
                  timestamp: new Date().toISOString(),
                  jevHandled: true
                });
                await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
                  customerPhone: senderPhone,
                  customerName: messageData.pushName || 'Cliente WhatsApp',
                  lastMessage: fastStatusReply,
                  lastTimestamp: new Date().toISOString(),
                  lastJevIntent: 'ORDER_STATUS'
                }, { merge: true });

                await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, fastStatusReply);
                console.log(`[TypeSafe Jev Fast Path] Status do pedido #${recentOrder.orderNumber} enviado para ${senderPhone}`);
                return res.status(200).json({ status: 'jev_fast_order_status', reply: fastStatusReply });
              }
            }
          }

          // 5. ESCALATION PATH: Urgent Complaint or Human Takeover Request
          if (jevTriage.urgent || jevTriage.intent === 'COMPLAINT' || jevTriage.intent === 'HUMAN_HELP') {
            const escalationReply = `Compreendo perfeitamente sua solicitação. 🙏\n\nJá notifiquei nossa gerência com prioridade máxima! Um atendente humano irá assumir esta conversa aqui no WhatsApp em instantes para te atender da melhor forma.`;

            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
              customerPhone: senderPhone,
              customerName: messageData.pushName || 'Cliente WhatsApp',
              needsHuman: true,
              urgency: 'HIGH',
              sentiment: jevTriage.sentiment,
              lastJevIntent: jevTriage.intent,
              alertReason: jevTriage.intent === 'COMPLAINT' ? 'Reclamação urgente de cliente' : 'Solicitou atendente humano',
              lastMessage: textContent,
              lastTimestamp: new Date().toISOString()
            }, { merge: true });

            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'user',
              text: textContent,
              timestamp: new Date().toISOString(),
              jevIntent: jevTriage.intent,
              urgent: true
            });
            await db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).collection('messages').add({
              sender: 'assistant',
              text: escalationReply,
              timestamp: new Date().toISOString(),
              jevHandled: true
            });

            // Trigger PWA Push Notification to store owner
            sendAlertPushNotification(targetStoreId, {
              title: `🚨 Alerta Urgente: ${messageData.pushName || senderPhone}`,
              body: `Cliente com urgência (${jevTriage.intent}): "${textContent.slice(0, 70)}"`,
              url: '/?tab=orders'
            }).catch(() => {});

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, escalationReply);
            console.log(`[TypeSafe Jev] 🚨 Transbordo humano disparado para ${senderPhone} (${jevTriage.intent})`);
            return res.status(200).json({ status: 'jev_human_escalation', reply: escalationReply });
          }

          // Lead Scoring for Niche Segments (Vehicles & Real Estate)
          if (est.segment?.includes('VEIC') || est.segment?.includes('IMOB')) {
            qualifyLeadWithJev(textContent, est.segment).then(leadData => {
              if (leadData) {
                db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
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
          db.collection('establishments').doc(targetStoreId).collection('chats').doc(senderPhone).set({
            lastJevIntent: jevTriage.intent,
            lastJevSentiment: jevTriage.sentiment
          }, { merge: true }).catch(() => {});
        }

        // Process with Gemini AI for this specific store
        const { replyText } = await processAiCustomerMessage(
          targetStoreId,
          senderPhone,
          textContent,
          messageData.pushName
        );

        if (replyText) {
          // 🎙️ Voice Mirror Engine: If customer sent an audio, synthesize and send human voice response
          const isVoiceInbound = !!audioMsg;
          if (isVoiceInbound && est.aiVoiceMirrorEnabled !== false) {
            try {
              const chosenVoice = est.aiVoiceId || 'pt-BR-FranciscaNeural';
              console.log(`[Voice Mirror] Cliente enviou áudio. Sintetizando voz neural (${chosenVoice}) para ${senderPhone}...`);
              const audioBase64 = await generateVoiceAudioBase64(replyText, chosenVoice);
              if (audioBase64) {
                await sendWhatsAppAudio(evoUrl, evoKey, evoInst, senderPhone, audioBase64);
                console.log(`[Voice Mirror] Mensagem de voz enviada com sucesso para ${senderPhone}!`);
              }
            } catch (voiceErr: any) {
              console.warn('[Voice Mirror Error]:', voiceErr.message);
            }
          }

          // Natural thinking jitter (1.2s - 2.2s) before replying to simulate human reading/thinking
          await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 1000)));
          await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, replyText);
        }

        return res.status(200).json({ status: 'processed', establishmentId: targetStoreId, reply: replyText });
      }

      return res.status(200).json({ status: 'event_received' });
    } catch (err: any) {
      console.error('[Webhook Evolution Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Establishment Authentication (Direct & Fallback)
  // ----------------------------------------------------
  function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + '_iapedido_salt').digest('hex');
  }

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, storeName, storePhone, segment } = req.body;
      if (!email || !password || !storeName) {
        return res.status(400).json({ error: 'E-mail, senha e nome do estabelecimento são obrigatórios.' });
      }

      const cleanEmail = email.toLowerCase().trim();
      
      // Check if user already exists
      const existingUsers = await db.collection('establishment_users').where('email', '==', cleanEmail).limit(1).get();
      if (!existingUsers.empty) {
        return res.status(400).json({ error: 'Este e-mail já está cadastrado. Vá na aba Entrar para fazer login.' });
      }

      // Try to create in Firebase Auth via Admin SDK as well
      let uid = '';
      try {
        const fbUser = await admin.auth().createUser({
          email: cleanEmail,
          password: password,
          displayName: storeName
        });
        uid = fbUser.uid;
      } catch (fbErr: any) {
        console.warn('[Fallback Auth] Admin createUser aviso:', fbErr.message);
        uid = 'est_' + crypto.randomBytes(8).toString('hex');
      }

      const hashedPassword = hashPassword(password);

      // Save credentials in establishment_users
      await db.collection('establishment_users').doc(uid).set({
        uid,
        email: cleanEmail,
        passwordHash: hashedPassword,
        storeName,
        storePhone: storePhone || '',
        segment: segment || 'Alimentação & Bebidas',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Initialize store profile in establishments
      await db.collection('establishments').doc(uid).set({
        id: uid,
        name: storeName,
        phone: storePhone || '',
        segment: segment || 'Alimentação & Bebidas',
        address: '',
        deliveryFee: 5.0,
        estimatedDeliveryTime: '30 a 50 minutos',
        operatingHours: 'Segunda a Domingo das 18:00 às 23:00',
        description: `Atendimento inteligente no WhatsApp para ${storeName}`,
        pixKey: cleanEmail,
        evolutionConnected: false,
        aiPromptCustom: `Você é o atendente virtual do ${storeName}. Seja simpático, acolhedor, rápido e use emojis moderados. Tire dúvidas sobre o cardápio e quando o cliente decidir, monte o pedido perguntando: nome do cliente, se é delivery ou retirada, endereço (se delivery) e forma de pagamento (PIX, Cartão na entrega ou Dinheiro com troco). Sempre confirme os itens antes de registrar.`,
        aiWelcomeMessage: `Olá! Seja muito bem-vindo ao ${storeName} 🍔! O que você gostaria de pedir hoje?`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        evolutionApiKey: 'minha_chave_secreta_7108',
        evolutionApiUrl: 'http://34.69.146.15:8081',
        evolutionInstanceName: `pedidos_${uid.slice(0, 15)}`
      }, { merge: true });

      // Create initial sample products for new store
      const sampleProds = [
        { name: 'X-Burguer Especial', price: 28.9, category: 'Lanches', description: 'Pão artesanal, hambúrguer 160g, queijo prato e molho especial.', available: true },
        { name: 'Batata Frita Crocante', price: 16.0, category: 'Porções', description: 'Porção individual de batata frita bem sequinha.', available: true },
        { name: 'Refrigerante Lata 350ml', price: 6.0, category: 'Bebidas', description: 'Coca-Cola, Guaraná ou Fanta gelada.', available: true }
      ];
      for (const prod of (segment === 'AUTOMOTIVE_PARTS' ? [] : sampleProds)) {
        await db.collection('establishments').doc(uid).collection('products').add({
          ...prod,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      let customToken = null;
      try {
        customToken = await admin.auth().createCustomToken(uid);
      } catch {}

      res.json({
        success: true,
        uid,
        email: cleanEmail,
        storeName,
        customToken
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
  // API: Establishment Settings (Multi-Tenant)
  // ----------------------------------------------------
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
          evolutionApiUrl: 'http://34.69.146.15:8081',
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
      res.json({ id: doc.id, ...doc.data() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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

  // ----------------------------------------------------
  // API: Products CRUD (Multi-Tenant)
  // ----------------------------------------------------
  app.get('/api/products', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const snapshot = await db.collection('establishments').doc(storeId).collection('products').get();
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(products);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const product = { ...req.body };
      const productId = product.id || `prod_${Date.now()}`;
      if (Object.prototype.hasOwnProperty.call(product, 'model3d')) {
        let uid: string;
        try { uid = (await admin.auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''))).uid; }
        catch { return res.status(401).json({ error: 'Entre novamente para salvar o modelo 3D.' }); }
        if (uid !== storeId) return res.status(403).json({ error: 'O modelo 3D precisa pertencer à sua loja.' });
        const store = await db.collection('establishments').doc(storeId).get();
        if (store.data()?.segment !== 'AUTOMOTIVE_PARTS') return res.status(400).json({ error: 'Modelos 3D estão disponíveis para projetos automotivos.' });
        const previous = product.id ? (await db.collection('establishments').doc(storeId).collection('products').doc(productId).get()).data() || {} : {};
        const images = product.images ?? previous.images ?? [];
        const imageUrl = product.imageUrl ?? previous.imageUrl;
        const update = model3dUpdate(product, storeId, [...(Array.isArray(images) ? images : []), ...(imageUrl ? [imageUrl] : [])]);
        if (update.model3d) {
          const file = admin.storage().bucket(MODEL3D_STORAGE_BUCKET).file(model3dStoragePath(update.model3d.url, storeId));
          let metadata: any;
          try { [metadata] = await file.getMetadata(); }
          catch { throw new Model3dValidationError('Envie o arquivo GLB antes de salvar o projeto.'); }
          if (Number(metadata.size) !== update.model3d.sizeBytes || Number(metadata.size) > MAX_MODEL3D_BYTES || metadata.contentType !== 'model/gltf-binary') throw new Model3dValidationError('O arquivo enviado não corresponde ao modelo 3D informado.');
          const [bytes] = await file.download();
          validateGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
        }
        Object.assign(product, update);
      }
      const productData = {
        ...product,
        id: productId,
        price: Number(product.price || 0),
        available: product.available !== false,
        updatedAt: new Date().toISOString()
      };
      await db.collection('establishments').doc(storeId).collection('products').doc(productId).set(productData, { merge: true });
      res.json({ success: true, product: productData });
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

  // ----------------------------------------------------
  // API: Orders & Automatic WhatsApp Status Updates (Multi-Tenant)
  // ----------------------------------------------------
  app.get('/api/orders', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const snapshot = await db.collection('establishments').doc(storeId).collection('orders').orderBy('createdAt', 'desc').limit(100).get();
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
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }

      const order = orderSnap.data() as any;
      const updatePayload: any = {
        status: status,
        updatedAt: new Date().toISOString()
      };

      if (rejectionReason) {
        updatePayload.rejectionReason = rejectionReason;
      }
      if (courierPhone) {
        updatePayload.courierPhone = courierPhone.replace(/\D/g, '');
        if (courierName) updatePayload.courierName = courierName;
        updatePayload.dispatchedAt = new Date().toISOString();
      }

      await orderRef.update(updatePayload);

      // Auto-save courier if requested
      if (saveCourier && courierPhone) {
        try {
          const estRef = db.collection('establishments').doc(storeId);
          const estSnap = await estRef.get();
          const estData = estSnap.data() || {};
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
          console.warn('[Auto-save Courier Error in server.ts]:', saveErr);
        }
      }

      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      const rawSeg = (est.segment || '').toUpperCase();
      const isFoodEst = !rawSeg.includes('VEIC') && !rawSeg.includes('CARRO') && !rawSeg.includes('IMOB') && !rawSeg.includes('IMOVE') && !rawSeg.includes('MODA') && !rawSeg.includes('ELETRO');

      // Prepare WhatsApp message based on status change
      let statusMessage = '';
      const orderNum = order.orderNumber || id.slice(-4);

      if (status === 'CONFIRMADO' || status === 'EM_PREPARO') {
        statusMessage = isFoodEst
          ? `✅ *PEDIDO #${orderNum} CONFIRMADO!*\n\nOlá, *${order.customerName}*! Seu pedido foi aprovado pelo restaurante e já está em preparo na cozinha! 🍳\n\n⏱️ *Tempo estimado:* ${est.estimatedDeliveryTime || '30 a 45 minutos'}.\nAvisaremos assim que sair para você! Obrigado pela preferência!`
          : `✅ *SOLICITAÇÃO #${orderNum} CONFIRMADA!*\n\nOlá, *${order.customerName}*! Sua solicitação foi confirmada pela equipe da *${est.name || 'loja'}* e já está em processamento! ✅\n\n⏱️ *Previsão/Atendimento:* ${est.estimatedDeliveryTime || 'Em breve'}.\nQualquer dúvida estamos à disposição!`;
      } else if (status === 'A_CAMINHO') {
        const courierGreeting = courierName ? ` com o entregador *${courierName}*` : '';
        statusMessage = isFoodEst
          ? `🛵 *SEU PEDIDO #${orderNum} SAIU PARA ENTREGA!*\n\nOlá, *${order.customerName}*! O entregador acabou de sair${courierGreeting} a caminho de: \n📍 *${order.customerAddress}*\n\nFique atento ao interfone ou campainha! Bom apetite! 😋`
          : `📦 *SOLICITAÇÃO #${orderNum} SAIU PARA ENVIO/ENTREGA!*\n\nOlá, *${order.customerName}*! Seu envio acabou de sair${courierGreeting} a caminho de: \n📍 *${order.customerAddress}*\n\nFique atento(a), já está chegando! 🚀`;
      } else if (status === 'PRONTO') {
        statusMessage = isFoodEst
          ? `🛍️ *PEDIDO #${orderNum} PRONTO PARA RETIRADA!*\n\nOlá, *${order.customerName}*! Seu pedido já está embalado e prontinho esperando por você no balcão da loja!\nTe aguardamos!`
          : `📍 *SOLICITAÇÃO #${orderNum} PRONTA!*\n\nOlá, *${order.customerName}*! Já está tudo pronto para sua retirada ou visita na loja!\nTe aguardamos! ✨`;
      } else if (status === 'CONCLUIDO') {
        statusMessage = `🎉 *SOLICITAÇÃO #${orderNum} FINALIZADA!*\n\nMuito obrigado pela confiança, *${order.customerName}*! Se puder, nos conte o que achou. Até a próxima! ⭐⭐⭐⭐⭐`;
      } else if (status === 'CANCELADO') {
        statusMessage = `❌ *ATUALIZAÇÃO DA SOLICITAÇÃO #${orderNum}*\n\nOlá, *${order.customerName}*! Infelizmente sua solicitação não pôde ser aceita no momento.\n` +
          (rejectionReason ? `⚠️ *Motivo:* ${rejectionReason}\n\n` : '\n') +
          `Se desejar alterar algo ou conversar com a nossa equipe, ficamos à sua disposição!`;
      }
      let evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      if (evoUrl.includes('localhost:8080') || !evoUrl) {
        evoUrl = (process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      }
      let evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
      if (!evoKey) evoKey = 'minha_chave_secreta_7108';
      const evoInst = (est.evolutionInstanceName || process.env.EVOLUTION_INSTANCE_NAME || 'pedidos_zap').trim();

      // If statusMessage exists and customer has phone, send via Evolution API
      let sentNotification = false;
      if (statusMessage && order.customerPhone) {
        const sendResult = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, order.customerPhone, statusMessage);
        sentNotification = sendResult.success;

        // Also append system message to conversation history
        await db.collection('establishments').doc(storeId)
          .collection('chats').doc(order.customerPhone)
          .collection('messages').add({
            sender: 'system',
            text: statusMessage,
            timestamp: new Date().toISOString(),
            orderId: id
          }).catch(() => {});
      }

      // Notify motoboy if courierPhone provided
      if ((status === 'A_CAMINHO' || status === 'ENTREGA') && courierPhone) {
        try {
          const cleanCourierPhone = courierPhone.replace(/\D/g, '');
          if (cleanCourierPhone.length >= 10) {
            const deliveryAddress = order.customerAddress || 'Endereço a combinar';
            const encodedAddress = encodeURIComponent(deliveryAddress);
            const hasGps = !isNaN(Number(order.latitude)) && !isNaN(Number(order.longitude)) && Number(order.latitude) !== 0;
            const wazeUrl = hasGps 
              ? `https://waze.com/ul?ll=${order.latitude},${order.longitude}&navigate=yes`
              : `https://waze.com/ul?q=${encodedAddress}`;
            const mapsUrl = hasGps 
              ? `https://www.google.com/maps?q=${order.latitude},${order.longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
            const gpsNotice = hasGps ? `\n📍 *Ponto GPS Exato (Enviado pelo cliente no WhatsApp)!*` : '';

            const itemsText = (order.items || [])
              .map((it: any) => `• ${it.quantity}x ${it.name}${it.notes ? ` (${it.notes})` : ''}`)
              .join('\n');

            const totalNum = Number(order.total ?? order.totalAmount ?? 0);
            const totalFormatted = totalNum.toFixed(2).replace('.', ',');
            const changeInfo = order.changeFor ? ` (Troco para R$ ${Number(order.changeFor).toFixed(2).replace('.', ',')})` : '';

            const motoboyGreeting = courierName ? `Olá, *${courierName}*! ` : '';
            const courierMessage = 
`${motoboyGreeting}🛵 *NOVA ENTREGA DISPONÍVEL - ${est.name || 'iaPedido'}*
━━━━━━━━━━━━━━━━━━━━
📦 *Pedido:* #${orderNum}
👤 *Cliente:* ${order.customerName || 'Cliente'}
📞 *Tel do Cliente:* ${order.customerPhone || 'Não informado'}

📍 *Endereço de Entrega:*
${deliveryAddress}${gpsNotice}

🗺️ *Abrir GPS com 1 Clique:*
🚗 *Waze:* ${wazeUrl}
📍 *Google Maps:* ${mapsUrl}

🛍️ *Itens:*
${itemsText || 'Itens diversos'}

💰 *Valor do Pedido:* R$ ${totalFormatted}
💳 *Forma de Pagamento:* ${order.paymentMethod || 'A combinar'}${changeInfo}
${order.notes ? `\n📝 *Observações:* ${order.notes}` : ''}
━━━━━━━━━━━━━━━━━━━━
_Bom trabalho e dirija com segurança! 🚀_`;

            await sendWhatsAppMessage(evoUrl, evoKey, evoInst, cleanCourierPhone, courierMessage);
          }
        } catch (motoboyErr) {
          console.warn('[Motoboy Dispatch Error in server.ts]:', motoboyErr);
        }
      }

      res.json({
        success: true,
        orderId: id,
        newStatus: status,
        sentNotification,
        message: statusMessage
      });
    } catch (err: any) {
      console.error('Error updating order status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Couriers CRUD in server.ts
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
        return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
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
  // API: Interactive WhatsApp Simulator (Frontend Testing)
  // ----------------------------------------------------
  app.post('/api/simulator/chat', async (req, res) => {
    try {
      const storeId = req.body.establishmentId || getStoreId(req);
      const { phone, text, name } = req.body;
      const testPhone = phone || '5511988887777';
      const testName = name || 'Cliente Teste';

      const result = await processAiCustomerMessage(
        storeId,
        testPhone,
        text,
        testName
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

  app.get('/api/customers', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const blockedSnap = await db.collection('establishments').doc(storeId).collection('blocked_contacts').get();
      const blockedMap = new Map<string, any>();
      blockedSnap.docs.forEach(doc => blockedMap.set(doc.id, doc.data()));

      const [ordersSnap, chatsSnap, customersSnap, autoProjectsSnap] = await Promise.all([
        db.collection('establishments').doc(storeId).collection('orders').get(),
        db.collection('establishments').doc(storeId).collection('chats').get().catch(() => ({ docs: [] as any[] })),
        db.collection('establishments').doc(storeId).collection('customers').get().catch(() => ({ docs: [] as any[] })),
        db.collection('automotive_projects').where('establishmentId', '==', storeId).get().catch(() => ({ docs: [] as any[] }))
      ]);

      const map = new Map<string, any>();

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
            if (o.customerName && o.customerName !== 'Cliente') existing.name = o.customerName;
          }
        }
      });

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
        }
      }

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

      res.json(Array.from(map.values()).sort((a, b) => new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime()));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Evolution API Status & Connection (Multi-Tenant)
  // ----------------------------------------------------
  app.get('/api/evolution/status', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      let evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      if (evoUrl.includes('localhost:8080') || !evoUrl) {
        evoUrl = (process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      }
      let evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
      if (!evoKey) {
        evoKey = 'minha_chave_secreta_7108';
      }
      const cleanStoreSuffix = storeId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 15);
      const evoInst = (est.evolutionInstanceName || `pedidos_${cleanStoreSuffix}`).trim();

      // 1. Try Evolution Go (/instance/all)
      try {
        const respAll = await fetch(`${evoUrl}/instance/all`, {
          headers: { apikey: evoKey }
        });
        if (respAll.ok) {
          const allData = await respAll.json().catch(() => ({}));
          if (allData && Array.isArray(allData.data)) {
            const found = allData.data.find((inst: any) => 
              inst.name === evoInst ||
              (inst.webhook && inst.webhook.includes(storeId)) ||
              inst.name.startsWith(`pedidos_${storeId.slice(0, 15)}`)
            );
            if (found) {
              let isConnected = !!found.connected;
              if (!isConnected && found.jid) {
                try {
                  const reconnectRes = await fetch(`${evoUrl}/instance/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: found.token || evoInst },
                    body: JSON.stringify({
                      immediate: true,
                      webhookUrl: `${(process.env.APP_URL || 'http://localhost:3005').replace(/\/$/, '')}/api/webhook/evolution/${storeId}`
                    })
                  });
                  const rData = await reconnectRes.json().catch(() => ({}));
                  if (rData?.data?.jid) {
                    isConnected = true;
                  }
                } catch {}
              }

              await db.collection('establishments').doc(storeId).update({
                evolutionConnected: isConnected
              });
              return res.json({
                connected: isConnected,
                state: isConnected ? 'open' : (found.disconnect_reason === 'Reconnecting' ? 'connecting' : 'close'),
                raw: found
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[Evolution Status Check Go] Error:', err.message);
      }

      // 2. Fallback: Evolution v1/v2 (/instance/connectionState/:instance)
      try {
        const resp = await fetch(`${evoUrl}/instance/connectionState/${evoInst}`, {
          headers: { apikey: evoKey }
        });
        const data = await resp.json();
        const isConnected = data.instance?.state === 'open' || data.state === 'open';

        await db.collection('establishments').doc(storeId).update({
          evolutionConnected: isConnected
        });

        return res.json({
          connected: isConnected,
          state: data.instance?.state || data.state || 'close',
          raw: data
        });
      } catch (e: any) {
        return res.json({
          connected: false,
          error: e.message,
          message: 'Não foi possível conectar ao servidor da Evolution API.'
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch WhatsApp groups for the connected instance
  app.get('/api/evolution/groups', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      let evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      if (evoUrl.includes('localhost:8080') || !evoUrl) {
        evoUrl = (process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      }
      let evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
      if (!evoKey) evoKey = 'minha_chave_secreta_7108';
      const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
      let evoInst = (est.evolutionInstanceName || defaultInstName).trim();

      // Auto-resolve active instance name from /instance/all
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
        console.warn('[Evolution Groups Local] Erro ao checar /instance/all:', e.message);
      }

      console.log(`[Evolution Groups Local] Buscando grupos para instância ${evoInst}...`);
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
        console.warn('[Evolution Groups Local] Tentativa 1 (/group/list) falhou:', e.message);
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
          console.warn('[Evolution Groups Local] Tentativa 2 (/group/myall) falhou:', e.message);
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
          console.warn('[Evolution Groups Local] Tentativa 3 falhou:', e.message);
        }
      }

      // Sort alphabetically by subject
      groups.sort((a, b) => a.subject.localeCompare(b.subject, 'pt-BR', { sensitivity: 'base' }));
      return res.json({ success: true, groups, total: groups.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/evolution/connect', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      let evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      if (evoUrl.includes('localhost:8080') || !evoUrl) {
        evoUrl = (process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      }
      let evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
      if (!evoKey) {
        evoKey = 'minha_chave_secreta_7108';
      }
      const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
      const evoInst = (est.evolutionInstanceName || defaultInstName).trim();
      const appUrl = (process.env.APP_URL || 'http://localhost:3005').replace(/\/$/, '');
      const autoWebhookUrl = `${appUrl}/api/webhook/evolution/${storeId}`;

      // 1. Try Evolution Go Flow:
      try {
        const allRes = await fetch(`${evoUrl}/instance/all`, {
          headers: { apikey: evoKey }
        });
        const allData = await allRes.json().catch(() => ({}));
        let instanceExists = false;
        if (allData && Array.isArray(allData.data)) {
          instanceExists = allData.data.some((inst: any) => inst.name === evoInst);
        }

        if (!instanceExists) {
          console.log(`[Evolution Go] Criando instância multi-tenant: ${evoInst} para loja ${storeId}`);
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
                ignoreStatus: true
              }
            })
          });
        }

        // Connect with per-establishment webhook
        console.log(`[Evolution Go] Conectando instância ${evoInst} com webhook: ${autoWebhookUrl}`);
        await fetch(`${evoUrl}/instance/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoInst },
          body: JSON.stringify({
            webhookUrl: autoWebhookUrl,
            subscribe: ['MESSAGE', 'CONNECTION', 'QRCODE']
          })
        });

        // Save instance name and webhook url back to establishment doc for reference
        await db.collection('establishments').doc(storeId).set({
          evolutionInstanceName: evoInst,
          evolutionWebhookUrl: autoWebhookUrl,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Wait a tiny moment and fetch QR
        // Poll for QR Code (Evolution Go can take 1-3 seconds to generate QR)
        let qrData: any = {};
        for (let attempt = 1; attempt <= 5; attempt++) {
          await new Promise(r => setTimeout(r, 1200));
          const qrRes = await fetch(`${evoUrl}/instance/qr`, {
            headers: { apikey: evoInst }
          });
          qrData = await qrRes.json().catch(() => ({}));
          const found = qrData?.data?.Qrcode || qrData?.data?.qrcode || qrData?.data?.Code || qrData?.data?.code || qrData?.qrcode || qrData?.qr;
          if (found) {
            break;
          }
        }

        const finalQr = qrData?.data?.Qrcode || qrData?.data?.qrcode || qrData?.data?.Code || qrData?.data?.code || qrData?.qrcode || qrData?.qr;
        if (finalQr) {
          return res.json({
            base64: finalQr,
            qr: finalQr,
            code: finalQr,
            instanceName: evoInst,
            webhookUrl: autoWebhookUrl
          });
        }

        return res.json({
          base64: null,
          qr: null,
          code: null,
          instanceName: evoInst,
          webhookUrl: autoWebhookUrl,
          connected: false,
          message: qrData?.error || 'Aguardando o WhatsApp inicializar o QR Code. Se o banco Postgres da VPS atingiu limite de conexões, reinicie o container na VPS.'
        });
      } catch (e: any) {
        console.warn('[Evolution Go Connect] Tentando fallback v1/v2:', e.message);
      }

      // 2. Fallback to Evolution API v1/v2
      const resp = await fetch(`${evoUrl}/instance/connect/${evoInst}`, {
        headers: { apikey: evoKey }
      });
      const text = await resp.text();
      try {
        const data = JSON.parse(text);
        return res.json(data);
      } catch {
        return res.status(resp.status || 500).json({ error: text });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Send WhatsApp Test Message (Proxied to prevent CORS and support Go & v1/v2)
  app.post('/api/evolution/test-send', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const { number, text } = req.body;
      if (!number || !text) {
        return res.status(400).json({ error: 'Número e mensagem são obrigatórios.' });
      }

      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108';
      const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
      const evoInst = est.evolutionInstanceName || defaultInstName;

      const result = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, number, text);
      if (result.success) {
        res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
      } else {
        res.status(500).json({ error: result.error || 'Falha ao enviar mensagem.' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: AI Voice Preview Endpoint (Testing voices in Settings)
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

  // API: Request Pairing Code (Connect via phone number without QR code)
  app.post('/api/evolution/pair', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'Telefone é obrigatório para pairing code.' });

      const rawDigits = phone.replace(/\D/g, '');
      const cleanPhone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;

      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
      const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
      const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
      let evoInst = (est.evolutionInstanceName || defaultInstName).trim();
      const appUrl = (process.env.APP_URL || 'http://localhost:3005').replace(/\/$/, '');
      const autoWebhookUrl = `${appUrl}/api/webhook/evolution/${storeId}`;

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
                ignoreStatus: true
              }
            })
          });
        }

        await fetch(`${evoUrl}/instance/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoInst },
          body: JSON.stringify({
            webhookUrl: autoWebhookUrl,
            subscribe: ['MESSAGE', 'CONNECTION', 'MESSAGES_UPSERT']
          })
        }).catch(() => {});
      } catch (e: any) {
        console.warn('[Evolution API Pair Local] Erro ao preparar instância:', e.message);
      }

      console.log(`[Evolution API Local] Solicitando Pairing Code para ${cleanPhone} na instância ${evoInst}...`);
      const pairRes = await fetch(`${evoUrl}/instance/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoInst },
        body: JSON.stringify({ phone: cleanPhone })
      });

      const pairData = await pairRes.json().catch(() => ({}));
      console.log(`[Evolution API Local] Resposta Pairing Code:`, JSON.stringify(pairData));

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
      console.error('[Evolution API Local] Erro no Pairing Code:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // Mercado Pago PIX Subscription & AI Credits Endpoints
  // ----------------------------------------------------
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

  app.get('/api/billing/summary', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const snap = await db.collection('establishments').doc(storeId).get();
      const est = snap.data() || {};
      const trialActive = isEstablishmentSubscriptionActive({ ...est, id: storeId }) && est.accountStatus !== 'active_paid' && est.plan !== 'active';
      const storePlan = resolveStorePlan(est.planTier, est.segment);
      const usageSnap: any = await db.collection('establishments').doc(storeId).collection('aiUsage').get().catch(() => ({ docs: [] as any[] }));
      const totalUsed = (usageSnap.docs as any[]).reduce((sum: number, d: any) => sum + Number(d.data()?.estimatedCost || 0), 0);
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
        minTopupBrl: 100,
        creditsBalance: Number(est.aiCreditsBalance || 0),
        totalUsed: Number(totalUsed.toFixed(4))
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/billing/credits/pix', async (req, res) => {
    try {
      const storeId = req.body.establishmentId || getStoreId(req);
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount < 100 || amount > 5000) {
        return res.status(400).json({ error: 'A recarga mínima é de R$ 100 e a máxima é de R$ 5.000.' });
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
      return res.json({
        success: true,
        id,
        amount,
        qr_code: created.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: created.point_of_interaction?.transaction_data?.qr_code_base64
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Falha ao gerar recarga.' });
    }
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
      return res.json({ id, status: paymentInfo.status, approved: paymentInfo.status === 'approved' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Falha ao consultar recarga.' });
    }
  });

  // API: Gerar cobrança PIX para assinatura mensal (Essencial R$ 197, Pro R$ 347, Performance R$ 497)
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

  async function activateStoreSubscriptionLocal(paymentId: string, fallbackStoreId?: string) {
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
        await activateStoreSubscriptionLocal(paymentId, paymentInfo.external_reference);
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
        await activateStoreSubscriptionLocal(paymentId, paymentInfo.external_reference);
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

  // ----------------------------------------------------
  // AI Catalog Radar & Product Intelligence Endpoint
  // ----------------------------------------------------
  app.get('/api/ai/catalog-radar', async (req, res) => {
    try {
      const storeId = getStoreId(req);
      const forceRefresh = req.query.refresh === 'true';

      const radarRef = db.collection('establishments').doc(storeId).collection('analytics').doc('catalogRadar');
      const existingDoc = await radarRef.get();
      
      if (existingDoc.exists && !forceRefresh) {
        const data = existingDoc.data();
        const ageHours = (Date.now() - new Date(data?.analyzedAt || 0).getTime()) / (1000 * 60 * 60);
        if (ageHours < 6) {
          return res.json({ success: true, data });
        }
      }

      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
      const productsSnap = await db.collection('establishments').doc(storeId).collection('products').get();
      const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const totalItems = products.length;
      const withPhoto = products.filter((p: any) => p.imageUrl && p.imageUrl.trim()).length;
      const withoutPhoto = totalItems - withPhoto;
      const photoPercentage = totalItems > 0 ? Math.round((withPhoto / totalItems) * 100) : 0;

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
        const response = await genai.models.generateContent({
          model: 'gemini-2.5-flash',
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
        console.warn('[Catalog Radar AI Error Local]:', e.message);
      }

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

      await radarRef.set(parsedResult, { merge: true }).catch(() => {});

      return res.json({ success: true, data: parsedResult });
    } catch (err: any) {
      console.error('[Catalog Radar Error Local]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // Vite Dev Server Middleware
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================================`);
    console.log(`🚀 iaPedido - Servidor Ativo na porta ${PORT}`);
    console.log(`🌐 Painel Web: http://localhost:${PORT}`);
    console.log(`⚡ Webhook Evolution: http://localhost:${PORT}/api/webhook/evolution`);
    console.log(`🤖 Motor IA: Google Gemini 2.5 Flash Ativo`);
    console.log(`========================================================\n`);
  });
}

startServer().catch(err => {
  console.error('Fatal Server Error:', err);
});
