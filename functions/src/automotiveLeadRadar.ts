/**
 * Automotive Lead Radar & Outbound Sales Engine (Dual-Engine: Instagram + Google Maps)
 * Powered by Apify & Google Gemini 2.5 Intelligence
 */
import { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { GoogleGenAI } from '@google/genai';

export interface ScrapedLead {
  id: string;
  source: 'google_maps' | 'instagram';
  title: string;
  subtitle: string;
  handleOrLocation: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  instagramUrl?: string;
  avatarUrl: string;
  carModel: string;
  porscheScore: number;
  buyingSignal: string;
  aiSuggestedPitch: string;
  tags: string[];
  status: 'new' | 'contacted' | 'imported';
  city: string;
  country: 'BR' | 'US' | 'EU';
  createdAt: string;
}

function getApifyToken(): string {
  return process.env.APIFY_API_TOKEN || '';
}

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
}

/**
 * Run Apify actor and wait for dataset items (up to timeoutMs)
 */
async function runApifyActor(actorId: string, input: any, token: string, maxWaitMs = 45000): Promise<any[]> {
  try {
    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });

    if (!runRes.ok) {
      const errText = await runRes.text();
      console.warn(`[Apify Error] Failed to start actor ${actorId}:`, errText);
      return [];
    }

    const runJson = await runRes.json();
    const runId = runJson.data?.id;
    const datasetId = runJson.data?.defaultDatasetId;
    if (!runId || !datasetId) return [];

    console.log(`[Apify Actor] Started ${actorId} with run ID: ${runId}`);

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
      if (!statusRes.ok) break;
      const statusJson = await statusRes.json();
      const status = statusJson.data?.status;

      if (status === 'SUCCEEDED') {
        const datasetRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=10`);
        if (!datasetRes.ok) return [];
        const items = await datasetRes.json();
        return Array.isArray(items) ? items : [];
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.warn(`[Apify Actor] Run ${runId} ended with status: ${status}`);
        break;
      }
    }
  } catch (err: any) {
    console.error(`[Apify Run Exception] for ${actorId}:`, err.message);
  }
  return [];
}

/**
 * Register Lead Radar API Endpoints
 */
export function registerLeadRadarEndpoints(app: Express, db: admin.firestore.Firestore) {
  // 1. Trigger live scan
  app.post('/api/automotive/radar/scan', async (req: Request, res: Response) => {
    try {
      const token = getApifyToken();
      const storeId = req.query.establishmentId as string || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
      const { keyword = 'porsche 911', location = 'São Paulo', engine = 'all' } = req.body || {};

      console.log(`[Lead Radar Scan] Starting scan for "${keyword}" at "${location}" (engine=${engine})`);
      const results: ScrapedLead[] = [];
      const ai = getGenAI();

      // Clean search hashtag for Instagram
      const cleanHashtag = keyword
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      // A. INSTAGRAM MINING (B2C)
      if (engine === 'all' || engine === 'instagram') {
        const targetTag = cleanHashtag.includes('porsche') ? cleanHashtag : `porsche${cleanHashtag || '911'}`;
        const igItems = await runApifyActor('apify~instagram-hashtag-scraper', {
          hashtags: [targetTag],
          resultsLimit: 6
        }, token, 35000);

        for (const item of igItems) {
          const username = item.ownerUsername || item.username;
          if (!username) continue;

          const caption = item.caption || '';
          const postUrl = item.url || `https://instagram.com/${username}`;
          const avatarUrl = item.displayUrl || item.owner?.profilePicUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80';

          // Use Gemini to analyze post & compute sales pitch
          let carModel = 'Porsche 911';
          let buyingSignal = 'Postou conteúdo recente sobre Porsche 911 no Instagram.';
          let pitch = `Olá @${username}! Acompanhei sua postagem sobre Porsche. Aqui na Flow Garage desenvolvemos escapamentos esportivos em Inox 304 com ronco de alta performance. Gostaria de conhecer nossas opções?`;
          let matchScore = 92;

          try {
            const prompt = `Analise este post real do Instagram sobre Porsche:
Autor: @${username}
Legenda: "${caption.slice(0, 500)}"
Localidade desejada: ${location}

Você é o Harvey AI SDR da Flow Garage (fabricante de escapamentos esportivos para supercarros).
Retorne ESTRITAMENTE um JSON no formato:
{
  "carModel": "modelo exato de Porsche ou Supercarro identificado (ex: Porsche 911 GT3 992)",
  "buyingSignal": "resumo em 1 frase do sinal de compra ou interesse em som/performance",
  "pitch": "abordagem personalizada citando o carro e oferecendo o ronco em inox 304 com válvulas",
  "matchScore": 85 a 98
}`;

            const aiRes = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { responseMimeType: 'application/json' }
            });

            const parsed = JSON.parse(aiRes.text || '{}');
            if (parsed.carModel) carModel = parsed.carModel;
            if (parsed.buyingSignal) buyingSignal = parsed.buyingSignal;
            if (parsed.pitch) pitch = parsed.pitch;
            if (parsed.matchScore) matchScore = Number(parsed.matchScore);
          } catch (aiErr) {
            console.warn('[Gemini Instagram Analysis Warn]:', aiErr);
          }

          const leadObj: ScrapedLead = {
            id: `ig_${username}_${Date.now()}`,
            source: 'instagram',
            title: `@${username}`,
            subtitle: `Post recente com #${targetTag}`,
            handleOrLocation: `@${username}`,
            instagramUrl: postUrl,
            avatarUrl,
            carModel,
            porscheScore: matchScore,
            buyingSignal,
            aiSuggestedPitch: pitch,
            tags: ['Instagram Real', targetTag, location.split(',')[0].trim()],
            status: 'new',
            city: location,
            country: location.toLowerCase().includes('miami') || location.toLowerCase().includes('us') ? 'US' : 'BR',
            createdAt: new Date().toISOString()
          };

          results.push(leadObj);
          // Persist in Firestore
          await db.collection('establishments').doc(storeId).collection('automotive_leads').doc(leadObj.id).set(leadObj, { merge: true });
        }
      }

      // B. GOOGLE MAPS MINING (B2B)
      if (engine === 'all' || engine === 'google_maps') {
        const queryTerm = `${keyword} ${location}`;
        const mapItems = await runApifyActor('compass~crawler-google-places', {
          searchStringsArray: [queryTerm],
          maxCrawledPlacesPerSearch: 6,
          language: location.toLowerCase().includes('us') ? 'en' : 'pt'
        }, token, 35000);

        for (const item of mapItems) {
          const title = item.title;
          if (!title) continue;

          const address = item.address || location;
          const phone = item.phone || '';
          const website = item.website || '';
          const cleanPhone = phone.replace(/\D/g, '');
          const avatarUrl = item.imageUrl || 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=150&auto=format&fit=crop&q=80';

          let buyingSignal = `Empresa ativa no Google Maps atendendo clientes na região de ${address}.`;
          let pitch = `Olá equipe da ${title}! Acompanhamos o trabalho de vocês em ${location}. A Flow Garage fabrica escapamentos e downpipes em inox 304 sob medida para Porsche com condições especiais para oficinas parceiras. Gostariam de receber nosso catálogo técnico?`;
          let matchScore = 95;

          try {
            const prompt = `Analise esta oficina/empresa real do Google Maps:
Nome: "${title}"
Endereço: "${address}"
Categoria: "${item.categoryName || 'Automotivo'}"
Avaliações: ${item.totalScore || 5} estrelas

Você é o Harvey AI SDR da Flow Garage.
Retorne ESTRITAMENTE um JSON no formato:
{
  "carModel": "Especialidade identificada (ex: Centro Especializado Porsche & Exóticos)",
  "buyingSignal": "resumo em 1 frase da relevância comercial para venda de escapamentos",
  "pitch": "abordagem B2B personalizada oferecendo parceria e tabela de atacado para a oficina",
  "matchScore": 88 a 98
}`;

            const aiRes = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
              config: { responseMimeType: 'application/json' }
            });

            const parsed = JSON.parse(aiRes.text || '{}');
            if (parsed.buyingSignal) buyingSignal = parsed.buyingSignal;
            if (parsed.pitch) pitch = parsed.pitch;
            if (parsed.matchScore) matchScore = Number(parsed.matchScore);
          } catch (aiErr) {
            console.warn('[Gemini Maps Analysis Warn]:', aiErr);
          }

          const leadObj: ScrapedLead = {
            id: `maps_${Buffer.from(title).toString('base64').slice(0, 15)}_${Date.now()}`,
            source: 'google_maps',
            title,
            subtitle: item.categoryName || 'Oficina & Preparação Especializada',
            handleOrLocation: address,
            phone: phone || undefined,
            whatsapp: cleanPhone ? cleanPhone : undefined,
            website: website || undefined,
            avatarUrl,
            carModel: 'Centro Especializado Porsche & Supercarros',
            porscheScore: matchScore,
            buyingSignal,
            aiSuggestedPitch: pitch,
            tags: ['Google Maps Real', 'Parceiro B2B', location.split(',')[0].trim()],
            status: 'new',
            city: location,
            country: location.toLowerCase().includes('miami') || location.toLowerCase().includes('us') ? 'US' : 'BR',
            createdAt: new Date().toISOString()
          };

          results.push(leadObj);
          // Persist in Firestore
          await db.collection('establishments').doc(storeId).collection('automotive_leads').doc(leadObj.id).set(leadObj, { merge: true });
        }
      }

      console.log(`[Lead Radar Scan] Finished. Total real leads fetched and analyzed: ${results.length}`);
      return res.json({ success: true, count: results.length, leads: results });
    } catch (err: any) {
      console.error('[Lead Radar Scan Error]:', err);
      return res.status(500).json({ error: err.message || 'Falha ao executar varredura do radar.' });
    }
  });

  // 2. Fetch all saved leads from Firestore
  app.get('/api/automotive/radar/leads', async (req: Request, res: Response) => {
    try {
      const storeId = req.query.establishmentId as string || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
      const snap = await db.collection('establishments').doc(storeId).collection('automotive_leads').orderBy('createdAt', 'desc').limit(50).get();

      const leads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.json({ success: true, leads });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Import lead into automotive projects CRM
  app.post('/api/automotive/radar/leads/:id/import', async (req: Request, res: Response) => {
    try {
      const storeId = req.query.establishmentId as string || 'ZFFWUNspKNYKsn22kKDH6nybCWw2';
      const leadId = req.params.id;

      const leadDoc = await db.collection('establishments').doc(storeId).collection('automotive_leads').doc(leadId).get();
      if (!leadDoc.exists) {
        return res.status(404).json({ error: 'Lead não encontrado.' });
      }

      const leadData = leadDoc.data() as ScrapedLead;
      await leadDoc.ref.update({ status: 'imported', importedAt: new Date().toISOString() });

      // Create new automotive project in CRM
      const newProjRef = db.collection('automotive_projects').doc();
      await newProjRef.set({
        establishmentId: storeId,
        customerName: leadData.title,
        phone: leadData.whatsapp || leadData.phone || '',
        vehicleModel: leadData.carModel,
        serviceType: 'Escapamento Esportivo em Inox 304 com Válvulas',
        status: 'CONTATO_INICIAL',
        leadSource: `Radar IA (${leadData.source === 'instagram' ? 'Instagram' : 'Google Maps'})`,
        notes: `Lead descoberto pelo Radar IA Harvey:\nSinal de Compra: ${leadData.buyingSignal}\nPitch Sugerido: ${leadData.aiSuggestedPitch}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return res.json({ success: true, projectId: newProjRef.id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
