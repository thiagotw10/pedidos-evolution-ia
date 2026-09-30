/**
 * Neural Voice Generator (Espelho de Voz WhatsApp)
 * Options and metadata for frontend settings
 */

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
