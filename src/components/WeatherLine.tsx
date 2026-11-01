import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '../theme/tokens';
import { WEATHER_LEGAL_URL, type WeatherSummary } from '../weather/weatherClient';

/** Today's weather in one short line, for example 8° and "Rain until 10", with Apple's credit. Nothing until there is weather. */
export function WeatherLine({ summary }: { summary: WeatherSummary | null }) {
  if (!summary) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityLabel={`Weather: ${Math.round(summary.temperatureC)} degrees, ${summary.text}`}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M7 15a4 4 0 1 1 1.5-7.7A5 5 0 0 1 18 9a3 3 0 0 1 0 6z" />
          <Path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" />
        </Svg>
        <Text style={styles.text}>
          <Text style={styles.strong}>{Math.round(summary.temperatureC)}°</Text>, {summary.text}
        </Text>
      </View>
      <Pressable onPress={() => void Linking.openURL(WEATHER_LEGAL_URL)} accessibilityRole="link" accessibilityLabel="Apple Weather, legal and data sources" hitSlop={8}>
        <Text style={styles.credit}>{'\uF8FF'} Weather</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { color: colors.muted, fontSize: 17 },
  strong: { color: colors.ink, fontWeight: '500' },
  credit: { color: colors.muted, fontSize: 12 },
});
