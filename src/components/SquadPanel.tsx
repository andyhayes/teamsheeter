import { useState } from 'react';
import { ALL_POSITIONS } from '../lib/presets';
import { newId } from '../lib/storage';
import type { Player } from '../lib/types';

interface Props {
  squad: Player[];
  onChange: (squad: Player[]) => void;
}

export function SquadPanel({ squad, onChange }: Props) {
  const [bulk, setBulk] = useState('');

  const update = (id: string, patch: Partial<Player>) =>
    onChange(squad.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const togglePosition = (player: Player, pos: string) =>
    update(player.id, {
      positions: player.positions.includes(pos)
        ? player.positions.filter((x) => x !== pos)
        : ALL_POSITIONS.filter((x) => x === pos || player.positions.includes(x)),
    });

  const move = (index: number, delta: number) => {
    const next = [...squad];
    const [p] = next.splice(index, 1);
    next.splice(index + delta, 0, p);
    onChange(next);
  };

  const addBulk = () => {
    const names = bulk
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    onChange([...squad, ...names.map((name) => ({ id: newId(), name, positions: [] }))]);
    setBulk('');
  };

  return (
    <div className="squad-panel">
      <section className="card">
        <h2>Squad</h2>
        <p className="muted small">
          Tick the positions each player is happy playing. The scheduler prefers these, then the same line (defence,
          midfield, attack). Leave blank for "anywhere". Players with GK are offered as keepers.
        </p>
        <table className="squad-table">
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th>Positions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {squad.map((p, i) => (
              <tr key={p.id}>
                <td className="order">
                  <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                    ↑
                  </button>
                  <button className="icon" disabled={i === squad.length - 1} onClick={() => move(i, 1)} title="Move down">
                    ↓
                  </button>
                </td>
                <td>
                  <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                </td>
                <td>
                  <div className="chips">
                    {ALL_POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        className={`chip ${p.positions.includes(pos) ? 'on' : ''}`}
                        onClick={() => togglePosition(p, pos)}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <button className="icon danger" onClick={() => onChange(squad.filter((x) => x.id !== p.id))} title="Remove player">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Add players</h2>
        <p className="muted small">One name per line (or comma separated).</p>
        <textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Sam\nRiley'} />
        <button className="primary" onClick={addBulk} disabled={!bulk.trim()}>
          Add to squad
        </button>
      </section>
    </div>
  );
}
