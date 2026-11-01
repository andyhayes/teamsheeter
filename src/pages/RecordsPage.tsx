import { useMemo, useState } from 'react';
import { Empty, ErrorBox, Loading } from '../components/ui';
import { useMyTeams, usePlayedMatches, usePlayerSeasonsAll, useTeamsPlayerMatches, useTeamsPlayers } from '../lib/queries';
import { matchRecords, playerRecords, type RecordEntry } from '../lib/records';
import { useTeam } from '../lib/team-context';

/**
 * Team records (the Club Records sheet), and across all of the user's teams at the club.
 * The club view only ever includes teams the user belongs to.
 */
export function RecordsPage() {
  const { teamId, season, membership } = useTeam();
  const myTeams = useMyTeams();
  const clubTeams = (myTeams.data ?? []).filter((t) => t.club_id === membership.club_id);
  const [scope, setScope] = useState<'team' | 'season' | 'club'>('team');
  const teamIds = useMemo(() => (scope === 'club' ? clubTeams.map((t) => t.team_id) : [teamId]), [scope, clubTeams, teamId]);
  const teamName = new Map(clubTeams.map((t) => [t.team_id, t.team_name]));

  const matches = usePlayedMatches(teamIds);
  const seasons = usePlayerSeasonsAll(teamIds);
  const playerMatches = useTeamsPlayerMatches(teamIds);
  const players = useTeamsPlayers(teamIds);

  const records = useMemo(() => {
    const names = new Map((players.data ?? []).map((p) => [p.id, p.name]));
    let ms = matches.data ?? [];
    let ss = seasons.data ?? [];
    let pm = playerMatches.data ?? [];
    if (scope === 'season' && season) {
      ms = ms.filter((m) => m.season_id === season.id);
      ss = ss.filter((s) => !s.legacy && s.season_label === season.label);
      pm = pm.filter((r) => r.season_id === season.id);
    }
    const labelled = ms.map((m) => ({ ...m, teamName: scope === 'club' ? teamName.get(m.team_id) : undefined }));
    return {
      team: matchRecords(labelled),
      players: playerRecords(ss, pm, (id) => names.get(id) ?? '?'),
    };
  }, [matches.data, seasons.data, playerMatches.data, players.data, scope, season]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = matches.isLoading || seasons.isLoading || playerMatches.isLoading;
  return (
    <main className="page narrow">
      <ErrorBox error={matches.error ?? seasons.error ?? playerMatches.error} />
      <div className="toolbar">
        <h1>Records</h1>
        <div className="segmented">
          <button className={scope === 'team' ? 'on' : ''} onClick={() => setScope('team')}>
            All time
          </button>
          <button className={scope === 'season' ? 'on' : ''} onClick={() => setScope('season')}>
            {season?.label ?? 'This season'}
          </button>
          {clubTeams.length > 1 && (
            <button className={scope === 'club' ? 'on' : ''} onClick={() => setScope('club')} title={`Across your ${clubTeams.length} teams at ${membership.club_name}`}>
              Your teams at {membership.club_name}
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="two-col">
          <RecordList title="Team" records={records.team} />
          <RecordList title="Players" records={records.players} />
        </div>
      )}
    </main>
  );
}

function RecordList({ title, records }: { title: string; records: RecordEntry[] }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {records.length ? (
        <dl className="records">
          {records.map((r) => (
            <div key={r.title} className="record">
              <dt>{r.title}</dt>
              <dd>
                <b>{r.value}</b>
                {r.holders.map((h) => (
                  <span key={h} className="holder">
                    {h}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <Empty>Nothing yet.</Empty>
      )}
    </section>
  );
}
