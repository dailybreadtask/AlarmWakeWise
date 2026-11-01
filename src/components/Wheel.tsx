import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/tokens';

export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** How many values show at once. The middle one is the chosen value. */
const VISIBLE = 5;

export type WheelSize = 'regular' | 'compact';

/** Row height, the three type sizes, the colon, and the widest the wheel is allowed to be. */
const METRICS = {
  regular: { item: 48, big: 46, near: 28, far: 20, colon: 42, maxWidth: 300 },
  compact: { item: 38, big: 32, near: 21, far: 16, colon: 30, maxWidth: 250 },
} as const;

/**
 * A scroll-wheel column, as the iOS time picker: it moves with the finger, carries its momentum, and settles on one value.
 * It loops: after the last value comes the first again. Tap a value to scroll to it.
 */
export function Wheel({ options, value, unit, onPick, align, size = 'regular' }: { options: number[]; value: number; unit: string; onPick: (v: number) => void; align: 'start' | 'end' | 'center'; size?: WheelSize }) {
  const m = METRICS[size];
  const ITEM = m.item;
  const scroller = useRef<ScrollView>(null);
  const len = options.length;
  // The list is repeated, so the wheel can run past either end. Scrolling settles back into the middle copy.
  const copies = 5;
  const middle = Math.floor(copies / 2) * len;
  const total = len * copies;
  const index = Math.max(0, options.indexOf(value));
  // The position under the middle while the wheel moves, for the size and shade of each number. Updates once per value crossed.
  const [live, setLive] = useState(middle + index);
  const lastTick = useRef(middle + index);
  const pad = ITEM * ((VISIBLE - 1) / 2);

  // Follows the chosen value when it changes from somewhere else, such as a tap elsewhere.
  useEffect(() => {
    scroller.current?.scrollTo({ y: (middle + index) * ITEM, animated: true });
  }, [index, middle, ITEM]);

  const positionAt = (y: number) => Math.min(total - 1, Math.max(0, Math.round(y / ITEM)));

  // Chooses the value the wheel has come to rest on, then moves back to the middle copy so it can keep looping.
  function settle(y: number) {
    const position = positionAt(y);
    const picked = options[position % len];
    if (picked !== value) onPick(picked);
    if (position < len || position >= total - len) {
      scroller.current?.scrollTo({ y: (middle + (position % len)) * ITEM, animated: false });
      lastTick.current = middle + (position % len);
      setLive(middle + (position % len));
    }
  }

  return (
    <ScrollView
      ref={scroller}
      style={styles.scroller}
      contentOffset={{ x: 0, y: (middle + index) * ITEM }}
      contentContainerStyle={{ paddingVertical: pad }}
      snapToInterval={ITEM}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      accessibilityLabel={`${unit} wheel`}
      onScroll={(e) => {
        const position = positionAt(e.nativeEvent.contentOffset.y);
        if (position !== lastTick.current) {
          lastTick.current = position;
          setLive(position);
          void Haptics.selectionAsync();
        }
      }}
      onScrollEndDrag={(e) => {
        // With no momentum the wheel stops here, and no momentum-end event follows.
        if (!e.nativeEvent.velocity || e.nativeEvent.velocity.y === 0) settle(e.nativeEvent.contentOffset.y);
      }}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
    >
      {Array.from({ length: total }, (_, position) => {
        const v = options[position % len];
        const d = Math.abs(position - live);
        return (
          <Pressable
            key={position}
            onPress={() => {
              scroller.current?.scrollTo({ y: position * ITEM, animated: true });
              if (v !== value) onPick(v);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${v} ${unit}`}
            accessibilityState={{ selected: position === live }}
            style={[styles.item, { height: ITEM }, align === 'end' ? styles.alignEnd : align === 'center' ? styles.alignCentre : styles.alignStart]}
          >
            <Text style={[d === 0 ? styles.big : d === 1 ? styles.near : styles.far, { fontSize: d === 0 ? m.big : d === 1 ? m.near : m.far, lineHeight: ITEM }]}>{String(v).padStart(2, '0')}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}


/** Hours and minutes side by side with the chosen value in the band between them: the time picker used for alarms. */
export function TimeWheel({ hour, minute, onHour, onMinute, accessibilityLabel = 'Time', size = 'regular' }: { hour: number; minute: number; onHour: (h: number) => void; onMinute: (m: number) => void; accessibilityLabel?: string; size?: WheelSize }) {
  const m = METRICS[size];
  return (
    <View style={[styles.wheel, { height: m.item * VISIBLE, maxWidth: m.maxWidth }]} accessibilityLabel={accessibilityLabel}>
      <Band size={size} />
      <View style={styles.column}>
        <Wheel options={HOURS} value={hour} unit="hours" onPick={onHour} align="end" size={size} />
      </View>
      <View style={styles.column}>
        <Wheel options={MINUTES} value={minute} unit="minutes" onPick={onMinute} align="start" size={size} />
      </View>
      <Colon size={size} left="50%" />
    </View>
  );
}

/** Hours, minutes and seconds side by side, for a length of time. The chosen value sits in the band across the middle. */
export function DurationWheel({ seconds, onChange, accessibilityLabel = 'Length', size = 'compact' }: { seconds: number; onChange: (seconds: number) => void; accessibilityLabel?: string; size?: WheelSize }) {
  const m = METRICS[size];
  const h = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  return (
    <View style={[styles.wheel, { height: m.item * VISIBLE, maxWidth: m.maxWidth }]} accessibilityLabel={accessibilityLabel}>
      <Band size={size} />
      <View style={styles.column}>
        <Wheel options={HOURS} value={h} unit="hours" onPick={(v) => onChange(v * 3600 + min * 60 + sec)} align="center" size={size} />
      </View>
      <View style={styles.column}>
        <Wheel options={MINUTES} value={min} unit="minutes" onPick={(v) => onChange(h * 3600 + v * 60 + sec)} align="center" size={size} />
      </View>
      <View style={styles.column}>
        <Wheel options={MINUTES} value={sec} unit="seconds" onPick={(v) => onChange(h * 3600 + min * 60 + v)} align="center" size={size} />
      </View>
      <Colon size={size} left="33.3%" />
      <Colon size={size} left="66.6%" />
    </View>
  );
}

/** The chosen-value band across the middle of the wheel, with a hairline above and below. */
function Band({ size }: { size: WheelSize }) {
  const m = METRICS[size];
  return <View style={[styles.band, { top: m.item * ((VISIBLE - 1) / 2), height: m.item }]} pointerEvents="none" />;
}

function Colon({ size, left }: { size: WheelSize; left: `${number}%` }) {
  const m = METRICS[size];
  return (
    <Text style={[styles.colon, { left, top: m.item * 2 + (m.item - m.colon) / 2 - m.colon * 0.12, fontSize: m.colon, lineHeight: m.colon * 1.2 }]} pointerEvents="none" accessibilityElementsHidden>
      :
    </Text>
  );
}

const styles = StyleSheet.create({
  // Centred, and never wider than the size allows, so a wheel does not stretch across the whole screen.
  wheel: { flexDirection: 'row', alignSelf: 'center', width: '100%' },
  band: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.ink, borderBottomWidth: 1, borderBottomColor: colors.line },
  column: { flex: 1 },
  scroller: { flex: 1 },
  colon: { position: 'absolute', marginLeft: -5, fontWeight: '100', color: '#9A9A94' },
  item: { justifyContent: 'center' },
  alignCentre: { alignItems: 'center' },
  alignEnd: { alignItems: 'flex-end', paddingRight: 14 },
  alignStart: { alignItems: 'flex-start', paddingLeft: 14 },
  big: { color: colors.ink, fontWeight: '100', letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  near: { color: '#8A8A84', fontWeight: '200', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  far: { color: '#C2C2BC', fontWeight: '200', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
});
