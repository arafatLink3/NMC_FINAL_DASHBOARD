module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for `expo-router` typed routes.
      'expo-router/babel',
    ],
  };
};