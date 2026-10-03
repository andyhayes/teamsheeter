import { formatMinutes, playerMinutes } from './schedule-utils';
import { fixtureTitle, type Fixture, type Period, type PlayerId, type Schedule } from './types';

/**
 * Tab-separated team sheet laid out like TeamSheetTemplates.xlsx:
 * position column, one column per period with an "HT" column between halves, then subs.
 */
export function scheduleToTsv(
  schedule: Schedule,
  slots: string[],
  periods: Period[],
  squadOrder: PlayerId[],
  names: Map<PlayerId, string>,
  fixture: Fixture,
): string {
  const name = (id: PlayerId | null) => (id ? names.get(id) ?? '' : '');
  const columns: (number | 'HT')[] = [];
  periods.forEach((p, k) => {
    if (k > 0 && p.half !== periods[k - 1].half) columns.push('HT');
    columns.push(k);
  });

  const benches = schedule.map((row) => squadOrder.filter((id) => !row.includes(id)));
  const benchRows = Math.max(0, ...benches.map((b) => b.length));

  const lines: string[][] = [];
  lines.push([fixture.date, fixtureTitle(fixture)]);
  lines.push(['', ...columns.map((c) => (c === 'HT' ? 'HT' : `${formatMinutes(periods[c].duration)} mins`))]);
  slots.forEach((label, s) => {
    lines.push([label, ...columns.map((c) => (c === 'HT' ? label : name(schedule[c][s])))]);
  });
  for (let b = 0; b < benchRows; b++) {
    const label = b === 0 ? 'Subs' : '';
    lines.push([label, ...columns.map((c) => (c === 'HT' ? label : name(benches[c][b] ?? null)))]);
  }

  lines.push([]);
  lines.push(['Player', 'Minutes']);
  const minutes = playerMinutes(schedule, periods, squadOrder);
  for (const id of squadOrder) lines.push([name(id), formatMinutes(minutes.get(id)!.total)]);

  return lines.map((l) => l.join('\t')).join('\n');
}
