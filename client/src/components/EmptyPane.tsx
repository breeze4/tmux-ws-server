import { useState } from 'react';
import { useSessions } from '../hooks/useSessions';

interface Props {
  onSelectSession: (name: string) => void;
}

export default function EmptyPane({ onSelectSession }: Props) {
  const { sessions, loading, createSession } = useSessions();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      await createSession();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.prompt}>Select a session</div>
      {loading && sessions.length === 0 && (
        <div style={styles.muted}>Loading sessions...</div>
      )}
      <div style={styles.list}>
        {sessions.map((s) => (
          <button
            key={s.id}
            style={styles.sessionBtn}
            onClick={() => onSelectSession(s.name)}
          >
            {s.name}
            <span style={styles.meta}>{s.windows}w</span>
          </button>
        ))}
      </div>
      <button
        style={styles.createBtn}
        onClick={handleCreate}
        disabled={creating}
      >
        {creating ? 'Creating...' : '+ New Session'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d0d1a',
    color: '#c8c8d0',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
  },
  prompt: {
    fontSize: 16,
    color: '#888',
    marginBottom: 16,
  },
  muted: {
    color: '#555',
    fontSize: 12,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 200,
    overflowY: 'auto',
    minWidth: 160,
  },
  sessionBtn: {
    background: '#1a1a2e',
    color: '#c8c8d0',
    border: '1px solid #333',
    borderRadius: 4,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  meta: {
    color: '#666',
    fontSize: 12,
  },
  createBtn: {
    marginTop: 16,
    background: '#2a5a2a',
    color: '#e0e0e0',
    border: 'none',
    borderRadius: 4,
    padding: '10px 24px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
  },
};
