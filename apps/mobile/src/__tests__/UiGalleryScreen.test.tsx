import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UiGalleryScreen } from '../screens/dev/UiGalleryScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('UiGalleryScreen (dev only)', () => {
  it('renders a section for every primitive and navigates back', () => {
    const goBack = jest.fn();
    const { getByRole } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <UiGalleryScreen navigation={{ goBack } as never} route={{ key: 'k', name: 'UiGallery' } as never} />
      </SafeAreaProvider>
    );
    for (const section of [
      'Typography',
      'Button',
      'IconButton',
      'TextField',
      'Card',
      'Chip',
      'SegmentedControl',
      'Badge / Tag',
      'Avatar',
      'Header',
      'ListRow',
      'StatBlock',
      'Skeleton',
      'EmptyState',
      'BottomSheet',
      'Icons',
    ]) {
      expect(getByRole('header', { name: section })).toBeTruthy();
    }
    fireEvent.press(getByRole('button', { name: 'Go back' }));
    expect(goBack).toHaveBeenCalled();
  });

  it('opens the modal bottom sheet', () => {
    const { getByRole, queryByText, getByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <UiGalleryScreen navigation={{ goBack: jest.fn() } as never} route={{ key: 'k', name: 'UiGallery' } as never} />
      </SafeAreaProvider>
    );
    expect(queryByText('Show runs')).toBeNull();
    fireEvent.press(getByRole('button', { name: 'Open modal sheet' }));
    expect(getByText('Show runs')).toBeTruthy();
  });
});
