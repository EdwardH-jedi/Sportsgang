import { api } from '../lib/api';
import {
  buildCrewQuery,
  createCrew,
  deleteCrew,
  getCrew,
  isLastOwnerError,
  joinCrew,
  leaveCrew,
  listCrews,
  updateCrew,
} from '../lib/crews';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('crews API client', () => {
  it('builds list queries with rounded coords and every filter', () => {
    expect(buildCrewQuery({})).toBe('');
    expect(
      buildCrewQuery({
        lat: -33.87654,
        lng: 151.20712,
        radiusKm: 20,
        sport: 'running',
        q: '  bondi ',
        mine: true,
        limit: 10,
        offset: 20,
      })
    ).toBe(
      '?lat=-33.88&lng=151.21&radius_km=20&sport=running&q=bondi&mine=true&limit=10&offset=20'
    );
  });

  it('drops radius without coords and ignores a lone lat', () => {
    expect(buildCrewQuery({ lat: -33.9, radiusKm: 5 })).toBe('');
  });

  it('calls the crew endpoints', async () => {
    (api.get as jest.Mock).mockResolvedValue({ items: [], total: 0 });
    await listCrews({ mine: true });
    expect(api.get).toHaveBeenCalledWith('/crews?mine=true');
    await getCrew('c1');
    expect(api.get).toHaveBeenCalledWith('/crews/c1');
    await joinCrew('c1');
    expect(api.post).toHaveBeenCalledWith('/crews/c1/join');
    await leaveCrew('c1');
    expect(api.delete).toHaveBeenCalledWith('/crews/c1/membership');
    await deleteCrew('c1');
    expect(api.delete).toHaveBeenCalledWith('/crews/c1');
  });

  it('rounds the crew home point on create and update', async () => {
    await createCrew({ name: 'Dawn Patrol', homeArea: 'Bondi', homeLat: -33.891234, homeLng: 151.274567 });
    expect(api.post).toHaveBeenCalledWith('/crews', {
      name: 'Dawn Patrol',
      homeArea: 'Bondi',
      homeLat: -33.89,
      homeLng: 151.27,
    });
    await updateCrew('c1', { homeLat: null, homeLng: null, paceMinSecPerKm: 300 });
    expect(api.patch).toHaveBeenCalledWith('/crews/c1', {
      homeLat: null,
      homeLng: null,
      paceMinSecPerKm: 300,
    });
  });

  it('recognises the last-owner 409', () => {
    expect(
      isLastOwnerError(
        new Error("You're the crew's only owner. Delete the crew, or wait until the other members have left.")
      )
    ).toBe(true);
    expect(isLastOwnerError(new Error('Crew not found'))).toBe(false);
  });
});
