module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) automatically adds the Reanimated 4 worklets
    // plugin (`react-native-worklets/plugin`) when react-native-worklets is
    // installed. Do NOT add it (or `react-native-reanimated/plugin`) here as
    // well — applying it twice breaks worklet compilation.
    presets: ['babel-preset-expo'],
  };
};

