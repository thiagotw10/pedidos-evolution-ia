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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_OPTIONS = void 0;
exports.cleanSpokenTextForTTS = cleanSpokenTextForTTS;
exports.generateVoiceAudioBase64 = generateVoiceAudioBase64;
/**
 * Neural Voice Generator (Espelho de Voz WhatsApp)
 * Powered by Microsoft Azure Speech Neural Engine via node-edge-tts with multi-layer fallback
 */
const node_edge_tts_1 = require("node-edge-tts");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
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
 * Clean text from emojis, markdown, URLs, and formatting so spoken audio is natural
 */
function cleanSpokenTextForTTS(text) {
    let clean = text
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}]/gu, '')
        .replace(/[*_~`#]/g, '')
        .replace(/https?:\/\/[^\s]+/g, 'link')
        .replace(/•\s*/g, ', ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+([.,!?:;])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (clean.length > 600) {
        clean = clean.slice(0, 600) + '...';
    }
    return clean;
}
/**
 * Fallback to Google Translate TTS audio endpoint (returns mp3 base64)
 */
async function generateGoogleTtsFallback(text, voiceId) {
    try {
        let lang = 'en';
        if (voiceId.startsWith('pt'))
            lang = 'pt';
        else if (voiceId.startsWith('es'))
            lang = 'es';
        else if (voiceId.startsWith('de'))
            lang = 'de';
        else if (voiceId.startsWith('fr'))
            lang = 'fr';
        else if (voiceId.startsWith('it'))
            lang = 'it';
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 300))}&tl=${lang}&client=tw-ob`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok)
            return null;
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length > 0) {
            console.log(`[VoiceGenerator] Fallback to Google TTS succeeded (${buffer.length} bytes, lang=${lang})`);
            return buffer.toString('base64');
        }
        return null;
    }
    catch (err) {
        console.warn('[VoiceGenerator Google TTS Fallback Error]:', err?.message);
        return null;
    }
}
/**
 * Generate humanized neural audio as a Base64 MP3 string.
 */
async function generateVoiceAudioBase64(text, voiceId = 'pt-BR-FranciscaNeural') {
    if (!text || !text.trim())
        return null;
    const cleanSpokenText = cleanSpokenTextForTTS(text);
    if (!cleanSpokenText)
        return null;
    // 1. Primary: node-edge-tts via in-memory streamAudio
    try {
        const tts = new node_edge_tts_1.EdgeTTS({ voice: voiceId });
        const chunks = [];
        for await (const chunk of tts.streamAudio(cleanSpokenText)) {
            if (Buffer.isBuffer(chunk)) {
                chunks.push(chunk);
            }
        }
        const buffer = Buffer.concat(chunks);
        if (buffer.length > 0) {
            return buffer.toString('base64');
        }
    }
    catch (streamErr) {
        console.warn('[VoiceGenerator streamAudio Error]:', streamErr?.message || streamErr);
    }
    // 2. Secondary: node-edge-tts via temporary file ttsPromise
    const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`);
    try {
        const tts = new node_edge_tts_1.EdgeTTS({ voice: voiceId });
        await tts.ttsPromise(cleanSpokenText, tmpPath);
        if (fs.existsSync(tmpPath)) {
            const fileBuffer = fs.readFileSync(tmpPath);
            fs.unlinkSync(tmpPath);
            if (fileBuffer.length > 0) {
                return fileBuffer.toString('base64');
            }
        }
    }
    catch (fileErr) {
        console.warn('[VoiceGenerator ttsPromise Error]:', fileErr?.message || fileErr);
        if (fs.existsSync(tmpPath)) {
            try {
                fs.unlinkSync(tmpPath);
            }
            catch { }
        }
    }
    // 3. Tertiary: High-reliability Google Translate TTS fallback
    return await generateGoogleTtsFallback(cleanSpokenText, voiceId);
}
//# sourceMappingURL=voiceGenerator.js.map