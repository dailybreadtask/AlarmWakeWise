import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme/tokens';

const N = 17;
const CELL = 14;
const CENTRE = (N - 1) / 2;
const SIZE = N * CELL;

/**
 * A disc made of dots. By default it fills in clockwise as a plan is worked out: at 100 the whole disc is lit and the
 * middle turns yellow. With `drain`, `progress` is the share of a countdown that has passed: the dots go out clockwise
 * from the top, and the middle stays yellow until the end. `progress` runs from 0 to 100. `size` is the width and height in points; the disc scales to fit.
 */
export function PlanningDisc({ progress, drain = false, size = SIZE }: { progress: number; drain?: boolean; size?: number }) {
  const dots = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - CENTRE;
      const dy = y - CENTRE;
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
      const inDisc = r <= 7.6;
      // Where this dot is round the clock face, from 0 at twelve o'clock, clockwise, to 1.
      const phase = (angle - 0.25 + 1) % 1;
      const lit = inDisc && (drain ? phase * 100 >= progress && progress < 100 : angle * 100 <= progress || progress >= 100);
      const core = r <= 2.2 && (drain || progress >= 100);
      const size = !inDisc ? 2 : lit ? (r > 6.4 ? 8 : 5) : 3;
      dots.push(
        <Circle
          key={`${x}-${y}`}
          cx={x * CELL + CELL / 2}
          cy={y * CELL + CELL / 2}
          r={size / 2}
          fill={core ? colors.primary : lit ? colors.ink : inDisc ? '#A9A9A3' : '#D2D2CC'}
          stroke={core ? colors.ink : undefined}
          strokeWidth={core ? 1 : 0}
        />,
      );
    }
  }
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {dots}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
});
