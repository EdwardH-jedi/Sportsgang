/**
 * Pure tests for the v2 preference form state (components/preferences/formState).
 * Payload shape follows docs/run-golf-v2/CONTRACTS.md §2.
 */

import type { SportProfile } from '@protin/shared-types';

import {
  buildUpsert,
  emptyGolfForm,
  emptyRunForm,
  golfFormFromProfile,
  runFormFromProfile,
  toggleTime,
  validateGolfForm,
  validateRunForm,
  validateTimes,
  type GolfFormState,
  type RunFormState,
} from '../components/preferences/formState';

const GOLF: GolfFormState = {
  level: 'advanced',
  handicapSource: 'official_index',
  handicapText: '+2.1',
  experience: 'regular',
  intents: ['welcome_beginners', 'similar_level'],
  toleranceTenths: 80,
  holes: '18',
};

const RUN: RunFormState = {
  level: 'intermediate',
  paceMode: 'match_pace',
  paceFastest: '5:30',
  paceSlowest: '6:15',
  distances: [10, 5],
  groupStyle: 'stay_together',
};

function row(overrides: Partial<SportProfile>): SportProfile {
  return {
    id: 'sp1',
    userId: 'u1',
    sport: 'golf',
    level: 'beginner',
    preferredTimes: ['morning'],
    updatedAt: '2026-10-01T00:00:00Z',
    preferencesVersion: null,
    golfHandicapTenths: null,
    golfHandicapSource: null,
    golfExperience: null,
    golfPartnerIntents: null,
    golfSimilarityToleranceTenths: null,
    golfPreferredHoles: null,
    runPaceMode: null,
    runPaceMinSecPerKm: null,
    runPaceMaxSecPerKm: null,
    runDistancesKm: null,
    runGroupStyle: null,
    ...overrides,
  };
}

describe('validateGolfForm', () => {
  it('stores a plus handicap as negative tenths and marks the row v2', () => {
    const result = validateGolfForm(GOLF);
    expect(result).toEqual({
      ok: true,
      fields: {
        sport: 'golf',
        level: 'advanced',
        preferencesVersion: 2,
        golfHandicapTenths: -21,
        golfHandicapSource: 'official_index',
        golfExperience: 'regular',
        golfPartnerIntents: ['welcome_beginners', 'similar_level'],
        golfSimilarityToleranceTenths: 80,
        golfPreferredHoles: '18',
      },
    });
  });

  it('sends an explicit null handicap for "no handicap" (never an invented number)', () => {
    const result = validateGolfForm({ ...GOLF, handicapSource: 'none', handicapText: '' });
    expect(result.ok && result.fields.golfHandicapTenths).toBeNull();
    expect(result.ok && result.fields.golfHandicapSource).toBe('none');
  });

  it('clears the tolerance when "similar level" is not chosen', () => {
    const result = validateGolfForm({ ...GOLF, intents: ['any_level'], toleranceTenths: 80 });
    expect(result.ok && result.fields.golfSimilarityToleranceTenths).toBeNull();
  });

  it('never carries running fields', () => {
    const result = validateGolfForm(GOLF);
    expect(result.ok && Object.keys(result.fields).some((k) => k.startsWith('run'))).toBe(false);
  });

  it.each([
    [{ level: null }, 'Choose your overall level.'],
    [{ handicapSource: null }, 'Choose your handicap situation.'],
    [{ handicapText: '' }, 'Enter your handicap.'],
    [{ handicapText: '-2.1' }, 'Use + for a plus handicap (e.g. +2.1).'],
    [{ handicapText: '60' }, 'Handicaps run from +10.0 to 54.0.'],
    [{ experience: null }, 'Choose your golf experience.'],
    [{ intents: [] }, 'Choose at least one kind of golf partner.'],
  ] as [Partial<GolfFormState>, string][])('rejects %j', (patch, error) => {
    expect(validateGolfForm({ ...GOLF, ...patch })).toEqual({ ok: false, error });
  });
});

