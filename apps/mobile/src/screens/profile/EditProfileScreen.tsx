import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { FormErrorBanner } from '../../components/FormErrorBanner';
import { Select } from '../../components/Select';
import { Button, Card, Header, Icon, IconButton, Screen, TextField } from '../../components/ui';
import { SYDNEY_SUBURB_OPTIONS } from '../../data/sydneySuburbs';
import {
  DISPLAY_NAME_HELPER_TEXT,
  sanitizeDisplayName,
} from '../../lib/displayName';
import { useProfileStore } from '../../stores/profile';
import { colors, layout, radii, spacing, typography } from '../../theme';
import type { EditProfileScreenProps } from '../../navigation/types';

const BIO_MAX = 400;
export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 4;

export function EditProfileScreen({ navigation }: EditProfileScreenProps) {
  const { profile, photoUris, upsertProfile, uploadProfilePhotos, fetchProfile } =
    useProfileStore();

  const [displayName, setDisplayName] = useState<string>(profile?.displayName ?? '');
  const [suburb, setSuburb] = useState<string | null>(profile?.suburb ?? null);
  const [bio, setBio] = useState<string>(profile?.bio ?? '');

  // Photo replacement is opt-in. The backend's PUT /users/me/photos replaces
  // the entire set with uploaded files; existing absolute media URLs in
  // photoUris cannot be re-submitted as files. So we keep the existing photos
  // untouched unless the user explicitly enters "replace" mode and picks a
  // fresh 2-4 set.
  const [replaceMode, setReplaceMode] = useState(false);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function pickPhoto() {
    setError(null);
    if (newPhotos.length >= MAX_PHOTOS) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo library access needed',
        'SportsGang needs permission to your photo library so you can update your profile photos.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setNewPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, uri]));
  }

  function removeNewPhoto(index: number) {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function cancelReplaceMode() {
    setReplaceMode(false);
    setNewPhotos([]);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Please enter a display name.');
      return;
    }
    if (!suburb) {
      setError('Please select your Sydney suburb.');
      return;
    }
    if (replaceMode) {
      if (newPhotos.length < MIN_PHOTOS) {
        setError(`Please add at least ${MIN_PHOTOS} photos or cancel replacing.`);
        return;
      }
      if (newPhotos.length > MAX_PHOTOS) {
        setError(`You can only keep up to ${MAX_PHOTOS} photos.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      if (replaceMode) {
        await uploadProfilePhotos(newPhotos);
      }
      const trimmedBio = bio.trim();
      await upsertProfile({
        displayName: trimmedName,
        // Preserve birthYear from the existing profile so we don't accidentally
        // null it out — onboarding routing depends on it.
        birthYear: profile?.birthYear,
        suburb,
        // Send `null` (not `undefined`) when the user clears the bio so the
        // backend explicitly sets the column to NULL. JSON.stringify drops
        // undefined keys, which would leave the previous bio in place.
        bio: trimmedBio.length > 0 ? trimmedBio : null,
      });
      // Re-fetch so the Profile screen we return to renders the persisted
      // values (including any photo URLs the server just minted).
      await fetchProfile();
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const newPhotoSlots = Array.from({ length: MAX_PHOTOS }, (_, i) => newPhotos[i] ?? null);

  return (
    <Screen padded={false} withKeyboard>
      <Header
        title="Edit profile"
        leading={
          <Button
            label="Cancel"
            variant="ghost"
            size="sm"
            onPress={() => navigation.goBack()}
            disabled={isSaving}
            accessibilityLabel="Cancel"
          />
        }
        style={styles.header}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Section: Basic info */}
        <Section title="Basic info">
          <Card padding="lg" style={styles.cardBody}>
            <TextField
              label="Display name *"
              accessibilityLabel="Display name"
              helper={DISPLAY_NAME_HELPER_TEXT}
              value={displayName}
              onChangeText={(text) => setDisplayName(sanitizeDisplayName(text))}
              placeholder="How you'll appear to others"
              autoCapitalize="words"
              autoCorrect={false}
              spellCheck={false}
              // Mirror OnboardingStep1's displayName defenses. iOS
              // Password Autofill paints the field yellow and captures
              // keystrokes if a credential-save overlay is still alive
              // when this input mounts. `textContentType="name"` is the
              // strongest non-credential iOS semantic and breaks the
              // association. Android side: matching `autoComplete="name"`
              // + `importantForAutofill="no"` so no autofill source can
              // write to the native input without firing onChangeText.
              textContentType="name"
              autoComplete="name"
              importantForAutofill="no"
              // A lineHeight on a single-line TextInput clips descenders
              // and "@" on Android; clear the one TextField spreads in.
            />

            <Select
              label="Your Sydney suburb"
              required
              value={suburb}
              onChange={setSuburb}
              placeholder="Select your suburb"
              options={SYDNEY_SUBURB_OPTIONS}
              searchable
              modalTitle="Sydney suburb"
              accessibilityLabel="Sydney suburb"
            />
          </Card>
        </Section>

        {/* Section: Photos */}
        <Section title="Photos">
          <Card padding="lg" style={styles.cardBody}>
            {!replaceMode ? (
              <>
                {photoUris.length > 0 ? (
                  <View style={styles.previewGrid}>
                    {photoUris.map((uri, idx) => (
                      <Image
                        key={`${uri}-${idx}`}
                        source={{ uri }}
                        style={styles.previewThumb}
                        resizeMode="cover"
                        accessibilityLabel={`Saved photo ${idx + 1}`}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.helperText}>No photos saved yet.</Text>
                )}
                <Button
                  label="Replace photos"
                  variant="secondary"
                  leadingIcon="image"
                  fullWidth
                  onPress={() => {
                    setReplaceMode(true);
                    setError(null);
                  }}
                  disabled={isSaving}
                  accessibilityLabel="Replace photos"
                />
                <Text style={styles.helperText}>
                  Replacing photos uploads a fresh {MIN_PHOTOS}-{MAX_PHOTOS} set from your library.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.helperText}>
                  {newPhotos.length} of {MAX_PHOTOS} selected · at least {MIN_PHOTOS} required
                </Text>
                <View style={styles.editGrid}>
                  {newPhotoSlots.map((uri, index) => (
                    <PhotoSlot
                      key={`slot-${index}`}
                      uri={uri}
                      index={index}
                      canAdd={index === newPhotos.length && newPhotos.length < MAX_PHOTOS}
                      onAdd={pickPhoto}
                      onRemove={() => removeNewPhoto(index)}
                    />
                  ))}
                </View>
                <Button
                  label="Keep current photos"
                  variant="ghost"
                  fullWidth
                  onPress={cancelReplaceMode}
                  disabled={isSaving}
                  accessibilityLabel="Cancel photo replacement"
                />
              </>
            )}
          </Card>
        </Section>

        {/* Section: Bio */}
        <Section title="Bio">
          <TextField
            value={bio}
            onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
            placeholder="Tell partners a bit about yourself..."
            multiline
            numberOfLines={5}
            minHeight={BIO_MIN_HEIGHT}
            textAlignVertical="top"
            accessibilityLabel="Bio"
          />
          <Text style={styles.charCount}>{bio.length} / {BIO_MAX}</Text>
        </Section>

        <FormErrorBanner message={error} />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Save"
          size="lg"
          fullWidth
          loading={isSaving}
          onPress={handleSave}
          accessibilityLabel="Save profile"
        />
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

interface PhotoSlotProps {
  uri: string | null;
  index: number;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: () => void;
}

function PhotoSlot({ uri, index, canAdd, onAdd, onRemove }: PhotoSlotProps) {
  if (uri) {
    return (
      <View style={styles.slot}>
        <Image source={{ uri }} style={styles.slotImage} resizeMode="cover" />
        <IconButton
          icon="close"
          size="sm"
          variant="filled"
          onPress={onRemove}
          accessibilityLabel={`Remove photo ${index + 1}`}
          style={styles.removeButton}
        />
      </View>
    );
  }
  if (canAdd) {
    return (
      <Pressable
        style={({ pressed }) => [styles.slot, styles.slotAdd, pressed && styles.slotPressed]}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={`Add photo ${index + 1}`}
      >
        <Icon name="plus" size="lg" color={colors.brand} />
        <Text style={styles.slotAddLabel}>Add photo</Text>
      </Pressable>
    );
  }
  return <View style={[styles.slot, styles.slotEmpty]} />;
}

const BIO_MIN_HEIGHT = spacing.xxxl * 2;

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm + spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  cardBody: {
    gap: spacing.md + spacing.xs,
  },
  helperText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  charCount: {
    ...typography.caption,
    alignSelf: 'flex-end',
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewThumb: {
    width: '23%',
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
  },
  editGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slot: {
    width: '48%',
    aspectRatio: 3 / 4,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandMuted,
    backgroundColor: colors.brandSoft,
  },
  slotPressed: {
    backgroundColor: colors.surfacePressed,
  },
  slotAddLabel: {
    ...typography.caption,
    color: colors.brand,
  },
  slotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
});
