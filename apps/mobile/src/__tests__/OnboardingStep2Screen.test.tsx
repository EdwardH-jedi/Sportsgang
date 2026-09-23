/**
 * OnboardingStep2Screen tests (Slice B — photos + bio).
 *
 * Step 2 now owns:
 *  - 2–4 profile photos picked from the device photo library
 *  - a required bio persisted via upsertProfile alongside the basic info
 *    already captured in Step 1
 *
 * Mocks:
 *  - stores/profile (useProfileStore)
 *  - expo-image-picker
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Alert } from 'react-native';
import { render as rtlRender, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';


import { OnboardingStep2Screen } from '../screens/onboarding/OnboardingStep2Screen';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function SafeArea({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={safeAreaMetrics}>{children}</SafeAreaProvider>;
}

/** Screens use the Screen primitive, which needs safe-area context. */
function render(ui: React.ReactElement) {
  return rtlRender(ui, { wrapper: SafeArea });
}


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

jest.mock('../stores/profile', () => ({
  useProfileStore: jest.fn(),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────


// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { navigate: jest.fn(), replace: jest.fn() };
}

function setupStore(overrides: Record<string, unknown> = {}) {
  const { useProfileStore } = require('../stores/profile');
  (useProfileStore as jest.Mock).mockReturnValue({
    profile: {
      id: 'p1',
      userId: 'u1',
      displayName: 'Jordan Lee',
      birthYear: 1990,
      suburb: 'Newtown',
      bio: undefined,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    photoUris: [],
    uploadProfilePhotos: mockUploadProfilePhotos,
    upsertProfile: mockUpsertProfile,
    ...overrides,
  });
}

function grantPermission() {
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
}

function pickAsset(uri: string) {
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri }],
  });
}

