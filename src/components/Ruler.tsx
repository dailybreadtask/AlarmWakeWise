import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, useTheme } from '../theme/tokens';

const HEIGHT = 84;

export interface RulerProps {
  /** The value the ruler rests on, from `min` to `max`. */
  value: number;
  min: number;
  max: number;
  /** Called as the person drags, once for each tick crossed, and when it settles. Not called when the ruler moves by itself. */
  onChange: (value: number) => void;
  /** Width of one tick, in points. */
  tickWidth?: number;
  /** A long tick every this many ticks. */
  major: number;
  /** A medium tick every this many ticks. */
  medium?: number;
  /** A number under every this many ticks. */
  labelEvery: number;
  format?: (value: number) => string;
  accessibilityLabel: string;
  /** What a screen reader says for a value. */
  valueText?: (value: number) => string;
}

/**
 * A tape measure: drag it and it ticks past a fixed pointer, then settles on a tick. Long ticks, medium ticks and
 * small ticks make the scale readable at a glance. The pointer is a yellow dot on a line. Each tick crossed gives a light haptic.
 */
export function Ruler({ value, min, max, onChange, tickWidth = 12, major, medium, labelEvery, format = String, accessibilityLabel, valueText }: RulerProps) {
  const { c } = useTheme();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  // True only while the person's finger (or its momentum) is moving the ruler, so a move we make ourselves is not reported.
  const byHand = useRef(false);
  const clampIndex = (i: number) => Math.min(max - min, Math.max(0, i));
  const index = clampIndex(value - min);
  const lastTick = useRef(index);
  const count = max - min + 1;

  // The ticks, drawn as three paths rather than hundreds of views.
  const paths = useMemo(() => {
    let long = '';
    let mid = '';
    let small = '';
    for (let i = 0; i < count; i++) {
      const v = min + i;
      const x = i * tickWidth + tickWidth / 2;
      if (v % major === 0) long += `M${x} 14V58`;
      else if (medium && v % medium === 0) mid += `M${x} 14V44`;
      else small += `M${x} 14V30`;
    }
    return { long, mid, small };
  }, [count, min, tickWidth, major, medium]);

  const labels = useMemo(() => {
    const out: { left: number; text: string; key: number }[] = [];
    for (let i = 0; i < count; i++) {
      const v = min + i;
      if (v % labelEvery === 0) out.push({ left: i * tickWidth + tickWidth / 2 - 20, text: format(v), key: v });
    }
    return out;
  }, [count, min, tickWidth, labelEvery, format]);

  // Follows the value when it changes from somewhere else, such as a preset.
  useEffect(() => {
    if (width === 0 || byHand.current) return;
    lastTick.current = index;
    scroller.current?.scrollTo({ x: index * tickWidth, animated: true });
  }, [index, width, tickWidth]);

  const indexAt = (x: number) => clampIndex(Math.round(x / tickWidth));

  // The ruler has come to rest: report the tick it settled on, if it is not the last one reported.
  function settle(x: number) {
    const i = indexAt(x);
    if (i !== lastTick.current) {
      lastTick.current = i;
      onChange(min + i);
    }
    byHand.current = false;
  }

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: (valueText ?? format)(value) }}
    >
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: index * tickWidth, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: width / 2 - tickWidth / 2 }}
          snapToInterval={tickWidth}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            byHand.current = true;
          }}
          onScroll={(e) => {
            if (!byHand.current) return;
            const i = indexAt(e.nativeEvent.contentOffset.x);
            if (i !== lastTick.current) {
              lastTick.current = i;
              void Haptics.selectionAsync();
              onChange(min + i);
            }
          }}
          onScrollEndDrag={(e) => {
            // With no momentum the ruler stops here, and no momentum-end event follows.
            const v = e.nativeEvent.velocity;
            if (!v || v.x === 0) settle(e.nativeEvent.contentOffset.x);
          }}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
        >
          <View style={{ width: count * tickWidth, height: HEIGHT }}>
            <Svg width={count * tickWidth} height={HEIGHT}>
              {paths.small ? <Path d={paths.small} stroke="#8A8A84" strokeWidth={1} /> : null}
              {paths.mid ? <Path d={paths.mid} stroke="#8A8A84" strokeWidth={1} /> : null}
              {paths.long ? <Path d={paths.long} stroke={c.ink} strokeWidth={1} /> : null}
            </Svg>
            {labels.map((l) => (
              <Text key={l.key} style={[styles.label, { left: l.left }]}>
                {l.text}
              </Text>
            ))}
          </View>
        </ScrollView>
      ) : null}
      <View style={styles.line} pointerEvents="none" />
      <View style={styles.puck} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT, justifyContent: 'center' },
  label: { position: 'absolute', top: 62, width: 40, textAlign: 'center', color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  line: { position: 'absolute', left: '50%', top: 0, width: 1, height: 64, marginLeft: -0.5, backgroundColor: colors.ink },
  puck: { position: 'absolute', left: '50%', top: 32, width: 28, height: 28, marginLeft: -14, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.ink },
});
