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

สคริปต์จะติดตั้ง Xcode CLT / Node.js (ถ้ายังไม่มี), clone โปรเจกต์ไปที่ `~/AI-Video-Edit-Pro`, ติดตั้ง dependencies,
รัน typecheck + unit tests, แล้วเปิดโปรแกรมที่ `http://localhost:5173` ให้อัตโนมัติ (รันซ้ำได้ ปลอดภัย)

ตัวเลือกเพิ่มเติม:

```bash
# ระบุ branch / โฟลเดอร์ / เปิด https (จำเป็นสำหรับ OPFS บน iPad-Android เมื่อเข้าผ่าน Wi-Fi)
AIVEP_BRANCH=main AIVEP_DIR=~/Code/AI-Video-Edit-Pro AIVEP_HTTPS=1 bash setup-mac.sh
```

ถ้ามีโค้ดอยู่แล้ว (ทุก OS):

```bash
npm install
npm run dev          # http://localhost:5173  (เปิดจากเครื่องอื่นใน Wi-Fi เดียวกันได้ผ่าน IP ของเครื่อง)
npm run dev:https    # https แบบ self-signed สำหรับทดสอบบน iPad / Android
npm test             # unit + UI smoke tests (72 tests)
npm run build        # production build + PWA service worker → dist/
```

### ทดสอบบน iPad / Android

1. รัน `npm run dev` (หรือ `AIVEP_HTTPS=1 bash setup-mac.sh`) บน Mac — Terminal จะแสดง URL แบบ `http://192.168.x.x:5173`
2. เปิด URL นั้นบน Safari / Chrome ของแท็บเล็ตที่อยู่ Wi-Fi เดียวกัน
3. กด **Share → Add to Home Screen** เพื่อติดตั้งเป็นแอป (PWA) แบบเต็มจอ

---

## ฟีเจอร์ที่ใช้งานได้ตอนนี้

| หมวด | รายละเอียด |
| --- | --- |
| **Media** | Import วิดีโอ / เสียง / รูป (ปุ่ม, ลากวาง, หรือ drop ลง timeline) · thumbnail · waveform · เก็บไฟล์ไว้ในเครื่องด้วย OPFS (กลับมาเปิดต่อได้หลังปิดแท็บ) |
| **Timeline** | หลายแทร็ก (V1, V2… / A1…) · ลากย้าย · ย้ายข้ามแทร็ก · ตัดขอบ (trim) แม่นยำระดับเฟรม · Split (blade) · Ripple delete · Duplicate · Magnetic snapping (ขอบคลิป / playhead) · ซูมด้วยล้อเมาส์ ⌘+scroll หรือ pinch สองนิ้ว · lock / mute / hide แทร็ก |
| **Preview** | Canvas compositor 60 fps · นาฬิกาแบบ monotonic (เฟรมไม่เพี้ยนตามความหนักของการวาด) · เสียงผ่าน Web Audio (volume ต่อคลิป, ทำงานบน iOS) |
| **Inspector** | Speed (0.1–8×) · Fade in/out · Volume / Mute · Position / Scale / Rotation / Opacity · Text (ฟอนต์, สี, พื้นหลัง, จัดวาง) · Effects: Brightness, Contrast, Saturation, B&W, Sepia, Hue, Blur, Invert |
| **Titles** | คลิปข้อความหลายบรรทัดวาดตรงบน canvas (กด **T**) |
| **History** | Undo / Redo ไม่จำกัดชั้น (200 ขั้น) — การลาก 1 ครั้ง = undo 1 ครั้ง (transaction) |
| **Export** | เรนเดอร์เป็นไฟล์ MP4 (Safari) / WebM (Chrome, Edge, Firefox) ที่ความละเอียดโปรเจกต์ (สูงสุด 1920 px) พร้อมเสียงมิกซ์ |
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

### ท่าทางสัมผัส (iPad / Android)

- ลาก 1 นิ้วบนพื้นที่ว่าง = เลื่อน timeline · แตะ = ย้าย playhead
- ถ่าง/หุบ 2 นิ้ว = ซูม timeline (ยึดตำแหน่งนิ้ว)
- ลากคลิป = ย้าย · ลากขอบ (22 px) = trim · ลากขึ้น/ลง = ย้ายแทร็ก

---

## สถาปัตยกรรม (Architecture)

