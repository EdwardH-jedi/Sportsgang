import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Icon, IconButton, TextField } from '../../components/ui';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import { OnboardingFrame, OnboardingSection } from './OnboardingFrame';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep2'>;

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 4;
const BIO_MAX = 400;

export function OnboardingStep2Screen({ navigation }: Props) {
  const { profile, photoUris, uploadProfilePhotos, upsertProfile } = useProfileStore();
  // Hard-clamp hydrated state to MAX_PHOTOS so an over-long persisted/preloaded
  // list cannot silently survive into the screen's working copy.
  const [photos, setPhotos] = useState<string[]>(() => photoUris.slice(0, MAX_PHOTOS));
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

  async function handleContinue() {
    setError(null);
    if (photos.length < MIN_PHOTOS) {
      setError(`Please add at least ${MIN_PHOTOS} photos.`);
      return;
    }
    if (photos.length > MAX_PHOTOS) {
      // Defence-in-depth against malformed hydrated state: the picker already
      // refuses to add past MAX_PHOTOS, but submit must also reject it rather
      // than silently persisting an over-long list downstream.
      setError(`You can only keep up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const trimmedBio = bio.trim();
    if (!trimmedBio) {
      setError('Please write a short bio.');
      return;
    }
    if (!profile || !profile.displayName) {
      // Profile must be present from Step 1 — the backend requires
      // display_name on every profile PUT, so we cannot send bio alone.
      setError('Your basic info is missing. Please restart onboarding.');
      return;
    }
    setIsSubmitting(true);
    try {
      // Upload photos first: avatar_url on the profile is synced server-side
      // to the first photo, so persisting bio afterwards keeps the latest
      // updated_at while preserving the server-assigned avatar.
      await uploadProfilePhotos(photos);
      await upsertProfile({
        displayName: profile.displayName,
        birthYear: profile.birthYear,
        suburb: profile.suburb,
        bio: trimmedBio,
      });
      navigation.navigate('OnboardingStep3');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your photos and bio. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null);

  return (
    <OnboardingFrame
      step={2}
      eyebrow="Profile"
      title="Photos & bio"
      subtitle={`Add ${MIN_PHOTOS}–${MAX_PHOTOS} photos and a short bio so people know who they'll run with.`}
      error={error}
      submitLabel="Continue"
      onSubmit={() => void handleContinue()}
      submitting={isSubmitting}
      withKeyboard
    >
      <OnboardingSection
        title="Photos *"
        hint={`${photos.length} of ${MAX_PHOTOS} selected · at least ${MIN_PHOTOS} required`}
      >
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
      </OnboardingSection>

      <TextField
        label="Bio *"
        value={bio}
        onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
        placeholder="Tell people a bit about yourself and how you train..."
        multiline
        minHeight={120}
        helper={`${bio.length} / ${BIO_MAX}`}
        accessibilityLabel="Bio"
      />
    </OnboardingFrame>
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
        <Icon name="camera" size="lg" color={colors.brand} />
        <Text style={styles.slotAddLabel}>Add photo</Text>
      </Pressable>
    );
  }
  return <View style={[styles.slot, styles.slotEmpty]} />;
}

const styles = StyleSheet.create({
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  slot: {
    width: '47%',
    aspectRatio: 3 / 4,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotFilled: {
    backgroundColor: colors.surfaceElevated,
  },
  slotImage: {
    ...StyleSheet.absoluteFillObject,
  },
  removeButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  slotAdd: {
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandMuted,
    backgroundColor: colors.brandSoft,
  },
  slotPressed: {
    backgroundColor: colors.surfacePressed,
  },
  slotAddLabel: {
    ...typography.buttonSmall,
    color: colors.brand,
  },
  slotEmpty: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
