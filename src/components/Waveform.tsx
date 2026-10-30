import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { colors } from '../theme/tokens';

const BARS = 28;

/** Live level bars while recording. Still when reduced motion is on. Runs on the UI thread. */
export function Waveform({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const phase = useSharedValue(0);

  useEffect(() => {
    if (active && !reduced) {
      phase.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false));
    } else {
      phase.set(0);
    }
  }, [active, reduced, phase]);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: BARS }, (_, i) => (
        <Bar key={i} index={i} phase={phase} active={active} />
      ))}
    </View>
  );
}

function Bar({ index, phase, active }: { index: number; phase: SharedValue<number>; active: boolean }) {
  const style = useAnimatedStyle(() => {
    const level = active ? Math.abs(Math.sin(phase.get() * Math.PI * 2 + index * 0.45)) : 0;
    return { transform: [{ scaleY: 0.15 + 0.85 * level }] };
  });
  return <Animated.View style={[styles.bar, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 },
  bar: { width: 3, height: 56, borderRadius: 2, backgroundColor: colors.ink },
});
