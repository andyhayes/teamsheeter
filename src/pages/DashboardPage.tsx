import { Link } from 'react-router-dom';
import { Empty, ErrorBox, Loading } from '../components/ui';
import { formatDate, outcome, scoreline, sideLabel } from '../lib/format';
import { useMatches, usePlayers, useSeasonSummary, useSeasonTotals, useSheetIds, useSquad, type SquadPlayer } from '../lib/queries';
import { useTeam } from '../lib/team-context';

export function DashboardPage() {
  const { season, teamId, canEdit, path } = useTeam();
  const matches = useMatches(season?.id);
  const summary = useSeasonSummary(season?.id);
  const totals = useSeasonTotals(season?.id);
  const sheets = useSheetIds(teamId);
  const squad = useSquad(season?.id);

  if (matches.isLoading || squad.isLoading) return <Loading />;
  const squadEmpty = !squad.data?.length;
  const today = new Date().toISOString().slice(0, 10);
  const next = (matches.data ?? []).find((m) => m.status === 'fixture' && m.date >= today);
  // Played and postponed matches, most recent first.
  const results = (matches.data ?? []).filter((m) => m.status === 'played' || m.status === 'postponed').reverse();
  const s = summary.data;
  const top = (key: 'goals' | 'assists' | 'potm') =>
    [...(totals.data ?? [])].filter((t) => t[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 3);

  return (
    <main className="page narrow">
      <ErrorBox error={matches.error ?? summary.error ?? totals.error ?? squad.error} />
      {squadEmpty && <SquadSetup />}
      <section className="card next-fixture">
        <h2>Next fixture</h2>
        {next ? (
          <div className="card-head">
            <div>
              <div className="big">vs {next.opponent || 'TBC'}</div>
              <div className="muted">
                {[formatDate(next.date, { weekday: 'long', day: 'numeric', month: 'long' }), next.kickoff?.slice(0, 5), sideLabel(next.side), next.venue].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Link className="button primary" to={path(`matches/${next.id}`)}>
              {sheets.data?.has(next.id) ? 'Team sheet' : canEdit ? 'Make team sheet' : 'View'}
            </Link>
          </div>
        ) : (
          <p className="muted">
            No fixtures coming up.{' '}
            {canEdit && <Link to={path('fixtures')}>Add one</Link>}
          </p>
        )}
      </section>

      {s && (
        <section className="stat-tiles">
          <Tile label="Played" value={s.played} />
          <Tile label="Won" value={s.won} />
          <Tile label="Drawn" value={s.drawn} />
          <Tile label="Lost" value={s.lost} />
          <Tile label="Goals" value={`${s.goals_for}–${s.goals_against}`} />
          <Tile label="Clean sheets" value={s.clean_sheets} />
        </section>
      )}

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <h2>Results</h2>
            <Link to={path('fixtures')} className="small">
              All fixtures
            </Link>
          </div>
          {results.length ? (
            <ul className="fixture-list compact">
              {results.slice(0, 8).map((m) => {
                const o = outcome(m);
                return (
                  <li key={m.id}>
                    <Link to={path(`matches/${m.id}/result`)} className="fixture-main">
                      <span className="fixture-date">{formatDate(m.date, { day: 'numeric', month: 'short' })}</span>
                      <span className="fixture-opp">{m.opponent}</span>
                      {m.status === 'postponed' ? (
                        <span className="result-pill P">Postponed</span>
                      ) : (
                        o && <span className={`result-pill ${o}`}>{o} {scoreline(m)}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No results yet this season.</Empty>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Leaders</h2>
            <Link to={path('season')} className="small">
              All stats
            </Link>
          </div>
          {(
            [
              ['goals', 'Goals'],
              ['assists', 'Assists'],
              ['potm', 'Player of the match'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="leader-group">
              <h3>{label}</h3>
              {top(key).length ? (
                <ol>
                  {top(key).map((t) => (
                    <li key={t.player_id}>
                      <Link to={path(`players/${t.player_id}`)}>{t.player_name}</Link> <b>{t[key]}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted small">None yet</p>
              )}
            </div>
          ))}
        </section>
      </div>

      {!squadEmpty && <SquadSummary squad={squad.data!} />}
    </main>
  );
}

/** Shown at the top of the page until the season has a squad: it's the first thing a team needs. */
function SquadSetup() {
  const { season, teamId, canEdit, path } = useTeam();
  const players = usePlayers(canEdit ? teamId : undefined);
  const earlier = players.data?.length ?? 0;
  return (
    <section className="card squad-setup">
      <h2>Set up the {season?.label} squad</h2>
      {canEdit ? (
        <>
          <p className="muted">
            Add your players and the positions they're happy playing. Team sheets are built from the squad, so do this before
            your first fixture.
            {earlier > 0 && ` ${earlier} player${earlier === 1 ? '' : 's'} from earlier seasons can be added back in one click.`}
          </p>
          <Link className="button primary" to={path('squad')}>
            Set up squad
          </Link>
        </>
      ) : (
        <p className="muted">The coaches haven't added this season's squad yet.</p>
      )}
    </section>
  );
}

function SquadSummary({ squad }: { squad: SquadPlayer[] }) {
  const { canEdit, path } = useTeam();
  const keepers = squad.filter((p) => p.positions.includes('GK')).length;
  const noPositions = squad.filter((p) => !p.positions.length).length;
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          Squad <span className="count">{squad.length} players</span>
        </h2>
        <Link to={path('squad')} className="small">
          {canEdit ? 'Edit squad' : 'View squad'}
        </Link>
      </div>
      {canEdit && (keepers === 0 || noPositions > 0) && (
        <p className="hint squad-nudge">
          {[
            keepers === 0 && 'No one is marked as a keeper (GK).',
            noPositions > 0 && `${noPositions} player${noPositions === 1 ? " has" : 's have'} no preferred positions, so the scheduler will play them anywhere.`,
          ]
            .filter(Boolean)
            .join(' ')}{' '}
          <Link to={path('squad')}>Set positions</Link>
        </p>
      )}
      <ul className="squad-grid">
        {squad.map((p) => (
          <li key={p.id}>
            <Link to={path(`players/${p.id}`)}>{p.name}</Link>
            <span className="muted small">{p.positions.join(' ') || 'Any'}</span>
          </li>
        ))}
      </ul>
    </section>
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
