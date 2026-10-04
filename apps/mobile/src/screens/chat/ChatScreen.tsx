import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import {
  SessionProposalCard,
  type SessionProposalCardData,
} from '../../components/SessionProposalCard';
import { api, BASE_URL } from '../../lib/api';
import { parseInstant } from '../../lib/instant';
import { compareTimeline, dedupeMessagesById } from '../../lib/messages';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { ChatScreenProps } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface MessageListResponse {
  items: Message[];
  total: number;
  limit: number;
  offset: number;
}

// Booking shape returned by GET /bookings (camelCased by lib/api). Only the
// fields the in-chat proposal card needs are listed; the BookingDetail
// screen owns the wider shape.
interface BookingItem extends SessionProposalCardData {
  createdAt: string;
  updatedAt: string;
}

interface BookingListResponse {
  items: BookingItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Unified timeline entry. Text messages and proposal cards are merged in
 * `createdAt` order so the chat reads chronologically — a proposal sent
 * mid-conversation appears between the surrounding text bubbles, not pinned
 * to the top or bottom.
 */
type TimelineEntry =
  | { kind: 'message'; createdAt: string; message: Message }
  | { kind: 'proposal'; createdAt: string; proposal: BookingItem };

const PROPOSAL_FETCH_STATUSES = 'proposed,confirmed,declined';

// The API's single 403 detail for a restricted pair, and the socket close
// code that goes with it (CONTRACTS.md §8; apps/api/app/services/safety.py,
// chat.py). Any other failure or close is treated as transient.
const CONTACT_UNAVAILABLE = "You can't contact this person.";
const WS_CLOSE_FORBIDDEN = 4003;

interface Thread {
  epoch: number;
  messages: Message[];
  proposals: BookingItem[];
}

interface ChatStatus {
  loading: boolean;
  error: string | null;
  restricted: boolean;
  paused: boolean;
}

// Screen chrome (header actions, planning banner, Send) scales with Dynamic
// Type up to the cap the app's screen titles use (ScreenHeader), so at the
// largest sizes the messages and the text being typed — which scale fully —
// keep room on screen.
const CHROME_TEXT_SCALE = 1.4;

const FRESH_STATUS: ChatStatus = { loading: true, error: null, restricted: false, paused: false };
const NO_MESSAGES: Message[] = [];
const NO_PROPOSALS: BookingItem[] = [];

function isRestriction(err: unknown): boolean {
  return err instanceof Error && err.message === CONTACT_UNAVAILABLE;
}

/**
 * Keeps whichever copy of each booking is newer: a refresh read before an
 * accept or decline committed must not undo it. The fetched list still
 * decides which bookings are listed (cancelled ones drop out).
 */
function mergeProposals(current: BookingItem[], fetched: BookingItem[]): BookingItem[] {
  const known = new Map(current.map((p) => [p.id, p]));
  return fetched.map((p) => {
    const mine = known.get(p.id);
    return mine && parseInstant(mine.updatedAt) > parseInstant(p.updatedAt) ? mine : p;
  });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, partnerName, partnerId: routePartnerId, sport } = route.params;
  // Sport-aware wording for the 1:1 planning CTA; legacy sports keep "court".
  const venueNoun = sport === 'golf' ? 'course' : sport === 'running' ? 'meeting spot' : 'court';
  const { user, token } = useAuthStore();
  const currentUserId = user?.id ?? null;
  // Treat empty / whitespace-only partner ids as null so an accidentally-blank
  // navigation param can't drive the ownership fallback into thinking every
  // sender is "not the partner" (i.e., "me"). See `isOwnMessage` below.
  const normalizedRoutePartnerId =
    routePartnerId && routePartnerId.trim().length > 0 ? routePartnerId : null;
  const insets = useSafeAreaInsets();
  // At the largest text sizes the input needs the full width for its
  // placeholder and typed line; Send then sits under it (see inputRow).
  const { fontScale } = useWindowDimensions();
  const stackComposer = fontScale >= 2.5;
  // At accessibility text sizes the fixed header and planning banner would
  // leave the message list no room while typing, so the banner steps aside
  // while the keyboard is up ("+ Session" in the header stays).
  const accessibilityText = fontScale >= 1.6;

