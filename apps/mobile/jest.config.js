/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Pre-test mocks for the SDK 53+ Expo "winter" runtime — must run before
  // any test imports `expo-*`, otherwise TurboModules trip an Invariant.
  setupFiles: [
    '<rootDir>/jest.setup.js',
    // Official gesture-handler mocks (native module + buttons + Pressable).
    'react-native-gesture-handler/jestSetup.js',
  ],
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    // Reanimated 4 test harness (JS-only shared values, fake frame timer).
    '<rootDir>/jest.setupAfterEnv.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|@sentry/.*|native-base|react-native-svg)',
  ],
  testMatch: ['<rootDir>/src/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
};