describe('validateRunForm', () => {
  it('stores pace as integer seconds per km and sorts distances', () => {
    const result = validateRunForm(RUN);
    expect(result).toEqual({
      ok: true,
      fields: {
        sport: 'running',
        level: 'intermediate',
        preferencesVersion: 2,
        runPaceMode: 'match_pace',
        runPaceMinSecPerKm: 330,
        runPaceMaxSecPerKm: 375,
        runDistancesKm: [5, 10],
        runGroupStyle: 'stay_together',
      },
    });
  });

  it('rejects "6.30" instead of storing it as a decimal', () => {
    const result = validateRunForm({ ...RUN, paceFastest: '6.30' });
    expect(result.ok).toBe(false);
  });

  it('requires a range to match pace', () => {
    expect(validateRunForm({ ...RUN, paceFastest: '', paceSlowest: '' })).toEqual({
      ok: false,
      error: 'Matching pace needs your comfortable pace range.',
    });
  });

  it('rejects an inverted range', () => {
    const result = validateRunForm({ ...RUN, paceFastest: '6:30', paceSlowest: '5:30' });
    expect(result.ok).toBe(false);
  });

  it('lets a social runner leave pace empty — social is not pace zero', () => {
    const result = validateRunForm({ ...RUN, paceMode: 'social', paceFastest: '', paceSlowest: '', distances: [] });
    expect(result.ok && result.fields.runPaceMinSecPerKm).toBeNull();
    expect(result.ok && result.fields.runPaceMaxSecPerKm).toBeNull();
    expect(result.ok && result.fields.runDistancesKm).toBeNull();
  });

  it('rejects a half-filled social pace', () => {
    const result = validateRunForm({ ...RUN, paceMode: 'social', paceSlowest: '' });
    expect(result.ok).toBe(false);
  });

  it('never carries golf fields', () => {
    const result = validateRunForm(RUN);
    expect(result.ok && Object.keys(result.fields).some((k) => k.startsWith('golf'))).toBe(false);
  });
});

describe('prefill from stored rows', () => {
  it('round-trips a configured golf row through the form', () => {
    const stored = row({
      level: 'advanced',
      preferencesVersion: 2,
      golfHandicapTenths: -21,
      golfHandicapSource: 'official_index',
      golfExperience: 'regular',
      golfPartnerIntents: ['welcome_beginners'],
      golfPreferredHoles: '9',
    });
    const form = golfFormFromProfile(stored);
    expect(form.handicapText).toBe('+2.1');
    const result = validateGolfForm(form);
    expect(result.ok && result.fields.golfHandicapTenths).toBe(-21);
  });

  it('round-trips a running row', () => {
    const stored = row({
      sport: 'running',
      runPaceMode: 'match_pace',
      runPaceMinSecPerKm: 305,
      runPaceMaxSecPerKm: 390,
      runDistancesKm: [21.1],
    });
    const form = runFormFromProfile(stored);
    expect(form.paceFastest).toBe('5:05');
    expect(form.paceSlowest).toBe('6:30');
    expect(form.distances).toEqual([21.1]);
  });

  it('a legacy row only contributes its level', () => {
    expect(golfFormFromProfile(row({ level: 'intermediate' }))).toEqual({ ...emptyGolfForm(), level: 'intermediate' });
    expect(runFormFromProfile(null)).toEqual(emptyRunForm());
  });
});

describe('buildUpsert', () => {
  it('echoes legacy golfClub/goals so the full-replace legacy fields are not wiped', () => {
    const result = validateGolfForm(GOLF);
    if (!result.ok) throw new Error('expected ok');
    const body = buildUpsert(result.fields, ['morning'], row({ golfClub: 'Moore Park', goals: 'Break 90' }));
    expect(body.golfClub).toBe('Moore Park');
    expect(body.goals).toBe('Break 90');
    expect(body.preferredTimes).toEqual(['morning']);
  });

  it('adds no legacy keys for a brand-new row', () => {
    const result = validateRunForm(RUN);
    if (!result.ok) throw new Error('expected ok');
    const body = buildUpsert(result.fields, ['evening'], null);
    expect(body).not.toHaveProperty('golfClub');
    expect(body).not.toHaveProperty('goals');
  });
});

describe('availability', () => {
  it('Flexible is exclusive with specific times', () => {
    expect(toggleTime(['morning', 'evening'], 'flexible')).toEqual(['flexible']);
    expect(toggleTime(['flexible'], 'morning')).toEqual(['morning']);
    expect(toggleTime(['morning'], 'morning')).toEqual([]);
  });

  it('requires at least one choice', () => {
    expect(validateTimes([])).not.toBeNull();
    expect(validateTimes(['flexible'])).toBeNull();
  });
});
