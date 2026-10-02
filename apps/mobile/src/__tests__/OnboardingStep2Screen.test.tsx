/**
 * OnboardingStep2Screen tests — optional "Photos & bio" (v2).
 *
 * Photos and bio are no longer a completion gate: the screen is reached
 * from Profile, saves a bio without photos, accepts a single photo (the API
 * takes 1–4) and "Not now" leaves without saving anything.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { OnboardingStep2Screen } from '../screens/onboarding/OnboardingStep2Screen';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

const ImagePicker = require('expo-image-picker');

const mockUpsertProfile = jest.fn();
const mockUploadProfilePhotos = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: jest.fn(),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

function makeNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
}

const PROFILE = {
  id: 'p1',
  userId: 'u1',
  displayName: 'Jordan Lee',
  birthYear: 1990,
  suburb: 'Newtown',
  bio: undefined as string | undefined,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function setupStore(overrides: Record<string, unknown> = {}) {
  const { useProfileStore } = require('../stores/profile');
  (useProfileStore as jest.Mock).mockReturnValue({
    profile: PROFILE,
    photoUris: [],
    uploadProfilePhotos: mockUploadProfilePhotos,
    upsertProfile: mockUpsertProfile,
    ...overrides,
  });
}

async function addPhoto(utils: ReturnType<typeof render>, label: string, uri: string) {
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri }] });
  fireEvent.press(utils.getByLabelText(label));
  await waitFor(() => utils.getByLabelText(`Remove photo ${label.match(/\d+/)?.[0]}`));
}

function renderScreen(nav = makeNavigation()) {
  return { nav, ...render(<OnboardingStep2Screen navigation={nav as any} route={{} as any} />) };
}

describe('OnboardingStep2Screen (optional photos & bio)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  it('is labelled optional and has no onboarding step indicator', () => {
    const { getByText, queryByText, getByLabelText } = renderScreen();
    getByText('Optional');
    getByText('Photos & bio');
    getByLabelText('Add photo 1');
    getByLabelText('Bio');
    expect(queryByText(/Step \d of 4/)).toBeNull();
  });

  it('saves a bio without any photos and goes back', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    const { nav, getByLabelText } = renderScreen();
    fireEvent.changeText(getByLabelText('Bio'), '  Early-morning runner in the Inner West.  ');
    fireEvent.press(getByLabelText('Save'));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect(mockUploadProfilePhotos).not.toHaveBeenCalled();
    expect(mockUpsertProfile).toHaveBeenCalledWith({
      displayName: 'Jordan Lee',
      birthYear: 1990,
      suburb: 'Newtown',
      bio: 'Early-morning runner in the Inner West.',
    });
  });

  it('sends bio: null when the bio is left empty (clears it server-side)', async () => {
    setupStore({ profile: { ...PROFILE, bio: 'Old bio' } });
    mockUpsertProfile.mockResolvedValue(undefined);
    const { nav, getByLabelText } = renderScreen();
    fireEvent.changeText(getByLabelText('Bio'), '   ');
    fireEvent.press(getByLabelText('Save'));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect(mockUpsertProfile).toHaveBeenCalledWith(expect.objectContaining({ bio: null }));
  });

  it('uploads a single photo (no two-photo minimum) before saving the bio', async () => {
    mockUploadProfilePhotos.mockResolvedValue(['https://api/media/profile_photos/u1/00.jpg']);
    mockUpsertProfile.mockResolvedValue(undefined);
    const utils = renderScreen();
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    fireEvent.press(utils.getByLabelText('Save'));
    await waitFor(() => expect(utils.nav.goBack).toHaveBeenCalled());
    expect(mockUploadProfilePhotos).toHaveBeenCalledWith(['file:///tmp/p1.jpg']);
    const uploadOrder = mockUploadProfilePhotos.mock.invocationCallOrder[0];
    const upsertOrder = mockUpsertProfile.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(upsertOrder);
  });

  it('"Not now" leaves without saving anything', () => {
    const { nav, getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('Not now'));
    expect(nav.goBack).toHaveBeenCalled();
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(mockUploadProfilePhotos).not.toHaveBeenCalled();
  });

  it('tells the user how many photos are already saved and that new ones replace them', () => {
    setupStore({ photoUris: ['https://api/a.jpg', 'https://api/b.jpg'] });
    const { getByText } = renderScreen();
    getByText('You have 2 saved photos. Adding new photos replaces them.');
  });

  it('removes a picked photo', async () => {
    const utils = renderScreen();
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    fireEvent.press(utils.getByLabelText('Remove photo 1'));
    await waitFor(() => utils.getByLabelText('Add photo 1'));
  });

  it('caps selection at 4 photos', async () => {
    const utils = renderScreen();
    for (let i = 1; i <= 4; i++) {
      await addPhoto(utils, `Add photo ${i}`, `file:///tmp/p${i}.jpg`);
    }
    expect(utils.queryByLabelText('Add photo 5')).toBeNull();
    expect(utils.queryByLabelText('Add photo 1')).toBeNull();
  });

  it('alerts and does not open the picker when permission is denied', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('Add photo 1'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('stays on screen and shows the error when the upload fails', async () => {
    mockUploadProfilePhotos.mockRejectedValue(new Error('Upload failed'));
    const utils = renderScreen();
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    fireEvent.press(utils.getByLabelText('Save'));
    await waitFor(() => utils.getByText('Upload failed'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(utils.nav.goBack).not.toHaveBeenCalled();
  });

  it('stays on screen when saving the bio fails', async () => {
    mockUpsertProfile.mockRejectedValue(new Error('Server error'));
    const { nav, getByLabelText, getByText } = renderScreen();
    fireEvent.changeText(getByLabelText('Bio'), 'Ready to train.');
    fireEvent.press(getByLabelText('Save'));
    await waitFor(() => getByText('Server error'));
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it('refuses to save when the basic profile is missing', async () => {
    setupStore({ profile: null });
    const { nav, getByLabelText, getByText } = renderScreen();
    fireEvent.press(getByLabelText('Save'));
    await waitFor(() => getByText('Your basic info is missing. Please restart onboarding.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(nav.goBack).not.toHaveBeenCalled();
  });
});
