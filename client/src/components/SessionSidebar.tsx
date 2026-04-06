import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSessions, type Session } from '../hooks/useSessions';

interface Props {
  activeSession: string | null;
  onAttach: (sessionName: string) => void;
  onDetach: () => void;
}

export default function SessionSidebar({ activeSession, onAttach, onDetach }: Props) {
  const { sessions, loading, error, createSession, renameSession, killSession } = useSessions();
  const [newName, setNewName] = useState('');
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    try {
      await createSession(newName.trim() || undefined);
      setNewName('');
    } catch (err: any) {
      setActionError(err.message);
    }
  }

  async function handleKill(name: string) {
    if (!window.confirm(`Kill session "${name}"?`)) return;
    setActionError(null);
    try {
      await killSession(name);
    } catch (err: any) {
      setActionError(err.message);
    }
  }

  function startRename(session: Session) {
    setEditingSession(session.name);
    setEditValue(session.name);
  }

  async function commitRename(oldName: string) {
    setEditingSession(null);
    if (!editValue.trim() || editValue.trim() === oldName) return;
    setActionError(null);
    try {
      await renameSession(oldName, editValue.trim());
    } catch (err: any) {
      setActionError(err.message);
    }
  }

  function handleRenameKeyDown(e: KeyboardEvent, oldName: string) {
    if (e.key === 'Enter') {
      commitRename(oldName);
    } else if (e.key === 'Escape') {
      setEditingSession(null);
    }
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>Sessions</div>

      {error && <div style={styles.error}>Poll error: {error}</div>}
      {actionError && <div style={styles.error}>{actionError}</div>}

      <div style={styles.list}>
        {loading && sessions.length === 0 && <div style={styles.muted}>Loading...</div>}
        {!loading && sessions.length === 0 && <div style={styles.muted}>No sessions</div>}

        {sessions.map((s) => {
          const isActive = s.name === activeSession;
          return (
            <div
              key={s.id}
              style={{
                ...styles.item,
                backgroundColor: isActive ? '#2a3a4a' : 'transparent',
              }}
            >
              <div
                style={styles.itemMain}
                onClick={() => onAttach(s.name)}
                title={`Click to attach to "${s.name}"`}
              >
                {editingSession === s.name ? (
                  <input
                    style={styles.renameInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitRename(s.name)}
                    onKeyDown={(e) => handleRenameKeyDown(e, s.name)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span style={styles.sessionName}>{s.name}</span>
                )}
                <span style={styles.meta}>
                  {s.windows}w
                  {s.attached > 0 && <span style={styles.attachedBadge}> ●</span>}
                </span>
              </div>
              <div style={styles.itemActions}>
                <button
                  style={styles.actionBtn}
                  onClick={(e) => { e.stopPropagation(); startRename(s); }}
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  style={styles.actionBtn}
                  onClick={(e) => { e.stopPropagation(); handleKill(s.name); }}
                  title="Kill session"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {activeSession && (
        <button style={styles.detachBtn} onClick={onDetach}>
          Detach
        </button>
      )}

      <form style={styles.createForm} onSubmit={handleCreate}>
        <input
          style={styles.createInput}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Session name (optional)"
        />
        <button style={styles.createBtn} type="submit">
          + New
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 250,
    minWidth: 250,
    height: '100%',
    backgroundColor: '#1a1a2e',
    color: '#c8c8d0',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #333',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 13,
  },
  header: {
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#e0e0e0',
    borderBottom: '1px solid #333',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  muted: {
    padding: '12px 16px',
    color: '#666',
  },
  error: {
    padding: '8px 16px',
    color: '#ff6b6b',
    fontSize: 12,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px 6px 16px',
    cursor: 'pointer',
    borderBottom: '1px solid #222',
  },
  itemMain: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  sessionName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    color: '#888',
    fontSize: 12,
    flexShrink: 0,
  },
  attachedBadge: {
    color: '#4caf50',
  },
  itemActions: {
    display: 'flex',
    gap: 2,
    marginLeft: 4,
    flexShrink: 0,
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    padding: '2px 4px',
    fontSize: 13,
    lineHeight: 1,
  },
  renameInput: {
    background: '#111',
    color: '#e0e0e0',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: 13,
    width: '100%',
    outline: 'none',
  },
  detachBtn: {
    margin: '8px 16px',
    padding: '6px 0',
    background: '#333',
    color: '#c8c8d0',
    border: '1px solid #555',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
  createForm: {
    padding: '8px 12px',
    borderTop: '1px solid #333',
    display: 'flex',
    gap: 6,
  },
  createInput: {
    flex: 1,
    background: '#111',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
    outline: 'none',
  },
  createBtn: {
    background: '#2a5a2a',
    color: '#e0e0e0',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
};