async function addPhoto(utils: ReturnType<typeof render>, label: string, uri: string) {
  grantPermission();
  pickAsset(uri);
  fireEvent.press(utils.getByLabelText(label));
  await waitFor(() => utils.getByLabelText(`Remove photo ${label.match(/\d+/)?.[0]}`));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OnboardingStep2Screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the step indicator for 4-step flow', () => {
    const { getByText } = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Step 2 of 4');
  });

  it('renders four photo slots and a bio field', () => {
    const { getByLabelText } = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByLabelText('Add photo 1');
    // Slots 2–4 are disabled until the prior slot is filled, so they render
    // but are not pressable add-buttons yet.
    getByLabelText('Bio');
  });

  it('lays photos out as two equal flex cells per row (no percentage gap maths)', () => {
    const { getByLabelText, getAllByText } = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    expect(StyleSheet.flatten(getByLabelText('Add photo 1').props.style).flex).toBe(1);
    // Photos + Bio carry the red required marker.
    expect(getAllByText(' *')).toHaveLength(2);
  });

  it('shows selection count hint', () => {
    const { getByText } = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText(/0 of 4 selected/);
  });

  // ── Photo selection ────────────────────────────────────────────────────────

  it('adds a photo from the library and renders it in the first slot', async () => {
    const utils = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    utils.getByLabelText('Remove photo 1');
  });

  it('removes a photo when the remove button is pressed', async () => {
    const utils = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    fireEvent.press(utils.getByLabelText('Remove photo 1'));
    await waitFor(() => utils.getByLabelText('Add photo 1'));
  });

  it('alerts and does not launch picker when permission is denied', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });
    const utils = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(utils.getByLabelText('Add photo 1'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it('blocks Continue when fewer than 2 photos are selected', async () => {
    const utils = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    fireEvent.changeText(utils.getByLabelText('Bio'), 'Love a morning run.');
    fireEvent.press(utils.getByLabelText('Continue'));
    await waitFor(() => utils.getByText('Please add at least 2 photos.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('blocks Continue when bio is only whitespace', async () => {
    const utils = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    await addPhoto(utils, 'Add photo 2', 'file:///tmp/p2.jpg');
    fireEvent.changeText(utils.getByLabelText('Bio'), '   ');
    fireEvent.press(utils.getByLabelText('Continue'));
    await waitFor(() => utils.getByText('Please write a short bio.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
  });

  it('caps photo selection at 4 by hiding the add slot', async () => {
    const utils = render(
      <OnboardingStep2Screen navigation={makeNavigation() as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    await addPhoto(utils, 'Add photo 2', 'file:///tmp/p2.jpg');
    await addPhoto(utils, 'Add photo 3', 'file:///tmp/p3.jpg');
    await addPhoto(utils, 'Add photo 4', 'file:///tmp/p4.jpg');
    expect(utils.queryByLabelText('Add photo 5')).toBeNull();
    // All 4 slots are now filled; no "Add photo" slot remains.
    expect(utils.queryByLabelText('Add photo 1')).toBeNull();
  });

  // ── Successful submit ──────────────────────────────────────────────────────

  it('uploads photos to the backend and persists bio, then navigates', async () => {
    mockUploadProfilePhotos.mockResolvedValue([
      'https://api/media/profile_photos/u1/00.jpg',
      'https://api/media/profile_photos/u1/01.jpg',
    ]);
    mockUpsertProfile.mockResolvedValue(undefined);
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep2Screen navigation={nav as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    await addPhoto(utils, 'Add photo 2', 'file:///tmp/p2.jpg');
    fireEvent.changeText(utils.getByLabelText('Bio'), '  Early-morning runner in the Inner West.  ');
    fireEvent.press(utils.getByLabelText('Continue'));
    await waitFor(() => {
      expect(mockUploadProfilePhotos).toHaveBeenCalledWith([
        'file:///tmp/p1.jpg',
        'file:///tmp/p2.jpg',
      ]);
    });
    expect(mockUpsertProfile).toHaveBeenCalledWith({
      displayName: 'Jordan Lee',
      birthYear: 1990,
      suburb: 'Newtown',
      bio: 'Early-morning runner in the Inner West.',
    });
    expect(nav.navigate).toHaveBeenCalledWith('OnboardingStep3');
  });

  // ── API error ──────────────────────────────────────────────────────────────

  it('does not advance and surfaces the error if photo upload fails', async () => {
    mockUploadProfilePhotos.mockRejectedValue(new Error('Upload failed'));
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep2Screen navigation={nav as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    await addPhoto(utils, 'Add photo 2', 'file:///tmp/p2.jpg');
    fireEvent.changeText(utils.getByLabelText('Bio'), 'Ready to train.');
    fireEvent.press(utils.getByLabelText('Continue'));
    await waitFor(() => utils.getByText('Upload failed'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('does not advance if bio persistence fails after a successful upload', async () => {
    mockUploadProfilePhotos.mockResolvedValue([
      'https://api/media/profile_photos/u1/00.jpg',
      'https://api/media/profile_photos/u1/01.jpg',
    ]);
    mockUpsertProfile.mockRejectedValue(new Error('Server error'));
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep2Screen navigation={nav as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    await addPhoto(utils, 'Add photo 2', 'file:///tmp/p2.jpg');
    fireEvent.changeText(utils.getByLabelText('Bio'), 'Ready to train.');
    fireEvent.press(utils.getByLabelText('Continue'));
    await waitFor(() => utils.getByText('Server error'));
    expect(mockUpsertProfile).toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  // ── Missing basic info guard ───────────────────────────────────────────────

  it('fails gracefully if the profile from Step 1 is missing', async () => {
    setupStore({ profile: null });
    const nav = makeNavigation();
    const utils = render(
      <OnboardingStep2Screen navigation={nav as any} route={{} as any} />
    );
    await addPhoto(utils, 'Add photo 1', 'file:///tmp/p1.jpg');
    await addPhoto(utils, 'Add photo 2', 'file:///tmp/p2.jpg');
    fireEvent.changeText(utils.getByLabelText('Bio'), 'Ready.');
    fireEvent.press(utils.getByLabelText('Continue'));
    await waitFor(() => utils.getByText('Your basic info is missing. Please restart onboarding.'));
    expect(mockUpsertProfile).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});
