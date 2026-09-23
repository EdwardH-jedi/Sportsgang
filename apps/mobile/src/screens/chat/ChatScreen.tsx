import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import {
  Avatar,
  Button,
  EmptyState,
  Header,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  TextField,
} from '../../components/ui';
import { SessionProposalCard } from '../../components/SessionProposalCard';
import { useChat } from '../../hooks/useChat';
import type { ChatMessage } from '../../lib/matches';
import { sportLabel } from '../../lib/sports';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import type { ChatScreenProps } from '../../navigation/types';

// ─── Screen ──────────────────────────────────────────────────────────────────

export function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { matchId, partnerName, partnerId: routePartnerId, sport } = route.params;
  const { user, token } = useAuthStore();
  const currentUserId = user?.id ?? null;
  // Treat empty / whitespace-only partner ids as null so an accidentally-blank
  // navigation param can't drive the ownership fallback into thinking every
  // sender is "not the partner" (i.e., "me"). See `isOwnMessage` below.
  const normalizedRoutePartnerId =
    routePartnerId && routePartnerId.trim().length > 0 ? routePartnerId : null;
  const insets = useSafeAreaInsets();
  // Tracks which booking id is currently mid-accept / mid-decline so its
  // card can show a spinner without freezing every other card on the screen.
  const [actingBookingId, setActingBookingId] = useState<string | null>(null);
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

  const {
    timeline,
    isLoading,
    error: fetchError,
    refresh: fetchMessages,
    refreshProposals: fetchProposals,
    sendMessage: postChatMessage,
    respondToProposal,
    blockPartner,
  } = useChat({
    matchId,
    token,
    onIncomingMessage: () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    },
  });

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
      await blockPartner(partnerId.current);
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
  }, [isBlocking, navigation, blockPartner]);

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

  // After the user proposes a session in BookingComposer, navigation pops
  // back into the chat — refetch proposals on focus so the new card shows
  // up without forcing a manual pull-to-refresh. Skip the very first focus
  // so useChat's initial mount fetch isn't doubled.
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
        // Patches the card in place with the backend's response.
        await respondToProposal(bookingId, action);
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
    [actingBookingId, respondToProposal]
  );

  const sendMessage = useCallback(async () => {
    const body = draft.trim();
    if (!body || isSending) return;
    // Clear optimistically so the user can keep typing while the request flies.
    setDraft('');
    setIsSending(true);
    try {
      // useChat dedupes on append: the WebSocket may have already broadcast
      // this same id back to us before the POST response resolved. Without
      // that, both paths would each push the message and React would warn:
      //   "Encountered two children with the same key: <id>"
      await postChatMessage(body);
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
  }, [draft, isSending, postChatMessage]);

  return (
    <Screen padded={false}>
      {/* Header — kept OUTSIDE the KeyboardAvoidingView so it stays anchored
          at the top regardless of keyboard state. Identity (avatar + name)
          goes in the Header's leading slot. */}
      <Header
        onBack={() => navigation.goBack()}
        backLabel="Back"
        style={styles.header}
        leading={
          <View style={styles.headerIdentity}>
            <Avatar name={partnerName} size="sm" />
            <View style={styles.headerText}>
              <Text style={styles.headerName} numberOfLines={1} accessibilityRole="header">
                {partnerName}
              </Text>
              <Text style={styles.headerSport} numberOfLines={1}>
                {sportLabel(sport)}
              </Text>
            </View>
          </View>
        }
        right={
          <>
            <IconButton
              icon="calendar"
              variant="filled"
              onPress={() => navigation.navigate('BookingComposer', { matchId, sport })}
              accessibilityLabel="Propose a session"
            />
            <IconButton icon="more" onPress={openSafetyMenu} accessibilityLabel="More options" />
          </>
        }
      />

      {/* Session-planning banner — also kept outside the KAV. The banner
          must not move when the keyboard opens; only the list+composer
          should shift. */}
      <View style={styles.planBanner}>
        <View style={styles.planIcon}>
          <Icon name="calendar" size="md" color={colors.brand} />
        </View>
        <View style={styles.planBannerText}>
          <Text style={styles.planBannerTitle}>Plan a session</Text>
          <Text style={styles.planBannerSubtitle}>
            Find a court and propose a time.
          </Text>
        </View>
        <Button
          label="Find a court"
          size="sm"
          onPress={() =>
            navigation.navigate('BookingComposer', {
              matchId,
              sport,
            })
          }
          accessibilityLabel="Find a court"
        />
      </View>

      {isLoading ? (
        <MessagesSkeleton />
      ) : fetchError ? (
        <EmptyState
          icon="alert"
          title="Couldn't load messages"
          message={fetchError}
          action={{ label: 'Try again', icon: 'refresh', onPress: fetchMessages }}
        />
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
                <Avatar name={partnerName} size="lg" />
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
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              accessibilityLabel="Message"
              multiline
              minHeight={COMPOSER_HEIGHT}
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
              // Anchor multi-line text to the top edge — without this, Android
              // vertically centers the caret as the input grows, which makes
              // the first line appear to "jump" while typing.
              textAlignVertical="top"
              containerStyle={styles.composerField}
              inputStyle={styles.input}
            />
            <IconButton
              icon="send"
              variant="brand"
              onPress={sendMessage}
              disabled={!draft.trim() || isSending}
              accessibilityLabel="Send"
              style={styles.sendButton}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

/** Placeholder bubbles while the first page of messages loads. */
function MessagesSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel="Loading messages"
      accessibilityState={{ busy: true }}
      testID="chat-loading"
    >
      <Skeleton width="55%" height={COMPOSER_HEIGHT - spacing.sm} radius={radii.lg} />
      <Skeleton
        width="40%"
        height={COMPOSER_HEIGHT - spacing.sm}
        radius={radii.lg}
        style={styles.skeletonOwn}
      />
      <Skeleton width="65%" height={COMPOSER_HEIGHT + spacing.md} radius={radii.lg} />
      <Skeleton
        width="35%"
        height={COMPOSER_HEIGHT - spacing.sm}
        radius={radii.lg}
        style={styles.skeletonOwn}
      />
    </View>
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

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  return (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
      <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
        {message.body}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

/**
 * Composer resting height (48). Real-device QA: at 44 the typed text felt
 * clipped on an iPhone with the keyboard open; 48 gives the caret + first
 * line clear breathing room. The Send button matches it so a single-line
 * composer reads as one row.
 */
const COMPOSER_HEIGHT = touchTarget + spacing.xs;
/** ~5 lines of growth before the input scrolls internally. */
const COMPOSER_MAX_HEIGHT = COMPOSER_HEIGHT + spacing.xxl + spacing.xl + spacing.xs;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    gap: spacing.xs,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  headerText: {
    flex: 1,
  },
  headerName: {
    ...typography.bodyStrong,
    fontSize: typography.bodyLarge.fontSize,
  },
  headerSport: {
    ...typography.caption,
  },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  planIcon: {
    width: touchTarget - spacing.xs,
    height: touchTarget - spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBannerText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  planBannerTitle: {
    ...typography.bodyStrong,
  },
  planBannerSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  skeleton: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm + spacing.xs,
  },
  skeletonOwn: {
    alignSelf: 'flex-end',
  },
  messageList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    // Larger bottom pad so the last bubble keeps clear of the composer's
    // top border AND the keyboard edge when the input grows multi-line.
    paddingBottom: spacing.lg,
    gap: spacing.xs + spacing.xs / 2,
  },
  proposalRow: {
    // Full-bleed card wrapper: cancels the bubble's 78% maxWidth so the
    // session proposal occupies the chat list's content width on its own
    // row. Vertical breathing room separates it from adjacent bubbles.
    paddingVertical: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md - spacing.xs / 2,
    paddingVertical: spacing.sm + spacing.xs / 2,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: radii.sm / 2,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceElevated,
    borderBottomLeftRadius: radii.sm / 2,
  },
  bubbleText: {
    ...typography.body,
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
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  composerField: {
    flex: 1,
  },
  input: {
    // TextField's multiline input is sized from `minHeight`; pin the
    // resting height and cap growth (~5 lines) so the keyboard never
    // covers the composer while the user reviews a long message.
    minHeight: COMPOSER_HEIGHT,
    maxHeight: COMPOSER_MAX_HEIGHT,
  },
  sendButton: {
    // + TextField's 1pt border above and below the input.
    width: COMPOSER_HEIGHT + 2,
    height: COMPOSER_HEIGHT + 2,
    minHeight: COMPOSER_HEIGHT + 2,
  },
});