  // Everything shown or acted on belongs to one binding: this account and
  // this match (the BookingDetail idiom, reviews R3/Q04). Each binding gets a
  // new epoch. Fetches, socket frames, sends, proposal actions and safety
  // dialogs are tagged with it, so a late result for another binding — even
  // the same match or account again (A → B → A) — never shows or acts.
  // Right after login the token is set before /auth/me returns the user;
  // that phase is its own binding, keyed by its token.
  const account = currentUserId ?? (token ? `pending:${token}` : null);
  const binding = account ? `${account}|${matchId}` : null;
  const bound = useRef({ binding, epoch: 0 });
  if (bound.current.binding !== binding) bound.current = { binding, epoch: bound.current.epoch + 1 };
  const epoch = bound.current.epoch;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = useCallback((e: number) => mounted.current && bound.current.epoch === e, []);
  // Set synchronously once this binding is restricted, so a response already
  // in flight can never repopulate the hidden history.
  const restrictedEpoch = useRef<number | null>(null);
  const live = useCallback((e: number) => isCurrent(e) && restrictedEpoch.current !== e, [isCurrent]);

  const [thread, setThread] = useState<Thread>({ epoch, messages: [], proposals: [] });
  const [statusState, setStatusState] = useState<{ epoch: number } & ChatStatus>({ epoch, ...FRESH_STATUS });
  const [draftState, setDraftState] = useState({ epoch, text: '' });
  const [sendingEpoch, setSendingEpoch] = useState<number | null>(null);
  const [acting, setActing] = useState<{ epoch: number; bookingId: string } | null>(null);
  const [reconnects, setReconnects] = useState(0);

  const messages = thread.epoch === epoch ? thread.messages : NO_MESSAGES;
  const proposals = thread.epoch === epoch ? thread.proposals : NO_PROPOSALS;
  const status: ChatStatus = statusState.epoch === epoch ? statusState : FRESH_STATUS;
  const { loading: isLoading, error: fetchError, restricted, paused } = status;
  const draft = draftState.epoch === epoch ? draftState.text : '';
  // The latest draft, updated synchronously with every change, so a failed
  // send can tell whether something newer was typed meanwhile.
  const draftRef = useRef({ epoch, text: '' });
  const isSending = sendingEpoch === epoch;
  // Tracks which booking id is currently mid-accept / mid-decline so its
  // card can show a spinner without freezing every other card on the screen.
  const actingBookingId = acting && acting.epoch === epoch ? acting.bookingId : null;
  // One-at-a-time guards, each held by the operation that took it: a late
  // finally from an earlier binding cannot release a newer operation's guard.
  const sendingOp = useRef<{ epoch: number } | null>(null);
  const actingOp = useRef<{ epoch: number } | null>(null);
  const blockingOp = useRef<object | null>(null);

  const updateThread = useCallback((e: number, change: (t: Thread) => Partial<Thread>) => {
    setThread((prev) => {
      if (bound.current.epoch !== e) return prev;
      const base = prev.epoch === e ? prev : { epoch: e, messages: [], proposals: [] };
      return { ...base, ...change(base) };
    });
  }, []);
  const updateStatus = useCallback((e: number, patch: Partial<ChatStatus>) => {
    setStatusState((prev) => {
      if (bound.current.epoch !== e) return prev;
      const base = prev.epoch === e ? prev : { epoch: e, ...FRESH_STATUS };
      return { ...base, ...patch };
    });
  }, []);
  const writeDraft = useCallback((e: number, text: string) => {
    draftRef.current = { epoch: e, text };
    setDraftState({ epoch: e, text });
  }, []);
  const setDraft = useCallback((text: string) => writeDraft(epoch, text), [epoch, writeDraft]);

