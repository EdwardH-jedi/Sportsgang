/**
 * useChat hook tests
 *
 * Covers the chat data layer extracted from ChatScreen:
 *  - parallel initial fetch of message history + proposals
 *  - error surface when the history fetch fails
 *  - proposal shape filter + chronological timeline merge
 *  - sendMessage POSTs and dedupes against a WebSocket echo
 *  - WebSocket lifecycle (URL, frame merge, onIncomingMessage, close)
 *  - respondToProposal patches the proposal in place
 *  - blockPartner hits POST /blocks/:id
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { useChat } from '../hooks/useChat';

jest.mock('../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
  BASE_URL: 'http://localhost:8000',
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  close = jest.fn();
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
}

(global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const msg1 = {
  id: 'msg-1',
  matchId: 'match-1',
  senderId: 'partner-1',
  body: 'Hey',
  createdAt: '2026-04-08T08:00:00Z',
};
const msg2 = {
  id: 'msg-2',
  matchId: 'match-1',
  senderId: 'me',
  body: 'Hi!',
  createdAt: '2026-04-08T08:02:00Z',
};
const proposal = {
  id: 'booking-1',
  matchId: 'match-1',
  proposerId: 'partner-1',
  partnerId: 'me',
  sport: 'running',
  startsAt: '2026-04-10T07:00:00',
  endsAt: '2026-04-10T08:00:00',
  status: 'proposed',
  partner: { displayName: 'Sam' },
  createdAt: '2026-04-08T08:01:00Z',
  updatedAt: '2026-04-08T08:01:00Z',
};

function mockFetches(opts: { messages?: unknown[]; bookings?: unknown[] } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/bookings')) {
      return Promise.resolve({ items: opts.bookings ?? [], total: 0, limit: 50, offset: 0 });
    }
    return Promise.resolve({ items: opts.messages ?? [], total: 0, limit: 100, offset: 0 });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  MockWebSocket.instances = [];
});

describe('useChat', () => {
  it('fetches history and proposals in parallel on mount', async () => {
    mockFetches({ messages: [msg1, msg2], bookings: [proposal] });
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith('/matches/match-1/messages?limit=100');
    expect(mockGet).toHaveBeenCalledWith(
      '/bookings?match_id=match-1&status=proposed,confirmed,declined&limit=50'
    );
    expect(result.current.messages).toEqual([msg1, msg2]);
    expect(result.current.proposals).toEqual([proposal]);
    expect(result.current.error).toBeNull();
  });

  it('merges proposals into the timeline by createdAt', async () => {
    mockFetches({ messages: [msg1, msg2], bookings: [proposal] });
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.timeline.map((e) => e.kind)).toEqual([
      'message',
      'proposal',
      'message',
    ]);
  });

  it('drops malformed proposal rows', async () => {
    mockFetches({ bookings: [proposal, { ...proposal, id: 'bad', partner: null }] });
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.proposals.map((p) => p.id)).toEqual(['booking-1']);
  });

  it('surfaces the error message when the history fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Network down');
  });

  it('refresh() clears a previous error once the retry succeeds', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network down'));
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.error).toBe('Network down'));

    mockFetches({ messages: [msg1] });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages).toEqual([msg1]);
  });

  it('sendMessage posts the body and dedupes a WebSocket echo of the same id', async () => {
    mockFetches();
    mockPost.mockResolvedValue(msg2);
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendMessage('Hi!');
    });
    expect(mockPost).toHaveBeenCalledWith('/matches/match-1/messages', { body: 'Hi!' });

    act(() => {
      MockWebSocket.instances[0].onmessage?.({ data: JSON.stringify(msg2) });
    });
    expect(result.current.messages).toEqual([msg2]);
  });

  it('sendMessage rethrows so the screen can restore the draft', async () => {
    mockFetches();
    mockPost.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.sendMessage('x')).rejects.toThrow('offline');
    expect(result.current.messages).toEqual([]);
  });

  it('opens the match WebSocket, merges frames and notifies onIncomingMessage', async () => {
    mockFetches();
    const onIncoming = jest.fn();
    const { result, unmount } = renderHook(() =>
      useChat({ matchId: 'match-1', token: 'jwt', onIncomingMessage: onIncoming })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://localhost:8000/matches/match-1/ws?token=jwt');

    act(() => {
      ws.onmessage?.({ data: JSON.stringify(msg1) });
      ws.onmessage?.({ data: 'not json' });
    });
    expect(result.current.messages).toEqual([msg1]);
    expect(onIncoming).toHaveBeenCalledTimes(1);
    expect(onIncoming).toHaveBeenCalledWith(msg1);

    unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it('does not open a WebSocket without a token', async () => {
    mockFetches();
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: null }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('respondToProposal patches the proposal in place', async () => {
    mockFetches({ bookings: [proposal] });
    mockPost.mockResolvedValue({ ...proposal, status: 'confirmed' });
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.respondToProposal('booking-1', 'confirm');
    });
    expect(mockPost).toHaveBeenCalledWith('/bookings/booking-1/confirm', {});
    expect(result.current.proposals[0].status).toBe('confirmed');
  });

  it('blockPartner posts to /blocks/:id', async () => {
    mockFetches();
    mockPost.mockResolvedValue({});
    const { result } = renderHook(() => useChat({ matchId: 'match-1', token: 't' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.blockPartner('partner-1');
    });
    expect(mockPost).toHaveBeenCalledWith('/blocks/partner-1', {});
  });
});
