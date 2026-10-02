import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Screen } from '../../components/Screen';
import { Button } from '../../components/ui';
import { useProfileStore } from '../../stores/profile';
import { TOUCH_TARGET, colors, radii, spacing, typography } from '../../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep2'>;

export const MAX_PHOTOS = 4;
const BIO_MAX = 400;

/**
 * Optional "Photos & bio" screen (reached from Profile). Neither photos nor
 * a bio is required to use the app any more: partner cards lead with sport
 * details. Picked photos replace the saved set (the API takes 1–4 files);
 * the bio can be saved on its own and cleared by leaving it empty.
 */
export function OnboardingStep2Screen({ navigation }: Props) {
  const { profile, photoUris, uploadProfilePhotos, upsertProfile } = useProfileStore();
  // Only freshly picked local files: saved photos are remote URLs that the
  // upload endpoint cannot accept back as files.
  const [photos, setPhotos] = useState<string[]>([]);
  const [bio, setBio] = useState<string>(profile?.bio ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function pickPhoto() {
    setError(null);
    if (photos.length >= MAX_PHOTOS) {
      setError(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo library access needed',
        'SportsGang needs permission to your photo library so you can add profile photos.'
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
    setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, uri]));
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    if (!profile || !profile.displayName) {
      // Every profile PUT needs display_name, so a bio cannot be sent alone.
      setError('Your basic info is missing. Please restart onboarding.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (photos.length > 0) {
        // avatar_url is synced server-side to the first uploaded photo.
        await uploadProfilePhotos(photos);
      }
      const trimmedBio = bio.trim();
      await upsertProfile({
        displayName: profile.displayName,
        birthYear: profile.birthYear,
        suburb: profile.suburb,
        // null (not undefined) clears a previous bio on the server.
        bio: trimmedBio.length > 0 ? trimmedBio : null,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your photos and bio. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null);

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Optional</Text>
        <Text style={styles.title} accessibilityRole="header">
          Photos & bio
        </Text>
        <Text style={styles.subtitle}>
          Add up to {MAX_PHOTOS} photos and a short intro. Both are optional — partners see your
          running and golf details first.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <Text style={styles.hint}>
          {photoUris.length > 0
            ? `You have ${photoUris.length} saved photo${photoUris.length === 1 ? '' : 's'}. Adding new photos replaces them.`
            : `${photos.length} of ${MAX_PHOTOS} selected`}
        </Text>
        <View style={styles.photoGrid}>
          {slots.map((uri, index) => (
            <PhotoSlot
              key={`slot-${index}`}
              uri={uri}
              index={index}
              canAdd={index === photos.length && photos.length < MAX_PHOTOS}
              onAdd={pickPhoto}
              onRemove={() => removePhoto(index)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bio</Text>
        <TextInput
          style={styles.bioInput}
          value={bio}
          onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
          placeholder="A line about how you like to run or play..."
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          accessibilityLabel="Bio"
        />
        <Text style={styles.charCount}>
          {bio.length} / {BIO_MAX}
        </Text>
      </View>

      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button label="Save" onPress={handleSave} loading={isSubmitting} />
      <Button
        label="Not now"
        variant="ghost"
        onPress={() => navigation.goBack()}
        disabled={isSubmitting}
        style={styles.skip}
      />
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
      <View style={[styles.slot, styles.slotFilled]}>
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
        style={({ pressed }) => [styles.slot, styles.slotAdd, pressed && styles.slotPressed]}
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
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slot: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  slotFilled: {
    borderWidth: 2,
    borderColor: colors.brand,
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
  slotPressed: {
    opacity: 0.65,
  },
  slotEmpty: {
    borderWidth: 1,
    borderColor: colors.separator,
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
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  removeButtonText: {
    // Fixed light glyph on the fixed dark overlay dot.
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
  },
  bioInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 120,
    fontSize: typography.bodyLarge.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  charCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  skip: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
});
