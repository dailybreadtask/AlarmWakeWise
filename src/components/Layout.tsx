import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { PressScale } from './PressScale';

/** The shared page: paper background, even margins, one rhythm of spacing. */
export function Page({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.page}>{children}</ScrollView>;
}

/** A small uppercase label above a group, as on the home screen. */
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

/** A white card that groups related content. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** The one main action on a screen. */
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PressScale style={[styles.primary, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.primaryText}>{label}</Text>
    </PressScale>
  );
}

/** A quieter action beside or below the main one. */
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressScale style={styles.secondary} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.secondaryText}>{label}</Text>
    </PressScale>
  );
}

/** A title and an optional line of explanation, at the top of a screen. */
export function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.lg, flexGrow: 1, backgroundColor: colors.paper, paddingBottom: space.xl * 2 },
  section: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.lg, gap: space.sm },
  heading: { gap: space.xs },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  primaryText: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', backgroundColor: colors.card },
  secondaryText: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  disabled: { opacity: 0.5 },
});
