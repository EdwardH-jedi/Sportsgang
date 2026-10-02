/**
 * EditProfileScreen tests
 *
 * Mocks:
 *  - stores/profile (useProfileStore → profile, photoUris, upsertProfile,
 *                    uploadProfilePhotos, fetchProfile)
 *  - expo-image-picker
 *  - components/Screen
 *  - theme
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { EditProfileScreen } from '../screens/profile/EditProfileScreen';

// ─── Mock expo-image-picker ───────────────────────────────────────────────────

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

const ImagePicker = require('expo-image-picker');

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockUpsertProfile = jest.fn();
const mockUploadProfilePhotos = jest.fn();
const mockFetchProfile = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: jest.fn(),
}));

function setupStore(overrides: Record<string, unknown> = {}) {
  const { useProfileStore } = require('../stores/profile');
  (useProfileStore as jest.Mock).mockReturnValue({
    profile: {
      id: 'p1',
      userId: 'u1',
      displayName: 'Jordan Lee',
      birthYear: 1990,
      suburb: 'Newtown',
      bio: 'Old bio',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    photoUris: [
      'http://api/media/profile_photos/u1/00.jpg',
      'http://api/media/profile_photos/u1/01.jpg',
    ],
    upsertProfile: mockUpsertProfile,
    uploadProfilePhotos: mockUploadProfilePhotos,
    fetchProfile: mockFetchProfile,
    ...overrides,
  });
}

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', border: '#ccc', surface: '#fff',
    surfaceElevated: '#f5f5f5', background: '#fafafa', separator: '#e0e0e0',
    textPrimary: '#000', textSecondary: '#555', textTertiary: '#888',
    textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h1: {}, h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { goBack: jest.fn(), navigate: jest.fn() };
}

function grantPhotoPermission() {
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
}

function pickAsset(uri: string) {
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri }],
  });
}

async function addNewPhoto(utils: ReturnType<typeof render>, label: string, uri: string) {
  grantPhotoPermission();
  pickAsset(uri);
  fireEvent.press(utils.getByLabelText(label));
  await waitFor(() => utils.getByLabelText(`Remove photo ${label.match(/\d+/)?.[0]}`));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EditProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Pre-population ─────────────────────────────────────────────────────────

  it('pre-populates display name, suburb, and bio from the current profile', () => {
    const utils = render(
      <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    expect(utils.getByLabelText('Display name').props.value).toBe('Jordan Lee');
    expect(utils.getByLabelText('Bio').props.value).toBe('Old bio');
    // Suburb Select renders the chosen value as visible text
    utils.getByText('Newtown');
  });

  it('shows existing photo thumbnails as read-only previews', () => {
    const utils = render(
      <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    utils.getByLabelText('Saved photo 1');
    utils.getByLabelText('Saved photo 2');
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('blocks save and surfaces an error if display name is cleared', async () => {
    const utils = render(
      <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.changeText(utils.getByLabelText('Display name'), '   ');
    fireEvent.press(utils.getByLabelText('Save profile'));
    await waitFor(() => utils.getByText('Please enter a display name.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('blocks save when in replace-photos mode without any new photo', async () => {
    const utils = render(
      <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Replace photos'));
    // No photos picked yet
    fireEvent.press(utils.getByLabelText('Save profile'));
    await waitFor(() => utils.getByText('Add at least one photo, or keep your current photos.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(mockUploadProfilePhotos).not.toHaveBeenCalled();
  });

  // ── Save without changing photos ───────────────────────────────────────────

  it('persists a changed suburb selected through the Select UI', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    mockFetchProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );

    // Open the suburb picker and choose a different suburb than the
    // pre-populated one ("Newtown" → "Bondi"). The first matching label
    // is the option in the modal list.
    fireEvent.press(utils.getByLabelText('Sydney suburb'));
    fireEvent.press(utils.getAllByText('Bondi')[0]);

    fireEvent.press(utils.getByLabelText('Save profile'));

    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ suburb: 'Bondi' })
      );
    });
    expect(mockFetchProfile).toHaveBeenCalledTimes(1);
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('saves profile fields without uploading photos, then refreshes and goes back', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    mockFetchProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(utils.getByLabelText('Display name'), 'Jordan L.');
    fireEvent.changeText(utils.getByLabelText('Bio'), 'Updated bio.');
    fireEvent.press(utils.getByLabelText('Save profile'));

    await waitFor(() => {
      expect(mockUpsertProfile).toHaveBeenCalledWith({
        displayName: 'Jordan L.',
        birthYear: 1990,
        suburb: 'Newtown',
        bio: 'Updated bio.',
      });
    });
    expect(mockUploadProfilePhotos).not.toHaveBeenCalled();
    expect(mockFetchProfile).toHaveBeenCalledTimes(1);
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('sends bio: null (not undefined) when the user clears the bio so the backend nulls it', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    mockFetchProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.changeText(utils.getByLabelText('Bio'), '   ');
    fireEvent.press(utils.getByLabelText('Save profile'));

    await waitFor(() => expect(mockUpsertProfile).toHaveBeenCalled());
    const payload = mockUpsertProfile.mock.calls[0][0];
    // Must be exactly `null` so JSON.stringify emits `"bio": null`. `undefined`
    // would be dropped by the serializer and the backend would preserve the
    // previous bio.
    expect(payload.bio).toBeNull();
    expect('bio' in payload).toBe(true);

    // Save still completes the rest of the flow.
    expect(mockFetchProfile).toHaveBeenCalledTimes(1);
    expect(nav.goBack).toHaveBeenCalled();
  });

  // ── Save with replaced photos ──────────────────────────────────────────────

  it('uploads new photos before upserting profile when replace mode is active', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    mockUploadProfilePhotos.mockResolvedValue([
      'http://api/media/profile_photos/u1/new1.jpg',
      'http://api/media/profile_photos/u1/new2.jpg',
    ]);
    mockFetchProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );

    fireEvent.press(utils.getByLabelText('Replace photos'));
    await addNewPhoto(utils, 'Add photo 1', 'file:///tmp/new1.jpg');
    await addNewPhoto(utils, 'Add photo 2', 'file:///tmp/new2.jpg');

    fireEvent.press(utils.getByLabelText('Save profile'));

    await waitFor(() => expect(mockUploadProfilePhotos).toHaveBeenCalledWith([
      'file:///tmp/new1.jpg',
      'file:///tmp/new2.jpg',
    ]));
    expect(mockUpsertProfile).toHaveBeenCalled();
    expect(mockFetchProfile).toHaveBeenCalled();
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('accepts a single replacement photo (photos are optional; API takes 1-4)', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    mockUploadProfilePhotos.mockResolvedValue(['http://api/media/profile_photos/u1/only.jpg']);
    mockFetchProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Replace photos'));
    await addNewPhoto(utils, 'Add photo 1', 'file:///tmp/only.jpg');
    fireEvent.press(utils.getByLabelText('Save profile'));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect(mockUploadProfilePhotos).toHaveBeenCalledWith(['file:///tmp/only.jpg']);
  });

  // ── Cancel replace mode ────────────────────────────────────────────────────

  it('exits replace mode and clears picked photos when "Keep current photos" is pressed', async () => {
    const utils = render(
      <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Replace photos'));
    await addNewPhoto(utils, 'Add photo 1', 'file:///tmp/new1.jpg');
    fireEvent.press(utils.getByLabelText('Cancel photo replacement'));
    await waitFor(() => utils.getByLabelText('Replace photos'));
    expect(utils.queryByLabelText('Add photo 1')).toBeNull();
  });

  // ── Permission denied ──────────────────────────────────────────────────────

  it('alerts and does not launch the picker when photo permission is denied', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    const utils = render(
      <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Replace photos'));
    fireEvent.press(utils.getByLabelText('Add photo 1'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  // ── Save error ─────────────────────────────────────────────────────────────

  it('does not navigate back when upsertProfile fails and surfaces the error', async () => {
    mockUpsertProfile.mockRejectedValue(new Error('Server error'));
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Save profile'));
    await waitFor(() => utils.getByText('Server error'));
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  // ── Cancel header ──────────────────────────────────────────────────────────

  it('goes back when the Cancel header is pressed', () => {
    const nav = makeNavigation();
    const utils = render(
      <EditProfileScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Cancel'));
    expect(nav.goBack).toHaveBeenCalled();
  });

  // ── Display name input rendering bug regression ────────────────────────────
  // Mirrors the contracts pinned in OnboardingStep1Screen.test.tsx. The
  // EditProfile flow lacked these defenses and reproduced the same on-device
  // regressions: '@'/descender clip from a TextInput lineHeight, and an iOS
  // Strong Password Autofill yellow box that captured keystrokes before they
  // reached React state. These tests pin the contract that defeats both.
  describe('display name input rendering (regression)', () => {
    function getDisplayNameInput(utils: ReturnType<typeof render>) {
      return utils.getByLabelText('Display name');
    }

    it('does not set a TextInput lineHeight that would clip descenders', () => {
      const utils = render(
        <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getDisplayNameInput(utils);
      const style = Array.isArray(input.props.style)
        ? Object.assign({}, ...input.props.style)
        : input.props.style;
      expect(style.lineHeight).toBeUndefined();
      const { colors: themeColors } = require('../theme');
      expect(style.color).toBe(themeColors.textPrimary);
    });

    it('declares an iOS non-credential content type so Strong Password Autofill cannot capture the field', () => {
      const utils = render(
        <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getDisplayNameInput(utils);
      expect(input.props.textContentType).not.toBe('none');
      expect(['nickname', 'username', 'givenName', 'name']).toContain(
        input.props.textContentType
      );
    });

    it('declares a non-credential autofill hint and keeps importantForAutofill="no" so Android cannot write to the native input without firing onChangeText', () => {
      const utils = render(
        <EditProfileScreen navigation={makeNavigation() as any} route={{} as any} />
      );
      const input = getDisplayNameInput(utils);
      expect(['name', 'username', 'off']).toContain(input.props.autoComplete);
      expect(input.props.autoComplete).not.toBe('password');
      expect(input.props.autoComplete).not.toBe('current-password');
      expect(input.props.autoComplete).not.toBe('new-password');
      expect(input.props.importantForAutofill).toBe('no');
    });

    it('sanitizes Korean / non-English keystrokes out of the controlled value before submit', async () => {
      mockUpsertProfile.mockResolvedValue(undefined);
      mockFetchProfile.mockResolvedValue(undefined);
      const nav = makeNavigation();
      const utils = render(
        <EditProfileScreen navigation={nav as any} route={{} as any} />
      );
      // The Edit Profile flow pre-populates with the existing profile's
      // displayName ("Jordan Lee"). Simulate the user typing a mixed CJK +
      // Latin replacement; the sanitizer must strip the CJK characters
      // before they reach React state, so the upsertProfile payload only
      // contains the Latin portion.
      fireEvent.changeText(getDisplayNameInput(utils), '김민수Jordan');
      fireEvent.press(utils.getByLabelText('Save profile'));
      await waitFor(() => {
        expect(mockUpsertProfile).toHaveBeenCalledWith(
          expect.objectContaining({ displayName: 'Jordan' })
        );
      });
    });
  });
});

// silence the act warnings
afterEach(() => {
  jest.clearAllMocks();
});
