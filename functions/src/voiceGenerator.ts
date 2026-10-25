/**
 * Neural Voice Generator (Espelho de Voz WhatsApp)
 * Powered by Google Cloud Text-to-Speech (Neural2 Engine) with multi-layer fallback
 */
import { TextToSpeechClient, protos } from '@google-cloud/text-to-speech';
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
    id: 'pt-BR-AntonioNeural',
    name: 'Antonio',
    gender: 'Masculino',
    tone: 'Firme, Educado & Comercial (Padrão Flow Garage)'
  },
  {
    id: 'pt-BR-FranciscaNeural',
    name: 'Francisca',
    gender: 'Feminino',
    tone: 'Simpática & Acolhedora'
  },
  {
    id: 'pt-BR-ThalitaMultilingualNeural',
    name: 'Thalita',
    gender: 'Feminino',
    tone: 'Jovem, Descontraída & Dinâmica'
  }
];

let gcpTtsClient: TextToSpeechClient | null = null;
function getGcpTtsClient(): TextToSpeechClient {
  if (!gcpTtsClient) {
    gcpTtsClient = new TextToSpeechClient();
  }
  return gcpTtsClient;
}

interface ResolvedVoiceConfig {
  languageCode: string;
  name: string;
  ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender;
}

export function resolveVoiceConfig(voiceId: string = ''): ResolvedVoiceConfig {
  const v = (voiceId || '').toLowerCase();

  // English
  if (v.startsWith('en')) {
    const isFemale = v.includes('aria') || v.includes('jenny');
    return {
      languageCode: 'en-US',
      name: isFemale ? 'en-US-Neural2-F' : 'en-US-Neural2-D',
      ssmlGender: isFemale
        ? protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE
        : protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE
    };
  }

  // Spanish
  if (v.startsWith('es')) {
    const isFemale = v.includes('elvira') || v.includes('dalia');
    return {
      languageCode: 'es-ES',
      name: isFemale ? 'es-ES-Neural2-A' : 'es-ES-Neural2-B',
      ssmlGender: isFemale
        ? protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE
        : protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE
    };
  }

  // German
  if (v.startsWith('de')) {
    return {
      languageCode: 'de-DE',
      name: 'de-DE-Neural2-B',
      ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE
    };
  }

  // French
  if (v.startsWith('fr')) {
    return {
      languageCode: 'fr-FR',
      name: 'fr-FR-Neural2-B',
      ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE
    };
  }

  // Italian
  if (v.startsWith('it')) {
    return {
      languageCode: 'it-IT',
      name: 'it-IT-Neural2-C',
      ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE
    };
  }

  // Default: Brazilian Portuguese
  // Antonio -> Male (Neural2-B)
  if (v.includes('antonio')) {
    return {
      languageCode: 'pt-BR',
      name: 'pt-BR-Neural2-B',
      ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.MALE
    };
  }

  // Thalita -> Female Young (Neural2-C)
  if (v.includes('thalita')) {
    return {
      languageCode: 'pt-BR',
      name: 'pt-BR-Neural2-C',
      ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE
    };
  }

  // Francisca / Default -> Female Welcoming (Neural2-A)
  return {
    languageCode: 'pt-BR',
    name: 'pt-BR-Neural2-A',
    ssmlGender: protos.google.cloud.texttospeech.v1.SsmlVoiceGender.FEMALE
  };
}

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
 * Generate audio via Google Cloud Text-to-Speech (Neural2)
 */
async function generateGcpTts(text: string, voiceId: string): Promise<string | null> {
  try {
    const client = getGcpTtsClient();
    const voiceConfig = resolveVoiceConfig(voiceId);

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: voiceConfig.languageCode,
        name: voiceConfig.name,
        ssmlGender: voiceConfig.ssmlGender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0.0
      }
    });

    if (response.audioContent) {
      const buffer = Buffer.from(response.audioContent);
      if (buffer.length > 0) {
        console.log(`[VoiceGenerator GCP] Sucesso gerando áudio: voz=${voiceConfig.name} (${voiceConfig.ssmlGender}), bytes=${buffer.length}`);
        return buffer.toString('base64');
      }
    }
    return null;
  } catch (err: any) {
    console.warn('[VoiceGenerator GCP Error]:', err.message);
    return null;
  }
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
  voiceId: string = 'pt-BR-AntonioNeural'
): Promise<string | null> {
  if (!text || !text.trim()) return null;

  const cleanSpokenText = cleanSpokenTextForTTS(text);
  if (!cleanSpokenText) return null;

  // 1. Primary: Google Cloud Text-to-Speech (Official Neural2 Engine, zero blocking, distinct male/female voices)
  const gcpAudio = await generateGcpTts(cleanSpokenText, voiceId);
  if (gcpAudio) {
    return gcpAudio;
  }

  // 2. Secondary: node-edge-tts via in-memory streamAudio
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

  // 3. Tertiary: node-edge-tts via temporary file ttsPromise
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

  // 4. Quaternary: Google Translate TTS fallback
  return await generateGoogleTtsFallback(cleanSpokenText, voiceId);
}
