import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from '../../components/ui';
import { colors } from '../../theme';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe('Screen', () => {
  it('applies the top inset and canvas colour', () => {
    const { getByTestId } = wrap(
      <Screen testID="s">
        <Text>Body</Text>
      </Screen>
    );
    const style = StyleSheet.flatten(getByTestId('s').props.style);
    expect(style.paddingTop).toBe(47);
    expect(style.backgroundColor).toBe(colors.background);
  });

  it('can skip the top inset and use another surface level', () => {
    const { getByTestId } = wrap(
      <Screen testID="s" safeTop={false} surface={1}>
        <Text>Body</Text>
      </Screen>
    );
    const style = StyleSheet.flatten(getByTestId('s').props.style);
    expect(style.paddingTop).toBe(0);
    expect(style.backgroundColor).toBe(colors.surface);
  });

  it('renders header and footer around the body', () => {
    const { getByText } = wrap(
      <Screen header={<Text>Head</Text>} footer={<Text>Foot</Text>}>
        <Text>Body</Text>
      </Screen>
    );
    expect(getByText('Head')).toBeTruthy();
    expect(getByText('Body')).toBeTruthy();
    expect(getByText('Foot')).toBeTruthy();
  });

  it('scroll mode passes scrollProps through', () => {
    const { UNSAFE_getByType } = wrap(
      <Screen scroll scrollProps={{ testID: 'scroller' }}>
        <Text>Body</Text>
      </Screen>
    );
    expect(UNSAFE_getByType(ScrollView).props.testID).toBe('scroller');
  });
});
