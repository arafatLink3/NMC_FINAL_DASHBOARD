// `react-native-web` ships no `.d.ts` of its own. We only consume
// *runtime values* from it (Platform, View, Text, Pressable, TextInput,
// FlatList, ScrollView, StyleSheet); all types come from `react-native`,
// which is type-equivalent. Treating the module as `any` keeps tsc happy
// without forcing a hard dependency on a third-party @types package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'react-native-web';
