import { useAudioPlayer } from 'expo-audio';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WAKE_SOUNDS, type WakeSound } from '../sound/wakeSounds';
import { colors, radius, space, type } from '../theme/tokens';

interface Props {
  selectedId: string;
  onSelect: (sound: WakeSound) => void;
}

/** Pick a tone and hear it. Previews are the same tones the alarm plays. */
export function SoundChoice({ selectedId, onSelect }: Props) {
  const selected = WAKE_SOUNDS.find((s) => s.id === selectedId) ?? WAKE_SOUNDS[0];
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {WAKE_SOUNDS.map((sound) => {
          const on = sound.id === selected.id;
          return (
            <Pressable
              key={sound.id}
              onPress={() => onSelect(sound)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${sound.name}. ${sound.description}`}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{sound.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Preview key={selected.id} sound={selected} />
    </View>
  );
}

/** A remount per tone (the key above) so the player loads the tone that was picked. */
function Preview({ sound }: { sound: WakeSound }) {
  const player = useAudioPlayer(sound.preview);
  return (
    <Pressable style={styles.preview} onPress={() => player.play()} accessibilityRole="button" accessibilityLabel={`Play ${sound.name}`}>
      <Text style={styles.previewText}>Play {sound.name}</Text>
      <Text style={styles.caption}>{sound.description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { gap: space.sm, paddingVertical: space.xs },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, ...type.label },
  chipTextOn: { color: colors.onPrimary },
  preview: { backgroundColor: colors.card, borderRadius: radius.card, padding: space.md, gap: space.xs },
  previewText: { color: colors.ink, ...type.label },
  caption: { color: colors.muted, ...type.caption },
});
