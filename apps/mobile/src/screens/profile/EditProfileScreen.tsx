import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Screen } from '../../components/Screen';
import { Select } from '../../components/Select';
import { SYDNEY_SUBURB_OPTIONS } from '../../data/sydneySuburbs';
import {
  DISPLAY_NAME_HELPER_TEXT,
  sanitizeDisplayName,
} from '../../lib/displayName';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { EditProfileScreenProps } from '../../navigation/types';

const BIO_MAX = 400;
// Photos are optional; replacing them needs at least one new photo (API takes 1–4).
export const MIN_PHOTOS = 1;
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
  // fresh 1-4 set.
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
        setError('Add at least one photo, or keep your current photos.');
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
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            disabled={isSaving}
          >
            <Text style={styles.backButtonText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Edit profile</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.form}>
          {/* Section: Basic info */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Basic info</Text>

            <View style={styles.field}>
              <Text style={styles.label}>
                Display name<Text style={styles.required}> *</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={(text) =>
                  setDisplayName(sanitizeDisplayName(text))
                }
                placeholder="How you'll appear to others"
                placeholderTextColor={colors.textTertiary}
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
                accessibilityLabel="Display name"
              />
              <Text style={styles.helperText}>{DISPLAY_NAME_HELPER_TEXT}</Text>
            </View>

            <View style={styles.field}>
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
            </View>
          </View>

          {/* Section: Photos */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Photos</Text>
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
                <Pressable
                  onPress={() => {
                    setReplaceMode(true);
                    setError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Replace photos"
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  disabled={isSaving}
                >
                  <Text style={styles.secondaryButtonText}>Replace photos</Text>
                </Pressable>
                <Text style={styles.helperText}>
                  Replacing photos uploads a fresh {MIN_PHOTOS}-{MAX_PHOTOS} set from your library.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.helperText}>
                  {newPhotos.length} of {MAX_PHOTOS} selected
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
                <Pressable
                  onPress={cancelReplaceMode}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel photo replacement"
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
                  disabled={isSaving}
                >
                  <Text style={styles.secondaryButtonText}>Keep current photos</Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Section: Bio */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Bio</Text>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
              placeholder="Tell partners a bit about yourself..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              accessibilityLabel="Bio"
            />
            <Text style={styles.charCount}>{bio.length} / {BIO_MAX}</Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || isSaving) && styles.saveButtonPressed,
            ]}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
          >
            {isSaving ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
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
        <Pressable
          style={styles.removeButton}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove photo ${index + 1}`}
        >
          <Text style={styles.removeButtonText}>×</Text>
        </Pressable>
      </View>
    );
  }
  if (canAdd) {
    return (
      <Pressable
        style={({ pressed }) => [styles.slot, styles.slotAdd, pressed && styles.pressed]}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={`Add photo ${index + 1}`}
      >
        <Text style={styles.slotAddPlus}>+</Text>
        <Text style={styles.slotAddLabel}>Add photo</Text>
      </Pressable>
    );
  }
  return <View style={[styles.slot, styles.slotEmpty]} />;
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.surfaceElevated,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surfaceElevated,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  backButton: {
    minWidth: 64,
  },
  backButtonText: {
    ...typography.body,
    color: colors.brand,
    fontWeight: '600',
  },
  form: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    // Explicit fontSize/fontWeight only — spreading bodyLarge brings
    // lineHeight 26 which clips descenders on a single-line TextInput
    // on Android. Mirrors OnboardingStep1 / RegisterScreen.
    fontSize: typography.bodyLarge.fontSize,
    fontWeight: typography.bodyLarge.fontWeight,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  bioInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 120,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  charCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  helperText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  previewThumb: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.brandSoft,
  },
  editGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  slot: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.inputBackground,
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  slotAdd: {
    borderWidth: 2,
    borderColor: colors.brand,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  slotEmpty: {
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.inputBackground,
    opacity: 0.5,
  },
  slotAddPlus: {
    ...typography.h1,
    color: colors.brand,
    fontSize: 36,
    lineHeight: 40,
  },
  slotAddLabel: {
    ...typography.bodySmall,
    color: colors.brand,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    // Hardcoded white: the removeButton background is a fixed dark dot,
    // independent of theme `textInverse`.
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 22,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.brandSoft,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.brand,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  saveButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.md,
  },
  saveButtonPressed: {
    opacity: 0.65,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 17,
  },
  pressed: {
    opacity: 0.65,
  },
});
