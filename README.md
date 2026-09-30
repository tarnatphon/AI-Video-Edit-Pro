# AI Video Edit Pro

> โปรแกรมตัดต่อวิดีโอแบบ Multi-track ระดับโปร (UX สไตล์ Premiere / Final Cut, ใช้ง่ายแบบ Canva / CapCut)
> ที่รันบนเบราว์เซอร์ 100% — Mac, Windows, Linux, iPad และ Android — ไฟล์วิดีโอไม่ต้องอัปโหลดขึ้นเซิร์ฟเวอร์
>
> A professional multi-track video editor (Premiere/Final Cut UX, Canva-simple) that runs entirely in the
> browser on Mac, Windows, Linux, iPad and Android. Media never leaves the device.

---

## เริ่มใช้งานบน Mac (ก๊อปปี้แล้ววางใน Terminal ได้เลย)

```bash
curl -fsSL https://raw.githubusercontent.com/tarnatphon/AI-Video-Edit-Pro/main/setup-mac.sh | bash
```

สคริปต์จะติดตั้ง Xcode CLT / Node.js (ถ้ายังไม่มี), clone โปรเจกต์ไปที่ `~/AI-Video-Edit-Pro` (หรือโฟลเดอร์ล่าสุดที่จำไว้), ตรวจสอบความถูกต้องของไดรฟ์/ระบบไฟล์ APFS, ติดตั้ง dependencies, รัน typecheck + unit tests (เตือนอย่างเดียว ไม่ขวางการเปิดโปรแกรม), แล้วเปิดโปรแกรมที่ `http://localhost:5173` ให้อัตโนมัติ (รันซ้ำได้ ปลอดภัย)

ตัวเลือกเพิ่มเติม:

```bash
# ระบุ branch / โฟลเดอร์ (AIVEP_DIR มีสิทธิ์สูงสุดเสมอ) / เปิด https (จำเป็นสำหรับ OPFS บน iPad-Android เมื่อเข้าผ่าน Wi-Fi)
AIVEP_BRANCH=main AIVEP_DIR=~/Code/AI-Video-Edit-Pro AIVEP_HTTPS=1 bash setup-mac.sh
```

อัปเดตโค้ดในเครื่องให้ตรงกับ GitHub (`main`) แล้วเปิดโปรแกรม — รันสคริปต์เดิมจากในโฟลเดอร์ได้เลย
(สคริปต์จะ `git pull` ให้เมื่อไม่มีไฟล์ที่แก้ค้างไว้ และไม่ทำลายงานที่ยังไม่ได้ commit):

```bash
cd ~/AI-Video-Edit-Pro && bash setup-mac.sh
```

ถ้ามีโค้ดอยู่แล้ว (ทุก OS):

```bash
git pull --ff-only    # ดึงโค้ดล่าสุดจาก GitHub
npm install
npm run dev          # http://localhost:5173  (เปิดจากเครื่องอื่นใน Wi-Fi เดียวกันได้ผ่าน IP ของเครื่อง)
npm run dev:https    # https แบบ self-signed สำหรับทดสอบบน iPad / Android
npm test             # unit + UI smoke tests (105 tests)
npm run build        # production build + PWA service worker → dist/
```

### การตั้งค่าและสิทธิ์ของสคริปต์ setup-mac.sh

1. **ลำดับความสำคัญของ `AIVEP_DIR`**: ตัวแปร `AIVEP_DIR` มีสิทธิ์สูงสุดเหนือโฟลเดอร์ปัจจุบันเสมอ แม้จะรันจากใน checkout อื่น
2. **การจำพาสล่าสุด**: สคริปต์จะจำพาสที่เคยใช้ไว้ใน `~/.config/aivep/last_dir` ทำให้รัน `curl ... | bash` ซ้ำแล้วกลับมาที่เดิมได้เสมอ
3. **การตรวจสอบ External Drive / APFS**: ตรวจสอบว่าไดรฟ์ `/Volumes/...` ถูก mount อยู่หรือไม่ และตรวจว่าเป็นระบบไฟล์ APFS / Apple HFS+ หรือไม่ พร้อมแจ้งเตือนหากเป็น ExFAT/NTFS

---

## ฟีเจอร์ที่ใช้งานได้ตอนนี้

