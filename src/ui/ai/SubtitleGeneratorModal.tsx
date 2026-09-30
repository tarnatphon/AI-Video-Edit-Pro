import {
  AlertCircle,
  Check,
  Download,
  Languages,
  Loader2,
  MessageSquare,
  Mic,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { newId } from '../../core/id';
import { useEditorStore } from '../../core/store';
import {
  convertSubtitlesToVoiceoverScript,
  exportToSRT,
  exportToVTT,
  formatSrtTimestamp,
  SUBTITLE_PRESETS,
  type SubtitleSegment,
  type SubtitleStylePreset,
} from '../../core/subtitles';
import { applySubtitlesToTimeline } from '../../core/subtitleOps';
import { formatTimecode } from '../../core/time';
import { getClip } from '../../core/timelineOps';
import type { MediaAsset } from '../../core/types';
import { getEngine } from '../../engine/playback';
import {
  importSubtitlesFromText,
  transcribeAsset,
  type TranscribeProgress,
  type TranscribeProvider,
} from '../../engine/transcriber';
import { generateVoiceover } from '../../engine/tts';
import { IconButton, SliderField, TextButton } from '../shared/controls';

interface SubtitleGeneratorModalProps {
  onClose(): void;
  initialClipId?: string;
}

type TabType = 'transcribe' | 'editor' | 'styling';

export function SubtitleGeneratorModal({ onClose, initialClipId }: SubtitleGeneratorModalProps) {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);

  const targetClips = project.clips.filter((c) => c.kind === 'video' || c.kind === 'audio');
  const defaultSelectedId =
    initialClipId ??
    selectedClipIds.find((id) => {
      const c = getClip(project, id);
      return c && (c.kind === 'video' || c.kind === 'audio');
    }) ??
    targetClips[0]?.id ??
    '';

  const [activeTab, setActiveTab] = useState<TabType>('transcribe');
  const [selectedClipId, setSelectedClipId] = useState<string>(defaultSelectedId);

  // Transcribe options
  const [provider, setProvider] = useState<TranscribeProvider>('browser-whisper');
  const [language, setLanguage] = useState<string>('auto');
  const [model, setModel] = useState<'tiny' | 'base' | 'whisper-1' | 'whisper-large-v3-turbo'>('tiny');
  const [apiKey, setApiKey] = useState<string>('');
  const [apiEndpoint, setApiEndpoint] = useState<string>('https://api.openai.com/v1');

  // State
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState<boolean>(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<SubtitleStylePreset>(SUBTITLE_PRESETS[0]!);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeClip = targetClips.find((c) => c.id === selectedClipId);
  const asset: MediaAsset | undefined = activeClip?.assetId ? assets[activeClip.assetId] : undefined;

  const handleStartTranscribe = async () => {
    if (!asset) {
      setError('Please select a valid video or audio clip.');
      return;
    }

    setIsTranscribing(true);
    setError(null);
    setProgress({ stage: 'Starting speech recognition…', percent: 5 });

    try {
      const result = await transcribeAsset(asset, {
        provider,
        language: language === 'auto' ? undefined : language,
        model,
        apiKey: apiKey.trim() || undefined,
        apiEndpoint: apiEndpoint.trim() || undefined,
        onProgress: (p) => setProgress(p),
      });

      if (result.length === 0) {
        setError('No speech was detected in this audio segment.');
      } else {
        setSegments(result);
        setActiveTab('editor');
        setNotice(`Transcribed ${result.length} subtitle segments successfully!`);
      }
    } catch (err) {
      setError((err as Error).message || 'Transcription failed.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = importSubtitlesFromText(text, file.name);
      if (parsed.length > 0) {
        setSegments(parsed);
        setActiveTab('editor');
        setNotice(`Imported ${parsed.length} subtitles from ${file.name}`);
      } else {
        setError('Could not find valid SRT or WebVTT subtitle entries in this file.');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadSRT = () => {
    if (segments.length === 0) return;
    const content = exportToSRT(segments);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'subtitles'}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadVTT = () => {
    if (segments.length === 0) return;
    const content = exportToVTT(segments);
    const blob = new Blob([content], { type: 'text/vtt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'subtitles'}.vtt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateVoiceoverFromSubtitles = async () => {
    if (segments.length === 0) return;
    const script = convertSubtitlesToVoiceoverScript(segments);
    if (!script) return;

    setIsGeneratingVoiceover(true);
    setError(null);

    try {
      await generateVoiceover({
        text: script,
        voiceId: 'alloy',
        provider: 'browser',
        speed: 1.0,
      });
      setNotice('Voiceover created from subtitles and placed on audio track!');
    } catch (err) {
      setError((err as Error).message || 'Failed to generate voiceover.');
    } finally {
      setIsGeneratingVoiceover(false);
    }
  };

  const handleApplyToTimeline = () => {
    if (segments.length === 0) return;
    const store = useEditorStore.getState();

    store.beginTransaction();
    const result = applySubtitlesToTimeline(store.project, segments, selectedPreset);
    useEditorStore.setState({ project: result.project, selectedClipIds: result.createdClipIds });
    store.endTransaction();

    setNotice(`Added ${segments.length} subtitle clips to timeline!`);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  const handleSeek = (seconds: number) => {
    const targetFrame = Math.round(seconds * project.fps);
    useEditorStore.getState().setPlayhead(targetFrame);
    getEngine().seek(targetFrame);
  };

  const handleUpdateSegment = (id: string, patch: Partial<SubtitleSegment>) => {
    setSegments((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const handleDeleteSegment = (id: string) => {
    setSegments((list) => list.filter((s) => s.id !== id));
  };

  const handleAddSegment = () => {
    const lastSeg = segments[segments.length - 1];
    const start = lastSeg ? lastSeg.end + 0.5 : 0;
    const end = start + 3;
    const newSeg: SubtitleSegment = {
      id: newId('sub'),
      start,
      end,
      text: 'New subtitle caption',
    };
    setSegments((list) => [...list, newSeg]);
  };

  const filteredSegments = searchQuery
    ? segments.filter((s) => s.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : segments;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-pink-500 text-white">
              <MessageSquare size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">AI Subtitles &amp; Captions (Whisper)</h3>
              <p className="text-[11px] text-neutral-400">
                Generate speech-to-text subtitles, edit transcripts, and sync to timeline
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

        {/* Tabs Bar */}
        <div className="flex border-b border-line bg-neutral-900/40 px-5">
          <button
            type="button"
            onClick={() => setActiveTab('transcribe')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'transcribe'
                ? 'border-accent text-accent'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles size={14} /> Auto Transcribe
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'editor'
                ? 'border-accent text-accent'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <MessageSquare size={14} /> Transcript Editor ({segments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('styling')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
              activeTab === 'styling'
                ? 'border-accent text-accent'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Languages size={14} /> Style &amp; Presets
          </button>
        </div>

        {/* Content */}
        <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {/* TAB 1: Auto Transcribe */}
          {activeTab === 'transcribe' && (
            <div className="space-y-4">
              {/* Media Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-neutral-300">Target Media Clip</label>
                {targetClips.length === 0 ? (
                  <p className="text-xs text-neutral-500">No audio or video clips in this project.</p>
                ) : (
                  <select
                    value={selectedClipId}
                    onChange={(e) => setSelectedClipId(e.target.value)}
                    className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
                  >
                    {targetClips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatTimecode(c.duration, project.fps)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Engine Selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-300">Transcription Engine</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div
                    onClick={() => setProvider('browser-whisper')}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      provider === 'browser-whisper'
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-neutral-900/50 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-100">
                      <Sparkles size={14} className="text-accent" /> In-Browser Whisper
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      100% Client-side AI (Transformers.js). Offline &amp; private.
                    </div>
                  </div>

                  <div
                    onClick={() => setProvider('web-speech')}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      provider === 'web-speech'
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-neutral-900/50 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-100">
                      <MessageSquare size={14} className="text-purple-400" /> Web Speech Engine
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Browser-native fast speech recognition. Supports Thai &amp; 50+ languages.
                    </div>
                  </div>

                  <div
                    onClick={() => setProvider('whisper-api')}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      provider === 'whisper-api'
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-neutral-900/50 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-100">
                      <Languages size={14} className="text-pink-400" /> Cloud Whisper API
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Groq / OpenAI / Local Whisper server for ultra-high speed &amp; accuracy.
                    </div>
                  </div>
                </div>
              </div>

              {/* Language & Model settings */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-neutral-300">Spoken Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
                  >
                    <option value="auto">Auto-Detect</option>
                    <option value="th">Thai (ภาษาไทย)</option>
                    <option value="en">English</option>
                    <option value="ja">Japanese (日本語)</option>
                    <option value="zh">Chinese (中文)</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                    <option value="de">German (Deutsch)</option>
                  </select>
                </div>

                {provider === 'browser-whisper' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-neutral-300">Whisper Model Size</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as 'tiny' | 'base')}
                      className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
                    >
                      <option value="tiny">Whisper Tiny (~39 MB, Fastest)</option>
                      <option value="base">Whisper Base (~73 MB, Higher Accuracy)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* API Key fields for Cloud Whisper */}
              {provider === 'whisper-api' && (
                <div className="space-y-3 rounded-lg border border-line bg-neutral-900/60 p-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-neutral-300">API Key</label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-neutral-300">API Base Endpoint</label>
                    <input
                      type="text"
                      placeholder="https://api.openai.com/v1"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      className="h-9 rounded-md border border-line bg-neutral-900 px-3 text-xs text-neutral-100 outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {isTranscribing && progress && (
                <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 font-medium text-neutral-200">
                      <Loader2 size={14} className="animate-spin text-accent" />
                      {progress.stage}
                    </span>
                    <span className="font-mono text-accent">{progress.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-pink-500 transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Start Button & Import */}
              <div className="flex items-center gap-3 pt-2">
                <TextButton
                  variant="accent"
                  onClick={handleStartTranscribe}
                  disabled={isTranscribing || !activeClip}
                  className="flex-1 justify-center py-2.5 text-xs font-semibold"
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Transcribing Speech…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} /> Start AI Transcription
                    </>
                  )}
                </TextButton>

                <input
                  type="file"
                  accept=".srt,.vtt,text/plain"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <TextButton
                  variant="solid"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs"
                >
                  <Upload size={14} /> Import SRT / VTT
                </TextButton>
              </div>
            </div>
          )}

          {/* TAB 2: Transcript Editor */}
          {activeTab === 'editor' && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute top-2.5 left-2.5 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search subtitles…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-full rounded-md border border-line bg-neutral-900 pr-3 pl-8 text-xs text-neutral-100 outline-none focus:border-accent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <TextButton
                    variant="solid"
                    onClick={handleGenerateVoiceoverFromSubtitles}
                    disabled={isGeneratingVoiceover || segments.length === 0}
                    className="h-8 text-xs"
                  >
                    {isGeneratingVoiceover ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                    Generate Voiceover
                  </TextButton>
                  <TextButton variant="solid" onClick={handleAddSegment} className="h-8 text-xs">
                    <Plus size={14} /> Add Line
                  </TextButton>
                </div>
              </div>

              {/* Segments List */}
              {segments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-8 text-center text-xs text-neutral-500">
                  No subtitle segments generated yet. Go to the Auto Transcribe tab to start.
                </div>
              ) : (
                <div className="thin-scrollbar max-h-80 space-y-2 overflow-y-auto pr-1">
                  {filteredSegments.map((seg, idx) => (
                    <div
                      key={seg.id}
                      className="group flex items-start gap-2 rounded-lg border border-line bg-neutral-900/60 p-2.5 transition-colors hover:border-neutral-600"
                    >
                      <span className="w-5 pt-1 text-center font-mono text-[10px] text-neutral-500">
                        {idx + 1}
                      </span>

                      <div className="flex flex-col gap-1 font-mono text-[11px] text-neutral-400">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={seg.start}
                            onChange={(e) =>
                              handleUpdateSegment(seg.id, { start: Number.parseFloat(e.target.value) || 0 })
                            }
                            className="w-16 rounded border border-line bg-neutral-950 px-1 py-0.5 text-center text-[10px] text-neutral-200"
                          />
                          <span>→</span>
                          <input
                            type="number"
                            step="0.1"
                            value={seg.end}
                            onChange={(e) =>
                              handleUpdateSegment(seg.id, { end: Number.parseFloat(e.target.value) || 0 })
                            }
                            className="w-16 rounded border border-line bg-neutral-950 px-1 py-0.5 text-center text-[10px] text-neutral-200"
                          />
                        </div>
                        <span className="text-[10px] text-neutral-500">
                          {formatSrtTimestamp(seg.start)}
                        </span>
                      </div>

                      <textarea
                        value={seg.text}
                        rows={2}
                        onChange={(e) => handleUpdateSegment(seg.id, { text: e.target.value })}
                        className="thin-scrollbar flex-1 resize-none rounded-md border border-line bg-neutral-950 p-2 text-xs text-neutral-100 outline-none focus:border-accent"
                      />

                      <div className="flex flex-col gap-1">
                        <IconButton
                          label="Preview at timing"
                          onClick={() => handleSeek(seg.start)}
                          className="h-7 w-7 text-neutral-400 hover:text-white"
                        >
                          <Play size={13} />
                        </IconButton>
                        <IconButton
                          label="Delete segment"
                          variant="danger"
                          onClick={() => handleDeleteSegment(seg.id)}
                          className="h-7 w-7"
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Style & Presets */}
          {activeTab === 'styling' && (
            <div className="space-y-4">
              <label className="text-xs font-medium text-neutral-300">Subtitle Style Preset</label>

              {/* Preset Cards */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {SUBTITLE_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset)}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      selectedPreset.id === preset.id
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-neutral-900/50 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-100">{preset.name}</span>
                      {selectedPreset.id === preset.id && <Check size={14} className="text-accent" />}
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-400">{preset.description}</p>
                    <div className="mt-2 flex h-10 items-center justify-center rounded bg-black/60 px-2 text-center text-xs">
                      <span
                        style={{
                          color: preset.karaoke ? (preset.activeWordColor ?? '#ffe600') : preset.color,
                          backgroundColor: preset.background ?? 'transparent',
                          fontWeight: preset.bold ? 'bold' : 'normal',
                          padding: preset.background ? '2px 6px' : '0',
                          borderRadius: '4px',
                        }}
                      >
                        Sample Subtitle
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fine-tuning controls */}
              <div className="space-y-3 rounded-lg border border-line bg-neutral-900/40 p-3.5">
                <h4 className="text-xs font-semibold text-neutral-300">Custom Typography &amp; Placement</h4>

                <SliderField
                  label="Font Size"
                  value={selectedPreset.fontSize}
                  min={24}
                  max={120}
                  step={2}
                  unit="px"
                  decimals={0}
                  onChange={(v) => setSelectedPreset((p) => ({ ...p, fontSize: v }))}
                />

                <SliderField
                  label="Vertical Position (Y Offset)"
                  value={selectedPreset.yOffset}
                  min={-400}
                  max={500}
                  step={5}
                  unit="px"
                  decimals={0}
                  onChange={(v) => setSelectedPreset((p) => ({ ...p, yOffset: v }))}
                />

                <div className="flex items-center justify-between text-xs text-neutral-300">
                  <span>Text Colour</span>
                  <input
                    type="color"
                    value={selectedPreset.color}
                    onChange={(e) => setSelectedPreset((p) => ({ ...p, color: e.target.value }))}
                    aria-label="Text colour"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-300">
                  <span>Background Box</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedPreset.background ?? '#000000'}
                      onChange={(e) => setSelectedPreset((p) => ({ ...p, background: e.target.value }))}
                      aria-label="Background colour"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedPreset((p) => ({ ...p, background: null }))}
                      className="text-[11px] text-neutral-400 hover:text-white"
                    >
                      None
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/15 p-3 text-xs text-red-300">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {notice && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/15 p-3 text-xs text-green-300">
              <Check size={16} />
              {notice}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-line bg-neutral-900/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <TextButton
              variant="solid"
              onClick={handleDownloadSRT}
              disabled={segments.length === 0}
              className="text-xs"
            >
              <Download size={13} /> .SRT
            </TextButton>
            <TextButton
              variant="solid"
              onClick={handleDownloadVTT}
              disabled={segments.length === 0}
              className="text-xs"
            >
              <Download size={13} /> .VTT
            </TextButton>
          </div>

          <div className="flex items-center gap-2">
            <TextButton variant="ghost" onClick={onClose}>
              Cancel
            </TextButton>
            <TextButton
              variant="accent"
              onClick={handleApplyToTimeline}
              disabled={segments.length === 0}
            >
              <Sparkles size={14} /> Apply to Timeline
            </TextButton>
          </div>
        </div>
      </div>
    </div>
  );
}
