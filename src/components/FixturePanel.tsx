import { useEffect, useMemo, useState } from 'react';
import { FORMATIONS, PERIOD_PRESETS } from '../lib/presets';
import { generateSchedule } from '../lib/scheduler';
import { flattenPeriods, formatMinutes, matchLength, minutesBalance, playerMinutes } from '../lib/schedule-utils';
import { benchKey, type Fixture, type Formation, type Locks, type Player } from '../lib/types';

interface Props {
  fixture: Fixture;
  squad: Player[];
  formation: Formation;
  players: Player[];
  locks: Locks;
  onChange: (patch: Partial<Fixture>) => void;
  onToggleStartingSub: (id: string) => void;
}

const sameHalves = (a: number[][], b: number[][]) => JSON.stringify(a) === JSON.stringify(b);

export function FixturePanel({ fixture, squad, formation, players, locks, onChange, onToggleStartingSub }: Props) {
  const presetId = PERIOD_PRESETS.find((p) => sameHalves(p.halves, fixture.halves))?.id ?? 'custom';
  const keeperOptions = players;
  const outfield = players.length - new Set(fixture.keepers.filter(Boolean)).size;

  // Best achievable spread per period structure for this squad, to help pick a template.
  const spreadKey = JSON.stringify([formation.id, fixture.keepers, players.map((p) => [p.id, p.positions])]);
  const spreads = useMemo(() => {
    const result = new Map<string, string>();
    if (!players.length) return result;
    for (const preset of PERIOD_PRESETS) {
      const periods = flattenPeriods(preset.halves);
      const { schedule } = generateSchedule({
        players,
        slots: formation.slots,
        periods,
        keepers: fixture.keepers,
        quick: true,
      });
      const b = minutesBalance(playerMinutes(schedule, periods, players.map((p) => p.id)), matchLength(preset.halves));
      if (b) result.set(preset.id, b.min === b.max ? `all ${formatMinutes(b.min)}′` : `${formatMinutes(b.min)}–${formatMinutes(b.max)}′`);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadKey]);

  const toggleAvailable = (id: string) => {
    const set = new Set(fixture.available);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ available: squad.filter((p) => set.has(p.id)).map((p) => p.id) });
  };

  const setKeeper = (half: number, id: string) => {
    const keepers = fixture.halves.map((_, h) => fixture.keepers[h] ?? null);
    keepers[half] = id || null;
    onChange({ keepers });
  };

  const setHalves = (halves: number[][]) => {
    const keepers = halves.map((_, h) => fixture.keepers[h] ?? fixture.keepers[0] ?? null);
    onChange({ halves, keepers });
  };

  return (
    <div className="fixture-panel">
      <section className="card">
        <h2>Fixture</h2>
        <div className="field-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={fixture.date} onChange={(e) => onChange({ date: e.target.value })} />
          </label>
          <label className="field">
            <span>Venue</span>
            <select value={fixture.venue} onChange={(e) => onChange({ venue: e.target.value as Fixture['venue'] })}>
              <option value="">—</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Opponent</span>
          <input
            value={fixture.opponent}
            placeholder="Team name"
            onChange={(e) => onChange({ opponent: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Formation</span>
          <select value={fixture.formationId} onChange={(e) => onChange({ formationId: e.target.value })}>
            {FORMATIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card">
        <h2>Substitution periods</h2>
        <p className="muted small">Subs happen between periods. The range shows the fairest minutes split possible with this squad.</p>
        <ul className="preset-list">
          {PERIOD_PRESETS.map((p) => (
            <li key={p.id}>
              <label className={presetId === p.id ? 'active' : ''}>
                <input type="radio" name="preset" checked={presetId === p.id} onChange={() => setHalves(p.halves)} />
                <span className="preset-name">{p.name}</span>
                <span className="preset-spread">{spreads.get(p.id) ?? ''}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="halves-edit">
          {fixture.halves.map((durations, h) => (
            <HalfInput
              key={`${h}-${durations.join(',')}`}
              label={fixture.halves.length === 2 ? (h === 0 ? '1st half' : '2nd half') : `Part ${h + 1}`}
              durations={durations}
              onCommit={(d) => setHalves(fixture.halves.map((x, i) => (i === h ? d : x)))}
              onRemove={fixture.halves.length > 1 ? () => setHalves(fixture.halves.filter((_, i) => i !== h)) : undefined}
            />
          ))}
          <button className="link" onClick={() => setHalves([...fixture.halves, fixture.halves.at(-1) ?? [10]])}>
            + Add half / quarter
          </button>
          <p className="muted small">Total {formatMinutes(matchLength(fixture.halves))} minutes</p>
        </div>
      </section>

      <section className="card">
        <h2>Goalkeeper</h2>
        {fixture.halves.map((_, h) => (
          <label key={h} className="field inline">
            <span>{fixture.halves.length === 2 ? (h === 0 ? '1st half' : '2nd half') : `Part ${h + 1}`}</span>
            <select value={fixture.keepers[h] ?? ''} onChange={(e) => setKeeper(h, e.target.value)}>
              <option value="">Auto</option>
              {keeperOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.positions.includes('GK') ? ' (GK)' : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Available players</h2>
          <span className="count">
            {players.length} selected · {outfield} outfield for {formation.slots.length - 1} places
          </span>
        </div>
        <div className="quick-select">
          <button className="link" onClick={() => onChange({ available: squad.map((p) => p.id) })}>
            All
          </button>
          <button className="link" onClick={() => onChange({ available: [] })}>
            None
          </button>
        </div>
        <p className="muted small">Tap <b>Sub</b> to make a player start on the bench.</p>
        <ul className="avail-list">
          {squad.map((p) => (
            <li key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={fixture.available.includes(p.id)}
                  onChange={() => toggleAvailable(p.id)}
                />
                <span>{p.name}</span>
                <span className="muted small">{p.positions.join(' ')}</span>
              </label>
              {fixture.available.includes(p.id) && (
                <button
                  className={`chip sub-toggle ${locks[benchKey(0, p.id)] ? 'on' : ''}`}
                  onClick={() => onToggleStartingSub(p.id)}
                  title="Start this player on the bench"
                >
                  Sub
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function HalfInput({
  label,
  durations,
  onCommit,
  onRemove,
}: {
  label: string;
  durations: number[];
  onCommit: (d: number[]) => void;
  onRemove?: () => void;
}) {
  const [text, setText] = useState(durations.join(', '));
  useEffect(() => setText(durations.join(', ')), [durations]);
  const commit = () => {
    const parsed = text
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => n > 0 && Number.isFinite(n));
    if (parsed.length && parsed.join(',') !== durations.join(',')) onCommit(parsed);
    else setText(durations.join(', '));
  };
  return (
    <label className="field inline">
      <span>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        title="Period lengths in minutes, comma separated"
      />
      {onRemove && (
        <button className="icon" onClick={onRemove} title="Remove">
          ×
        </button>
      )}
    </label>
  );
}