| หมวด | รายละเอียด |
| --- | --- |
| **AI Smart Cut** | **Auto Cut Silence (ตัดช่วงเงียบอัตโนมัติ)**: ตรวจจับเสียงเงียบ/ช่องว่างการพูด (RMS energy / dB threshold) พร้อม **Auto-Detect Noise Level** ค้นหาระดับเสียงรบกวนอัตโนมัติ, waveform แสดงโซนเขียว/แดงแบบ interactive, ปรับ threshold / min silence / speech padding ได้อิสระ, รองรับ 3 โหมด: Jump Cut & Ripple Delete (ตัดและต่อให้ทันที), Split (ตัดแบ่งคลิป), Mute (ปิดเสียงเฉพาะช่วงเงียบ) |
| **AI Subtitles & Karaoke** | **Auto Subtitles with Whisper (ซับไตเติ้ล AI & คาราโอเกะ)**: ถอดเสียงเป็นคำบรรยายอัตโนมัติด้วย Whisper AI (In-Browser Transformers.js 100% Client-side ออฟไลน์, Web Speech Engine, หรือ Whisper Cloud API / Groq), **Word-by-Word Karaoke Highlight** สไตล์ TikTok Pop, สไตล์พรีเซ็ตหลากหลาย, **1-Click แปลงซับไตเติลเป็น AI Voiceover**, วางลงแทร็ก Subtitles อัตโนมัติ, พร้อม Import/Export `.srt` และ `.vtt` |
| **AI Scene Splitter** | **Scene & Shot Detection (ตรวจจับและตัดแบ่งฉาก)**: วิเคราะห์ Color Histogram & Luminance Deltas ข้ามเฟรมวิดีโอ เพื่อตรวจจับจุดเปลี่ยนมุมกล้อง/คัตฉากอัตโนมัติ พร้อม Thumbnail Strip และตัดแบ่งคลิปบน Timeline ได้ในคลิกเดียว |
| **AI Voiceover** | **Text-to-Speech Voiceover (พากย์เสียง AI)**: สร้างเสียงพากย์ภาษาไทย/อังกฤษ/ทั่วโลก ด้วย Web Speech Synthesis หรือ OpenAI HD Voices (Alloy, Echo, Nova, Onyx) พร้อมวางลงแทร็กเสียง A1/A2 และสร้าง Waveform ให้อัตโนมัติ |
| **AI Smart Reframe** | **16:9 ↔ 9:16 Aspect Ratio Converter**: แปลงวิดีโอแนวนอนเป็นแนวตั้งสำหรับ TikTok, Reels, Shorts พร้อม AI Auto-Detect Subject โฟกัสวัตถุหลักอัตโนมัติ, 3 สไตล์: Auto-Crop, Blurred Background (โคลนวิดีโอเบลอเป็นฉากหลัง), และ Fit Letterbox |
| **Audio Ops** | **Extract Audio & Auto Ducking**: แยกแทร็กเสียงจากวิดีโอ (Extract Audio to A1) ใน 1 คลิก, Auto Audio Ducking ลดเสียงดนตรีพื้นหลังอัตโนมัติเมื่อมีเสียงบรรยาย |
| **Transitions** | **Video Transitions**: เอฟเฟกต์เปลี่ยนฉากระดับโปร (Cross Dissolve, Dip to Black, Dip to White, Wipe Left, Wipe Right, Slide Left, Zoom In) พร้อม visual badges บนคลิปไทม์ไลน์และตัวปรับความยาว Transition In / Transition Out ใน Inspector |
| **Media & Timeline** | หลายแทร็ก (V1, V2… / A1…) · ลากย้าย · ย้ายข้ามแทร็ก · ตัดขอบ (trim) แม่นยำระดับเฟรม · Split (blade) · Ripple delete · Duplicate · Magnetic snapping · ซูม timeline · lock / mute / hide แทร็ก · OPFS Storage |
| **Preview & Effects** | Canvas compositor 60 fps · Speed (0.1–8×) · Fade in/out · Volume / Mute · Position / Scale / Rotation / Opacity · Text Titles (กด **T**) · Effects: Brightness, Contrast, Saturation, B&W, Sepia, Hue, Blur, Invert |
| **Fast Export & GIF** | **Fast Offline Render (WebCodecs)**: เรนเดอร์ไฟล์ MP4 / WebM ความเร็วสูงระดับฮาร์ดแวร์, Social Media Presets (TikTok, Reels, YouTube 1080p, Instagram Square), **Animated GIF Export** ส่งออกแอนิเมชัน GIF สำหรับมีมและสติกเกอร์ |
| **Cross-platform** | Responsive: Desktop = 3 คอลัมน์ + timeline เต็มจอ · Tablet/Mobile = แท็บ Media / Timeline / Edit ปุ่มขนาด ≥ 44 px · PWA ติดตั้งได้ ทำงานออฟไลน์ |

