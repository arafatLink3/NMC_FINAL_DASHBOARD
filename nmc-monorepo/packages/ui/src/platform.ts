/**
 * platform.ts — Cross-platform primitive selector.
 *
 * The UI package renders on two distinct runtimes:
 *
 *   1. Web (Next.js / Vite / CRA) — `react-dom` and `react-native-web`.
 *      Touch/gesture APIs come from the browser; modals, drawers and tooltips
 *      render inline. SVG is the native browser SVG.
 *
 *   2. Native (Expo / React Native) — `react-native`. Touch/gesture APIs come
 *      from `react-native-gesture-handler` (peer) and modals/drawers must use
 *      the `Modal` / navigation primitives from `react-native`.
 *
 * Runtime resolution: the bundler picks `platform.web.ts` or
 * `platform.native.ts` via the `react-native` field in this package's
 * `package.json`. Both shims re-export from this shared file.
 *
 * We import *runtime values* from `react-native-web` (which works on web
 * and is shimmed by Metro to `react-native` on native builds when the
 * consumer sets the standard alias) and *types* from `react-native`
 * directly. `react-native-web` doesn't ship its own `.d.ts` files; it
 * relies on `react-native`'s types being correct for both runtimes,
 * which they are.
 */

// `react-native-web` ships no `.d.ts` of its own. We only ever import
// *runtime values* from it (Platform/View/Text/Pressable/TextInput/etc.),
// never types. The ambient `react-native-web.d.ts` shim in this folder
// tells TypeScript to treat it as `any` at the type level, while the
// types we re-export below all come from `react-native` (which is
// type-equivalent to react-native-web).

import {
  Platform as RNWebPlatform,
  View as RNWebView,
  Text as RNWebText,
  Pressable as RNWebPressable,
  TextInput as RNWebTextInput,
  FlatList as RNWebFlatList,
  ScrollView as RNWebScrollView,
  StyleSheet as RNWebStyleSheet,
} from 'react-native-web';

// Runtime values.
export const Platform = RNWebPlatform;
export const View = RNWebView;
export const Text = RNWebText;
export const Pressable = RNWebPressable;
export const TextInput = RNWebTextInput;
export const FlatList = RNWebFlatList;
export const ScrollView = RNWebScrollView;
export const StyleSheet = RNWebStyleSheet;

// Types — `react-native-web` doesn't ship `.d.ts` files, so we re-export
// from `react-native` itself which is type-equivalent.
export type {
  ViewProps, ViewStyle,
  TextProps, TextStyle,
  TextInputProps,
  PressableProps,
  ScrollViewProps,
  FlatListProps,
  StyleProp,
  ImageProps, ImageStyle,
  GestureResponderEvent,
  NativeSyntheticEvent,
  TextInputChangeEventData,
  TextInputFocusEventData,
  LayoutChangeEvent,
} from 'react-native';

/** A constant the components use to branch behaviour that's *not* covered
 *  by `react-native-web` (e.g. native-only haptic feedback, accessibility
 *  shortcuts, file system). Always prefer it over `typeof window`. */
export const IS_WEB = Platform.OS === 'web';
export const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';
