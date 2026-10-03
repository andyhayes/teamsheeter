import { describe, expect, it } from 'vitest';
import { defaultState, exportState, importState, type AppState } from './storage';

function sampleState(): AppState {
  const state = defaultState();
  const ids = state.fixture.available;
  state.fixture = { ...state.fixture, teamName: 'Appley Bridge', opponent: 'Rovers', venue: 'away' };
  state.schedule = state.fixture.halves.flat().map(() => [ids[0], ...ids.slice(1, 9)]);
  state.scheduleKey = 'key';
  state.locks = { '0:1': ids[1], '0:sub:x': ids[10] };
  state.seed = 7;
  return state;
}

describe('export / import', () => {
  it('round-trips the full state', () => {
    const state = sampleState();
    expect(importState(exportState(state))).toEqual(state);
  });

  it('drops a schedule that does not fit the fixture, and unknown players', () => {
    const state = sampleState();
    const data = JSON.parse(exportState(state));
    data.state.schedule = [['nobody']];
    data.state.fixture.available.push('ghost');
    data.state.locks.bad = 'ghost';
    const next = importState(JSON.stringify(data));
    expect(next.schedule).toBeNull();
    expect(next.scheduleKey).toBe('');
    expect(next.fixture.available).not.toContain('ghost');
    expect(next.locks.bad).toBeUndefined();
  });

  it('falls back to defaults for invalid fixture fields', () => {
    const data = JSON.parse(exportState(sampleState()));
    Object.assign(data.state.fixture, { formationId: 'nope', halves: [[0, -1]], venue: 'moon' });
    const next = importState(JSON.stringify(data));
    expect(next.fixture.formationId).toBe(defaultState().fixture.formationId);
    expect(next.fixture.halves).toEqual(defaultState().fixture.halves);
    expect(next.fixture.venue).toBe('');
  });

  it('rejects files that are not Teamsheeter exports', () => {
    expect(() => importState('not json')).toThrow('not valid JSON');
    expect(() => importState('{"hello":1}')).toThrow('Not a Teamsheeter export');
    expect(() => importState('[{"name":"Sam"}]')).toThrow('Not a Teamsheeter export');
  });
});
