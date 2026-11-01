import { useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../components/ui';

const RETRY_MS = 5000;

function writeDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // A draft is a safety net only.
  }
}

export function readDraft<T>(key: string): { savedAt: number; value: T } | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/**
 * Save `value` a moment after it stops changing. Until the save succeeds a copy is kept in
 * local storage under `draftKey`, so pitch-side edits survive a lost signal or a closed tab;
 * failed saves are retried. `baseline` is the value as loaded from the server (not saved again).
 */
export function useAutosave<T>(value: T | null, baseline: T | null, save: (v: T) => Promise<void>, draftKey: string, delay = 800): { status: SaveStatus; error: string | null } {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);
  const savedJson = useRef<string | null>(null);
  const latest = useRef<T | null>(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  latest.current = value;

  useEffect(() => {
    savedJson.current = baseline == null ? null : JSON.stringify(baseline);
  }, [baseline]);

  useEffect(() => {
    if (value == null) return;
    const json = JSON.stringify(value);
    if (json === savedJson.current) return;
    setStatus('pending');
    writeDraft(draftKey, value);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = async () => {
      if (cancelled) return;
      setStatus('saving');
      try {
        await saveRef.current(value);
        if (cancelled) return;
        savedJson.current = json;
        setError(null);
        // Only clear the draft if nothing newer has been typed since.
        if (JSON.stringify(latest.current) === json) {
          clearDraft(draftKey);
          setStatus('saved');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus(navigator.onLine ? 'error' : 'offline');
        timer = setTimeout(attempt, RETRY_MS);
      }
    };
    timer = setTimeout(attempt, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, draftKey, delay]);

  // Leaving the screen (e.g. Edit → Done) saves straight away instead of waiting for the debounce.
  useEffect(
    () => () => {
      const v = latest.current;
      if (v == null || JSON.stringify(v) === savedJson.current) return;
      saveRef.current(v).then(
        () => clearDraft(draftKey),
        () => {}, // The draft stays, and is picked up next time the screen opens.
      );
    },
    [draftKey],
  );

  // Retry straight away when the connection comes back.
  useEffect(() => {
    const online = () => {
      if (latest.current != null && JSON.stringify(latest.current) !== savedJson.current) {
        saveRef.current(latest.current).then(
          () => {
            savedJson.current = JSON.stringify(latest.current);
            clearDraft(draftKey);
            setStatus('saved');
          },
          () => {},
        );
      }
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [draftKey]);

  return { status, error };
}