### คีย์ลัด (Desktop)

| ปุ่ม | หน้าที่ |
| --- | --- |
| `Space` | เล่น / หยุด |
| `J` `K` `L` | ถอยหลัง 1 วินาที / หยุด / เล่น |
| `←` `→` (`⇧` = 10 เฟรม) | ขยับทีละเฟรม |
| `Home` / `End` | ไปต้น / ท้าย |
| `S` หรือ `⌘B` | Split ที่ playhead |
| `⌫` / `⇧⌫` | ลบ / Ripple delete |
| `⌘Z` / `⇧⌘Z` | Undo / Redo |
| `⌘D` · `⌘A` | Duplicate · เลือกทั้งหมด |
| `=` / `-` · `⌘ + wheel` | ซูม timeline |
| `N` · `T` · `Esc` | สลับ snapping · เพิ่ม Title · ยกเลิกการเลือก |

---

## สถาปัตยกรรม (Architecture)

```
src/
├── core/        ← โมเดลข้อมูล + ตรรกะล้วน (ไม่แตะ DOM, มี unit test ครบ 105 tests)
│   ├── types.ts          Project / Track / Clip / Transition / Effect / MediaAsset
│   ├── timelineOps.ts    add / move / trim / split / ripple / speed / fps
│   ├── silence.ts        RMS energy detection, dB thresholds, padding algorithms
│   ├── silenceOps.ts     pure silence cut, jump cut & ripple delete operations
│   ├── subtitles.ts      SubtitleSegment model, SRT/VTT parser & serializer, style presets
│   ├── subtitleOps.ts    apply subtitles to timeline, track allocation, formatting
│   ├── scene.ts          color histogram comparison, shot change score thresholding
│   ├── sceneOps.ts       split clip into detected scene clips
│   ├── reframe.ts        aspect ratio conversion math, center-of-interest focus
│   ├── reframeOps.ts     auto-crop transform & blurred background track generation
│   ├── transitions.ts    transition definitions (crossfade, dip, wipe, slide, zoom)
│   ├── tts.ts            voice options & speech synthesis parameters
│   ├── snapping.ts       magnetic snapping
│   ├── effects.ts        CSS-filter builder + software fallback
│   ├── time.ts           timecode / frame conversion
│   ├── project.ts        factories & defaults
│   └── store.ts          Zustand store · undo/redo · transactions
├── engine/      ← Media engine (browser APIs)
│   ├── silenceDetector.ts decode audio samples, mono downsampling, silence analysis
│   ├── transcriber.ts     Whisper AI (Transformers.js), Web Speech API, Cloud Whisper API
│   ├── sceneDetector.ts   video frame canvas sampling & histogram difference analysis
│   ├── tts.ts             speech synthesis engine (Browser SpeechSynthesis + OpenAI TTS)
│   ├── fastExporter.ts    hardware-accelerated WebCodecs / fast offline exporter
│   ├── sources.ts        FrameSource interface + <video>/<audio>/<img> sources + SourcePool
│   ├── compositor.ts     canvas frame rendering (transforms, effects, transitions, text)
│   ├── playback.ts       PlaybackEngine: rAF loop, monotonic clock, A/V sync
│   ├── audioMixer.ts     Web Audio graph (gain ต่อคลิป, capture สำหรับ export)
│   ├── probe.ts          duration / dimensions / thumbnail
│   ├── waveform.ts       peak analysis (OfflineAudioContext)
│   ├── opfs.ts           Origin Private File System storage
│   ├── persistence.ts    session save/restore
│   ├── importer.ts       import pipeline
│   └── exporter.ts       MediaRecorder real-time export
└── ui/          ← React 19 + Tailwind v4
    ├── ai/               SilenceRemovalModal, SubtitleGeneratorModal, SceneDetectionModal, VoiceoverModal, SmartReframeModal
    ├── layout/           EditorLayout.tsx (Desktop 3-column ↔ Tablet tabbed)
    ├── timeline/         Timeline, ruler, clips, headers, toolbar, gestures
    ├── preview/          PreviewPlayer.tsx
    ├── inspector/        Inspector.tsx (clip timing, transitions, effects, AI quick tools)
    ├── media/            MediaLibrary.tsx
    ├── toolbar/          TopBar.tsx, ExportDialog.tsx
    └── hooks/            shortcuts, persistence, media queries
tests/           ← Vitest: 97 core/AI tests + 8 full-app smoke tests
```

---

## License

MIT
