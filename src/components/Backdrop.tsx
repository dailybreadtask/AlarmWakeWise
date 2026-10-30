import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';

/** The dotted paper from the mockup's capture screen. Sits behind the content. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="dots" patternUnits="userSpaceOnUse" width="14" height="14">
            <Circle cx="2" cy="2" r="1" fill="#111111" fillOpacity="0.08" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
    </View>
  );
}
