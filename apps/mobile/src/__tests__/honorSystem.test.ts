/**
 * Honor System (local champion titles) read-only API client tests.
 *
 * Asserts the four GET helpers target the documented backend paths and
 * pin the read-only contract: no mutation helper is exported, and the
 * mobile client surface contains no `post`, `put`, `patch`, or
 * `delete` calls against the Honor System routes.
 */

import * as honorSystem from '../lib/honorSystem';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe('honor system API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getMyRank hits GET /rankings/me with sport and area', async () => {
    mockGet.mockResolvedValueOnce({
      id: null,
      userId: 'u-1',
      sport: 'tennis',
      area: 'annandale',
      rating: 1000,
      wins: 0,
      losses: 0,
      streak: 0,
      lastPlayedAt: null,
      createdAt: null,
      updatedAt: null,
    });
    const out = await honorSystem.getMyRank('tennis', 'annandale');
    expect(mockGet).toHaveBeenCalledWith(
      '/rankings/me?sport=tennis&area=annandale'
    );
    expect(out.rating).toBe(1000);
  });

  it('getRankings hits GET /rankings with sport and area', async () => {
    mockGet.mockResolvedValueOnce({
      sport: 'tennis',
      area: 'annandale',
      items: [],
      total: 0,
    });
    const out = await honorSystem.getRankings('tennis', 'annandale');
    expect(mockGet).toHaveBeenCalledWith(
      '/rankings?sport=tennis&area=annandale'
    );
    expect(out.total).toBe(0);
  });

  it('getCurrentHonor hits GET /honors with sport and area and tolerates null', async () => {
    mockGet.mockResolvedValueOnce(null);
    const out = await honorSystem.getCurrentHonor('tennis', 'annandale');
    expect(mockGet).toHaveBeenCalledWith(
      '/honors?sport=tennis&area=annandale'
    );
    expect(out).toBeNull();
  });

  it('getMyHonors hits GET /honors/me', async () => {
    mockGet.mockResolvedValueOnce([]);
    const out = await honorSystem.getMyHonors();
    expect(mockGet).toHaveBeenCalledWith('/honors/me');
    expect(out).toEqual([]);
  });

  it('URL-encodes sport and area values', async () => {
    mockGet.mockResolvedValue({});
    await honorSystem.getMyRank('table tennis', 'st. peters');
    expect(mockGet).toHaveBeenCalledWith(
      '/rankings/me?sport=table+tennis&area=st.+peters'
    );
  });

  it('exports no mutation helpers and never calls write verbs', async () => {
    mockGet.mockResolvedValue({});
    await honorSystem.getMyRank('tennis', 'annandale');
    await honorSystem.getRankings('tennis', 'annandale');
    await honorSystem.getCurrentHonor('tennis', 'annandale');
    await honorSystem.getMyHonors();

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();

    // Module exports must not contain a function whose name implies
    // a mutation. This pins the read-only contract — adding a public
    // submit/post/transfer/result helper here is the regression we
    // want to fail loudly.
    const exportedKeys = Object.keys(honorSystem);
    for (const key of exportedKeys) {
      expect(/post|submit|transfer|result|create|update|delete/i.test(key)).toBe(
        false
      );
    }
  });
});

describe('honor system scope helpers', () => {
  it('areaFromSuburb lowercases and collapses whitespace', () => {
    expect(honorSystem.areaFromSuburb('Annandale')).toBe('annandale');
    expect(honorSystem.areaFromSuburb('  Balmain   East ')).toBe('balmain east');
  });

  it('areaFromSuburb returns null without a usable suburb', () => {
    expect(honorSystem.areaFromSuburb(null)).toBeNull();
    expect(honorSystem.areaFromSuburb(undefined)).toBeNull();
    expect(honorSystem.areaFromSuburb('   ')).toBeNull();
  });

  it('primarySport picks the first sport profile, else running', () => {
    expect(
      honorSystem.primarySport([{ sport: 'golf' }, { sport: 'running' }])
    ).toBe('golf');
    expect(honorSystem.primarySport([])).toBe('running');
    expect(honorSystem.primarySport(null)).toBe('running');
  });
});
