import { useState, useEffect, useCallback, useRef } from 'react';

export interface Session {
  id: string;
  name: string;
  attached: number;
  windows: number;
  created: number;
}

interface UseSessionsResult {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  createSession: (name?: string) => Promise<void>;
  renameSession: (oldName: string, newName: string) => Promise<void>;
  killSession: (name: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) {
        setSessions(data);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  const createSession = useCallback(async (name?: string) => {
    const body: Record<string, string> = {};
    if (name) body.name = name;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    await refresh();
  }, [refresh]);

  const renameSession = useCallback(async (oldName: string, newName: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    await refresh();
  }, [refresh]);

  const killSession = useCallback(async (name: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    await refresh();
  }, [refresh]);

  return { sessions, loading, error, createSession, renameSession, killSession, refresh };
}
