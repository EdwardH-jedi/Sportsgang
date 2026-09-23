import {
  formatDistanceAway,
  formatKm,
  formatPace,
  formatPaceWithUnit,
  paceBandText,
  paceBandValue,
  parseKm,
  parsePace,
  validatePaceBand,
} from '../lib/pace';

describe('pace formatting', () => {
  it('formats seconds per km as m:ss', () => {
    expect(formatPace(330)).toBe('5:30');
    expect(formatPace(305)).toBe('5:05');
    expect(formatPace(600)).toBe('10:00');
    expect(formatPace(null)).toBe('');
    expect(formatPaceWithUnit(330)).toBe('5:30 /km');
    expect(formatPaceWithUnit(undefined)).toBe('');
  });

  it('parses m:ss, m.ss and whole minutes', () => {
    expect(parsePace('5:30')).toBe(330);
    expect(parsePace('5.30')).toBe(330);
    expect(parsePace('6')).toBe(360);
    expect(parsePace(' 4:05 ')).toBe(245);
  });

  it('rejects malformed pace text', () => {
    expect(parsePace('')).toBeNull();
    expect(parsePace('5:3')).toBeNull();
    expect(parsePace('5:75')).toBeNull();
    expect(parsePace('fast')).toBeNull();
  });

  it('builds pace band copy for every bound combination', () => {
    expect(paceBandText(300, 360)).toBe('5:00–6:00 /km');
    expect(paceBandText(330, 330)).toBe('5:30 /km');
    expect(paceBandText(300, null)).toBe('From 5:00 /km');
    expect(paceBandText(null, 360)).toBe('Up to 6:00 /km');
    expect(paceBandText(null, null)).toBeNull();
    expect(paceBandValue(300, 360)).toBe('5:00–6:00');
    expect(paceBandValue(300, null)).toBe('5:00+');
    expect(paceBandValue(null, null)).toBeNull();
  });
});

describe('validatePaceBand', () => {
  it('accepts empty fields as no band', () => {
    expect(validatePaceBand('', '')).toEqual({ min: null, max: null, error: null });
  });

  it('accepts a valid band', () => {
    expect(validatePaceBand('5:00', '6:15')).toEqual({ min: 300, max: 375, error: null });
  });

  it('flags malformed, out-of-range and inverted bands', () => {
    expect(validatePaceBand('5:7', '').error).toMatch(/minutes:seconds/);
    expect(validatePaceBand('2:00', '').error).toMatch(/between 2:30 and 15:00/);
    expect(validatePaceBand('', '16:00').error).toMatch(/between/);
    expect(validatePaceBand('6:00', '5:00').error).toBe('The faster pace must come first.');
  });
});

describe('distance formatting', () => {
  it('formats km with at most one decimal', () => {
    expect(formatKm(5)).toBe('5');
    expect(formatKm(5.25)).toBe('5.3');
    expect(formatKm(21.1)).toBe('21.1');
    expect(formatKm(null)).toBe('');
  });

  it('formats a coarse distance away', () => {
    expect(formatDistanceAway(2)).toBe('2 km away');
    expect(formatDistanceAway(1.5)).toBe('1.5 km away');
    expect(formatDistanceAway(0.4)).toBe('Under 1 km away');
    expect(formatDistanceAway(null)).toBeNull();
  });

  it('parses distance input', () => {
    expect(parseKm('5')).toBe(5);
    expect(parseKm('10.5')).toBe(10.5);
    expect(parseKm('21,1')).toBe(21.1);
    expect(parseKm('')).toBeNull();
    expect(parseKm('ten')).toBeNull();
  });
});
