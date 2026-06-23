/**
 * Card — The 12px rounded card surface used by every page.
 *
 * Mirrors the legacy `.card` class: `background: var(--card)`, `border-radius:
 * var(--radius)`, `padding: 14px`, `border: 1px solid var(--border)`. Use
 * for any grouping of related content. For a flat / borderless variant
 * (e.g. inside the bras page table wrapper), pass `flat`.
 */
import { forwardRef, type ReactNode, type Ref } from 'react';
import { View, type ViewProps, type ViewStyle } from '../platform.js';
import { useTheme, makeStyles } from '../theme/ThemeContext.js';
import type { Tokens } from '../theme/tokens.js';

export interface CardProps extends Omit<ViewProps, 'style'> {
  children?: ReactNode;
  flat?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  testID?: string;
}

interface CardStyles {
  base: ViewStyle;
  flat: ViewStyle;
  padded: ViewStyle;
  noPad: ViewStyle;
}

const useStyles = makeStyles<CardStyles>((t: Tokens) => ({
  base: {
    backgroundColor: t.card,
    borderRadius: t.radius,
    borderWidth: 1,
    borderColor: t.border,
    padding: 14,
  },
  flat: { backgroundColor: t.surface, borderColor: t.border },
  padded: { padding: 14 },
  noPad: { padding: 0 },
}));

export const Card = forwardRef(function Card(
  props: CardProps,
  ref: Ref<typeof View>,
): JSX.Element {
  const styles = useStyles();
  const { children, flat = false, padded = true, style, testID, ...rest } = props;
  const merged: ViewStyle = {
    ...styles.base,
    ...(flat ? styles.flat : {}),
    ...(padded ? {} : styles.noPad),
    ...(style || {}),
  };
  return (
    <View ref={ref} testID={testID} style={merged} {...rest}>
      {children}
    </View>
  );
});
