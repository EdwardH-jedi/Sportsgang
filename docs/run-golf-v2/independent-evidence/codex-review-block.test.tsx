/**
 * PartnerDetailScreen — reads the card the Explore feed loaded, shows the
 * sport details + every reason/caveat, and "Show interest" uses the
 * existing like (mutual → existing chat), never an invitation inbox.
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { PartnerDetailScreen } from '../screens/explore/PartnerDetailScreen';
import { useExploreStore } from '../stores/explore';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://api.test',
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

const golfer = {
  userId: 'g1',
  displayName: 'Morgan',
  suburb: 'Bondi',
  bio: 'Weekend golfer, happy to help newer players.',
  photoUrls: [],
  sportProfiles: [
    {
      sport: 'golf',
      level: 'advanced',
      preferencesConfigured: true,
      preferredTimes: ['morning', 'afternoon'],
      golfHandicapTenths: -21,
      golfHandicapSource: 'official_index',
      golfExperience: 'regular',
      golfPartnerIntents: ['welcome_beginners'],
      golfPreferredHoles: '18',
      runPaceMode: null,
      runPaceMinSecPerKm: null,
      runPaceMaxSecPerKm: null,
      runDistancesKm: null,
      runGroupStyle: null,
    },
  ],
  compatibility: {
    tier: 'compatible',
    reasons: [
      { code: 'more_experienced', text: 'More experienced than you (plays regularly vs driving-range experience)' },
      { code: 'welcomes_beginners', text: 'Welcomes beginners' },
    ],
    caveats: [{ code: 'handicap_self_reported', text: 'Handicaps are self-reported, not verified' }],
  },
};

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

async function loadGolfFeed() {
  useExploreStore.getState().reset();
  useExploreStore.getState().setFocusSport('golf');
  mockGet.mockResolvedValueOnce({ items: [golfer], total: 1, limit: 20, offset: 0, nextCursor: null });
  await useExploreStore.getState().loadFeed();
}

function renderDetail(userId = 'g1', sport: 'golf' | 'running' = 'golf') {
  return render(
    <PartnerDetailScreen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigation={navigation as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      route={{ key: 'PartnerDetail', name: 'PartnerDetail', params: { userId, sport } } as any}
    />
  );
}


beforeEach(async()=>{jest.clearAllMocks();await loadGolfFeed();});
afterEach(()=>jest.restoreAllMocks());
it('PROOF: pre-block feed response arriving last resurrects the blocked card',async()=>{
 const u=renderDetail();
 let finish!: (v:any)=>void;mockGet.mockReturnValueOnce(new Promise(r=>{finish=r;}));
 let pending!: Promise<void>;
 act(()=>{pending=useExploreStore.getState().loadFeed({force:true});});
 jest.spyOn(Alert,'alert').mockImplementation((_t,_b,buttons)=>buttons?.find(b=>b.style==='destructive')?.onPress?.());
 mockPost.mockResolvedValueOnce({id:'block1',blockedId:'g1'});
 await act(async()=>fireEvent.press(u.getByTestId('partner-block')));
 expect(useExploreStore.getState().feed.items).toHaveLength(0);
 await act(async()=>{finish({items:[golfer],total:1,limit:20,nextCursor:null});await pending;});
 expect(useExploreStore.getState().feed.items.map(c=>c.userId)).toContain('g1');
});
it('CONTROL: Cancel in block confirmation sends no request',async()=>{
 const u=renderDetail();jest.spyOn(Alert,'alert').mockImplementation((_t,_b,buttons)=>buttons?.find(b=>b.style==='cancel')?.onPress?.());
 await act(async()=>fireEvent.press(u.getByTestId('partner-block')));expect(mockPost).not.toHaveBeenCalled();expect(useExploreStore.getState().feed.items).toHaveLength(1);
});
it('PROOF: like remains enabled during a confirmed block request',async()=>{
 const u=renderDetail();jest.spyOn(Alert,'alert').mockImplementation((_t,_b,buttons)=>buttons?.find(b=>b.style==='destructive')?.onPress?.());
 let finish!: (v:any)=>void;mockPost.mockReturnValueOnce(new Promise(r=>{finish=r;})).mockResolvedValueOnce({matchCreated:true,matchId:'m9'});
 await act(async()=>fireEvent.press(u.getByTestId('partner-block')));
 await act(async()=>fireEvent.press(u.getByLabelText('Show interest')));
 expect(mockPost.mock.calls.map(c=>c[0])).toEqual(['/blocks/g1','/discovery/actions']);expect(navigation.replace).toHaveBeenCalled();
 await act(async()=>finish({id:'block1'}));expect(navigation.goBack).toHaveBeenCalled();
});
