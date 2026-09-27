import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
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
        description: 'Os melhores hambúrgueres artesanais na brasa, smash burgers e porções crocantes!',
        pixKey: 'contato@burgercia.com.br',
        evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
        evolutionApiKey: process.env.EVOLUTION_API_KEY || 'B6D711FCDE4D4FD5936544120E713976',
        evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME || 'restaurante_zap',
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

// Evolution API helper: Send WhatsApp Message
async function sendWhatsAppMessage(
  evolutionUrl: string,
  apiKey: string,
  instanceName: string,
  number: string,
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const cleanNumber = number.replace(/\D/g, '');
    const cleanUrl = evolutionUrl.replace(/\/$/, '');
    const url = `${cleanUrl}/message/sendText/${instanceName}`;

    console.log(`[Evolution API] Enviando mensagem para ${cleanNumber} via ${url}...`);

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

    const data = await response.json();
    if (!response.ok) {
      console.error('[Evolution API Response Error]:', data);
      return { success: false, error: JSON.stringify(data) };
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

  // ----------------------------------------------------
  // API: Evolution API Webhook Receiver
  // ----------------------------------------------------
  app.post('/api/webhook/evolution', async (req, res) => {
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
        
        // Extract text message content
        const msg = messageData.message || {};
        const textContent = 
          msg.conversation || 
          msg.extendedTextMessage?.text || 
          msg.imageMessage?.caption || 
          '';

        if (!textContent.trim()) {
          return res.status(200).json({ status: 'no_text' });
        }

        console.log(`[WhatsApp Inbound] De: ${senderPhone} | Mensagem: "${textContent}"`);

        // Get establishment configuration
        const instanceName = payload.instance || process.env.EVOLUTION_INSTANCE_NAME || 'restaurante_zap';
        const estDoc = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).get();
        const est = estDoc.data() || {};

        // Process with Gemini AI
        const { replyText } = await processAiCustomerMessage(
          DEFAULT_ESTABLISHMENT_ID,
          senderPhone,
          textContent,
          messageData.pushName
        );

        // Send response back via Evolution API
        const evoUrl = est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
        const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || '';
        const evoInst = est.evolutionInstanceName || instanceName;

        if (evoUrl && evoKey) {
          await sendWhatsAppMessage(evoUrl, evoKey, evoInst, senderPhone, replyText);
        } else {
          console.warn('[Webhook Evolution] Evolution API não configurada para resposta automática.');
        }

        return res.status(200).json({ status: 'processed', reply: replyText });
      }

      return res.status(200).json({ status: 'event_received' });
    } catch (err: any) {
      console.error('[Webhook Evolution Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Establishment Settings
  // ----------------------------------------------------
  app.get('/api/establishment', async (_req, res) => {
    try {
      const doc = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Estabelecimento não encontrado' });
      }
      res.json({ id: doc.id, ...doc.data() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/establishment', async (req, res) => {
    try {
      const updateData = { ...req.body, updatedAt: new Date().toISOString() };
      delete updateData.id;
      await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).set(updateData, { merge: true });
      res.json({ success: true, message: 'Dados atualizados com sucesso!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Products CRUD
  // ----------------------------------------------------
  app.get('/api/products', async (_req, res) => {
    try {
      const snapshot = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).collection('products').get();
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(products);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const product = req.body;
      const productId = product.id || `prod_${Date.now()}`;
      const productData = {
        ...product,
        id: productId,
        price: Number(product.price || 0),
        available: product.available !== false,
        updatedAt: new Date().toISOString()
      };
      await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).collection('products').doc(productId).set(productData, { merge: true });
      res.json({ success: true, product: productData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).collection('products').doc(id).delete();
      res.json({ success: true, message: 'Produto removido com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Orders & Automatic WhatsApp Status Updates
  // ----------------------------------------------------
  app.get('/api/orders', async (_req, res) => {
    try {
      const snapshot = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).collection('orders').orderBy('createdAt', 'desc').limit(100).get();
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/orders/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;

      const orderRef = db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).collection('orders').doc(id);
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

      await orderRef.update(updatePayload);

      // Prepare WhatsApp message based on status change
      let statusMessage = '';
      const orderNum = order.orderNumber || id.slice(-4);

      if (status === 'CONFIRMADO' || status === 'EM_PREPARO') {
        statusMessage = `✅ *PEDIDO #${orderNum} CONFIRMADO!*\n\n` +
          `Olá, *${order.customerName}*! Seu pedido foi aprovado pelo restaurante e já está em preparo na cozinha! 🍳\n\n` +
          `⏱️ *Tempo estimado:* 30 a 45 minutos.\n` +
          `Avisaremos assim que sair para você! Obrigado pela preferência!`;
      } else if (status === 'A_CAMINHO') {
        statusMessage = `🛵 *SEU PEDIDO #${orderNum} SAIU PARA ENTREGA!*\n\n` +
          `Olá, *${order.customerName}*! O entregador acabou de sair com seu pedido a caminho de: \n` +
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

      // If statusMessage exists and customer has phone, send via Evolution API
      let sentNotification = false;
      if (statusMessage && order.customerPhone) {
        const estDoc = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).get();
        const est = estDoc.data() || {};
        const evoUrl = est.evolutionApiUrl || process.env.EVOLUTION_API_URL;
        const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY;
        const evoInst = est.evolutionInstanceName || process.env.EVOLUTION_INSTANCE_NAME;

        if (evoUrl && evoKey && evoInst) {
          const sendResult = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, order.customerPhone, statusMessage);
          sentNotification = sendResult.success;
        }

        // Also append system message to conversation history
        await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID)
          .collection('chats').doc(order.customerPhone)
          .collection('messages').add({
            sender: 'system',
            text: statusMessage,
            timestamp: new Date().toISOString(),
            orderId: id
          });
      }

      res.json({
        success: true,
        orderId: id,
        newStatus: status,
        sentNotification,
        message: statusMessage
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Interactive WhatsApp Simulator (Frontend Testing)
  // ----------------------------------------------------
  app.post('/api/simulator/chat', async (req, res) => {
    try {
      const { phone, text, name } = req.body;
      const testPhone = phone || '5511988887777';
      const testName = name || 'Cliente Teste';

      const result = await processAiCustomerMessage(
        DEFAULT_ESTABLISHMENT_ID,
        testPhone,
        text,
        testName
      );

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/simulator/messages/:phone', async (req, res) => {
    try {
      const { phone } = req.params;
      const snapshot = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID)
        .collection('chats').doc(phone)
        .collection('messages').orderBy('timestamp', 'asc').limit(50).get();

      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // API: Evolution API Status & Connection
  // ----------------------------------------------------
  app.get('/api/evolution/status', async (_req, res) => {
    try {
      const estDoc = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).get();
      const est = estDoc.data() || {};
      const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
      const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || '';
      const evoInst = est.evolutionInstanceName || process.env.EVOLUTION_INSTANCE_NAME || 'restaurante_zap';

      if (!evoUrl || !evoKey) {
        return res.json({ connected: false, message: 'URL ou API Key da Evolution API não informadas.' });
      }

      try {
        const resp = await fetch(`${evoUrl}/instance/connectionState/${evoInst}`, {
          headers: { apikey: evoKey }
        });
        const data = await resp.json();
        const isConnected = data.instance?.state === 'open' || data.state === 'open';

        // Update establishment
        await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).update({
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

  app.post('/api/evolution/connect', async (_req, res) => {
    try {
      const estDoc = await db.collection('establishments').doc(DEFAULT_ESTABLISHMENT_ID).get();
      const est = estDoc.data() || {};
      const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
      const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || '';
      const evoInst = est.evolutionInstanceName || process.env.EVOLUTION_INSTANCE_NAME || 'restaurante_zap';

      if (!evoUrl || !evoKey) {
        return res.status(400).json({ error: 'Configure a URL e a API Key da Evolution API primeiro.' });
      }

      const resp = await fetch(`${evoUrl}/instance/connect/${evoInst}`, {
        headers: { apikey: evoKey }
      });
      const data = await resp.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================================`);
    console.log(`🚀 ZapPedidos IA - Servidor Ativo na porta ${PORT}`);
    console.log(`🌐 Painel Web: http://localhost:${PORT}`);
    console.log(`⚡ Webhook Evolution: http://localhost:${PORT}/api/webhook/evolution`);
    console.log(`🤖 Motor IA: Google Gemini 2.5 Flash Ativo`);
    console.log(`========================================================\n`);
  });
}

startServer().catch(err => {
  console.error('Fatal Server Error:', err);
});
