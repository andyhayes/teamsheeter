import { useState, type ReactNode } from 'react';

export function Loading({ what }: { what?: string }) {
  return <p className="muted loading">Loading{what ? ` ${what}` : ''}…</p>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="error-box">{error instanceof Error ? error.message : String(error)}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

/** A button that runs an async action, showing progress and any error. */
export function ActionButton({
  onClick,
  children,
  className,
  disabled,
  title,
  confirm: confirmText,
}: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  /** Ask before running (e.g. for deletes). */
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = async () => {
    if (confirmText && !confirming) return setConfirming(true);
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await onClick();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="action-button">
      <button className={className} disabled={disabled || busy} title={title} onClick={run}>
        {busy ? '…' : confirming ? confirmText : children}
      </button>
      {confirming && (
        <button className="link" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      )}
      {error && <span className="inline-error">{error}</span>}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <span className={`role-badge ${role}`}>{role}</span>;
}

export type SaveStatus = 'saved' | 'saving' | 'pending' | 'error' | 'offline';

export function SaveIndicator({ status, error }: { status: SaveStatus; error?: string | null }) {
  const label = {
    saved: 'Saved ✓',
    saving: 'Saving…',
    pending: 'Unsaved changes',
    error: `Save failed${error ? `: ${error}` : ''}, retrying`,
    offline: 'Offline, kept on this device',
  }[status];
  return <span className={`save-indicator ${status}`}>{label}</span>;
}
