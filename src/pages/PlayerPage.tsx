import { Link, useParams } from 'react-router-dom';
import { SortableTable } from '../components/SortableTable';
import { Empty, ErrorBox, Loading } from '../components/ui';
import type { PlayerMatchRow, PlayerSeasonAll } from '../lib/db-types';
import { formatDate } from '../lib/format';
import { usePlayerMatches, usePlayerSeasonsAll, usePlayers } from '../lib/queries';
import { formatMinutes } from '../lib/schedule-utils';
import { useTeam } from '../lib/team-context';

export function PlayerPage() {
  const { playerId } = useParams();
  const { teamId, season, path } = useTeam();
  const players = usePlayers(teamId);
  const matches = usePlayerMatches(playerId);
  const seasons = usePlayerSeasonsAll([teamId]);
  const player = players.data?.find((p) => p.id === playerId);

  if (players.isLoading) return <Loading />;
  if (!player) return <main className="page narrow"><Empty>Player not found.</Empty></main>;

  const lowerName = player.name.toLowerCase();
  const mySeasons = (seasons.data ?? []).filter((s) => s.player_id === player.id || (!s.player_id && s.player_name.toLowerCase() === lowerName));
  const thisSeason = (matches.data ?? []).filter((m) => m.season_id === season?.id);
  const byPos: Record<string, number> = {};
  for (const m of thisSeason) for (const [k, v] of Object.entries(m.minutes_by_position)) byPos[k] = (byPos[k] ?? 0) + v;
  const totalMins = Object.values(byPos).reduce((a, b) => a + b, 0);
  const sum = (k: keyof PlayerSeasonAll) => mySeasons.reduce((a, s) => a + (s[k] as number), 0);

  return (
    <main className="page narrow">
      <ErrorBox error={matches.error ?? seasons.error} />
      <h1>{player.name}</h1>
      <p className="muted">
        {player.positions.length ? `Prefers ${player.positions.join(', ')}` : 'Happy anywhere'}
        {!player.active && ' · no longer active'}
      </p>

      <section className="stat-tiles">
        <Tile label="Appearances (all time)" value={sum('appearances')} />
        <Tile label="Goals" value={sum('goals')} />
        <Tile label="Assists" value={sum('assists')} />
        <Tile label="Saves" value={sum('saves')} />
      </section>

      {totalMins > 0 && (
        <section className="card">
          <h2>Positions played in {season?.label}</h2>
          <div className="position-bars">
            {Object.entries(byPos)
              .sort((a, b) => b[1] - a[1])
              .map(([pos, mins]) => (
                <div key={pos} className="position-bar">
                  <span className="pos-label">{pos}</span>
                  <span className="bar">
                    <span className={`fill ${pos === 'GK' ? 'gk' : ''}`} style={{ width: `${(mins / totalMins) * 100}%` }} />
                  </span>
                  <span className="mins">{formatMinutes(mins)}′</span>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>By season</h2>
        {mySeasons.length ? (
          <SortableTable
            rows={mySeasons}
            rowKey={(s) => `${s.season_label}-${s.legacy}`}
            initialSort="season"
            columns={[
              { key: 'season', label: 'Season', numeric: false, value: (s) => s.season_label, render: (s) => `${s.season_label}${s.age_group ? ` (${s.age_group})` : ''}` },
              { key: 'apps', label: 'Apps', value: (s) => s.appearances },
              { key: 'goals', label: 'Goals', value: (s) => s.goals },
              { key: 'assists', label: 'Assists', value: (s) => s.assists },
              { key: 'shots', label: 'Shots', value: (s) => s.shots },
              { key: 'sot', label: 'On target', value: (s) => s.shots_on_target },
              { key: 'saves', label: 'Saves', value: (s) => s.saves },
            ]}
          />
        ) : (
          <Empty>No stats yet.</Empty>
        )}
      </section>

      <section className="card">
        <h2>Matches</h2>
        {matches.data?.length ? (
          <SortableTable<PlayerMatchRow>
            rows={matches.data}
            rowKey={(m) => m.match_id}
            initialSort="date"
            columns={[
              { key: 'date', label: 'Date', numeric: false, value: (m) => m.date, render: (m) => formatDate(m.date, { day: 'numeric', month: 'short', year: '2-digit' }) },
              { key: 'opp', label: 'Opponent', numeric: false, value: (m) => m.opponent, render: (m) => <Link to={path(`matches/${m.match_id}/stats`)}>{m.opponent}</Link> },
              { key: 'min', label: 'Min', value: (m) => Number(m.minutes), render: (m) => (m.available ? formatMinutes(Number(m.minutes)) : 'n/a') },
              { key: 'pos', label: 'Positions', numeric: false, value: (m) => Object.keys(m.minutes_by_position).join(' ') },
              { key: 'goals', label: 'G', title: 'Goals', value: (m) => m.goals },
              { key: 'assists', label: 'A', title: 'Assists', value: (m) => m.assists },
              { key: 'saves', label: 'Sv', title: 'Saves', value: (m) => m.saves },
              { key: 'potm', label: '★', title: 'Player of the match', value: (m) => (m.potm ? 1 : 0), render: (m) => (m.potm ? '★' : '') },
            ]}
          />
        ) : (
          <Empty>No played matches recorded.</Empty>
        )}
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
