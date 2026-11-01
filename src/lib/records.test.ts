import { describe, expect, it } from 'vitest';
import { matchRecords, playerRecords } from './records';

// The first six league results of 2026/27.
const matches = [
  { date: '2026-09-06', opponent: 'Wigan Junior Latics Yellows', goals_for: 1, goals_against: 2 },
  { date: '2026-09-13', opponent: 'East Leigh Titans', goals_for: 1, goals_against: 5 },
  { date: '2026-09-20', opponent: 'FC Britannia White', goals_for: 1, goals_against: 5 },
  { date: '2026-09-27', opponent: 'Cherrybrook Robins', goals_for: 6, goals_against: 1 },
  { date: '2026-10-04', opponent: 'Vulcan Football Club Rovers', goals_for: 4, goals_against: 2 },
  { date: '2026-10-11', opponent: 'FC Sparta Barca', goals_for: 3, goals_against: 1 },
];

describe('matchRecords', () => {
  it('finds biggest wins, defeats (with ties) and runs', () => {
    const r = Object.fromEntries(matchRecords(matches).map((e) => [e.title, e]));
    expect(r['Biggest win']).toEqual({ title: 'Biggest win', value: '+5', holders: ['vs Cherrybrook Robins, 6–1 (2026-09-27)'] });
    expect(r['Heaviest defeat'].holders).toHaveLength(2);
    expect(r['Highest-scoring match'].value).toBe('7');
    expect(r['Longest winning run'].value).toBe('3 matches');
    expect(r['Most clean sheets in a row']).toBeUndefined();
  });

  it('ignores matches without a score', () => {
    expect(matchRecords([{ date: '2026-01-01', opponent: 'X', goals_for: null, goals_against: null }])).toEqual([]);
  });
});

describe('playerRecords', () => {
  it('combines app and pre-app seasons, matching older seasons by name', () => {
    const seasons = [
      { season_label: '2021/22', player_id: null, player_name: 'Jax', appearances: 19, goals: 36, assists: 3, saves: 10 },
      { season_label: '2022/23', player_id: 'jax', player_name: 'Jax', appearances: 19, goals: 32, assists: 4, saves: 2 },
      { season_label: '2026/27', player_id: 'ethan', player_name: 'Ethan', appearances: 6, goals: 7, assists: 1, saves: 0 },
    ];
    const r = Object.fromEntries(playerRecords(seasons, [], (id) => id).map((e) => [e.title, e]));
    expect(r['Most goals in a season']).toMatchObject({ value: '36', holders: ['Jax · 2021/22'] });
    expect(r['Most goals (all time)']).toMatchObject({ value: '68', holders: ['Jax'] });
    expect(r['Most appearances (all time)']).toMatchObject({ value: '38' });
  });
});
