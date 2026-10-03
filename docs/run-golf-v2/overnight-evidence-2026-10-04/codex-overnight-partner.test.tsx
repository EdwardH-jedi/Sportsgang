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

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), isFocused: jest.fn(() => true) };

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



beforeEach(async()=>{jest.clearAllMocks();mockGet.mockReset();mockPost.mockReset();navigation.isFocused.mockReturnValue(true);await loadGolfFeed();});
afterEach(()=>jest.restoreAllMocks());
it('R4 block dialog opened for owner A cannot execute for owner B',async()=>{
 await useExploreStore.getState().hydrateFocus('a');useExploreStore.getState().setFocusSport('golf');mockGet.mockResolvedValueOnce({items:[golfer],total:1,limit:20,offset:0,nextCursor:null});await useExploreStore.getState().loadFeed();jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const u=renderDetail();fireEvent.press(u.getByText('Block'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];await act(async()=>useExploreStore.getState().hydrateFocus('b'));mockPost.mockResolvedValue({});await act(async()=>buttons.find((b:any)=>b.text==='Block').onPress());expect(mockPost).not.toHaveBeenCalled();
});
it('CONTROL block completed after focus loss does not navigate',async()=>{
 let resolve!:(v:any)=>void;mockPost.mockReturnValueOnce(new Promise(a=>{resolve=a;}));jest.spyOn(Alert,'alert').mockImplementation((_t,_b,buttons)=>{buttons?.find(b=>b.text==='Block')?.onPress?.();});const u=renderDetail();fireEvent.press(u.getByText('Block'));navigation.isFocused.mockReturnValue(false);await act(async()=>resolve({}));expect(navigation.goBack).not.toHaveBeenCalled();expect(navigation.replace).not.toHaveBeenCalled();
});
