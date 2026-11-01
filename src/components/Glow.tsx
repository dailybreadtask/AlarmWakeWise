import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { NIGHT } from '../theme/tokens';

/**
 * A soft pool of light behind a large numeral, so it glows in the dark. It sits behind its siblings and never takes a touch.
 * Place it first inside the view it should glow behind.
 */
export function Glow({ size = 460, color = NIGHT.primary, opacity = 0.14, style }: { size?: number; color?: string; opacity?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="pool" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="55%" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill="url(#pool)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
});
