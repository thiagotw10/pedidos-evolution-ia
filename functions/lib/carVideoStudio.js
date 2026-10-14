"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STUDIO_PERSONAS = void 0;
exports.registerCarVideoStudioRoutes = registerCarVideoStudioRoutes;
const crypto_1 = __importDefault(require("crypto"));
const msedge_tts_1 = require("msedge-tts");
exports.STUDIO_PERSONAS = [
    {
        id: 'sofia',
        name: 'Sofia',
        role: 'Consultora Digital',
        gender: 'Feminino',
        tone: 'Jovem, dinâmica, simpática e persuasiva',
        avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
        edgeVoiceId: 'pt-BR-ThalitaMultilingualNeural',
        elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel / Bella
        badge: 'Reels & Stories'
    },
    {
        id: 'lucas',
        name: 'Lucas',
        role: 'Especialista em Seminovos',
        gender: 'Masculino',
        tone: 'Profissional, seguro, foco em procedência e laudo cautelar',
        avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80',
        edgeVoiceId: 'pt-BR-AntonioNeural',
        elevenLabsVoiceId: 'ErXwobaYiN019PkySvjV', // Antoni
        badge: 'Fechador de Negócios'
    },
    {
        id: 'locutor_tv',
        name: 'Locutor Cinema',
        role: 'Comercial de TV & Montadora',
        gender: 'Masculino',
        tone: 'Voz grave e cinematográfica estilo comerciais de marcas de luxo',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
        edgeVoiceId: 'pt-BR-AntonioNeural',
        elevenLabsVoiceId: 'VR6AewLTigWG4xSOukaG', // Arnold
        badge: 'Comercial em Off'
    }
];
// Helper: upload buffer to Firebase Storage
async function uploadBufferToStorage(buffer, filename, storeId, contentType) {
    const cleanName = filename.replace(/\s+/g, '_');
    const storagePath = `establishments/${storeId}/studio/${cleanName}`;
    const encodedPath = encodeURIComponent(storagePath);
    const token = crypto_1.default.randomUUID();
    const bucketName = 'iapedido.firebasestorage.app';
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o?name=${encodedPath}&uploadType=media`;
    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Content-Type': contentType,
            'x-goog-meta-firebasestoragedownloadtokens': token,
            'Connection': 'close'
        },
        body: buffer
    });
    if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Falha no upload para o Storage: ${errText}`);
    }
    const data = await uploadRes.json();
    const finalToken = data.downloadTokens || token;
    const safeName = (data.name || storagePath).replace(/\//g, '%2F');
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${safeName}?alt=media&token=${finalToken}`;
}
function registerCarVideoStudioRoutes(app, db, genai) {
    /**
     * 1. GET /api/ai/car-video-studio/personas
     * Retorna os apresentadores e vozes disponíveis
     */
    app.get('/api/ai/car-video-studio/personas', (_req, res) => {
        return res.json({
            success: true,
            personas: exports.STUDIO_PERSONAS,
            formats: [
                {
                    id: 'influencer',
                    label: 'Apresentador Virtual (Avatar na Tela)',
                    description: 'A persona aparece em destaque narrando os detalhes do veículo com gestos sincronizados.'
                },
                {
                    id: 'voiceover',
                    label: 'Comercial de TV (Locução em Off)',
                    description: 'Vídeo 100% focado nos detalhes do carro com narração cinematográfica e cards dinâmicos.'
                }
            ]
        });
    });
    /**
     * 2. POST /api/ai/car-video-studio/generate-script
     * Usa o Google Gemini para analisar o veículo e criar o roteiro perfeito para Reels/TikTok
     */
    app.post('/api/ai/car-video-studio/generate-script', async (req, res) => {
        try {
            const { carName, category, price, year, mileage, transmission, description, highlights, format = 'influencer', personaId = 'sofia', storeName = 'Nossa Loja' } = req.body;
            if (!carName) {
                return res.status(400).json({ error: 'Nome do veículo é obrigatório para gerar o roteiro.' });
            }
            const persona = exports.STUDIO_PERSONAS.find(p => p.id === personaId) || exports.STUDIO_PERSONAS[0];
            const prompt = `
Você é o roteirista publicitário sênior especialista em vídeos virais e vendas automotivas para Instagram Reels, TikTok e WhatsApp.
Você está criando o roteiro de um vídeo curto (30 a 45 segundos) para a loja "${storeName}".

Dados do Veículo:
- Veículo: ${carName}
- Categoria / Família: ${category || 'Geral'}
- Preço: ${price ? `R$ ${Number(price).toLocaleString('pt-BR')}` : 'Sob consulta'}
- Ano/Modelo: ${year || 'Não informado'}
- KM: ${mileage || 'Baixa km'}
- Câmbio: ${transmission || 'Automático'}
- Destaques / Opcionais: ${highlights || 'Impecável, laudo cautelar aprovado'}
- Informações Adicionais: ${description || 'Sem detalhes adicionais'}

Estilo Desejado:
- Formato: ${format === 'influencer' ? 'Apresentador Virtual (Avatar falando direto com o público)' : 'Comercial de TV / Locução Off com imagens do veículo'}
- Persona / Tom: ${persona.name} (${persona.tone})

Instruções Críticas:
1. O roteiro deve prender a atenção nos primeiros 3 segundos com um gancho matador (Hook).
2. Destaque no corpo do texto: conservação, opcionais desejados, segurança da compra (laudo cautelar/garantia) e condições facilitadas (pega carro na troca e simula financiamento).
3. O Call to Action (CTA) final deve convidar o cliente a clicar no link ou mandar mensagem no WhatsApp da loja para agendar test drive ou simular entrada.
4. O tempo total narrado deve ter entre 70 e 100 palavras (aproximadamente 35 a 45 segundos).

Retorne APENAS um JSON válido puro, sem bloco de código markdown adicional, com os campos:
{
  "title": "Título magnético para o post do Instagram",
  "hook": "Frase de abertura de alto impacto (primeiros 3 segundos)",
  "fullScript": "Roteiro completo com marcações de cena em colchetes (ex: [Mostra interior], [Corta para rodas])",
  "cleanSpokenText": "Texto contínuo sem emojis, sem marcações e sem caracteres especiais, pronto para a voz artificial falar naturalmente em português brasileiro com pausas normais",
  "estimatedSeconds": 35,
  "specsCards": [
    { "label": "Ano", "value": "${year || '2023'}" },
    { "label": "Quilometragem", "value": "${mileage || 'Consulte'}" },
    { "label": "Câmbio", "value": "${transmission || 'Automático'}" },
    { "label": "Condição", "value": "Laudo Aprovado" },
    { "label": "Negociação", "value": "Aceitamos Troca" }
  ],
  "captionsTimeline": [
    { "text": "Gancho inicial curto", "time": "0-3s" },
    { "text": "Destaque do motor/interior", "time": "4-15s" },
    { "text": "Condição e procedência", "time": "16-25s" },
    { "text": "Chame no WhatsApp para test-drive", "time": "26-35s" }
  ],
  "cta": "Mande um WhatsApp agora e garanta sua visita!"
}
`;
            const aiResponse = await genai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json'
                }
            });
            const parsed = JSON.parse(aiResponse.text || '{}');
            return res.json({
                success: true,
                script: parsed,
                persona
            });
        }
        catch (err) {
            console.error('[Car Video Studio Script Error]:', err);
            return res.status(500).json({ error: err.message || 'Erro ao gerar roteiro do veículo.' });
        }
    });
    /**
     * 3. POST /api/ai/car-video-studio/generate-audio
     * Converte o texto falado do roteiro em áudio ultra-realista em Português
     * Usa Edge TTS Azure Neural Engine (ou ElevenLabs se chave configurada)
     */
    app.post('/api/ai/car-video-studio/generate-audio', async (req, res) => {
        try {
            const { spokenText, personaId = 'sofia', storeId = 'default' } = req.body;
            if (!spokenText || !spokenText.trim()) {
                return res.status(400).json({ error: 'Texto para narração é obrigatório.' });
            }
            const persona = exports.STUDIO_PERSONAS.find(p => p.id === personaId) || exports.STUDIO_PERSONAS[0];
            // Limpeza de caracteres que atrapalham síntese de voz
            let textToSpeak = spokenText
                .replace(/[*_~`#\[\]]/g, '')
                .replace(/\p{Extended_Pictographic}/gu, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (textToSpeak.length > 1000) {
                textToSpeak = textToSpeak.slice(0, 1000);
            }
            const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
            // Opção A: ElevenLabs se a chave estiver configurada
            if (elevenLabsKey && persona.elevenLabsVoiceId) {
                try {
                    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${persona.elevenLabsVoiceId}`, {
                        method: 'POST',
                        headers: {
                            'xi-api-key': elevenLabsKey,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: textToSpeak,
                            model_id: 'eleven_multilingual_v2',
                            voice_settings: {
                                stability: 0.5,
                                similarity_boost: 0.8
                            }
                        })
                    });
                    if (elevenRes.ok) {
                        const audioArrayBuffer = await elevenRes.arrayBuffer();
                        const audioBuffer = Buffer.from(audioArrayBuffer);
                        const filename = `voice_${persona.id}_${Date.now()}.mp3`;
                        const audioUrl = await uploadBufferToStorage(audioBuffer, filename, storeId, 'audio/mpeg');
                        return res.json({
                            success: true,
                            engine: 'elevenlabs',
                            audioUrl,
                            persona
                        });
                    }
                }
                catch (elevenErr) {
                    console.warn('[ElevenLabs Fallback to EdgeTTS]:', elevenErr.message);
                }
            }
            // Opção B: Microsoft Edge TTS Neural Engine (Gratuito, alta qualidade nativa PT-BR)
            const tts = new msedge_tts_1.MsEdgeTTS();
            await tts.setMetadata(persona.edgeVoiceId, msedge_tts_1.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
            const { audioStream } = await tts.toStream(textToSpeak);
            const audioBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                audioStream.on('data', (chunk) => chunks.push(chunk));
                audioStream.on('end', () => resolve(Buffer.concat(chunks)));
                audioStream.on('error', (err) => reject(err));
            });
            const filename = `voice_${persona.id}_${Date.now()}.mp3`;
            const audioUrl = await uploadBufferToStorage(audioBuffer, filename, storeId, 'audio/mpeg');
            return res.json({
                success: true,
                engine: 'msedge-neural',
                audioUrl,
                persona
            });
        }
        catch (err) {
            console.error('[Car Video Studio Audio Error]:', err);
            return res.status(500).json({ error: err.message || 'Erro ao gerar áudio do narrador.' });
        }
    });
    /**
     * 4. POST /api/ai/car-video-studio/attach-to-vehicle
     * Salva o vídeo/áudio e roteiro gerados diretamente no veículo no catálogo da loja
     */
    app.post('/api/ai/car-video-studio/attach-to-vehicle', async (req, res) => {
        try {
            const { storeId, productId, videoUrl, audioUrl, scriptData } = req.body;
            if (!storeId || !productId) {
                return res.status(400).json({ error: 'storeId e productId são obrigatórios.' });
            }
            const updateData = {
                updatedAt: new Date().toISOString()
            };
            if (videoUrl)
                updateData.videoUrl = videoUrl;
            if (audioUrl)
                updateData.aiAudioUrl = audioUrl;
            if (scriptData)
                updateData.aiVideoScript = scriptData;
            await db
                .collection('establishments')
                .doc(storeId)
                .collection('products')
                .doc(productId)
                .set(updateData, { merge: true });
            return res.json({
                success: true,
                message: 'Vídeo e roteiro IA vinculados ao veículo com sucesso!',
                productId
            });
        }
        catch (err) {
            console.error('[Car Video Studio Attach Error]:', err);
            return res.status(500).json({ error: err.message || 'Erro ao vincular vídeo ao veículo.' });
        }
    });
}
//# sourceMappingURL=carVideoStudio.js.map