```
src/
├── core/        ← โมเดลข้อมูล + ตรรกะล้วน (ไม่แตะ DOM, มี unit test ครบ)
│   ├── types.ts          Project / Track / Clip / Effect / MediaAsset (หน่วยเวลาเป็นเฟรมจำนวนเต็ม)
│   ├── timelineOps.ts    add / move / trim / split / ripple / speed / fps — pure functions + invariants
│   ├── snapping.ts       magnetic snapping
│   ├── effects.ts        CSS-filter builder + software fallback (pixel-exact colour matrices)
│   ├── time.ts           timecode / frame conversion
│   ├── project.ts        factories & defaults
│   └── store.ts          Zustand store · undo/redo · transactions
├── engine/      ← Media engine (browser APIs)
│   ├── sources.ts        FrameSource interface + <video>/<audio>/<img> sources + SourcePool
│   ├── compositor.ts     วาดเฟรมลง canvas (transform, opacity, fades, effects, text)
│   ├── playback.ts       PlaybackEngine: rAF loop, monotonic clock, A/V sync, render targets
│   ├── audioMixer.ts     Web Audio graph (gain ต่อคลิป, capture สำหรับ export)
│   ├── probe.ts          duration / dimensions / thumbnail
│   ├── waveform.ts       peak analysis (OfflineAudioContext)
│   ├── opfs.ts           Origin Private File System storage
│   ├── persistence.ts    session save/restore
│   ├── importer.ts       import pipeline
│   └── exporter.ts       MediaRecorder real-time export
└── ui/          ← React 19 + Tailwind v4 (Pointer Events → เมาส์ / นิ้ว / Apple Pencil ใช้โค้ดเดียวกัน)
    ├── layout/EditorLayout.tsx     Desktop 3-column ↔ Tablet tabbed
    ├── timeline/                   Timeline, ruler (canvas), clips, headers, toolbar, gestures
    ├── preview/PreviewPlayer.tsx   canvas + transport
    ├── inspector/Inspector.tsx     project & clip properties, effects
    ├── media/MediaLibrary.tsx      import + library
    ├── toolbar/                    top bar, export dialog
    └── hooks/                      shortcuts, persistence, media queries
tests/           ← Vitest: 65 core tests + 7 full-app smoke tests (jsdom, pointer-drag จำลอง)
```

### หลักการออกแบบที่ทำให้ "เป๊ะ"

1. **Integer frames everywhere** — ตำแหน่ง/ความยาวคลิปเป็นจำนวนเต็มของเฟรม ไม่มี floating-point drift; แปลงเป็นวินาทีเฉพาะตอนเรนเดอร์
2. **Pure operations + invariants** — ทุกการแก้ไข timeline เป็น pure function ที่รับประกันว่า: คลิปในแทร็กเดียวกันไม่ทับกัน, ไม่ยาวเกินไฟล์ต้นฉบับ, ไม่แตะแทร็กที่ล็อก, คืน reference เดิมเมื่อไม่มีอะไรเปลี่ยน (undo history จึงถูกและถูกจัดเก็บแบบ structural sharing)
3. **Engine ไม่ผูกกับ React** — `PlaybackEngine` อ่าน/เขียน store โดยตรง, UI เป็นแค่ view; export ใช้ engine ตัวเดียวกันวาดลง canvas อีกใบ
4. **Feature detection ทุกจุด** — OPFS, `ctx.filter`, Web Audio, MediaRecorder ล้วนมี fallback

### Data model (ย่อ)

```ts
interface Clip {
  id: string; trackId: string; kind: 'video' | 'audio' | 'image' | 'text'; assetId: string | null;
  start: Frames; duration: Frames; offset: Frames;   // integer frames @ project.fps
  speed: number; volume: number; muted: boolean; fadeIn: Frames; fadeOut: Frames;
  transform: { x; y; scale; rotation; opacity }; effects: Effect[]; text: TextStyle | null;
}
```

---

## Browser support

| แพลตฟอร์ม | เบราว์เซอร์ | หมายเหตุ |
| --- | --- | --- |
| macOS / Windows / Linux | Chrome, Edge ≥ 108 · Firefox ≥ 111 · Safari ≥ 16.4 | ครบทุกฟีเจอร์ |
| iPadOS / iOS | Safari ≥ 16.4 (แนะนำ 17+) | Export เป็น MP4; OPFS ต้องเปิดผ่าน https หรือ localhost |
| Android | Chrome ≥ 108 | Export เป็น WebM |

ข้อจำกัดปัจจุบัน: การ export ใช้เวลาเท่าความยาววิดีโอ (real-time capture) และไม่ควรสลับแท็บระหว่างเรนเดอร์

---

## Roadmap

- [ ] WebCodecs `VideoDecoder` + MP4 demuxer เป็น `FrameSource` แบบ frame-exact (interface พร้อมแล้ว)
- [ ] Offline export ด้วย WebCodecs `VideoEncoder` + mp4 muxer (เร็วกว่า real-time, ไฟล์ MP4 ทุกเบราว์เซอร์)
- [ ] Transitions ระหว่างคลิป (cross dissolve, wipe) และ keyframe animation
- [ ] WebGPU / WebGL effect pipeline (LUT, colour wheels)
- [ ] Linked audio track เมื่อวางวิดีโอ (แยกเสียงไป A1 อัตโนมัติ)
- [ ] Cloud project sync (Supabase) สำหรับสลับเครื่อง Mac ↔ iPad

## License

MIT
