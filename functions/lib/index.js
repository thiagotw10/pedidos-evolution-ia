"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.scheduledCampaignsRunner = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const express_1 = __importDefault(require("express"));
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const genai_1 = require("@google/genai");
dotenv_1.default.config();
// Initialize Firebase Admin (in Cloud Functions runtime it uses default credentials automatically)
if (firebase_admin_1.default.apps.length === 0) {
    firebase_admin_1.default.initializeApp();
}
const db = firebase_admin_1.default.firestore();
// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || 'AIzaSyA9GspslNh-yPg2n1vCRXU6SPP5OBUsDpo';
const genai = new genai_1.GoogleGenAI({ apiKey: geminiApiKey });
const DEFAULT_ESTABLISHMENT_ID = 'default_store';
const app = (0, express_1.default)();
app.use(express_1.default.json());
// In-memory cache for de-duplicating rapid Webhook calls from Evolution Go
const processedMessages = new Map();
// Multi-tenant helper to extract establishment ID
function getStoreId(req) {
    const param = req.params.establishmentId;
    const query = req.query.establishmentId;
    const header = req.headers['x-establishment-id'];
    const body = req.body?.establishmentId;
    return (param || query || header || body || DEFAULT_ESTABLISHMENT_ID).trim();
}
// Password hasher helper for fallback auth
function hashPassword(password) {
    return crypto_1.default.createHash('sha256').update(password + '_iapedido_salt').digest('hex');
}
// Evolution API message sender helper (matching psicocall proven implementation)
async function sendWhatsAppMessage(evoUrl, evoKey, evoInst, number, text) {
    try {
        const numericPhone = number.replace(/\D/g, '');
        const finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
        const res = await fetch(`${evoUrl}/send/text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: evoInst
            },
            body: JSON.stringify({
                number: finalPhone,
                text: text,
                delay: 1500
            })
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { success: false, error: errText };
        }
        const data = await res.json().catch(() => ({}));
        return { success: true, data };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
// Evolution API media sender helper (supporting images, audio, video, documents)
async function sendWhatsAppMedia(evoUrl, evoKey, evoInst, number, mediaUrl, caption, type = 'image') {
    try {
        const numericPhone = number.replace(/\D/g, '');
        const finalPhone = numericPhone.startsWith('55') ? numericPhone : `55${numericPhone}`;
        console.log(`[SendMedia] Enviando mídia (${type}) para ${finalPhone} via ${evoUrl}/send/media`);
        const res = await fetch(`${evoUrl}/send/media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: evoInst
            },
            body: JSON.stringify({
                number: finalPhone,
                type: type,
                url: mediaUrl,
                caption: formatWhatsAppText(caption),
                delay: 1200
            })
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(`[SendMedia] Erro ${res.status}:`, errText);
            return { success: false, error: errText };
        }
        const data = await res.json().catch(() => ({}));
        return { success: true, data };
    }
    catch (err) {
        console.error('[SendMedia Exception]:', err.message);
        return { success: false, error: err.message };
    }
}
// Helper to format messages cleanly for WhatsApp (converting markdown into WhatsApp format)
function formatWhatsAppText(text) {
    if (!text)
        return '';
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
// Helper to verify if an establishment has active access (7-day free trial or active paid subscription)
function isEstablishmentSubscriptionActive(est) {
    if (!est)
        return true;
    // Demo store always allowed for previewing
    if (est.id === DEFAULT_ESTABLISHMENT_ID)
        return true;
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
// Helper to download media (audio / image) from WhatsApp via Evolution API
async function downloadWhatsAppMedia(evoUrl, evoInst, msgContent) {
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
        const json = await res.json().catch(() => null);
        const base64Url = json?.data?.base64 || json?.base64 || '';
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
    }
    catch (err) {
        console.error('[DownloadMedia Exception]:', err.message);
        return null;
    }
}
// Process conversation with Google Gemini (Multi-Turn History + Function Calling + Audio / Image Multimodal + Product Photo Sending)
async function processAiCustomerMessage(establishmentId, customerPhone, incomingText, customerNameParam, mediaPart) {
    const estDoc = await db.collection('establishments').doc(establishmentId).get();
    const establishment = estDoc.data() || {};
    // Fetch active products (auto-seed default menu if empty)
    const productsCol = db.collection('establishments').doc(establishmentId).collection('products');
    const productsSnap = await productsCol.where('available', '==', true).get();
    let products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (products.length === 0) {
        const defaultMenu = [
            { name: 'Hamburguer Artesanal', description: 'Blend 180g, queijo cheddar, alface, tomate e maionese especial no pão brioche', price: 29.90, category: 'Hambúrgueres', available: true },
            { name: 'Hamburguer Duplo Cheddar Bacon', description: '2 blends 150g, muito bacon crocante, cheddar duplo e molho barbecue', price: 38.90, category: 'Hambúrgueres', available: true },
            { name: 'Batata Frita Rústica Especial', description: 'Batata crocante com páprica, alecrim e maionese da casa', price: 18.00, category: 'Porções', available: true },
            { name: 'Refrigerante Lata 350ml', description: 'Coca-Cola, Guaraná Antarctica ou Sprite', price: 6.00, category: 'Bebidas', available: true }
        ];
        for (const item of defaultMenu) {
            const docRef = await productsCol.add({ ...item, createdAt: new Date().toISOString() });
            products.push({ id: docRef.id, ...item });
        }
    }
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
        timestamp: new Date().toISOString()
    });
    const menuText = products.map((p) => `- ${p.name} (R$ ${Number(p.price).toFixed(2)}) [Categoria: ${p.category}]${p.imageUrl ? ` [POSSUI_FOTO_URL: ${p.imageUrl}]` : ''}: ${p.description || ''}`).join('\n');
    const systemInstruction = `
Você é o atendente de Inteligência Artificial do estabelecimento "${establishment.name || 'Restaurante'}".
Seu objetivo é atender os clientes de forma educada, ágil, simpática e objetiva.

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
1. APRESENTAÇÃO DO CARDÁPIO COM FOTOS:
   - Quando o cliente pedir o cardápio, as opções disponíveis ou perguntar o que tem para comer, acione a ferramenta 'enviar_cardapio_com_fotos'.
   - O sistema enviará automaticamente cada item do cardápio como uma mensagem com a foto do prato, nome, valor e descrição!
   - NUNCA reescreva IDs técnicos de banco de dados como [ID: ...] ou (ID: ...) nas mensagens.
2. FLUXO NORMAL AO SELECIONAR OS ITENS:
   - Quando o cliente escolher ou selecionar o que deseja (ex: "vou querer 2 hambúrgueres artesanais cheddar sem verdura"):
     NÃO reenvie as fotos do cardápio! Prossiga imediatamente com o fluxo normal de atendimento:
     1. Confirme os itens escolhidos e anote todas as observações (ex: "Perfeito! Dois Hambúrgueres Artesanais Cheddar anotados, com a observação: sem verdura.").
     2. Pergunte se prefere Entrega (Delivery) ou Retirada no balcão. Se for entrega, pergunte o endereço completo com rua e número.
     3. Pergunte a forma de pagamento (PIX, Cartão na entrega ou Dinheiro).
     4. Ao ter os dados confirmados, acione a ferramenta 'registrar_pedido' para salvar no painel da cozinha.
3. ATENÇÃO MÁXIMA ÀS QUANTIDADES E OBSERVAÇÕES:
   - Respeite rigorosamente a quantidade informada pelo cliente (se pedir 2 hambúrgueres, mantenha exatamente 2 unidades).
   - Registre todas as observações do cliente (ex: sem verdura, sem cebola, ponto da carne).
4. REGRA OBRIGATÓRIA DE FECHAMENTO (CHAMADA DE FERRAMENTA):
   - Assim que o cliente fornecer itens, endereço e forma de pagamento, você DEVE OBRIGATORIAMENTE chamar a ferramenta 'registrar_pedido'.
   - O pedido SÓ EXISTE NO SISTEMA DO RESTAURANTE SE VOCÊ EXECUTAR A FERRAMENTA 'registrar_pedido'.
5. FORMATAÇÃO VISUAL PARA WHATSAPP:
   - Use formato nativo do WhatsApp: negrito com APENAS UM asterisco (ex: *Hambúrguer Artesanal*). NUNCA use duplo asterisco **assim**.
   - Para listas de itens, use marcadores como '• ' ou emojis (🍔, 🥤, 🍟, 🍕), NUNCA inicie a linha com '* '.
6. MENSAGENS DE ÁUDIO E IMAGEM (MULTIMODALIDADE):
   - O cliente pode enviar mensagens de áudio com pedidos, dúvidas ou endereço. Você tem capacidade de ouvir e compreender áudios perfeitamente em português.
   - Extraia com atenção máxima todos os itens, quantidades, endereço e forma de pagamento informados por voz no áudio.
7. SUGESTÃO DE ÁUDIO NO INÍCIO:
   - Na primeira saudação ou início da conversa, dê as boas-vindas com alegria e mencione:
     "🎙️ *Dica:* Se preferir, pode me mandar mensagem de áudio que eu escuto perfeitamente e anoto seu pedido!"
8. LOCALIZAÇÃO EXATA VIA WHATSAPP (GPS / WAZE):
   - Ao perguntar o endereço para entrega (Delivery), sempre dê a opção prática da localização do WhatsApp:
     "🛵 Para entrega, qual é o seu endereço completo (rua, número e bairro)?
     📍 *Dica:* Se preferir, você pode simplesmente compartilhar sua *Localização aqui pelo WhatsApp* (no botão de anexo 📎 > Localização)! Nosso motoboy receberá a rota exata no Waze e Maps."
   - Quando o cliente enviar a localização (você receberá a indicação [LOCALIZAÇÃO GPS RECEBIDA]), confirme com muito entusiasmo que as coordenadas foram gravadas:
     "📍 *Localização recebida com sucesso!* Seus dados exatos de GPS foram salvos e o entregador irá direto pelo Waze/Google Maps até você! 🚀"
     Peça apenas o número da residência/apartamento e a forma de pagamento caso ainda faltem!
   - Ao chamar 'registrar_pedido', inclua a 'latitude' e 'longitude' fornecidas!
`;
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
        description: 'Envia os pratos do cardápio individualmente com suas respectivas fotos, preços e descrições para o WhatsApp do cliente quando ele pedir para ver o cardápio.',
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
        description: 'Envia a foto de um produto específico diretamente no WhatsApp do cliente quando ele pedir para ver foto.',
        parameters: {
            type: 'object',
            properties: {
                productId: { type: 'string', description: 'ID do produto no cardápio se identificado' },
                productName: { type: 'string', description: 'Nome do produto solicitado' }
            },
            required: ['productName']
        }
    };
    try {
        const contents = [];
        // Add past messages
        for (const h of history) {
            contents.push({
                role: h.sender === 'user' ? 'user' : 'model',
                parts: [{ text: h.text }]
            });
        }
        // Prepare current user message parts (supporting audio and image inlineData)
        const currentParts = [];
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
        }
        else if (mediaPart?.mimeType.startsWith('audio/')) {
            currentParts.push({ text: 'Por favor, ouça a mensagem de áudio enviada pelo cliente acima e responda ao pedido ou dúvida dele com base estritamente no cardápio e no fluxo do restaurante.' });
        }
        else if (mediaPart?.mimeType.startsWith('image/')) {
            currentParts.push({ text: 'Por favor, analise a imagem enviada pelo cliente e responda ao pedido ou dúvida dele.' });
        }
        else {
            currentParts.push({ text: 'Olá' });
        }
        // Add current user message
        contents.push({
            role: 'user',
            parts: currentParts
        });
        const response = await genai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                tools: [{ functionDeclarations: [registrarPedidoTool, enviarCardapioComFotosTool, enviarFotoProdutoTool] }],
                temperature: 0.1
            }
        });
        let replyText = response.text || '';
        let createdOrder = null;
        let mediaList = [];
        // Check if the model called any tools
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            for (const call of functionCalls) {
                if (call.name === 'enviar_cardapio_com_fotos') {
                    const args = call.args;
                    const catFilter = (args.category || '').toLowerCase().trim();
                    let prodsToSend = products.filter((p) => p.available !== false && p.imageUrl);
                    if (catFilter) {
                        const filtered = prodsToSend.filter((p) => p.category?.toLowerCase().includes(catFilter));
                        if (filtered.length > 0)
                            prodsToSend = filtered;
                    }
                    prodsToSend = prodsToSend.slice(0, 10);
                    if (prodsToSend.length > 0) {
                        mediaList = prodsToSend.map((p) => ({
                            url: p.imageUrl,
                            caption: `🍽️ *${p.name}* - R$ ${Number(p.price).toFixed(2)}\n${p.description || ''}`,
                            productName: p.name
                        }));
                        console.log(`[Menu Tool Triggered] Enviando cardápio com ${mediaList.length} foto(s) de produtos!`);
                        replyText = `Aqui está o nosso cardápio com as fotos de cada opção! 👆😋\n\nQual item te apetece mais hoje? Pode me mandar por áudio ou texto que já anoto seu pedido! 🎙️`;
                    }
                }
                if (call.name === 'enviar_foto_produto') {
                    const args = call.args;
                    const searchName = (args.productName || '').toLowerCase().trim();
                    const found = products.find((prod) => (args.productId && prod.id === args.productId) ||
                        prod.name.toLowerCase().includes(searchName) ||
                        searchName.includes(prod.name.toLowerCase()));
                    if (found && found.imageUrl) {
                        mediaList.push({
                            url: found.imageUrl,
                            caption: `📸 *${found.name}* - R$ ${Number(found.price).toFixed(2)}\n${found.description || ''}`,
                            productName: found.name
                        });
                        if (!replyText) {
                            replyText = `Aqui está a foto do nosso *${found.name}*! 😋 Ficou com água na boca? Posso adicionar ao seu pedido?`;
                        }
                        console.log(`[Photo Tool Triggered] Foto do produto "${found.name}" preparada para envio! URL: ${found.imageUrl}`);
                    }
                    else {
                        if (!replyText) {
                            replyText = `Ainda não temos a foto cadastrada deste item no sistema, mas ele é preparado com muito capricho! Gostaria de pedir?`;
                        }
                    }
                }
                if (call.name === 'registrar_pedido') {
                    const args = call.args;
                    let subtotal = 0;
                    const orderItems = (args.items || []).map((it) => {
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
                    console.log(`[Order Created] Pedido #${orderNumber} registrado para ${customerPhone}! Total: R$ ${total}`);
                    replyText = `🎉 *Pedido #${orderNumber} Registrado com Sucesso!*\n\n` +
                        `📋 *Itens:*\n` +
                        orderItems.map((it) => `• ${it.quantity}x ${it.name} - R$ ${it.total.toFixed(2)}`).join('\n') +
                        `\n\n🛵 *Tipo:* ${orderData.deliveryType === 'DELIVERY' ? `Entrega (${orderData.customerAddress})` : 'Retirada no Balcão'}\n` +
                        `💵 *Taxa de Entrega:* R$ ${deliveryFee.toFixed(2)}\n` +
                        `💰 *Total:* R$ ${total.toFixed(2)}\n` +
                        `💳 *Pagamento:* ${orderData.paymentMethod}\n\n` +
                        `⏳ *Aguardando confirmação do estabelecimento!*\n` +
                        `Assim que a cozinha aprovar seu pedido, você receberá a confirmação aqui mesmo!`;
                }
            }
        }
        // Safety Fallback: If Gemini generated text saying order was registered or confirming details without calling function
        if (!createdOrder && replyText) {
            const lowerReply = replyText.toLowerCase();
            const isConfirmedInText = lowerReply.includes('registrado com sucesso') ||
                lowerReply.includes('pedido foi registrado') ||
                lowerReply.includes('anotei seu pedido') ||
                lowerReply.includes('sendo preparado');
            if (isConfirmedInText) {
                console.log('[Fallback Order Capture] Gemini replied with confirmation text, creating order in Firestore...');
                // Find matching products from menu in conversation
                const fullConvo = [...history.map(h => h.text), incomingText, replyText].join(' ').toLowerCase();
                const matchedItems = [];
                let subtotal = 0;
                for (const p of products) {
                    if (fullConvo.includes(p.name.toLowerCase())) {
                        // Check for quantity in conversation (e.g. "2 hamburguer", "2x", "duas unidades")
                        let qty = 1;
                        const matchQty = fullConvo.match(new RegExp(`(\\d+)\\s*(?:unidades?|x)?\\s*(?:de\\s*)?${p.name.toLowerCase().slice(0, 10)}`, 'i'));
                        if (matchQty && matchQty[1]) {
                            qty = parseInt(matchQty[1], 10);
                        }
                        else if (fullConvo.includes('2 hamburguer') || fullConvo.includes('2 hambúrguer') || fullConvo.includes('dois hamburguer') || fullConvo.includes('duas unidades')) {
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
                    const defaultProd = products[0];
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
                if (fullConvo.includes('pix'))
                    detectedPayment = 'PIX';
                else if (fullConvo.includes('dinheiro'))
                    detectedPayment = 'Dinheiro';
                else if (fullConvo.includes('débito') || fullConvo.includes('debito'))
                    detectedPayment = 'Cartão de Débito';
                else if (fullConvo.includes('crédito') || fullConvo.includes('credito'))
                    detectedPayment = 'Cartão de Crédito';
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
        if (isAskingMenu && !isSelecting && mediaList.length === 0) {
            const prodsWithPhoto = products.filter((p) => p.available !== false && p.imageUrl).slice(0, 10);
            if (prodsWithPhoto.length > 0) {
                mediaList = prodsWithPhoto.map((p) => ({
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
            const askedPhoto = lowerIn.includes('foto') || lowerIn.includes('imagem') || lowerIn.includes('fotos') || lowerIn.includes('imagens') || lowerIn.includes('ver o ') || lowerIn.includes('ver a ');
            if (askedPhoto) {
                const found = products.find((prod) => prod.imageUrl && (lowerIn.includes(prod.name.toLowerCase()) ||
                    prod.name.toLowerCase().split(' ').some((w) => w.length > 3 && lowerIn.includes(w))));
                if (found) {
                    mediaList.push({
                        url: found.imageUrl,
                        caption: formatWhatsAppText(`📸 *${found.name}* - R$ ${Number(found.price).toFixed(2)}\n${found.description || ''}`),
                        productName: found.name
                    });
                    console.log(`[Single Photo Trigger] Foto do produto "${found.name}" preparada para envio!`);
                }
            }
        }
        if (!replyText) {
            if (mediaList.length === 1) {
                replyText = `Aqui está a foto do nosso *${mediaList[0].productName || 'produto'}*! Deseja pedir este item?`;
            }
            else if (mediaList.length > 1) {
                replyText = `Aqui estão as fotos dos nossos pratos! 👆😋\n\nQual item te apetece mais hoje? Se preferir, pode me mandar mensagem de áudio ou texto! 🎙️`;
            }
            else {
                replyText = 'Desculpe, não consegui entender perfeitamente. Como posso te ajudar com o cardápio?';
            }
        }
        // Ensure audio suggestion is present on customer's initial contact
        if (history.length <= 1) {
            const lowerReply = replyText.toLowerCase();
            if (!lowerReply.includes('áudio') && !lowerReply.includes('audio') && !lowerReply.includes('voz')) {
                replyText = `${replyText}\n\n🎙️ *Dica:* Se preferir, você também pode me mandar mensagem de áudio que eu escuto com atenção e anoto seu pedido!`;
            }
        }
        // Format clean WhatsApp typography (convert markdown bold/bullets and remove ID leaks)
        replyText = formatWhatsAppText(replyText);
        // Save assistant reply to chat history
        await chatRef.add({
            sender: 'assistant',
            text: replyText,
            timestamp: new Date().toISOString(),
            orderId: createdOrder ? createdOrder.id : null,
            mediaUrl: mediaList.length > 0 ? mediaList[0].url : null
        });
        return {
            replyText,
            orderCreated: createdOrder,
            mediaList,
            mediaToSend: mediaList.length > 0 ? mediaList[0] : null
        };
    }
    catch (err) {
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
            }, { merge: true }).catch(() => { });
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
        // Ignore messages sent by the bot itself (handles Evolution Go IsFromMe and Node fromMe)
        const fromMe = info.IsFromMe ?? key.fromMe ?? messageData.fromMe ?? false;
        if (fromMe) {
            console.log(`[Evolution Webhook] Ignorando mensagem enviada por mim (fromMe)`);
            return res.status(200).json({ status: 'ignored_from_me' });
        }
        // Determine group
        const isGroup = info.IsGroup ?? false;
        // Determine remote phone (handles Evolution Go Info.Chat / Info.Sender and Node key.remoteJid)
        const remoteJid = info.Chat || info.Sender || key.remoteJid || messageData.remoteJid || messageData.from || messageData.sender || '';
        const phone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '');
        // Ignore group chats and broadcast lists
        if (!phone || isGroup || remoteJid.includes('@g.us') || remoteJid.includes('broadcast')) {
            console.log(`[Evolution Webhook] Ignorando grupo ou sem telefone: ${remoteJid}`);
            return res.status(200).json({ status: 'ignored_group_or_no_phone' });
        }
        // Extract message content (handles Evolution Go Message and Node message)
        const msgContent = messageData.Message || messageData.message || messageData.msg || {};
        let text = msgContent.conversation ||
            msgContent.extendedTextMessage?.text ||
            msgContent.imageMessage?.caption ||
            messageData.conversation ||
            messageData.text ||
            messageData.body || '';
        const audioMsg = msgContent.audioMessage || msgContent.AudioMessage;
        const imageMsg = msgContent.imageMessage || msgContent.ImageMessage;
        const locationMsg = msgContent.locationMessage ||
            msgContent.LocationMessage ||
            msgContent.liveLocationMessage ||
            msgContent.LiveLocationMessage ||
            messageData.locationMessage;
        let gpsData = null;
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
                }
                catch (gpsUpdateErr) {
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
                if (now - t > 60000)
                    processedMessages.delete(k);
            }
        }
        // Load store establishment configuration
        const estDoc = await db.collection('establishments').doc(storeId).get();
        const est = estDoc.data() || {};
        // Subscription / Trial Verification (7 days trial or active paid subscription)
        if (!isEstablishmentSubscriptionActive(est)) {
            console.warn(`[Evolution Webhook] 🛑 BLOQUEADO: Assinatura do estabelecimento "${est.name || storeId}" expirada (teste de 7 dias encerrado). Mensagem de ${phone} não será respondida pela IA.`);
            return res.status(200).json({
                status: 'subscription_expired',
                message: 'Período de teste de 7 dias encerrado. Assinatura de R$ 50/mês necessária.'
            });
        }
        const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108';
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
        const evoInst = est.evolutionInstanceName || defaultInstName;
        // Handle Media (Voice Audio / Image)
        let mediaPart = null;
        if (audioMsg || imageMsg) {
            console.log(`[Evolution Webhook] Mídia detectada (${audioMsg ? 'áudio' : 'imagem'}) de ${phone}. Baixando via Evolution API...`);
            mediaPart = await downloadWhatsAppMedia(evoUrl, evoInst, msgContent);
            if (mediaPart) {
                console.log(`[Evolution Webhook] Mídia baixada com sucesso! Tipo: ${mediaPart.mimeType}, Tamanho base64: ${mediaPart.data.length}`);
            }
            else {
                console.warn(`[Evolution Webhook] Não foi possível baixar mídia de ${phone}`);
            }
            // Se for mensagem de áudio, marca como reproduzida (microfone azul no WhatsApp)
            if (audioMsg && messageId) {
                fetch(`${evoUrl}/message/markplayed`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: evoInst },
                    body: JSON.stringify({ number: phone, id: [messageId] })
                }).catch(() => { });
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
        const result = await processAiCustomerMessage(storeId, phone, text, pushName, mediaPart || undefined);
        // 1. Send product images if requested (e.g. menu items with individual photos)
        if (result.mediaList && result.mediaList.length > 0) {
            console.log(`[Evolution Webhook] Enviando ${result.mediaList.length} foto(s) de item/cardápio para ${phone}...`);
            for (let i = 0; i < result.mediaList.length; i++) {
                const item = result.mediaList[i];
                console.log(`[Evolution Webhook] Enviando foto ${i + 1}/${result.mediaList.length}: ${item.productName || 'Item'} (${item.url})`);
                await sendWhatsAppMedia(evoUrl, evoKey, evoInst, phone, item.url, item.caption, 'image');
                // Small delay between photos to guarantee sequential delivery on WhatsApp
                if (i < result.mediaList.length - 1) {
                    await new Promise(r => setTimeout(r, 650));
                }
            }
        }
        else if (result.mediaToSend) {
            console.log(`[Evolution Webhook] Enviando foto de produto para ${phone}: ${result.mediaToSend.url}`);
            await sendWhatsAppMedia(evoUrl, evoKey, evoInst, phone, result.mediaToSend.url, result.mediaToSend.caption, 'image');
        }
        // 2. Send reply text via Evolution API
        let sendRes = null;
        if (result.replyText && (!result.mediaToSend || result.replyText !== result.mediaToSend.caption)) {
            if (result.mediaList && result.mediaList.length > 0) {
                await new Promise(r => setTimeout(r, 500));
            }
            sendRes = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, phone, result.replyText);
            console.log(`[Evolution Webhook] Resposta enviada para ${phone}:`, JSON.stringify(sendRes));
        }
        return res.status(200).json({
            status: 'processed',
            establishmentId: storeId,
            reply: result.replyText,
            mediaSent: result.mediaToSend ? true : false
        });
    }
    catch (err) {
        console.error('[Evolution Webhook Error]:', err);
        return res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Auth Endpoints (Multi-Tenant)
// ----------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, storeName, storePhone, segment } = req.body;
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
            const fbUser = await firebase_admin_1.default.auth().createUser({
                email: cleanEmail,
                password: password,
                displayName: storeName
            });
            uid = fbUser.uid;
        }
        catch {
            uid = 'est_' + crypto_1.default.randomBytes(8).toString('hex');
        }
        const hashedPassword = hashPassword(password);
        await db.collection('establishment_users').doc(uid).set({
            uid,
            email: cleanEmail,
            passwordHash: hashedPassword,
            storeName,
            storePhone: storePhone || '',
            segment: segment || 'Alimentação & Bebidas',
            createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
        });
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
            evolutionApiKey: 'minha_chave_secreta_7108',
            evolutionApiUrl: 'http://34.69.146.15:8081',
            evolutionInstanceName: `pedidos_${uid.slice(0, 15)}`,
            createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        let customToken = null;
        try {
            customToken = await firebase_admin_1.default.auth().createCustomToken(uid);
        }
        catch { }
        res.json({ success: true, uid, email: cleanEmail, storeName, customToken });
    }
    catch (err) {
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
            customToken = await firebase_admin_1.default.auth().createCustomToken(uid);
        }
        catch { }
        res.json({
            success: true,
            uid,
            email: cleanEmail,
            storeName: userData.storeName || 'Meu Estabelecimento',
            customToken
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Establishment Settings (Multi-Tenant)
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
                createdAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('establishments').doc(storeId).set(newStore);
            return res.json(newStore);
        }
        return res.json({ id: doc.id, ...doc.data() });
    }
    catch (err) {
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
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
        let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (products.length === 0) {
            const defaultMenu = [
                { name: 'Hamburguer Artesanal', description: 'Blend 180g, queijo cheddar, alface, tomate e maionese especial no pão brioche', price: 29.90, category: 'Hambúrgueres', available: true },
                { name: 'Hamburguer Duplo Cheddar Bacon', description: '2 blends 150g, muito bacon crocante, cheddar duplo e molho barbecue', price: 38.90, category: 'Hambúrgueres', available: true },
                { name: 'Batata Frita Rústica Especial', description: 'Batata crocante com páprica, alecrim e maionese da casa', price: 18.00, category: 'Porções', available: true },
                { name: 'Refrigerante Lata 350ml', description: 'Coca-Cola, Guaraná Antarctica ou Sprite', price: 6.00, category: 'Bebidas', available: true }
            ];
            for (const item of defaultMenu) {
                const docRef = await productsCol.add({ ...item, createdAt: new Date().toISOString() });
                products.push({ id: docRef.id, ...item });
            }
        }
        res.json(products);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/products', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const productData = req.body;
        let productId = productData.id;
        if (productId) {
            delete productData.id;
            await db.collection('establishments').doc(storeId).collection('products').doc(productId).set(productData, { merge: true });
        }
        else {
            productId = `prod_${Date.now()}`;
            await db.collection('establishments').doc(storeId).collection('products').doc(productId).set({
                ...productData,
                id: productId,
                available: productData.available !== undefined ? productData.available : true,
                updatedAt: new Date().toISOString()
            });
        }
        res.json({ success: true, product: { id: productId, ...productData } });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.delete('/api/products/:id', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const { id } = req.params;
        await db.collection('establishments').doc(storeId).collection('products').doc(id).delete();
        res.json({ success: true, message: 'Produto removido com sucesso' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
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
    }
    catch (err) {
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
        const updateData = {
            status,
            updatedAt: new Date().toISOString()
        };
        if (rejectionReason)
            updateData.rejectionReason = rejectionReason;
        if (courierPhone) {
            updateData.courierPhone = courierPhone.replace(/\D/g, '');
            if (courierName)
                updateData.courierName = courierName;
            updateData.dispatchedAt = new Date().toISOString();
        }
        await orderRef.update(updateData);
        // If requested, auto-save this courier in the establishment's couriers directory
        if (saveCourier && courierPhone) {
            try {
                const estRef = db.collection('establishments').doc(storeId);
                const estDoc = await estRef.get();
                const estData = estDoc.data() || {};
                const existingCouriers = estData.couriers || [];
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
            }
            catch (saveErr) {
                console.warn('[Auto-save Courier Error]:', saveErr);
            }
        }
        const estDoc = await db.collection('establishments').doc(storeId).get();
        const est = estDoc.data() || {};
        const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const evoKey = est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108';
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
        const evoInst = est.evolutionInstanceName || defaultInstName;
        const customerName = orderData.customerName || 'Cliente';
        const customerPhone = orderData.customerPhone;
        const orderNum = orderData.orderNumber || id.slice(-4);
        // 1. Send automated WhatsApp notification to customer if phone exists
        if (customerPhone) {
            try {
                let notifyText = '';
                console.log(`[Order Status Update] Loja: ${storeId}, Pedido #${orderNum}, Status: ${status}, Telefone: ${customerPhone}`);
                if (status === 'CONFIRMADO' || status === 'EM_PREPARO' || status === 'PREPARANDO') {
                    notifyText = `Olá, *${customerName}*! Seu pedido *#${orderNum}* foi confirmado pelo restaurante e já está sendo preparado com muito carinho! 👨‍🍳🔥\n\n⏱️ *Tempo estimado:* ${est.estimatedDeliveryTime || '35 a 50 minutos'}.`;
                }
                else if (status === 'A_CAMINHO' || status === 'ENTREGA') {
                    const courierGreeting = courierName ? ` com o entregador *${courierName}*` : '';
                    notifyText = `Oba, *${customerName}*! 🛵 Seu pedido *#${orderNum}* acabou de sair para entrega${courierGreeting}!\n\n📍 *Endereço:* ${orderData.customerAddress || 'Endereço informado'}\n\nFique atento(a), o entregador chegará em instantes. Bom apetite! 😋`;
                }
                else if (status === 'PRONTO') {
                    notifyText = `Olá, *${customerName}*! 🛍️ Seu pedido *#${orderNum}* já está *PRONTO* para retirada no balcão!\n\nPode vir retirar quando quiser. Bom apetite! ✨`;
                }
                else if (status === 'CONCLUIDO' || status === 'FINALIZADO') {
                    notifyText = `Pedido *#${orderNum}* finalizado com sucesso! Muito obrigado pela preferência, *${customerName}*! Esperamos que tenha gostado da refeição. Até o próximo pedido! ⭐⭐⭐⭐⭐`;
                }
                else if (status === 'CANCELADO') {
                    notifyText = `Olá, *${customerName}*. Infelizmente seu pedido *#${orderNum}* precisou ser cancelado pelo restaurante.${rejectionReason ? `\n\n*Motivo:* ${rejectionReason}` : ''}\n\nPedimos desculpas pelo transtorno. Se tiver dúvidas, estamos à disposição!`;
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
                    }).catch(() => { });
                }
            }
            catch (notifyErr) {
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
                        .map((it) => `• ${it.quantity}x ${it.name}${it.notes ? ` (${it.notes})` : ''}`)
                        .join('\n');
                    const totalNum = Number(orderData.total ?? orderData.totalAmount ?? 0);
                    const totalFormatted = totalNum.toFixed(2).replace('.', ',');
                    const changeInfo = orderData.changeFor ? ` (Troco para R$ ${Number(orderData.changeFor).toFixed(2).replace('.', ',')})` : '';
                    const motoboyGreeting = courierName ? `Olá, *${courierName}*! ` : '';
                    const courierMessage = `${motoboyGreeting}🛵 *NOVA ENTREGA DISPONÍVEL - ${est.name || 'iaPedido'}*
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
            }
            catch (courierErr) {
                console.warn('[Courier Dispatch Error]:', courierErr);
            }
        }
        res.json({ success: true, orderId: id, status });
    }
    catch (err) {
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
    }
    catch (err) {
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
        const couriers = est.couriers || [];
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
        }
        else {
            couriers.push({ ...courierData, createdAt: new Date().toISOString() });
        }
        await estRef.set({ couriers }, { merge: true });
        res.json({ success: true, courier: courierData, couriers });
    }
    catch (err) {
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
        const couriers = (est.couriers || []).filter((c) => c.id !== id && c.phone !== id);
        await estRef.set({ couriers }, { merge: true });
        res.json({ success: true, couriers });
    }
    catch (err) {
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
        const result = await processAiCustomerMessage(storeId, testPhone, text, testName);
        res.json(result);
    }
    catch (err) {
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
    }
    catch (err) {
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
        const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
        const evoInst = (est.evolutionInstanceName || defaultInstName).trim();
        const allRes = await fetch(`${evoUrl}/instance/all`, {
            headers: { apikey: evoKey }
        });
        const allData = await allRes.json().catch(() => ({}));
        let isConnected = false;
        if (allData && Array.isArray(allData.data)) {
            const found = allData.data.find((inst) => inst.name === evoInst);
            if (found && found.connected) {
                isConnected = true;
            }
        }
        // Persist real-time connection state in Firestore
        await db.collection('establishments').doc(storeId).set({
            evolutionConnected: isConnected,
            updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => { });
        res.json({ connected: isConnected, state: isConnected ? 'open' : 'close' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.all(['/api/evolution/connect', '/api/evolution/qr'], async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const estDoc = await db.collection('establishments').doc(storeId).get();
        const est = estDoc.data() || {};
        const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
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
            const found = allData.data.find((inst) => inst.name === evoInst);
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
                        ignoreStatus: true
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
        }
        else {
            return res.json({ qr: null, base64: null, instanceName: evoInst, connected: true, status: 'connected' });
        }
    }
    catch (err) {
        console.error('[Evolution Connect Error]:', err);
        res.status(500).json({ error: 'Falha ao conectar Evolution API', details: err.message });
    }
});
app.post('/api/evolution/disconnect', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const estDoc = await db.collection('establishments').doc(storeId).get();
        const est = estDoc.data() || {};
        const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const evoKey = (est.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'minha_chave_secreta_7108').trim();
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
        const evoInst = (est.evolutionInstanceName || defaultInstName).trim();
        console.log(`[Evolution Go] Desconectando/removendo instância: ${evoInst}`);
        const allRes = await fetch(`${evoUrl}/instance/all`, {
            headers: { apikey: evoKey }
        });
        const allData = await allRes.json().catch(() => ({}));
        let instanceId = '';
        if (allData && Array.isArray(allData.data)) {
            const found = allData.data.find((inst) => inst.name === evoInst);
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
        }).catch(() => { });
        res.json({ success: true, message: 'Instância desconectada e reiniciada com sucesso.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/evolution/pair', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const { phone } = req.body;
        if (!phone)
            return res.status(400).json({ error: 'Telefone é obrigatório para pairing code.' });
        const cleanPhone = phone.replace(/\D/g, '');
        const estDoc = await db.collection('establishments').doc(storeId).get();
        const est = estDoc.data() || {};
        const evoUrl = (est.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
        const evoInst = (est.evolutionInstanceName || defaultInstName).trim();
        const pairRes = await fetch(`${evoUrl}/instance/pair`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoInst },
            body: JSON.stringify({ phone: cleanPhone })
        });
        const pairData = await pairRes.json().catch(() => ({}));
        const code = pairData?.data?.PairingCode || pairData?.pairingCode || null;
        res.json({ pairingCode: code, raw: pairData });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/evolution/test-send', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const { number, text } = req.body;
        const estDoc = await db.collection('establishments').doc(storeId).get();
        const est = estDoc.data() || {};
        const evoUrl = (est.evolutionApiUrl || 'http://34.69.146.15:8081').replace(/\/$/, '');
        const evoKey = est.evolutionApiKey || 'minha_chave_secreta_7108';
        const defaultInstName = storeId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${storeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
        const evoInst = est.evolutionInstanceName || defaultInstName;
        const result = await sendWhatsAppMessage(evoUrl, evoKey, evoInst, number, text);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Campaigns & Scheduled Broadcasts
// ----------------------------------------------------
// Helper to get unique past customers from delivered/completed orders, excluding blocked contacts
async function getAudienceCustomers(establishmentId) {
    const customersMap = new Map(); // phone -> name
    try {
        // 0. Fetch Blocked / Opt-out Contacts
        const blockedSnap = await db.collection('establishments').doc(establishmentId).collection('blocked_contacts').get();
        const blockedSet = new Set(blockedSnap.docs.map(d => d.id));
        // 1. Fetch from Orders collection (customers who actually placed valid orders)
        const ordersSnap = await db.collection('establishments').doc(establishmentId).collection('orders').get();
        for (const doc of ordersSnap.docs) {
            const o = doc.data();
            // Only include valid orders (exclude cancelled)
            if (o.status === 'CANCELADO')
                continue;
            const phone = (o.customerPhone || '').replace(/\D/g, '');
            if (phone && phone.length >= 10 && !blockedSet.has(phone)) {
                const existingName = customersMap.get(phone);
                const newName = (o.customerName || '').trim();
                if (!existingName || (newName && newName.toLowerCase() !== 'cliente')) {
                    customersMap.set(phone, newName || 'Cliente');
                }
            }
        }
    }
    catch (err) {
        console.error(`[Audience Fetch Error for ${establishmentId}]:`, err.message);
    }
    return Array.from(customersMap.entries()).map(([phone, name]) => ({ phone, name }));
}
// Helper to execute campaign broadcast to customer list
async function executeCampaignBroadcast(establishmentId, campaign, customers) {
    const estDoc = await db.collection('establishments').doc(establishmentId).get();
    const establishment = estDoc.data() || {};
    const evoUrl = (establishment.evolutionApiUrl || process.env.EVOLUTION_API_URL || 'http://34.69.146.15:8081').replace(/\/$/, '');
    const evoKey = establishment.evolutionApiKey || 'minha_chave_secreta_7108';
    const defaultInstName = establishmentId === DEFAULT_ESTABLISHMENT_ID ? 'pedidos_zap' : `pedidos_${establishmentId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 20)}`;
    const evoInst = (establishment.evolutionInstanceName || defaultInstName).trim();
    let sentCount = 0;
    let errorsCount = 0;
    console.log(`[Broadcast Campaign] Iniciando disparo da campanha "${campaign.title}" para ${customers.length} cliente(s) de ${establishment.name || establishmentId}`);
    for (let i = 0; i < customers.length; i++) {
        const client = customers[i];
        try {
            // Extract clean first name
            let firstName = (client.name || '').trim().split(' ')[0];
            if (!firstName || firstName.toLowerCase() === 'cliente') {
                firstName = 'Amigo(a)';
            }
            // Replace template variables
            let personalizedMsg = (campaign.message || '')
                .replace(/\{cliente\}/gi, firstName)
                .replace(/\{loja\}/gi, establishment.name || 'Nosso Restaurante')
                .replace(/\{horario\}/gi, establishment.operatingHours || 'Aberto agora');
            personalizedMsg = formatWhatsAppText(personalizedMsg);
            if (campaign.imageUrl && campaign.imageUrl.trim()) {
                await sendWhatsAppMedia(evoUrl, evoKey, evoInst, client.phone, campaign.imageUrl.trim(), personalizedMsg, 'image');
            }
            else {
                await sendWhatsAppMessage(evoUrl, evoKey, evoInst, client.phone, personalizedMsg);
            }
            sentCount++;
            console.log(`[Broadcast Campaign] (${i + 1}/${customers.length}) Enviado com sucesso para ${client.phone} (${firstName})`);
            // Security delay between customers to protect WhatsApp instance from spam detection
            if (i < customers.length - 1) {
                await new Promise(r => setTimeout(r, 1200));
            }
        }
        catch (err) {
            console.error(`[Broadcast Campaign Error] Falha ao enviar para ${client.phone}:`, err.message);
            errorsCount++;
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
    }, { merge: true }).catch(() => { });
    return { sentCount, errorsCount };
}
// 1. List Campaigns
app.get('/api/campaigns', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const snap = await db.collection('establishments').doc(storeId).collection('campaigns').orderBy('createdAt', 'desc').get();
        const campaigns = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(campaigns);
    }
    catch (err) {
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// 3. Create or Update Campaign
app.post('/api/campaigns', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const { id, title, description, message, imageUrl, scheduledTime, daysOfWeek, active, targetAudience } = req.body;
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
            updatedAt: new Date().toISOString()
        };
        const campaignsCol = db.collection('establishments').doc(storeId).collection('campaigns');
        if (id) {
            await campaignsCol.doc(id).set({
                ...campaignData,
                lastRunAt: null // Reset lastRunAt so new time tests can run on the same day
            }, { merge: true });
            res.json({ id, ...campaignData });
        }
        else {
            const newDoc = await campaignsCol.add({
                ...campaignData,
                createdAt: new Date().toISOString(),
                stats: { totalSent: 0, lastBatchCount: 0 }
            });
            res.json({ id: newDoc.id, ...campaignData });
        }
    }
    catch (err) {
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
    }
    catch (err) {
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
    }
    catch (err) {
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
        const campaign = { id: docSnap.id, ...docSnap.data() };
        const customers = await getAudienceCustomers(storeId);
        if (customers.length === 0) {
            return res.json({
                success: true,
                message: 'Nenhum cliente na base ainda para receber este disparo.',
                sentCount: 0
            });
        }
        // Trigger broadcast asynchronously and respond
        const result = await executeCampaignBroadcast(storeId, campaign, customers);
        res.json({
            success: true,
            message: `Disparo concluído com sucesso para ${result.sentCount} cliente(s)!`,
            sentCount: result.sentCount,
            errorsCount: result.errorsCount
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ----------------------------------------------------
// Customer Contacts Management (WhatsApp Audience)
// ----------------------------------------------------
// List all customers who actually ordered and received with their stats and block status
app.get('/api/customers', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        // Fetch blocked phones set
        const blockedSnap = await db.collection('establishments').doc(storeId).collection('blocked_contacts').get();
        const blockedMap = new Map();
        blockedSnap.docs.forEach(doc => {
            blockedMap.set(doc.id, doc.data());
        });
        // Fetch orders to aggregate customer data
        const ordersSnap = await db.collection('establishments').doc(storeId).collection('orders').get();
        const map = new Map();
        ordersSnap.docs.forEach(doc => {
            const o = doc.data();
            const phone = (o.customerPhone || '').replace(/\D/g, '');
            if (!phone || phone.length < 10)
                return;
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
            }
            else {
                existing.ordersCount += 1;
                if (isCompleted)
                    existing.completedOrdersCount += 1;
                if (o.status !== 'CANCELADO')
                    existing.totalSpent += orderTotal;
                if (new Date(orderDate) > new Date(existing.lastOrderDate)) {
                    existing.lastOrderDate = orderDate;
                    if (o.customerName && o.customerName !== 'Cliente') {
                        existing.name = o.customerName;
                    }
                }
            }
        });
        // Sort by last order descending
        const customersList = Array.from(map.values())
            .filter(c => c.completedOrdersCount > 0 || c.ordersCount > 0)
            .sort((a, b) => new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime());
        res.json(customersList);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Toggle block/opt-out for a contact from marketing broadcasts
app.post('/api/customers/toggle-block', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const { phone, reason } = req.body;
        if (!phone)
            return res.status(400).json({ error: 'Telefone é obrigatório.' });
        const cleanPhone = phone.replace(/\D/g, '');
        const docRef = db.collection('establishments').doc(storeId).collection('blocked_contacts').doc(cleanPhone);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            // Unblock
            await docRef.delete();
            res.json({ success: true, isBlocked: false, message: 'Contato reativado para receber disparos.' });
        }
        else {
            // Block / Opt-out
            await docRef.set({
                phone: cleanPhone,
                blockedAt: new Date().toISOString(),
                reason: reason || 'Removido pelo estabelecimento'
            });
            res.json({ success: true, isBlocked: true, message: 'Contato removido da lista de disparos.' });
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete contact from broadcast audience
app.delete('/api/customers/:phone', async (req, res) => {
    try {
        const storeId = getStoreId(req);
        const cleanPhone = (req.params.phone || '').replace(/\D/g, '');
        if (!cleanPhone)
            return res.status(400).json({ error: 'Telefone é obrigatório.' });
        await db.collection('establishments').doc(storeId).collection('blocked_contacts').doc(cleanPhone).set({
            phone: cleanPhone,
            blockedAt: new Date().toISOString(),
            reason: 'Removido pelo estabelecimento'
        });
        res.json({ success: true, isBlocked: true, message: 'Contato removido dos disparos com sucesso.' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Helper function to check and execute scheduled campaigns for all active stores
async function checkAndExecuteScheduledCampaigns() {
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
            const camp = { id: cDoc.id, ...cDoc.data() };
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
                const customers = await getAudienceCustomers(storeId);
                if (customers.length > 0) {
                    await executeCampaignBroadcast(storeId, camp, customers);
                    triggeredCount++;
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
    }
    catch (err) {
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
        const { MercadoPagoConfig, Payment } = await Promise.resolve().then(() => __importStar(require('mercadopago')));
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
    }
    catch (err) {
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
        const { MercadoPagoConfig, Payment } = await Promise.resolve().then(() => __importStar(require('mercadopago')));
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
    }
    catch (err) {
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
        if (!mpToken)
            return res.status(200).send('ok');
        const { MercadoPagoConfig, Payment } = await Promise.resolve().then(() => __importStar(require('mercadopago')));
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
    }
    catch (err) {
        console.error('[Subscription Webhook MP Error]:', err);
        return res.status(200).send('ok');
    }
});
// Export Cloud Scheduler Function (runs automatically every 5 minutes in background)
exports.scheduledCampaignsRunner = (0, scheduler_1.onSchedule)({
    schedule: '*/5 * * * *',
    timeZone: 'America/Sao_Paulo',
    region: 'us-central1'
}, async () => {
    console.log('[Scheduler Triggered] Executando verificação de campanhas agendadas...');
    await checkAndExecuteScheduledCampaigns();
});
// Export Cloud Function v2
exports.api = (0, https_1.onRequest)({
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    memory: '512MiB'
}, app);
//# sourceMappingURL=index.js.map