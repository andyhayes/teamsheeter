import type { Match } from './db-types';

export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);

/** W, D or L, or null if the score isn't in. */
export function outcome(m: Pick<Match, 'goals_for' | 'goals_against'>): 'W' | 'D' | 'L' | null {
  if (m.goals_for == null || m.goals_against == null) return null;
  return m.goals_for > m.goals_against ? 'W' : m.goals_for < m.goals_against ? 'L' : 'D';
}

export const scoreline = (m: Pick<Match, 'goals_for' | 'goals_against'>) =>
  m.goals_for == null || m.goals_against == null ? '' : `${m.goals_for}–${m.goals_against}`;

export const sideLabel = (side: Match['side']) => (side === 'home' ? 'Home' : side === 'away' ? 'Away' : side === 'neutral' ? 'Neutral' : '');

/** The current season label, e.g. "2026/27" (seasons roll over in July). */
export function currentSeasonLabel(today = new Date()) {
  const y = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

/** The label after this one: "2026/27" → "2027/28". */
export function nextSeasonLabel(label: string) {
  const m = /^(\d{4})\/(\d{2})$/.exec(label);
  if (!m) return '';
  const y = Number(m[1]) + 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

/** "U13" → "U14". */
export const nextAgeGroup = (age: string) => age.replace(/\d+/, (n) => String(Number(n) + 1));

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const per60 = (n: number, minutes: number) => (minutes > 0 ? (n * 60) / minutes : 0);

export const fmt = (n: number, dp = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(dp));
