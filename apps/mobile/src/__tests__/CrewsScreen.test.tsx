import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CrewsScreen } from '../screens/crews/CrewsScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('CrewsScreen (placeholder)', () => {
  it('shows the "Crews are coming" empty state and links to the Run tab', () => {
    const { getByRole } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <CrewsScreen />
      </SafeAreaProvider>
    );
    expect(getByRole('header', { name: 'Crews' })).toBeTruthy();
    expect(getByRole('header', { name: 'Crews are coming' })).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Find runners' }));
    expect(mockNavigate).toHaveBeenCalledWith('RunHome');
  });
});
