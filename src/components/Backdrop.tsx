import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

/** The dotted paper from the goal screens: a 12-point dot grid on the onyx ground. Sits behind the content. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="dots" patternUnits="userSpaceOnUse" width="12" height="12">
            <Circle cx="6" cy="6" r="1" fill="#C9C9C3" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
    </View>
  );
}

/** The paper colour the dots sit on. */
export const BACKDROP_PAPER = colors.paper;