  // The pair became restricted (a 403 with the restriction detail, or the
  // socket closed with 4003): hide the history like the API does and stop
  // contact actions for this binding. Existing bookings stay in My Plans.
  const markRestricted = useCallback(
    (e: number) => {
      if (!isCurrent(e)) return;
      restrictedEpoch.current = e;
      updateThread(e, () => ({ messages: [], proposals: [] }));
      updateStatus(e, { loading: false, error: null, restricted: true, paused: false });
    },
    [isCurrent, updateThread, updateStatus]
  );

  // iOS keyboard inset — bumps the visible composer above the keyboard.
  // Manual tracking is used because KeyboardAvoidingView's measured frame is
  // unreliable for non-Latin IMEs (Korean) when the keyboard frame changes
  // mid-frame. We listen to keyboardWillChangeFrame so the inset stays in
  // sync as the user toggles between Latin and Korean inputs. Android relies
  // on adjustResize and keeps inset = 0.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const onChange = (e: { endCoordinates: { screenY: number; height: number } }) => {
      const screenHeight = Dimensions.get('window').height;
      // screenY is the keyboard's top y in screen coordinates; the visible
      // keyboard height is the gap between that and the screen bottom.
      const visibleKeyboardHeight = Math.max(0, screenHeight - e.endCoordinates.screenY);
      setKeyboardInset(visibleKeyboardHeight);
    };
    const onHide = () => setKeyboardInset(0);
    const showSub = Keyboard.addListener('keyboardWillChangeFrame', onChange);
    const hideSub = Keyboard.addListener('keyboardWillHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Safety menu (Report / Block) ────────────────────────────────────────────
  // The open safety dialog (the PartnerDetail idiom, review Q06): losing
  // focus, a binding change and unmount each move it on, so an earlier menu
  // or confirmation can never report, block or navigate. The person acted on
  // is the one this binding's route names.
  const dialog = useRef(0);
  useEffect(
    () =>
      navigation.addListener?.('blur', () => {
        dialog.current += 1;
      }),
    [navigation]
  );
  useEffect(
    () => () => {
      dialog.current += 1;
    },
    [epoch]
  );

  const performBlock = useCallback(
    async (target: { epoch: number; partnerId: string }) => {
      if (!isCurrent(target.epoch) || blockingOp.current) return;
      const op = {};
      blockingOp.current = op;
      try {
        await api.post(`/blocks/${target.partnerId}`, {});
        if (!isCurrent(target.epoch)) return;
        Alert.alert('User blocked', "You won't be matched or contacted by this user.", [
          {
            text: 'OK',
            onPress: () => {
              if (isCurrent(target.epoch)) navigation.goBack();
            },
          },
        ]);
      } catch (err) {
        if (!isCurrent(target.epoch)) return;
        Alert.alert('Could not block', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        if (blockingOp.current === op) blockingOp.current = null;
      }
    },
    [isCurrent, navigation]
  );

  const confirmBlock = useCallback(
    (target: { epoch: number; partnerId: string; partnerName: string }) => {
      if (!isCurrent(target.epoch) || blockingOp.current) return;
      const opened = ++dialog.current;
      Alert.alert('Block ' + target.partnerName + '?', "You won't see messages or activity from this user.", [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            if (opened !== dialog.current || !isCurrent(target.epoch)) return;
            dialog.current += 1;
            void performBlock(target);
          },
        },
      ]);
    },
    [isCurrent, performBlock]
  );

  const openSafetyMenu = useCallback(() => {
    const target = { epoch, partnerId: normalizedRoutePartnerId, partnerName };
    const opened = ++dialog.current;
    const choose = (action: 'report' | 'block') => {
      if (opened !== dialog.current || !isCurrent(target.epoch) || !target.partnerId) return;
      if (action === 'block') {
        confirmBlock({ ...target, partnerId: target.partnerId });
        return;
      }
      dialog.current += 1;
      navigation.navigate('Report', { reportedUserId: target.partnerId, reportedName: target.partnerName });
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Report', 'Block', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) choose('report');
          else if (idx === 1) choose('block');
        }
      );
    } else {
      Alert.alert(partnerName, undefined, [
        { text: 'Report', onPress: () => choose('report') },
        { text: 'Block', style: 'destructive', onPress: () => choose('block') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [epoch, normalizedRoutePartnerId, partnerName, isCurrent, confirmBlock, navigation]);

  // ── History and proposals ───────────────────────────────────────────────────
  const loadGeneration = useRef(0);
  const proposalsGeneration = useRef(0);

  const fetchProposals = useCallback(async () => {
    if (!binding) return;
    const e = epoch;
    const gen = ++proposalsGeneration.current;
    // Pull every non-cancelled booking on this match. Cancelled bookings
    // are intentionally hidden from the in-chat surface — once the
    // proposer cancels, the card is gone; users discover the cancellation
    // via /matches preview / BookingDetail rather than a stale chat row.
    const data = await api.get<BookingListResponse>(
      `/bookings?match_id=${matchId}&status=${PROPOSAL_FETCH_STATUSES}&limit=50`
    );
    if (!live(e) || gen !== proposalsGeneration.current) return;
    // Defensive shape check: only render rows that have the fields the card
    // actually reads. Guards against unexpected backend payloads and makes
    // the chat resilient — a malformed item just doesn't appear instead of
    // crashing the screen.
    const fetched = data.items.filter(
      (p) =>
        p &&
        typeof p.proposerId === 'string' &&
        typeof p.partnerId === 'string' &&
        typeof p.startsAt === 'string' &&
        p.partner !== undefined &&
        p.partner !== null
    );
    updateThread(e, (t) => ({ proposals: mergeProposals(t.proposals, fetched) }));
  }, [binding, epoch, matchId, live, updateThread]);

  /** `quiet` keeps what is on screen while it refreshes (used after a reconnect). */
  const load = useCallback(
    async (quiet = false) => {
      if (!binding) return;
      const e = epoch;
      const gen = ++loadGeneration.current;
      const ok = () => live(e) && gen === loadGeneration.current;
      if (!quiet) updateStatus(e, { loading: true, error: null });
      try {
        // Run both fetches in parallel so a slow /bookings doesn't delay the
        // text history (and vice-versa). Either failing surfaces a single
        // friendly error.
        const [msgRes] = await Promise.all([
          api.get<MessageListResponse>(`/matches/${matchId}/messages?limit=100`),
          fetchProposals(),
        ]);
        if (!ok()) return;
        // Merge instead of replace: a WS-received message could have landed in
        // state while this fetch was in-flight (slow network, partner sent
        // mid-load). dedupeMessagesById keeps the FIRST occurrence so the
        // canonical history from data.items wins on overlap, and any tail-end
        // WS messages survive at the end. Defensive against duplicate rows in
        // the response too.
        updateThread(e, (t) => ({ messages: dedupeMessagesById([...msgRes.items, ...t.messages]) }));
        updateStatus(e, { loading: false, error: null });
      } catch (err) {
        if (!ok()) return;
        if (isRestriction(err)) {
          markRestricted(e);
          return;
        }
        if (quiet) {
          updateStatus(e, { paused: true });
          return;
        }
        updateStatus(e, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load messages.',
        });
      }
    },
    [binding, epoch, matchId, live, fetchProposals, updateThread, updateStatus, markRestricted]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // After the user proposes a session in BookingComposer, navigation pops
  // back into the chat — refetch proposals on focus so the new card shows
  // up without forcing a manual pull-to-refresh. Skip the very first focus
  // so the initial mount fetch above isn't doubled. A failed refresh keeps
  // what is shown, unless it reports the restriction.
  const didMountRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }
      const e = epoch;
      fetchProposals().catch((err) => {
        if (isRestriction(err)) markRestricted(e);
      });
    }, [epoch, fetchProposals, markRestricted])
  );

  const performBookingAction = useCallback(
    async (bookingId: string, action: 'confirm' | 'decline') => {
      const e = epoch;
      if (!live(e) || actingOp.current?.epoch === e) return;
      const op = { epoch: e };
      actingOp.current = op;
      setActing({ epoch: e, bookingId });
      try {
        const updated = await api.post<BookingItem>(`/bookings/${bookingId}/${action}`, {});
        if (!live(e) || updated?.id !== bookingId) return;
        // Authoritative: the backend's response for this booking replaces the
        // row; a refresh read earlier keeps it (see mergeProposals).
        updateThread(e, (t) => ({
          proposals: t.proposals.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
        }));
      } catch (err) {
        if (!live(e)) return;
        if (isRestriction(err)) {
          markRestricted(e);
          return;
        }
        Alert.alert(
          "Couldn't update this session.",
          err instanceof Error ? err.message : "Couldn't update this session. Please try again."
        );
      } finally {
        if (actingOp.current === op) actingOp.current = null;
        if (mounted.current) setActing((a) => (a && a.epoch === e ? null : a));
      }
    },
    [epoch, live, updateThread, markRestricted]
  );

  // ── Real-time WebSocket connection ──────────────────────────────────────────
  useEffect(() => {
    if (!token || !binding || restricted) return;
    const e = epoch;
    const wsBase = BASE_URL.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/matches/${matchId}/ws?token=${token}`);
    // False once this effect is cleaned up: a frame or close delivered to
    // this socket afterwards belongs to a binding that is gone.
    let attached = true;

    ws.onmessage = (event) => {
      if (!attached || !live(e)) return;
      try {
        const incoming = JSON.parse(event.data as string) as Message;
        if (!incoming || incoming.matchId !== matchId) return;
        // Use the shared dedupe helper so this path matches sendMessage and
        // fetchMessages — a single source of truth means a race between the
        // POST response and a WS echo of the same id can never duplicate.
        updateThread(e, (t) => ({ messages: dedupeMessagesById([...t.messages, incoming]) }));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (event) => {
      if (!attached || !isCurrent(e)) return;
      // 4003 is the server's restriction close; anything else (network loss,
      // server restart, a dropped slow socket) is transient and said so.
      if (event?.code === WS_CLOSE_FORBIDDEN) markRestricted(e);
      else updateStatus(e, { paused: true });
    };

    return () => {
      attached = false;
      ws.onmessage = null;
      ws.onclose = null;
      ws.close();
    };
  }, [binding, epoch, matchId, token, restricted, reconnects, live, isCurrent, markRestricted, updateStatus, updateThread]);

  const reconnect = useCallback(() => {
    if (!isCurrent(epoch)) return;
    updateStatus(epoch, { paused: false });
    setReconnects((n) => n + 1);
    // Catch up on anything sent while the socket was down.
    void load(true);
  }, [epoch, isCurrent, updateStatus, load]);

  // Merged chronological timeline. Proposal cards land between the text
  // bubbles surrounding their createdAt, so the chat reads as a single
  // story. Stable: messages and proposals are ordered by their createdAt
  // instant (not the string), messages winning ties so a text echo never
  // jumps ahead of the booking event it followed, then by id
  // (lib/messages.ts compareTimeline, CONTRACTS.md §9).
  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...messages.map<TimelineEntry>((m) => ({
        kind: 'message',
        createdAt: m.createdAt,
        message: m,
      })),
      ...proposals.map<TimelineEntry>((p) => ({
        kind: 'proposal',
        createdAt: p.createdAt,
        proposal: p,
      })),
    ];
    const key = (e: TimelineEntry) => ({
      kind: e.kind,
      createdAt: e.createdAt,
      id: e.kind === 'message' ? e.message.id : e.proposal.id,
    });
    entries.sort((a, b) => compareTimeline(key(a), key(b)));
    return entries;
  }, [messages, proposals]);

  const sendMessage = useCallback(async () => {
    const e = epoch;
    const body = draft.trim();
    if (!body || !live(e) || sendingOp.current?.epoch === e) return;
    const op = { epoch: e };
    sendingOp.current = op;
    // Clear optimistically so the user can keep typing while the request flies.
    writeDraft(e, '');
    setSendingEpoch(e);
    try {
      const msg = await api.post<Message>(`/matches/${matchId}/messages`, { body });
      if (!live(e)) return;
      // Dedupe-on-append: the WebSocket may have already broadcast this same
      // id back to us before the POST response resolved. Without this, both
      // paths would each push the message and React would warn:
      //   "Encountered two children with the same key: <id>"
      updateThread(e, (t) => ({ messages: dedupeMessagesById([...t.messages, msg]) }));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      if (!live(e)) return;
      if (isRestriction(err)) {
        markRestricted(e);
        return;
      }
      // Send failed — give the text back so the user doesn't lose it, unless
      // they have already typed something newer, which is never overwritten.
      const typed = draftRef.current.epoch === e ? draftRef.current.text : '';
      const reason = err instanceof Error ? err.message : 'Please try again.';
      if (typed.trim() === '') {
        writeDraft(e, body);
        Alert.alert('Could not send', reason);
      } else {
        const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
        Alert.alert('Could not send', `${reason}\n\nNot sent: “${preview}”`);
      }
    } finally {
      if (sendingOp.current === op) sendingOp.current = null;
      if (mounted.current) setSendingEpoch((s) => (s === e ? null : s));
    }
  }, [draft, epoch, live, matchId, updateThread, markRestricted, writeDraft]);

  return (
    <Screen padded={false}>
      {/* Header — kept OUTSIDE the KeyboardAvoidingView so it stays anchored
          at the top regardless of keyboard state. */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText} maxFontSizeMultiplier={1.4}>
            {'←'}
          </Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={2} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {partnerName}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {restricted ? null : (
            <Pressable
              style={({ pressed }) => [styles.bookButton, pressed && styles.pressed]}
              onPress={() => navigation.navigate('BookingComposer', { matchId, sport })}
              accessibilityRole="button"
              accessibilityLabel="Propose a session"
              hitSlop={10}
            >
              <Text style={styles.bookButtonText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                + Session
              </Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.overflowButton, pressed && styles.pressed]}
            onPress={openSafetyMenu}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Text style={styles.overflowText} maxFontSizeMultiplier={1.4}>
              ⋯
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Session-planning banner — also kept outside the KAV. The banner
          must not move when the keyboard opens; only the list+composer
          should shift. */}
      {restricted || (accessibilityText && keyboardInset > 0) ? null : (
      <View style={styles.planBanner}>
        <View style={styles.planBannerText}>
          <Text style={styles.planBannerTitle} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            Plan a session
          </Text>
          <Text style={styles.planBannerSubtitle} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            Find a {venueNoun} and propose a time.
          </Text>
        </View>
        <Pressable
          onPress={() =>
            navigation.navigate('BookingComposer', {
              matchId,
              sport,
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Find a ${venueNoun}`}
          style={({ pressed }) => [styles.findCourtCta, pressed && styles.pressed]}
        >
          <Text style={styles.findCourtCtaText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
            Find a {venueNoun}
          </Text>
        </Pressable>
      </View>
      )}

      {restricted ? (
        <View style={styles.centred} accessibilityLiveRegion="polite">
          <Text style={styles.restrictedTitle}>{CONTACT_UNAVAILABLE}</Text>
          <Text style={styles.restrictedBody}>
            Messages are hidden while contact is restricted. Sessions you already arranged stay in My Plans.
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : fetchError ? (
        <View style={styles.centred}>
          <Text style={styles.errorText}>{fetchError}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => void load()}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        // Single shared layout for both platforms. The composer is a normal
        // visible View below the FlatList — it must be tappable BEFORE the
        // keyboard opens, so it cannot live solely inside an
        // InputAccessoryView (the previous attempt's structural bug).
        //
        // Keyboard handling:
        //   - Android: rely on the OS via android:windowSoftInputMode=
        //     "adjustResize" (Expo default). The KAV here is just a flex:1
        //     wrapper — behavior=undefined, no manual lifting.
        //   - iOS: KAV behavior is undefined (no KAV-driven padding) and the
        //     composer's marginBottom is set from the iOS-only Keyboard event
        //     listener. This avoids double-lifting and gives reliable results
        //     for Korean / non-Latin IMEs where KAV's measured frame drifts.
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={listRef}
            data={timeline}
            keyExtractor={(item) =>
              item.kind === 'message' ? `m-${item.message.id}` : `p-${item.proposal.id}`
            }
            renderItem={({ item }) => {
              if (item.kind === 'message') {
                return (
                  <MessageBubble
                    message={item.message}
                    isOwn={isOwnMessage(
                      item.message.senderId,
                      currentUserId,
                      normalizedRoutePartnerId
                    )}
                  />
                );
              }
              const p = item.proposal;
              return (
                <View style={styles.proposalRow}>
                  <SessionProposalCard
                    proposal={p}
                    currentUserId={currentUserId ?? ''}
                    isActing={actingBookingId === p.id}
                    onAccept={() => performBookingAction(p.id, 'confirm')}
                    onDecline={() => performBookingAction(p.id, 'decline')}
                    onView={() =>
                      navigation.navigate('BookingDetail', { bookingId: p.id })
                    }
                  />
                </View>
              );
            }}
            style={styles.flex}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  Say hello to {partnerName} to get things started.
                </Text>
              </View>
            }
          />
          {paused ? (
            <View style={styles.pausedBar} accessibilityLiveRegion="polite">
              <Text style={styles.pausedText}>Live updates paused.</Text>
              <Pressable
                onPress={reconnect}
                accessibilityRole="button"
                accessibilityLabel="Reconnect"
                style={({ pressed }) => [styles.pausedButton, pressed && styles.pressed]}
              >
                <Text style={styles.pausedButtonText}>Reconnect</Text>
              </Pressable>
            </View>
          ) : null}
          <View
            style={[
              styles.inputRow,
              // Resting paddingBottom keeps the composer clear of the iPhone
              // home indicator when the keyboard is down.
              { paddingBottom: spacing.sm + insets.bottom },
              // iOS only: lift the composer by the visible keyboard height
              // (minus the home-indicator inset, which the keyboard absorbs)
              // so the input + Send button sit just above the keyboard, even
              // for Korean IMEs that change keyboard frame mid-frame.
              Platform.OS === 'ios' && keyboardInset > 0
                ? { marginBottom: Math.max(0, keyboardInset - insets.bottom) }
                : null,
            ]}
          >
            <TextInput
              style={[styles.input, stackComposer && styles.inputFullWidth]}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
              // Anchor multi-line text to the top edge — without this, Android
              // vertically centers the caret as the input grows, which makes
              // the first line appear to "jump" while typing.
              textAlignVertical="top"
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                (!draft.trim() || isSending) && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}
              onPress={sendMessage}
              disabled={!draft.trim() || isSending}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Text style={styles.sendButtonText} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                Send
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

