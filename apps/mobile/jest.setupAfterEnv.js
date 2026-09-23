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
