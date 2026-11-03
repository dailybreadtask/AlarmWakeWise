import { StyleSheet, View } from 'react-native';

import { colors, useTheme } from '../theme/tokens';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

/** The dotted paper from the goal screens: a 12-point dot grid on the ground. The dots stay quiet so the words sit on top. */
export function Backdrop() {
  const { c } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="dots" patternUnits="userSpaceOnUse" width="12" height="12">
            <Circle cx="6" cy="6" r="1" fill={c.line} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
    </View>
  );
}

/** The paper colour the dots sit on. */
export const BACKDROP_PAPER = colors.paper;
