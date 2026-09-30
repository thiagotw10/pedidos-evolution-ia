"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_OPTIONS = void 0;
exports.generateVoiceAudioBase64 = generateVoiceAudioBase64;
/**
 * Neural Voice Generator (Espelho de Voz WhatsApp)
 * Powered by Microsoft Azure Speech Neural Engine via Edge TTS
 */
const msedge_tts_1 = require("msedge-tts");
exports.VOICE_OPTIONS = [
    {
        id: 'pt-BR-FranciscaNeural',
        name: 'Francisca',
        gender: 'Feminino',
        tone: 'Simpática & Acolhedora (Padrão Recomendado)'
    },
    {
        id: 'pt-BR-AntonioNeural',
        name: 'Antonio',
        gender: 'Masculino',
        tone: 'Firme, Educado & Comercial'
    },
    {
        id: 'pt-BR-ThalitaMultilingualNeural',
        name: 'Thalita',
        gender: 'Feminino',
        tone: 'Jovem, Descontraída & Dinâmica'
    }
];
/**
 * Generate humanized neural audio in Brazilian Portuguese as a Base64 string.
 */
async function generateVoiceAudioBase64(text, voiceId = 'pt-BR-FranciscaNeural') {
    if (!text || !text.trim())
        return null;
    try {
        // Clean emojis, markdown (*, _, ~, #), URLs, and bullets from spoken text so it sounds completely natural
        let cleanSpokenText = text
            .replace(/\p{Extended_Pictographic}/gu, '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}]/gu, '')
            .replace(/[*_~`#]/g, '')
            .replace(/https?:\/\/[^\s]+/g, 'link enviado')
            .replace(/•\s*/g, ', ')
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+([.,!?:;])/g, '$1')
            .replace(/\s{2,}/g, ' ')
            .trim();
        // Limit voice messages to ~600 chars (approx. 30-40 seconds) to avoid over-long audios on WhatsApp
        if (cleanSpokenText.length > 600) {
            cleanSpokenText = cleanSpokenText.slice(0, 600) + '... Estou te enviando os detalhes completos em texto aqui também!';
        }
        const tts = new msedge_tts_1.MsEdgeTTS();
        await tts.setMetadata(voiceId, msedge_tts_1.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = await tts.toStream(cleanSpokenText);
        return new Promise((resolve) => {
            const chunks = [];
            audioStream.on('data', (chunk) => chunks.push(chunk));
            audioStream.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString('base64'));
            });
            audioStream.on('error', (err) => {
                console.warn('[VoiceGenerator Stream Error]:', err.message);
                resolve(null);
            });
        });
    }
    catch (err) {
        console.warn('[VoiceGenerator Error]:', err.message);
        return null;
    }
}
//# sourceMappingURL=voiceGenerator.js.map