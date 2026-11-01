import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SortableTable, type Column } from '../components/SortableTable';
import { Empty, ErrorBox, Loading } from '../components/ui';
import type { PlayerMatchRow } from '../lib/db-types';
import { fmt, formatDate, per60 } from '../lib/format';
import { useMatches, usePlayers, useSeasonPlayerMatches } from '../lib/queries';
import { formatMinutes } from '../lib/schedule-utils';
import { useTeam } from '../lib/team-context';

interface Row {
  player_id: string;
  name: string;
  apps: number;
  available: number;
  minutes: number;
  gk: number;
  byPos: Record<string, number>;
  captain: number;
  potm: number;
  saves: number;
  shots: number;
  sot: number;
  assists: number;
  goals: number;
  gf: number;
  ga: number;
}

function totalsFrom(rows: PlayerMatchRow[], nameOf: Map<string, string>): Row[] {
  const by = new Map<string, Row>();
  for (const r of rows) {
    const t =
      by.get(r.player_id) ??
      ({ player_id: r.player_id, name: nameOf.get(r.player_id) ?? '?', apps: 0, available: 0, minutes: 0, gk: 0, byPos: {}, captain: 0, potm: 0, saves: 0, shots: 0, sot: 0, assists: 0, goals: 0, gf: 0, ga: 0 } as Row);
    t.apps += Number(r.minutes) > 0 ? 1 : 0;
    t.available += Number(r.available_minutes);
    t.minutes += Number(r.minutes);
    t.gk += Number(r.gk_minutes);
    for (const [k, v] of Object.entries(r.minutes_by_position)) t.byPos[k] = (t.byPos[k] ?? 0) + v;
    t.captain += r.captain ? 1 : 0;
    t.potm += r.potm ? 1 : 0;
    t.saves += r.saves;
    t.shots += r.shots;
    t.sot += r.shots_on_target;
    t.assists += r.assists;
    t.goals += r.goals;
    t.gf += r.goals_for_on_pitch;
    t.ga += r.goals_against_on_pitch;
    by.set(r.player_id, t);
  }
  return [...by.values()];
}

/** The Season Summary / Player Summary pivots: per-player totals, filterable by match. */
export function SeasonPage() {
  const { season, teamId, path } = useTeam();
  const rows = useSeasonPlayerMatches(season?.id);
  const matches = useMatches(season?.id);
  const players = usePlayers(teamId);
  const [matchFilter, setMatchFilter] = useState<string>('');
  const [mode, setMode] = useState<'totals' | 'per60' | 'positions'>('totals');
  const played = (matches.data ?? []).filter((m) => m.status === 'played');
  const totals = useMemo(() => {
    const names = new Map((players.data ?? []).map((p) => [p.id, p.name]));
    return totalsFrom((rows.data ?? []).filter((r) => !matchFilter || r.match_id === matchFilter), names);
  }, [rows.data, players.data, matchFilter]);

  if (rows.isLoading) return <Loading what="stats" />;
  return (
    <main className="page">
      <ErrorBox error={rows.error} />
      <div className="toolbar">
        <h1>{season?.label} stats</h1>
        <select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)} aria-label="Match">
          <option value="">All {played.length} played matches</option>
          {played.map((m) => (
            <option key={m.id} value={m.id}>
              {formatDate(m.date, { day: 'numeric', month: 'short' })} vs {m.opponent}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button className={mode === 'totals' ? 'on' : ''} onClick={() => setMode('totals')}>
            Totals
          </button>
          <button className={mode === 'per60' ? 'on' : ''} onClick={() => setMode('per60')}>
            Per 60 min
          </button>
          <button className={mode === 'positions' ? 'on' : ''} onClick={() => setMode('positions')}>
            Minutes by position
          </button>
        </div>
      </div>
      {totals.length === 0 ? (
        <Empty>No stats recorded yet. Enter them on each played match's Stats tab.</Empty>
      ) : (
        <PlayerTable rows={totals} mode={mode} link={(id) => path(`players/${id}`)} />
      )}
    </main>
  );
}

function PlayerTable({ rows, mode, link }: { rows: Row[]; mode: 'totals' | 'per60' | 'positions'; link: (id: string) => string }) {
  const nameCol: Column<Row> = { key: 'name', label: 'Player', numeric: false, value: (r) => r.name, render: (r) => <Link to={link(r.player_id)}>{r.name}</Link> };
  let columns: Column<Row>[];
  if (mode === 'positions') {
    const positions = [...new Set(rows.flatMap((r) => Object.keys(r.byPos)))].sort(positionOrder);
    columns = [
      nameCol,
      { key: 'minutes', label: 'Total', value: (r) => r.minutes, render: (r) => formatMinutes(r.minutes) },
      ...positions.map((p): Column<Row> => ({ key: p, label: p, value: (r) => r.byPos[p] ?? 0, render: (r) => (r.byPos[p] ? formatMinutes(r.byPos[p]) : '') })),
    ];
  } else if (mode === 'per60') {
    const rate = (k: keyof Row, label: string): Column<Row> => ({
      key: String(k),
      label,
      value: (r) => per60(r[k] as number, k === 'saves' ? r.gk : r.minutes),
      render: (r) => fmt(per60(r[k] as number, k === 'saves' ? r.gk : r.minutes), 2),
    });
    columns = [
      nameCol,
      { key: 'minutes', label: 'Minutes', value: (r) => r.minutes, render: (r) => formatMinutes(r.minutes) },
      rate('goals', 'Goals'),
      rate('assists', 'Assists'),
      rate('shots', 'Shots'),
      rate('sot', 'On target'),
      { ...rate('saves', 'Saves'), title: 'Per 60 minutes in goal' },
      rate('gf', 'GF on pitch'),
      rate('ga', 'GA on pitch'),
    ];
  } else {
    columns = [
      nameCol,
      { key: 'apps', label: 'Apps', value: (r) => r.apps },
      { key: 'minutes', label: 'Minutes', title: 'Minutes played (of minutes available)', value: (r) => r.minutes, render: (r) => `${formatMinutes(r.minutes)}${r.available ? ` / ${formatMinutes(r.available)}` : ''}` },
      { key: 'gk', label: 'GK min', value: (r) => r.gk, render: (r) => (r.gk ? formatMinutes(r.gk) : '') },
      { key: 'goals', label: 'Goals', value: (r) => r.goals },
      { key: 'assists', label: 'Assists', value: (r) => r.assists },
      { key: 'shots', label: 'Shots', value: (r) => r.shots },
      { key: 'sot', label: 'On target', value: (r) => r.sot },
      { key: 'saves', label: 'Saves', value: (r) => r.saves },
      { key: 'potm', label: 'PotM', title: 'Player of the match', value: (r) => r.potm },
      { key: 'captain', label: 'Capt.', title: 'Captain', value: (r) => r.captain },
      { key: 'pm', label: '+/−', title: 'Goal difference while on the pitch', value: (r) => r.gf - r.ga, render: (r) => `${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}` },
    ];
  }
  return <SortableTable rows={rows} columns={columns} rowKey={(r) => r.player_id} initialSort={mode === 'positions' ? 'minutes' : 'goals'} />;
}

const ORDER = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'LM', 'CM', 'RM', 'CAM', 'LW', 'RW', 'ST'];
const positionOrder = (a: string, b: string) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);
