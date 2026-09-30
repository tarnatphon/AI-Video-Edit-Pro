import { Check, Loader2, Mic, Play, Sparkles, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEditorStore } from '../../core/store';
import { OPENAI_VOICES, type TTSGenerationOptions, type VoiceOption } from '../../core/tts';
import { generateVoiceover, getBrowserVoices } from '../../engine/tts';
import { SliderField, TextButton } from '../shared/controls';

interface VoiceoverModalProps {
  onClose(): void;
}

export function VoiceoverModal({ onClose }: VoiceoverModalProps) {
  const project = useEditorStore((s) => s.project);
  const audioTracks = project.tracks.filter((t) => t.kind === 'audio');

  const [text, setText] = useState('สวัสดีครับ ยินดีต้อนรับสู่ AI Video Edit Pro');
  const [provider, setProvider] = useState<'browser' | 'openai'>('browser');
  const [browserVoices, setBrowserVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch, setPitch] = useState<number>(1.0);
  const [apiKey, setApiKey] = useState<string>('');
  const [targetTrackId, setTargetTrackId] = useState<string>(audioTracks[0]?.id ?? 'a1');

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getBrowserVoices().then((voices) => {
      setBrowserVoices(voices);
      if (voices.length > 0) {
        setSelectedVoiceId(voices[0]!.id);
      }
    });
  }, []);

  const handlePreviewSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.pitch = pitch;
    const voice = window.speechSynthesis.getVoices().find((v) => v.name === selectedVoiceId);
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError('Please enter text for the voiceover.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setNotice(null);

    try {
      const options: TTSGenerationOptions = {
        text: text.trim(),
        voiceId: selectedVoiceId,
        speed,
        pitch,
        provider,
        apiKey: apiKey.trim() || undefined,
      };

      const { asset } = await generateVoiceover(options, targetTrackId);
      setNotice(`Added voiceover clip "${asset.name}" to audio track!`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError((err as Error).message || 'Failed to generate voiceover.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Mic size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">AI Voiceover (Text-to-Speech)</h3>
              <p className="text-[11px] text-neutral-400">
                Generate high-quality voiceover audio directly on audio tracks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {/* Script Textarea */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-300">Voiceover Script</label>
              <span className="text-[10px] text-neutral-500">{text.length} characters</span>
            </div>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter spoken script here…"
              className="thin-scrollbar w-full resize-y rounded-md border border-line bg-neutral-900 p-3 text-xs text-neutral-100 outline-none focus:border-accent"
            />
          </div>

          {/* Provider Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setProvider('browser');
                if (browserVoices.length > 0) setSelectedVoiceId(browserVoices[0]!.id);
              }}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                provider === 'browser'
                  ? 'border-accent bg-accent/10 text-neutral-100'
                  : 'border-line bg-neutral-900/50 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              <Volume2 size={16} className={provider === 'browser' ? 'text-accent' : ''} />
              <div>
                <div className="text-xs font-semibold">Browser Voices</div>
                <div className="text-[10px]">Instant &amp; Free (Thai, English, etc.)</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setProvider('openai');
                setSelectedVoiceId('alloy');
              }}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${
                provider === 'openai'
                  ? 'border-accent bg-accent/10 text-neutral-100'
                  : 'border-line bg-neutral-900/50 text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              <Sparkles size={16} className={provider === 'openai' ? 'text-accent' : ''} />
              <div>
                <div className="text-xs font-semibold">OpenAI HD Voices</div>
                <div className="text-[10px]">Studio Quality (Alloy, Echo, Nova)</div>
              </div>
            </button>
          </div>

          {/* Voice Picker */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">Voice Speaker</label>
              <select
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
              >
                {provider === 'openai'
                  ? OPENAI_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))
                  : browserVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">Target Audio Track</label>
              <select
                value={targetTrackId}
                onChange={(e) => setTargetTrackId(e.target.value)}
                className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
              >
                {audioTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Audio)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* OpenAI API Key */}
          {provider === 'openai' && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-neutral-900/60 p-3">
              <label className="text-xs font-medium text-neutral-300">OpenAI API Key</label>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
              />
            </div>
          )}

          {/* Sliders */}
          <div className="space-y-3 rounded-lg border border-line bg-neutral-900/40 p-3.5">
            <SliderField
              label="Speed (Rate)"
              value={speed}
              min={0.5}
              max={2.0}
              step={0.05}
              unit="×"
              onChange={(v) => setSpeed(v)}
            />

            {provider === 'browser' && (
              <SliderField
                label="Pitch"
                value={pitch}
                min={0.5}
                max={1.5}
                step={0.05}
                unit="×"
                onChange={(v) => setPitch(v)}
              />
            )}
          </div>

          {notice && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/15 p-3 text-xs text-green-300">
              <Check size={16} />
              {notice}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/15 p-3 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-neutral-900/60 px-5 py-3">
          <TextButton variant="ghost" onClick={handlePreviewSpeech}>
            <Play size={13} /> Test Voice
          </TextButton>

          <div className="flex items-center gap-2">
            <TextButton variant="ghost" onClick={onClose}>
              Cancel
            </TextButton>
            <TextButton
              variant="accent"
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim()}
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
              Generate to Track
            </TextButton>
          </div>
        </div>
      </div>
    </div>
  );
}
