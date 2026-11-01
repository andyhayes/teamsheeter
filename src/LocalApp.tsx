import { useCallback, useEffect, useRef, useState } from 'react';
import { SquadPanel } from './components/SquadPanel';
import { TeamSheetBuilder } from './components/TeamSheetBuilder';
import type { SheetState } from './lib/sheet-state';
import { exportState, importState, loadState, saveState, type AppState } from './lib/storage';
import type { Player } from './lib/types';

/** The original single-device app: everything in this browser's local storage, no account needed. */
export default function LocalApp() {
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<'match' | 'squad'>('match');
  const importRef = useRef<HTMLInputElement>(null);
  const [fileStatus, setFileStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const update = useCallback((fn: (s: SheetState) => SheetState) => setState(fn), []);

  useEffect(() => saveState(state), [state]);

  const updateSquad = (squad: Player[]) =>
    setState((s) => {
      const ids = new Set(squad.map((p) => p.id));
      return {
        ...s,
        squad,
        fixture: {
          ...s.fixture,
          available: s.fixture.available.filter((id) => ids.has(id)),
          keepers: s.fixture.keepers.map((id) => (id && ids.has(id) ? id : null)),
        },
      };
    });

  const showFileStatus = (ok: boolean, text: string) => {
    setFileStatus({ ok, text });
    setTimeout(() => setFileStatus(null), ok ? 2500 : 6000);
  };

  const exportFile = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const { date, opponent } = state.fixture;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `teamsheeter-${[date, opponent].filter(Boolean).join('-').replace(/[^\w-]+/g, '-') || 'backup'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showFileStatus(true, 'Exported ✓');
  };

  const importFile = async (file: File) => {
    try {
      setState(importState(await file.text()));
      showFileStatus(true, 'Imported ✓');
    } catch (e) {
      showFileStatus(false, `Import failed: ${e instanceof Error ? e.message : 'unreadable file'}`);
    }
  };

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ⚽
          </span>
          Teamsheeter
        </div>
        <nav className="tabs">
          <button className={tab === 'match' ? 'active' : ''} onClick={() => setTab('match')}>
            Match day
          </button>
          <button className={tab === 'squad' ? 'active' : ''} onClick={() => setTab('squad')}>
            Squad ({state.squad.length})
          </button>
        </nav>
        <div className="file-actions">
          {fileStatus && <span className={`file-status ${fileStatus.ok ? '' : 'error'}`}>{fileStatus.text}</span>}
          <button onClick={exportFile} title="Save the squad, fixture and team sheet to a file">
            Export
          </button>
          <button onClick={() => importRef.current?.click()} title="Load a previously exported file, replacing the current squad and match day">
            Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importFile(file);
            }}
          />
        </div>
      </header>

      {tab === 'squad' ? (
        <main className="page">
          <SquadPanel squad={state.squad} onChange={updateSquad} />
        </main>
      ) : (
        <TeamSheetBuilder state={state} onChange={update} />
      )}
    </div>
  );
}
