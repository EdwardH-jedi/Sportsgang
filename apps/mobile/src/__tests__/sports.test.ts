/**
 * Sport registry (lib/sports) tests — ordering, lookups and the label
 * fallbacks every sport surface relies on.
 */

import { BATTLE_SPORTS, sportLabelForBattle } from '../lib/events';
import {
  DEFAULT_SPORT,
  SPORTS,
  SPORT_IDS,
  getSport,
  isSport,
  sportLabel,
} from '../lib/sports';

jest.mock('../lib/api', () => ({ api: {} }));

describe('sport registry', () => {
  it('lists running first, then gym, tennis, golf', () => {
    expect(SPORT_IDS).toEqual(['running', 'gym', 'tennis', 'golf']);
    expect(DEFAULT_SPORT).toBe('running');
  });

  it('has unique ids', () => {
    expect(new Set(SPORT_IDS).size).toBe(SPORTS.length);
  });

  it('isSport narrows only registry ids', () => {
    expect(isSport('running')).toBe(true);
    expect(isSport('golf')).toBe(true);
    expect(isSport('basketball')).toBe(false);
    expect(isSport('toString')).toBe(false);
    expect(isSport(undefined)).toBe(false);
  });

  it('sportLabel returns registry labels and capitalises unknown sports', () => {
    expect(sportLabel('running')).toBe('Running');
    expect(sportLabel('gym')).toBe('Gym');
    expect(sportLabel('tennis')).toBe('Tennis');
    expect(sportLabel('golf')).toBe('Golf');
    expect(sportLabel('basketball')).toBe('Basketball');
  });

  it('maps venue text only to sports with a backend column', () => {
    expect(getSport('gym').venueField).toBe('gymName');
    expect(getSport('golf').venueField).toBe('golfClub');
    expect(getSport('running').venueField).toBeNull();
    expect(getSport('tennis').venueField).toBeNull();
  });
});

describe('battle sports', () => {
  it('puts running first and reuses the registry short labels', () => {
    expect(BATTLE_SPORTS[0]).toEqual({ value: 'running', label: 'Run' });
    expect(sportLabelForBattle('running')).toBe('Run');
    expect(sportLabelForBattle('tennis')).toBe('Tennis');
    expect(sportLabelForBattle('golf')).toBe('Golf');
    expect(sportLabelForBattle('basketball')).toBe('Basketball');
  });

  it('falls back to the registry label, then capitalisation', () => {
    expect(sportLabelForBattle('gym')).toBe('Gym');
    expect(sportLabelForBattle('volleyball')).toBe('Volleyball');
  });
});
