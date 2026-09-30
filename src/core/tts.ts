/**
 * AI Voiceover / Text-to-Speech domain models and voice presets.
 */

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  gender: 'female' | 'male' | 'neutral';
  provider: 'browser' | 'openai' | 'elevenlabs';
}

export interface TTSGenerationOptions {
  text: string;
  voiceId: string;
  speed?: number | undefined; // 0.5 to 2.0
  pitch?: number | undefined; // 0.5 to 1.5
  provider: 'browser' | 'openai' | 'custom';
  apiKey?: string | undefined;
  apiEndpoint?: string | undefined;
}

export const OPENAI_VOICES: readonly VoiceOption[] = [
  { id: 'alloy', name: 'Alloy (Balanced & Versatile)', lang: 'en', gender: 'neutral', provider: 'openai' },
  { id: 'echo', name: 'Echo (Warm & Natural)', lang: 'en', gender: 'male', provider: 'openai' },
  { id: 'fable', name: 'Fable (British Accent & Expressive)', lang: 'en', gender: 'neutral', provider: 'openai' },
  { id: 'onyx', name: 'Onyx (Deep & Authoritative)', lang: 'en', gender: 'male', provider: 'openai' },
  { id: 'nova', name: 'Nova (Energetic & Friendly)', lang: 'en', gender: 'female', provider: 'openai' },
  { id: 'shimmer', name: 'Shimmer (Clear & Expressive)', lang: 'en', gender: 'female', provider: 'openai' },
];
