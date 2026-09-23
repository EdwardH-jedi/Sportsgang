/**
 * Runs after the test framework is installed (needs `expect`).
 *
 * - Reanimated 4's official jest harness: shared values and animated styles
 *   run on the JS thread with a fake frame timer, so components built on
 *   `react-native-reanimated` render and animate deterministically.
 * - expo-haptics has no native module under jest; primitives call it on
 *   press, so stub it globally (tests that assert haptics can still spy on
 *   these functions).
 */
require('react-native-reanimated').setUpTests();

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Treat fonts (brand + @expo/vector-icons icon fonts) as loaded. Without
// this, vector-icons renders an empty <Text /> until an async font load
// resolves, which makes icons invisible to queries and triggers act()
// warnings. Tests that exercise font loading mock expo-font themselves.
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return {
    ...actual,
    isLoaded: () => true,
    loadAsync: jest.fn(() => Promise.resolve()),
    useFonts: () => [true, null],
  };
});
