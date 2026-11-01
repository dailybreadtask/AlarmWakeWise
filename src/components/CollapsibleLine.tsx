import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

interface LineProps {
  title: string;
  /** What is chosen, shown on the right. */
  value?: string;
}

function Chevron({ turned }: { turned: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#8A8A84" strokeWidth={2} strokeLinecap="round" style={{ transform: [{ rotate: turned ? '90deg' : '0deg' }] }}>
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/** A single line with a hairline under it: a title on the left, the current value and a chevron on the right. */
export function Line({ title, value, onPress }: LineProps & { onPress: () => void }) {
  return (
    <View style={[styles.wrap, styles.closed]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        <Chevron turned={false} />
      </Pressable>
    </View>
  );
}

/**
 * A line that opens downwards to show its choices in place. Closed, it reads as one underlined line with the current
 * value; open, the underline darkens and the content sits between the line and the next one.
 */
export function CollapsibleLine({ title, value, open, onToggle, children }: LineProps & { open: boolean; onToggle: () => void; children: ReactNode }) {
  // The change is animated unless the person has asked iOS for reduced motion.
  const [busy, setBusy] = useState(false);
  function toggle() {
    if (busy) return;
    setBusy(true);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
        onToggle();
        setBusy(false);
      });
  }
  return (
    <View style={[styles.wrap, open ? styles.open : styles.closed]}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={value ? `${title}, ${value}` : title} style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
        <Chevron turned={open} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1 },
  closed: { borderBottomColor: colors.hairline },
  open: { borderBottomColor: colors.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  title: { color: colors.ink, fontSize: 17 },
  value: { flex: 1, color: colors.muted, fontSize: 15, textAlign: 'right' },
  body: { paddingBottom: 12 },
});