/**
 * Decide whether a chat message belongs to the currently-authenticated user.
 *
 * Policy (deliberately conservative):
 *
 * 1. Missing / falsy `senderId` → not mine. We never let an undefined sender
 *    speculate into "current user / right / neon".
 * 2. Authenticated `currentUserId` is the source of truth. A message is
 *    mine iff `senderId === currentUserId` — exact string match.
 * 3. If auth user is unavailable (e.g. fresh login mid-session, before
 *    `/auth/me` lands), default to NOT mine. Rendering everything as
 *    partner/left is the safe failure mode — it merely looks slightly
 *    wrong; the previous "mine" fallback could leak the wrong identity
 *    onto the screen.
 *
 * The `routePartnerId` argument is intentionally accepted but unused: the
 * old fallback (`senderId !== routePartnerId === "mine"`) was the source of
 * the iPhone Chris/Sarah regression where a missing/empty partnerId made
 * every UUID look like the current user. Keeping the parameter in the
 * signature avoids a churning refactor at every call site while making the
 * fallback no-op explicit.
 */
function isOwnMessage(
  senderId: string | null | undefined,
  currentUserId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _routePartnerId: string | null | undefined
): boolean {
  if (!senderId) return false;
  if (!currentUserId) return false;
  return senderId === currentUserId;
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
      <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
        {message.body}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Back, name and actions share one row while they fit. On narrow phones
  // and at large text sizes the actions wrap onto a second row, right-aligned,
  // instead of running off the screen; the name keeps at least ~120 pt.
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 22,
    // Explicit, so the glyph's box follows its capped size.
    lineHeight: 26,
    color: colors.textPrimary,
  },
  headerCenter: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 120,
    alignItems: 'center',
  },
  headerName: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
  },
  bookButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  bookButtonText: {
    ...typography.label,
    color: colors.textInverse,
  },
  overflowButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    fontSize: 20,
    lineHeight: 24,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  // Text and CTA side by side while they fit; the CTA wraps below otherwise.
  planBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  planBannerText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    gap: 2,
  },
  planBannerTitle: {
    ...typography.label,
    color: colors.textPrimary,
    letterSpacing: 0.6,
  },
  planBannerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  findCourtCta: {
    backgroundColor: colors.brand,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  findCourtCtaText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 14,
    textAlign: 'center',
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    // Larger bottom pad so the last bubble keeps clear of the composer's
    // top border AND the keyboard edge when the input grows multi-line.
    // Slightly bumped from spacing.md so a fresh send doesn't visually
    // crash into the input on real devices.
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  proposalRow: {
    // Full-bleed card wrapper: cancels the bubble's 75% maxWidth so the
    // session proposal occupies the chat list's content width on its own
    // row. Vertical breathing room separates it from adjacent bubbles.
    paddingVertical: spacing.xs,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: 3,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.separator,
    borderBottomLeftRadius: 3,
  },
  bubbleText: {
    ...typography.body,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: colors.textInverse,
  },
  bubbleTextOther: {
    color: colors.textPrimary,
  },
  // Input and Send share a row while they fit; at large text sizes Send
  // wraps below the input (right-aligned) so the input keeps its width.
  inputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    // 12 px vertical padding on each side keeps a single line of bodyLarge
    // (lineHeight 26) clearly inside the box without clipping the caret or
    // descenders. Combined with minHeight 48, an empty composer is a
    // comfortable resting target above the iOS HIG threshold.
    paddingVertical: 12,
    // Real-device QA: at the previous 44 px the typed text felt clipped on
    // an iPhone with the keyboard open. 48 gives the caret + first line
    // clear breathing room. maxHeight 132 lets the input grow to ~5 lines
    // before scrolling internally so the user can review what they're
    // typing without the keyboard ever covering the composer.
    minHeight: 48,
    maxHeight: 132,
  },
  // minWidth, not a percentage flexBasis: Yoga only wraps on the item's own size.
  inputFullWidth: {
    minWidth: '100%',
  },
  sendButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    // Match the input's resting minHeight so a single-line composer reads
    // as one unified row. With alignItems: 'flex-end' on the parent, the
    // Send button stays bottom-aligned when the input grows multi-line.
    minHeight: 48,
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  sendButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  restrictedTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  restrictedBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pausedBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.surface,
  },
  pausedText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  pausedButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pausedButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.65 },
});
