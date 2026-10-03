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
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<BookingItem[]>([]);
  // Tracks which booking id is currently mid-accept / mid-decline so its
  // card can show a spinner without freezing every other card on the screen.
  const [actingBookingId, setActingBookingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  // iOS keyboard inset — bumps the visible composer above the keyboard.
  // Manual tracking is used because KeyboardAvoidingView's measured frame is
  // unreliable for non-Latin IMEs (Korean) when the keyboard frame changes
  // mid-frame. We listen to keyboardWillChangeFrame so the inset stays in
  // sync as the user toggles between Latin and Korean inputs. Android relies
  // on adjustResize and keeps inset = 0.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);

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

  const partnerId = useRef<string | null>(routePartnerId);
  // Local guard: prevents the user from firing /blocks/:id twice in a row by
  // re-opening the safety menu while a block is mid-flight. Pure UX safety;
  // the backend is still the source of truth.
  const [isBlocking, setIsBlocking] = useState(false);

  const performBlock = useCallback(async () => {
    if (!partnerId.current || isBlocking) return;
    setIsBlocking(true);
    try {
      await api.post(`/blocks/${partnerId.current}`, {});
      Alert.alert(
        'User blocked',
        "You won't be matched or contacted by this user.",
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert(
        'Could not block',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsBlocking(false);
    }
  }, [isBlocking, navigation]);

  const confirmBlock = useCallback(() => {
    if (!partnerId.current || isBlocking) return;
    Alert.alert(
      'Block ' + partnerName + '?',
      "You won't see messages or activity from this user.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void performBlock() },
      ]
    );
  }, [isBlocking, partnerName, performBlock]);

  const openSafetyMenu = useCallback(() => {
    const options = ['Report', 'Block', 'Cancel'];
    const destructiveIndex = 1;
    const cancelIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (idx) => {
          if (idx === 0 && partnerId.current) {
            navigation.navigate('Report', {
              reportedUserId: partnerId.current,
              reportedName: partnerName,
            });
          } else if (idx === 1) {
            confirmBlock();
          }
        }
      );
    } else {
      Alert.alert(partnerName, undefined, [
        {
          text: 'Report',
          onPress: () => {
            if (partnerId.current) {
              navigation.navigate('Report', {
                reportedUserId: partnerId.current,
                reportedName: partnerName,
              });
            }
          },
        },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => confirmBlock(),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [navigation, partnerName, confirmBlock]);

  const fetchProposals = useCallback(async () => {
    // Pull every non-cancelled booking on this match. Cancelled bookings
    // are intentionally hidden from the in-chat surface — once the
    // proposer cancels, the card is gone; users discover the cancellation
    // via /matches preview / BookingDetail rather than a stale chat row.
    const data = await api.get<BookingListResponse>(
      `/bookings?match_id=${matchId}&status=${PROPOSAL_FETCH_STATUSES}&limit=50`
    );
    // Defensive shape check: only render rows that have the fields the card
    // actually reads. Guards against unexpected backend payloads and makes
    // the chat resilient — a malformed item just doesn't appear instead of
    // crashing the screen.
    setProposals(
      data.items.filter(
        (p) =>
          p &&
          typeof p.proposerId === 'string' &&
          typeof p.partnerId === 'string' &&
          typeof p.startsAt === 'string' &&
          p.partner !== undefined &&
          p.partner !== null
      )
    );
  }, [matchId]);

  const fetchMessages = useCallback(async () => {
    try {
      // Run both fetches in parallel so a slow /bookings doesn't delay the
      // text history (and vice-versa). Either failing surfaces a single
      // friendly error.
      const [msgRes] = await Promise.all([
        api.get<MessageListResponse>(`/matches/${matchId}/messages?limit=100`),
        fetchProposals(),
      ]);
      // Merge instead of replace: a WS-received message could have landed in
      // state while this fetch was in-flight (slow network, partner sent
      // mid-load). dedupeMessagesById keeps the FIRST occurrence so the
      // canonical history from data.items wins on overlap, and any tail-end
      // WS messages survive at the end. Defensive against duplicate rows in
      // the response too.
      setMessages((prev) => dedupeMessagesById([...msgRes.items, ...prev]));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load messages.');
    } finally {
      setIsLoading(false);
    }
  }, [matchId, fetchProposals]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // After the user proposes a session in BookingComposer, navigation pops
  // back into the chat — refetch proposals on focus so the new card shows
  // up without forcing a manual pull-to-refresh. Skip the very first focus
  // so the initial mount fetch above isn't doubled.
  const didMountRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }
      void fetchProposals();
    }, [fetchProposals])
  );

  const performBookingAction = useCallback(
    async (bookingId: string, action: 'confirm' | 'decline') => {
      if (actingBookingId) return;
      setActingBookingId(bookingId);
      try {
        const updated = await api.post<BookingItem>(
          `/bookings/${bookingId}/${action}`,
          {}
        );
        // Optimistic-but-authoritative: trust the backend's response over
        // any in-flight refetch result. Replace the row in-place.
        setProposals((prev) =>
          prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
        );
      } catch (err) {
        Alert.alert(
          "Couldn't update this session.",
          err instanceof Error
            ? err.message
            : "Couldn't update this session. Please try again."
        );
      } finally {
        setActingBookingId(null);
      }
    },
    [actingBookingId]
  );

  // ── Real-time WebSocket connection ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const wsBase = BASE_URL.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/matches/${matchId}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data as string) as Message;
        // Use the shared dedupe helper so this path matches sendMessage and
        // fetchMessages — a single source of truth means a race between the
        // POST response and a WS echo of the same id can never duplicate.
        setMessages((prev) => dedupeMessagesById([...prev, incoming]));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [matchId, token]);

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
    const body = draft.trim();
    if (!body || isSending) return;
    // Clear optimistically so the user can keep typing while the request flies.
    setDraft('');
    setIsSending(true);
    try {
      const msg = await api.post<Message>(`/matches/${matchId}/messages`, { body });
      // Dedupe-on-append: the WebSocket may have already broadcast this same
      // id back to us before the POST response resolved. Without this, both
      // paths would each push the message and React would warn:
      //   "Encountered two children with the same key: <id>"
      setMessages((prev) => dedupeMessagesById([...prev, msg]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      // Send failed — restore the draft so the user doesn't lose their typing,
      // and surface the failure via Alert so they know to retry. Without this,
      // a flaky network silently swallows the message and the textbox just
      // becomes empty, which feels broken on real devices.
      setDraft(body);
      Alert.alert(
        'Could not send',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, matchId]);

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
          <Text style={styles.backText}>{'←'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {partnerName}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.bookButton, pressed && styles.pressed]}
            onPress={() =>
              navigation.navigate('BookingComposer', { matchId, sport })
            }
            accessibilityRole="button"
            accessibilityLabel="Propose a session"
          >
            <Text style={styles.bookButtonText}>+ Session</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.overflowButton, pressed && styles.pressed]}
            onPress={openSafetyMenu}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Text style={styles.overflowText}>⋯</Text>
          </Pressable>
        </View>
      </View>

      {/* Session-planning banner — also kept outside the KAV. The banner
          must not move when the keyboard opens; only the list+composer
          should shift. */}
      <View style={styles.planBanner}>
        <View style={styles.planBannerText}>
          <Text style={styles.planBannerTitle}>Plan a session</Text>
          <Text style={styles.planBannerSubtitle}>
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
          <Text style={styles.findCourtCtaText}>Find a {venueNoun}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : fetchError ? (
        <View style={styles.centred}>
          <Text style={styles.errorText}>{fetchError}</Text>
          <Pressable style={styles.retryButton} onPress={fetchMessages}>
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
              style={styles.input}
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
              <Text style={styles.sendButtonText}>Send</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    gap: spacing.sm,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  overflowText: {
    fontSize: 20,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  planBannerText: {
    flex: 1,
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
  },
  findCourtCtaText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 14,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
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
  pressed: { opacity: 0.65 },
});
