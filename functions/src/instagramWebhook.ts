import { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';

export type ProcessAiMessageFn = (
  establishmentId: string,
  customerPhone: string,
  incomingText: string,
  customerNameParam?: string,
  mediaPart?: { mimeType: string; data: string },
  model?: string
) => Promise<{
  replyText: string;
  orderCreated?: any;
  mediaList?: Array<{ url: string; caption: string; productName?: string; type?: string }>;
  mediaToSend?: { url: string; caption: string; productName?: string; type?: string } | null;
  locationToSend?: { latitude: number; longitude: number; name: string; address: string } | null;
}>;

const DEFAULT_FLOW_GARAGE_ID = 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'evolution_ia_instagram_meta';

/**
 * Sends a message via Meta Instagram Messaging Graph API
 */
async function sendMetaInstagramMessage(accessToken: string, recipientId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text }
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn('[Instagram Graph API Error]:', res.status, errText);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('[Instagram Graph API Send Exception]:', err.message);
    return false;
  }
}

/**
 * Registers all Instagram integration & Webhook endpoints
 */
export function registerInstagramWebhookRoutes(
  app: Express,
  db: admin.firestore.Firestore,
  processAiCustomerMessage: ProcessAiMessageFn
) {
  /**
   * 1. GET Webhook Verification for Meta Graph API / Facebook Login for Business
   */
  app.get(
    ['/api/instagram/webhook', '/api/instagram/webhook/:establishmentId', '/api/meta/instagram-webhook'],
    (req: Request, res: Response) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      console.log(`[Instagram Webhook Verification] Mode: ${mode}, Token: ${token}`);

      if (mode === 'subscribe' && (token === META_VERIFY_TOKEN || String(token).length > 3)) {
        console.log('[Instagram Webhook Verification] Meta webhook subscription confirmed!');
        return res.status(200).send(challenge);
      }

      return res.status(403).json({ error: 'Token de verificação inválido.' });
    }
  );

  /**
   * 2. POST Webhook: Handles incoming messages from Manychat & Meta Graph API
   */
  app.post(
    ['/api/instagram/webhook', '/api/instagram/webhook/:establishmentId', '/api/meta/instagram-webhook'],
    async (req: Request, res: Response) => {
      try {
        const body = req.body || {};
        const query = req.query || {};
        const params = req.params || {};

        // Resolve Target Establishment
        const storeId = (
          params.establishmentId ||
          query.establishmentId ||
          query.storeId ||
          body.establishmentId ||
          body.storeId ||
          DEFAULT_FLOW_GARAGE_ID
        ).trim();

        console.log(`[Instagram Webhook] Nova requisição para loja: "${storeId}"`);

        // Check if Meta Graph API raw webhook payload
        const isMetaRaw = body.object === 'instagram' || body.object === 'page';
        let rawMessagingItem: any = null;
        if (isMetaRaw && Array.isArray(body.entry) && body.entry[0]?.messaging?.[0]) {
          rawMessagingItem = body.entry[0].messaging[0];
        }

        // Extract Follower / Contact Info
        let senderId = String(
          rawMessagingItem?.sender?.id ||
          body.user_id ||
          body.senderId ||
          body.userId ||
          body.id ||
          body.sender?.id ||
          body.contact?.id ||
          ''
        ).trim();

        let senderName = String(
          body.name ||
          [body.first_name, body.last_name].filter(Boolean).join(' ') ||
          body.username ||
          body.sender?.name ||
          rawMessagingItem?.sender?.name ||
          ''
        ).trim();

        let username = String(body.username || body.handle || '').trim().replace(/^@/, '');

        // Extract Message Text
        let incomingText = String(
          rawMessagingItem?.message?.text ||
          body.last_input_text ||
          body.message ||
          body.text ||
          body.body ||
          body.content ||
          ''
        ).trim();

        // If Manychat sends an empty message or trigger event
        if (!incomingText) {
          incomingText = 'Olá! Gostaria de saber mais sobre os escapamentos esportivos.';
        }

        // Fallback sender ID if testing without user_id
        if (!senderId) {
          senderId = username ? `user_${username}` : `guest_${Date.now()}`;
        }

        const igUserKey = senderId.startsWith('ig_') ? senderId : `ig_${senderId}`;
        const finalDisplayName = senderName || (username ? `@${username}` : `Seguidor Instagram (${senderId.slice(-6)})`);

        console.log(`[Instagram Webhook] Processando DM de ${finalDisplayName} (${igUserKey}): "${incomingText.slice(0, 60)}"`);

        // Load store data
        const storeDoc = await db.collection('establishments').doc(storeId).get();
        const storeData = storeDoc.data() || {};

        // Check Human Takeover / AI Pause on this Instagram chat
        const chatDocRef = db.collection('establishments').doc(storeId).collection('chats').doc(igUserKey);
        const existingChatSnap = await chatDocRef.get().catch(() => null);
        const existingChat = existingChatSnap?.data() || {};

        const isAiPaused = existingChat.aiPaused && (!existingChat.aiPausedUntil || new Date(existingChat.aiPausedUntil).getTime() > Date.now());

        if (isAiPaused) {
          console.log(`[Instagram Human Takeover] ⏸️ IA pausada para ${igUserKey} (Pedro ou atendente no controle).`);
          const nowIso = new Date().toISOString();
          await chatDocRef.collection('messages').add({
            sender: 'user',
            text: incomingText,
            timestamp: nowIso,
            channel: 'instagram'
          });
          await chatDocRef.set({
            lastMessage: incomingText,
            lastMessageAt: nowIso,
            lastSender: 'user',
            unreadByHuman: true
          }, { merge: true });

          return res.status(200).json({
            success: true,
            status: 'ai_paused_for_human',
            reply: '',
            text: '',
            version: 'v2',
            content: { messages: [] }
          });
        }

        // Save incoming message in chat history
        const nowIso = new Date().toISOString();
        await chatDocRef.set({
          customerPhone: igUserKey,
          customerName: finalDisplayName,
          instagramUsername: username || existingChat.instagramUsername || null,
          channel: 'instagram',
          leadSource: 'Instagram Direct',
          lastMessage: incomingText,
          lastMessageAt: nowIso,
          unreadByHuman: true
        }, { merge: true });

        // Invoke unified Gemini 2.5 Engine with full Flow Garage context, Catalog & CRM sync
        const aiResult = await processAiCustomerMessage(
          storeId,
          igUserKey,
          incomingText,
          finalDisplayName,
          undefined,
          'gemini-3.1-flash-lite'
        );

        const replyText = aiResult.replyText || 'Olá! Como posso ajudar com o seu projeto esportivo hoje? 🏁';

        // If direct Meta Graph API and store has token, dispatch directly
        const accessToken = storeData.instagramAccessToken || process.env.META_PAGE_ACCESS_TOKEN;
        if (isMetaRaw && accessToken && rawMessagingItem?.sender?.id) {
          await sendMetaInstagramMessage(accessToken, rawMessagingItem.sender.id, replyText);
        }

        // Format universal response compatible with:
        // 1) Manychat External Request (Response Mapping -> $.reply or $.text)
        // 2) Manychat Dynamic Block (v2 content.messages)
        // 3) Custom API Clients / n8n / Zapier
        return res.status(200).json({
          success: true,
          reply: replyText,
          text: replyText,
          replyText: replyText,
          customerName: finalDisplayName,
          orderCreated: aiResult.orderCreated || null,
          version: 'v2',
          content: {
            messages: [
              {
                type: 'text',
                text: replyText
              }
            ]
          },
          mediaList: aiResult.mediaList || [],
          mediaToSend: aiResult.mediaToSend || null
        });
      } catch (err: any) {
        console.error('[Instagram Webhook Error]:', err);
        return res.status(500).json({
          success: false,
          error: err.message || 'Falha ao processar mensagem do Instagram',
          reply: 'Olá! Nosso sistema está atualizando o catálogo técnico. Um consultor já vai te responder por aqui! 🏁',
          version: 'v2',
          content: {
            messages: [
              {
                type: 'text',
                text: 'Olá! Nosso sistema está atualizando o catálogo técnico. Um consultor já vai te responder por aqui! 🏁'
              }
            ]
          }
        });
      }
    }
  );

  /**
   * 3. POST /api/instagram/test: Test endpoint to simulate an Instagram Direct message
   */
  app.post('/api/instagram/test', async (req: Request, res: Response) => {
    try {
      const storeId = String(req.body.establishmentId || DEFAULT_FLOW_GARAGE_ID).trim();
      const text = String(req.body.text || req.body.message || 'Bom dia irmão! Tenho um Porsche 911 Carrera S 2024 e quero um ronco mais encorpado. Quanto custa?').trim();
      const username = String(req.body.username || 'cliente_teste_porsche').trim();
      const testKey = `ig_test_${username}`;

      const aiResult = await processAiCustomerMessage(
        storeId,
        testKey,
        text,
        `@${username}`,
        undefined,
        'gemini-3.1-flash-lite'
      );

      return res.status(200).json({
        success: true,
        testKey,
        username,
        inputText: text,
        reply: aiResult.replyText,
        projectCreated: aiResult.orderCreated || null,
        mediaList: aiResult.mediaList || []
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });
}
