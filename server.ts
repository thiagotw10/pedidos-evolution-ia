import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

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

// Evolution API helper: Send WhatsApp Message (Supports Evolution Go and Evolution API v1/v2)
async function sendWhatsAppMessage(
  evolutionUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const numeric = number.replace(/\D/g, '');
    const cleanNumber = numeric.startsWith('55') ? numeric : `55${numeric}`;
    const cleanUrl = evolutionUrl.replace(/\/$/, '');

    console.log(`[Evolution API] Enviando mensagem para ${cleanNumber} (instância ${instanceName})...`);

    // 1. Try Evolution Go (/send/text with token as apikey)
    try {
      const respGo = await fetch(`${cleanUrl}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': instanceName
        },
        body: JSON.stringify({
          number: cleanNumber,
          text: text,
          delay: 1200
        })
      });

      if (respGo.ok) {
        const dataGo = await respGo.json();
        console.log(`[Evolution API Go] Mensagem enviada com sucesso para ${cleanNumber}!`);
        return { success: true, data: dataGo };
      }
    } catch (e: any) {
      console.warn(`[Evolution API Go] Falha ao tentar /send/text:`, e.message);
    }

    // 2. Fallback to Evolution API v1/v2 (/message/sendText/{instance})
    const url = `${cleanUrl}/message/sendText/${instanceName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        number: cleanNumber,
        options: {
          delay: 1200,
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

// Process conversation with Google Gemini
async function processAiCustomerMessage(
  establishmentId: string,
  customerPhone: string,
  incomingText: string,
  customerNameParam?: string
): Promise<{ replyText: string; orderCreated?: any }> {
  const estDoc = await db.collection('establishments').doc(establishmentId).get();
  const establishment = estDoc.data() || {};

  // Fetch active products
  const productsSnap = await db.collection('establishments').doc(establishmentId).collection('products').where('available', '==', true).get();
  const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Fetch recent conversation history
  const chatRef = db.collection('establishments').doc(establishmentId).collection('chats').doc(customerPhone).collection('messages');
  const historySnap = await chatRef.orderBy('timestamp', 'asc').limitToLast(12).get();
  const history = historySnap.docs.map(d => d.data());

  // Save current incoming message to history
  await chatRef.add({
    sender: 'user',
    text: incomingText,
    timestamp: new Date().toISOString()
  });

  const menuText = products.map((p: any) => 
    `- [ID: ${p.id}] ${p.name} (R$ ${Number(p.price).toFixed(2)}) [Categoria: ${p.category}]: ${p.description || ''}`
  ).join('\n');

  const systemInstruction = `
Você é o atendente de Inteligência Artificial do estabelecimento "${establishment.name || 'Restaurante'}".
Seu objetivo é atender os clientes pelo WhatsApp de forma educada, ágil, simpática e objetiva.

DADOS DO ESTABELECIMENTO:
- Nome: ${establishment.name}
- Horário de Funcionamento: ${establishment.operatingHours || 'Aberto agora'}
- Endereço da Loja: ${establishment.address || 'Não informado'}
- Taxa de Entrega: R$ ${Number(establishment.deliveryFee || 0).toFixed(2)}
- Tempo Estimado: ${establishment.estimatedDeliveryTime || '40 minutos'}
- Chave PIX: ${establishment.pixKey || 'Chave cadastrada no caixa'}
- Formas de Pagamento Aceitas: PIX, Cartão (Crédito/Débito na entrega), Dinheiro.
${establishment.aiPromptCustom ? `\nINSTRUÇÕES PERSONALIZADAS DO ESTABELECIMENTO:\n${establishment.aiPromptCustom}` : ''}

CARDÁPIO ATUAL:
${menuText || 'Nenhum item cadastrado no momento.'}

COMO VOCÊ DEVE AGIR:
1. Responda dúvidas sobre ingredientes, preços e categorias com base estritamente no cardápio acima.
2. Seja proativo em sugerir adicionais ou bebidas que combinem com o pedido.
3. FLUXO DE PEDIDO:
   Quando o cliente quiser fazer um pedido, certifique-se de ter:
   - Nome do cliente
   - Itens escolhidos e quantidades (e observações se houver)
   - Se é ENTREGA (Delivery) ou RETIRADA no balcão
   - Se for entrega: Endereço completo (Rua, Número, Bairro, Complemento/Referência)
   - Forma de pagamento (PIX, Cartão na entrega ou Dinheiro - se for dinheiro, pergunte se precisa de troco para quanto).
4. QUANDO TODOS OS DADOS ESTIVEREM COMPLETOS:
   Você DEVE acionar a ferramenta/função 'registrar_pedido' para registrar o pedido no sistema do restaurante.
   Após chamar a ferramenta com sucesso, informe ao cliente de maneira acolhedora que o pedido foi enviado para o restaurante e que ele receberá a confirmação assim que a equipe aceitar!
  `;

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
      parts: [{ text: incomingText }]
    });

    const response = await genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: [{ functionDeclarations: [registrarPedidoTool as any] }],
        temperature: 0.4
      }
    });

    let replyText = response.text || '';
    let createdOrder: any = null;

    // Check if the model called 'registrar_pedido'
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        if (call.name === 'registrar_pedido') {
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

          // Give model output or default confirmation
          replyText = `🎉 *Pedido #${orderNumber} Registrado com Sucesso!*\n\n` +
            `📋 *Itens:*\n` +
            orderItems.map((it: any) => `• ${it.quantity}x ${it.name} - R$ ${it.total.toFixed(2)}`).join('\n') +
            `\n\n🛵 *Tipo:* ${orderData.deliveryType === 'DELIVERY' ? `Entrega (${orderData.customerAddress})` : 'Retirada no Balcão'}\n` +
            `💵 *Taxa de Entrega:* R$ ${deliveryFee.toFixed(2)}\n` +
            `💰 *Total:* R$ ${total.toFixed(2)}\n` +
            `💳 *Pagamento:* ${orderData.paymentMethod}\n\n` +
            `⏳ *Aguardando confirmação do estabelecimento!*\n` +
            `Assim que a cozinha aprovar seu pedido, você receberá a confirmação aqui mesmo no WhatsApp!`;
        }
      }
    }

    if (!replyText) {
      replyText = 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com o cardápio?';
    }

    // Save assistant reply to chat history
    await chatRef.add({
      sender: 'assistant',
      text: replyText,
      timestamp: new Date().toISOString(),
      orderId: createdOrder ? createdOrder.id : null
    });

    return { replyText, orderCreated: createdOrder };
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

  app.use(express.json());

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
        
        // Ignore messages sent by the bot itself
        if (key.fromMe) {
          return res.status(200).json({ status: 'ignored_from_me' });
        }

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
        }

        if (!textContent.trim()) {
          return res.status(200).json({ status: 'no_text' });
        }

        console.log(`[WhatsApp Inbound] De: ${senderPhone} | Mensagem: "${textContent}"`);

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

        console.log(`[WhatsApp Multi-Tenant] Roteado para o Estabelecimento: ${targetStoreId}`);

        const estDoc = await db.collection('establishments').doc(targetStoreId).get();
        const est = estDoc.data() || {};

        // Subscription / Trial Verification (7 days trial or paid subscription)
        if (!isEstablishmentSubscriptionActive(est)) {
          console.warn(`[WhatsApp Multi-Tenant] 🛑 BLOQUEADO: Assinatura do estabelecimento "${est.name || targetStoreId}" expirada (teste de 7 dias encerrado). Mensagem de ${senderPhone} não será respondida pela IA.`);
          return res.status(200).json({
            status: 'subscription_expired',
            message: 'Período de teste de 7 dias encerrado. Assinatura de R$ 50/mês necessária.'
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

        // Process with Gemini AI for this specific store
        const { replyText } = await processAiCustomerMessage(
          targetStoreId,
          senderPhone,
          textContent,
          messageData.pushName
        );

        if (replyText) {
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
      for (const prod of sampleProds) {
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
      const product = req.body;
      const productId = product.id || `prod_${Date.now()}`;
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
      res.status(500).json({ error: err.message });
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

      // Prepare WhatsApp message based on status change
      let statusMessage = '';
      const orderNum = order.orderNumber || id.slice(-4);

      if (status === 'CONFIRMADO' || status === 'EM_PREPARO') {
        statusMessage = `✅ *PEDIDO #${orderNum} CONFIRMADO!*\n\n` +
          `Olá, *${order.customerName}*! Seu pedido foi aprovado pelo restaurante e já está em preparo na cozinha! 🍳\n\n` +
          `⏱️ *Tempo estimado:* 30 a 45 minutos.\n` +
          `Avisaremos assim que sair para você! Obrigado pela preferência!`;
      } else if (status === 'A_CAMINHO') {
        const courierGreeting = courierName ? ` com o entregador *${courierName}*` : '';
        statusMessage = `🛵 *SEU PEDIDO #${orderNum} SAIU PARA ENTREGA!*\n\n` +
          `Olá, *${order.customerName}*! O entregador acabou de sair${courierGreeting} a caminho de: \n` +
          `📍 *${order.customerAddress}*\n\n` +
          `Fique atento ao interfone ou campainha! Bom apetite! 😋`;
      } else if (status === 'PRONTO') {
        statusMessage = `🛍️ *PEDIDO #${orderNum} PRONTO PARA RETIRADA!*\n\n` +
          `Olá, *${order.customerName}*! Seu pedido já está embalado e prontinho esperando por você no balcão da loja!\n` +
          `Te aguardamos!`;
      } else if (status === 'CONCLUIDO') {
        statusMessage = `🎉 *PEDIDO #${orderNum} FINALIZADO!*\n\n` +
          `Esperamos que tenha tido uma ótima experiência gastronômica! Se puder, nos conte o que achou. Até a próxima! ⭐`;
      } else if (status === 'CANCELADO') {
        statusMessage = `❌ *ATUALIZAÇÃO DO PEDIDO #${orderNum}*\n\n` +
          `Olá, *${order.customerName}*! Infelizmente seu pedido não pôde ser aceito no momento.\n` +
          (rejectionReason ? `⚠️ *Motivo:* ${rejectionReason}\n\n` : '\n') +
          `Se desejar alterar algum item ou pedir em outro momento, ficamos à sua disposição!`;
      }

      const estDoc = await db.collection('establishments').doc(storeId).get();
      const est = estDoc.data() || {};
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
      const messagesCol = db.collection('establishments').doc(storeId)
        .collection('chats').doc(phone)
        .collection('messages');
      
      const snap = await messagesCol.get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      res.json({ success: true, message: 'Chat resetado com sucesso' });
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
            const found = allData.data.find((inst: any) => inst.name === evoInst);
            if (found) {
              const isConnected = !!found.connected;
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

  // ----------------------------------------------------
  // Mercado Pago PIX Subscription Endpoints (R$ 50/mês)
  // ----------------------------------------------------

  // API: Gerar cobrança PIX para assinatura mensal
  app.post('/api/subscription/pix', async (req, res) => {
    try {
      const { establishmentId, email, name } = req.body;
      const storeId = establishmentId || getStoreId(req);
      if (!storeId) {
        return res.status(400).json({ error: 'ID do estabelecimento não fornecido.' });
      }

      const mpToken = process.env.MP_ACCESS_TOKEN;
      if (!mpToken) {
        return res.status(500).json({ error: 'Configuração do Mercado Pago (MP_ACCESS_TOKEN) não encontrada no servidor.' });
      }

      const { MercadoPagoConfig, Payment } = await import('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: mpToken, options: { timeout: 10000 } });
      const payment = new Payment(client);

      const paymentResponse = await payment.create({
        body: {
          transaction_amount: 50,
          description: 'Assinatura Mensal iaPedido (30 dias) - Atendimento WhatsApp & IA',
          payment_method_id: 'pix',
          payer: {
            email: email || 'cliente@iapedido.com.br',
            first_name: name || 'Estabelecimento iaPedido'
          },
          external_reference: storeId
        }
      });

      const paymentId = String(paymentResponse.id);
      console.log(`[Mercado Pago] PIX Gerado com sucesso! ID: ${paymentId} para loja: ${storeId}`);

      // Registrar cobrança pendente no Firestore
      await db.collection('pendingSubscriptions').doc(paymentId).set({
        establishmentId: storeId,
        amount: 50,
        status: 'pending',
        payerEmail: email || '',
        createdAt: new Date().toISOString()
      }, { merge: true });

      return res.json({
        success: true,
        id: paymentId,
        qr_code: paymentResponse.point_of_interaction?.transaction_data?.qr_code,
        qr_code_base64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64
      });
    } catch (err: any) {
      console.error('[Mercado Pago Subscription Error]:', err);
      return res.status(500).json({ error: err.message || 'Falha ao gerar cobrança PIX.' });
    }
  });

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
        let storeId = paymentInfo.external_reference;
        if (!storeId) {
          const pendingDoc = await db.collection('pendingSubscriptions').doc(paymentId).get();
          storeId = pendingDoc.data()?.establishmentId;
        }

        if (storeId) {
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          const estDoc = await db.collection('establishments').doc(storeId).get();
          const estData = estDoc.data() || {};
          const currentValidUntilMs = estData.subscriptionValidUntil ? new Date(estData.subscriptionValidUntil).getTime() : 0;
          const baseTime = currentValidUntilMs > Date.now() ? currentValidUntilMs : Date.now();
          const newValidUntil = new Date(baseTime + thirtyDaysMs).toISOString();

          await db.collection('establishments').doc(storeId).set({
            plan: 'active',
            accountStatus: 'active_paid',
            subscriptionValidUntil: newValidUntil,
            lastPaymentDate: new Date().toISOString(),
            planPrice: 50,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          await db.collection('pendingSubscriptions').doc(paymentId).set({
            status: 'approved',
            approvedAt: new Date().toISOString()
          }, { merge: true });

          console.log(`[Mercado Pago] Assinatura da loja ${storeId} ativada por mais 30 dias (até ${newValidUntil})!`);
        }
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
        let storeId = paymentInfo.external_reference;
        if (!storeId) {
          const pendingDoc = await db.collection('pendingSubscriptions').doc(paymentId).get();
          storeId = pendingDoc.data()?.establishmentId;
        }

        if (storeId) {
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          const estDoc = await db.collection('establishments').doc(storeId).get();
          const estData = estDoc.data() || {};
          const currentValidUntilMs = estData.subscriptionValidUntil ? new Date(estData.subscriptionValidUntil).getTime() : 0;
          const baseTime = currentValidUntilMs > Date.now() ? currentValidUntilMs : Date.now();
          const newValidUntil = new Date(baseTime + thirtyDaysMs).toISOString();

          await db.collection('establishments').doc(storeId).set({
            plan: 'active',
            accountStatus: 'active_paid',
            subscriptionValidUntil: newValidUntil,
            lastPaymentDate: new Date().toISOString(),
            planPrice: 50,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          await db.collection('pendingSubscriptions').doc(paymentId).set({
            status: 'approved',
            approvedAt: new Date().toISOString()
          }, { merge: true });

          console.log(`[Subscription Webhook MP] Loja ${storeId} ativada via webhook para o pagamento ${paymentId}!`);
        }
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
