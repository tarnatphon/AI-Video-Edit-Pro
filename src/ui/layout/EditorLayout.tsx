import { Film, FolderOpen, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEditorStore, type PanelId } from '../../core/store';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { Inspector } from '../inspector/Inspector';
import { MediaLibrary } from '../media/MediaLibrary';
import { PreviewPlayer } from '../preview/PreviewPlayer';
import { Timeline } from '../timeline/Timeline';
import { TopBar } from '../toolbar/TopBar';

/**
 * Adaptive workspace:
 *  - Desktop (≥1024px): Media | Preview | Inspector, full-width multi-track timeline below.
 *  - Tablet / phone: Preview on top, one panel at a time (Media / Timeline / Inspector) with a
 *    bottom tab bar (44px+ touch targets, safe-area aware).
 */
export function EditorLayout() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopLayout /> : <CompactLayout />;
}

function DesktopLayout() {
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100 select-none">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-line bg-panel">
          <MediaLibrary />
        </aside>
        <main className="min-w-0 flex-1">
          <PreviewPlayer />
        </main>
        <aside className="w-80 shrink-0 border-l border-line bg-panel">
          <Inspector />
        </aside>
      </div>
      <section className="h-[300px] shrink-0 border-t border-line">
        <Timeline />
      </section>
    </div>
  );
}

const TABS: { id: PanelId; label: string; icon: ReactNode }[] = [
  { id: 'media', label: 'Media', icon: <FolderOpen size={20} /> },
  { id: 'timeline', label: 'Timeline', icon: <Film size={20} /> },
  { id: 'inspector', label: 'Edit', icon: <SlidersHorizontal size={20} /> },
];

function CompactLayout() {
  const activePanel = useEditorStore((s) => s.activePanel);
  const setActivePanel = useEditorStore((s) => s.setActivePanel);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100 select-none">
      <TopBar />
      <main className="h-[36dvh] shrink-0 border-b border-line">
        <PreviewPlayer />
      </main>
      <section className="min-h-0 flex-1 bg-panel">
        {activePanel === 'media' && <MediaLibrary />}
        {activePanel === 'timeline' && <Timeline />}
        {activePanel === 'inspector' && <Inspector />}
      </section>
      <nav className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]" aria-label="Panels">
        {TABS.map((tab) => {
          const active = tab.id === activePanel;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePanel(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? 'bg-accent/30 text-indigo-200' : ''}`}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
