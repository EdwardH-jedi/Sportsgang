/* Regression acceptance probe, deliberately outside the application test tree. */
jest.mock('/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2/apps/mobile/src/lib/api.ts', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() }, BASE_URL: 'http://review.test',
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}) }));
const { api } = require('/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2/apps/mobile/src/lib/api.ts');
const { useExploreStore } = require('/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2/apps/mobile/src/stores/explore.ts');
const { useProfileStore } = require('/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2/apps/mobile/src/stores/profile.ts');

beforeEach(() => { jest.clearAllMocks(); useExploreStore.getState().reset(); useProfileStore.getState().reset(); });

test('preference save must invalidate a ready compatibility feed before returning to Explore', async () => {
  const oldCard = { userId: 'old-fit', displayName: 'Old Fit', sportProfiles: [], compatibility: { tier: 'compatible', reasons: [{ code: 'pace_overlap', text: 'Old pace overlaps' }], caveats: [] } };
  api.get.mockResolvedValueOnce({ items: [oldCard], total: 1 });
  await useExploreStore.getState().loadFeed();
  api.post.mockResolvedValueOnce({ id: 'own', sport: 'running', preferencesVersion: 2, runPaceMode: 'match_pace', runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 });
  await useProfileStore.getState().upsertSportProfile({ sport: 'running', level: 'intermediate', preferencesVersion: 2, runPaceMode: 'match_pace', runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 });
  api.get.mockResolvedValueOnce({ items: [], total: 0 });
  await useExploreStore.getState().loadFeed();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(useExploreStore.getState().feed.items).toEqual([]);
});

test('a manual forced refresh retrieves changed compatibility (control)', async () => {
  api.get.mockResolvedValue({ items: [], total: 0 });
  await useExploreStore.getState().loadFeed();
  await useExploreStore.getState().loadFeed({ force: true });
  expect(api.get).toHaveBeenCalledTimes(2);
});

test('pace removal must release an active strict filter so general browsing remains usable', async () => {
  useExploreStore.getState().setStrictPace(true);
  api.post.mockResolvedValueOnce({ id: 'own', sport: 'running', preferencesVersion: 2, runPaceMode: 'social', runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null });
  await useProfileStore.getState().upsertSportProfile({ sport: 'running', level: 'intermediate', preferencesVersion: 2, runPaceMode: 'social', runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null });
  expect(useExploreStore.getState().strictPace).toBe(false);
});
