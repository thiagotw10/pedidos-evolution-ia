/**
 * Neural Voice Generator (Espelho de Voz WhatsApp)
 * Powered by Microsoft Azure Speech Neural Engine via node-edge-tts with multi-layer fallback
 */
import { EdgeTTS } from 'node-edge-tts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Feminino' | 'Masculino';
  tone: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
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
export function cleanSpokenTextForTTS(text: string): string {
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
async function generateGoogleTtsFallback(text: string, voiceId: string): Promise<string | null> {
  try {
    let lang = 'en';
    if (voiceId.startsWith('pt')) lang = 'pt';
    else if (voiceId.startsWith('es')) lang = 'es';
    else if (voiceId.startsWith('de')) lang = 'de';
    else if (voiceId.startsWith('fr')) lang = 'fr';
    else if (voiceId.startsWith('it')) lang = 'it';

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 300))}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > 0) {
      console.log(`[VoiceGenerator] Fallback to Google TTS succeeded (${buffer.length} bytes, lang=${lang})`);
      return buffer.toString('base64');
    }
    return null;
  } catch (err: any) {
    console.warn('[VoiceGenerator Google TTS Fallback Error]:', err?.message);
    return null;
  }
}

/**
 * Generate humanized neural audio as a Base64 MP3 string.
 */
export async function generateVoiceAudioBase64(
  text: string,
  voiceId: string = 'pt-BR-FranciscaNeural'
): Promise<string | null> {
  if (!text || !text.trim()) return null;

  const cleanSpokenText = cleanSpokenTextForTTS(text);
  if (!cleanSpokenText) return null;

  // 1. Primary: node-edge-tts via in-memory streamAudio
  try {
    const tts = new EdgeTTS({ voice: voiceId });
    const chunks: Buffer[] = [];
    for await (const chunk of tts.streamAudio(cleanSpokenText)) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    }
    const buffer = Buffer.concat(chunks);
    if (buffer.length > 0) {
      return buffer.toString('base64');
    }
  } catch (streamErr: any) {
    console.warn('[VoiceGenerator streamAudio Error]:', streamErr?.message || streamErr);
  }

  // 2. Secondary: node-edge-tts via temporary file ttsPromise
  const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp3`);
  try {
    const tts = new EdgeTTS({ voice: voiceId });
    await tts.ttsPromise(cleanSpokenText, tmpPath);
    if (fs.existsSync(tmpPath)) {
      const fileBuffer = fs.readFileSync(tmpPath);
      fs.unlinkSync(tmpPath);
      if (fileBuffer.length > 0) {
        return fileBuffer.toString('base64');
      }
    }
  } catch (fileErr: any) {
    console.warn('[VoiceGenerator ttsPromise Error]:', fileErr?.message || fileErr);
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }

  // 3. Tertiary: High-reliability Google Translate TTS fallback
  return await generateGoogleTtsFallback(cleanSpokenText, voiceId);
}
