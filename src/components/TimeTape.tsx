import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/tokens';

/** Width of one tick, which is five minutes. */
const TICK_W = 12;
const STEP_MINUTES = 5;
const TICKS = (24 * 60) / STEP_MINUTES;
const HEIGHT = 84;

interface Props {
  /** The time the tape rests on, in minutes after midnight. */
  value: number;
  /** Called as the person drags, once for each five minutes crossed. Not called when the tape moves by itself. */
  onChange: (minutes: number) => void;
}

/**
 * A tape measure for the day: drag it and it ticks past a fixed pointer, five minutes to a tick, then settles on a tick.
 * Hours are long ticks and every third hour is numbered. The pointer, a yellow dot on a line, marks the time.
 */
export function TimeTape({ value, onChange }: Props) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  // True only while the person's finger (or its momentum) is moving the tape, so a move we make ourselves is not reported.
  const byHand = useRef(false);
  const lastTick = useRef(Math.round(value / STEP_MINUTES));
  const index = Math.min(TICKS - 1, Math.max(0, Math.round(value / STEP_MINUTES)));

  // Follows the time when it changes from somewhere else, such as an alarm loading.
  useEffect(() => {
    if (width === 0 || byHand.current) return;
    lastTick.current = index;
    scroller.current?.scrollTo({ x: index * TICK_W, animated: true });
  }, [index, width]);

  const indexAt = (x: number) => Math.min(TICKS - 1, Math.max(0, Math.round(x / TICK_W)));

  // The tape has come to rest: report the tick it settled on, if it is not the last one reported.
  function settle(x: number) {
    const i = indexAt(x);
    if (i !== lastTick.current) {
      lastTick.current = i;
      onChange(i * STEP_MINUTES);
    }
    byHand.current = false;
  }

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel="Alarm time" accessibilityValue={{ text: `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }}>
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: index * TICK_W, y: 0 }}
          contentContainerStyle={{ paddingHorizontal: width / 2 - TICK_W / 2 }}
          snapToInterval={TICK_W}
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
              onChange(i * STEP_MINUTES);
            }
          }}
          onScrollEndDrag={(e) => {
            // With no momentum the tape stops here, and no momentum-end event follows.
            const v = e.nativeEvent.velocity;
            if (!v || v.x === 0) settle(e.nativeEvent.contentOffset.x);
          }}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
        >
          {Array.from({ length: TICKS }, (_, i) => {
            const minutes = i * STEP_MINUTES;
            const hour = minutes % 60 === 0;
            const half = minutes % 30 === 0;
            const label = minutes % 180 === 0;
            return (
              <View key={i} style={styles.cell}>
                <View style={[styles.tick, { height: hour ? 44 : half ? 30 : 16, backgroundColor: hour ? colors.ink : '#8A8A84' }]} />
                {label ? <Text style={styles.label}>{String(minutes / 60).padStart(2, '0')}</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.line} pointerEvents="none" />
      <View style={styles.puck} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT, justifyContent: 'center' },
  cell: { width: TICK_W, height: HEIGHT, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 14 },
  tick: { width: 1 },
  label: { position: 'absolute', top: 62, width: 40, textAlign: 'center', color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  line: { position: 'absolute', left: '50%', top: 0, width: 1, height: 64, marginLeft: -0.5, backgroundColor: colors.ink },
  puck: { position: 'absolute', left: '50%', top: 32, width: 28, height: 28, marginLeft: -14, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 1, borderColor: colors.ink },
});
