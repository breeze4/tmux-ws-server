interface Props {
  layout: 1 | 2 | 4;
  onLayoutChange: (layout: 1 | 2 | 4) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const layouts: { value: 1 | 2 | 4; label: string }[] = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 4, label: '4' },
];

export default function TopBar({ layout, onLayoutChange, sidebarOpen, onToggleSidebar }: Props) {
  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <button style={styles.menuBtn} onClick={onToggleSidebar} title="Toggle sidebar">
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <span style={styles.title}>BeeBaby Admin</span>
      </div>
      <div style={styles.toggleGroup}>
        {layouts.map((l) => (
          <button
            key={l.value}
            style={{
              ...styles.toggleBtn,
              ...(layout === l.value ? styles.toggleBtnActive : {}),
            }}
            onClick={() => onLayoutChange(l.value)}
            title={`${l.value}-pane layout`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 36,
    minHeight: 36,
    backgroundColor: '#16162a',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
    color: '#c8c8d0',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    color: '#c8c8d0',
    cursor: 'pointer',
    fontSize: 18,
    padding: '0 4px',
    lineHeight: 1,
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: '#e0e0e0',
  },
  toggleGroup: {
    display: 'flex',
    gap: 4,
  },
  toggleBtn: {
    background: '#2a2a3e',
    color: '#888',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '2px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: '20px',
  },
  toggleBtnActive: {
    background: '#3a5a8a',
    color: '#e0e0e0',
    borderColor: '#5a8aba',
  },
};
