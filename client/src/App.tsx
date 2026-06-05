import { useState, useEffect, useCallback, useMemo } from 'react';
import TopBar from './components/TopBar';
import PaneLayout from './components/PaneLayout';
import SessionSidebar from './components/SessionSidebar';

type Layout = 1 | 2 | 4;

const STORAGE_KEY = 'beebaby-pane-layout';

interface PersistedState {
  layout: Layout;
  panes: (string | null)[];
  sidebarOpen?: boolean;
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        [1, 2, 4].includes(parsed.layout) &&
        Array.isArray(parsed.panes)
      ) {
        // Normalize panes array to match layout length
        const panes = parsed.panes.slice(0, parsed.layout) as (string | null)[];
        while (panes.length < parsed.layout) panes.push(null);
        return { layout: parsed.layout, panes, sidebarOpen: parsed.sidebarOpen };
      }
    }
  } catch {
    // ignore
  }
  return { layout: 1, panes: [null] };
}

function saveState(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function App() {
  const [layout, setLayout] = useState<Layout>(() => loadState().layout);
  const [panes, setPanes] = useState<(string | null)[]>(() => loadState().panes);
  const [focusedPane, setFocusedPane] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = loadState().sidebarOpen;
    return saved !== undefined ? saved : window.innerWidth > 600;
  });

  // Persist on change
  useEffect(() => {
    saveState({ layout, panes, sidebarOpen });
  }, [layout, panes, sidebarOpen]);

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout(newLayout);
    setPanes((prev) => {
      if (newLayout <= prev.length) {
        return prev.slice(0, newLayout);
      }
      const extended = [...prev];
      while (extended.length < newLayout) {
        extended.push(null);
      }
      return extended;
    });
    setFocusedPane((prev) => (prev >= newLayout ? 0 : prev));
  }, []);

  const handlePaneSessionChange = useCallback(
    (index: number, session: string | null) => {
      setPanes((prev) => {
        const next = [...prev];
        next[index] = session;
        return next;
      });
    },
    [],
  );

  const handleAttach = useCallback(
    (sessionName: string) => {
      setPanes((prev) => {
        const emptyIndex = prev.findIndex((p) => p === null);
        const next = [...prev];
        if (emptyIndex !== -1) {
          next[emptyIndex] = sessionName;
        } else {
          next[focusedPane] = sessionName;
        }
        return next;
      });
    },
    [focusedPane],
  );

  const handleDetach = useCallback(() => {
    setPanes((prev) => {
      const next = [...prev];
      next[focusedPane] = null;
      return next;
    });
  }, [focusedPane]);

  const activeSession = panes[focusedPane] ?? null;

  const isNarrow = useMemo(() => window.innerWidth <= 600, []);

  const handleAttachAndClose = useCallback(
    (sessionName: string) => {
      handleAttach(sessionName);
      if (isNarrow) setSidebarOpen(false);
    },
    [handleAttach, isNarrow],
  );

  return (
    <div style={{ width: '100%', height: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <TopBar
        layout={layout}
        onLayoutChange={handleLayoutChange}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {sidebarOpen && (
          <>
            {isNarrow && (
              <div
                style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9,
                }}
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div style={isNarrow ? { position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 10 } : {}}>
              <SessionSidebar
                activeSession={activeSession}
                onAttach={handleAttachAndClose}
                onDetach={handleDetach}
              />
            </div>
          </>
        )}
        <PaneLayout
          panes={panes}
          layout={layout}
          onPaneSessionChange={handlePaneSessionChange}
          focusedPane={focusedPane}
          onFocusPane={setFocusedPane}
        />
      </div>
    </div>
  );
}
