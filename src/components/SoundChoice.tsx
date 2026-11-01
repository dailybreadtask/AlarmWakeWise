import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { WAKE_SOUNDS, type WakeSound, type WakeSoundCategory } from '../sound/wakeSounds';
import { colors, space, useTheme } from '../theme/tokens';

interface Props {
  selectedId: string;
  onSelect: (sound: WakeSound) => void;
}

const GROUPS: { category: WakeSoundCategory; title: string }[] = [
  { category: 'gentle', title: 'Gentle' },
  { category: 'powerful', title: 'Powerful' },
  { category: 'classic', title: 'Classic' },
];

/**
 * Choose an alarm tone. The list scrolls and is grouped by feel. Tapping a tone chooses it and plays its preview,
 * and the button on the right plays or stops a tone without changing the choice. Previews are the tones the alarm plays.
 */
export function SoundChoice({ selectedId, onSelect }: Props) {
  const { c } = useTheme();
  const selected = WAKE_SOUNDS.find((s) => s.id === selectedId) ?? WAKE_SOUNDS[0];
  // One player for the whole list, so only one tone sounds at a time and a new tap replaces the last.
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const playingId = status.playing ? previewId : null;

  async function preview(sound: WakeSound) {
    if (playingId === sound.id) {
      player.pause();
      return;
    }
    // Previews should be heard with the iPhone's silent switch on, as the alarm itself is.
    await setAudioModeAsync({ playsInSilentMode: true });
    player.replace(sound.preview);
    player.play();
    setPreviewId(sound.id);
  }

  function choose(sound: WakeSound) {
    void Haptics.selectionAsync();
    onSelect(sound);
    void preview(sound);
  }

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={false} accessibilityRole="radiogroup">
        {GROUPS.map((group) => {
          const sounds = WAKE_SOUNDS.filter((s) => s.category === group.category);
          if (sounds.length === 0) return null;
          return (
            <View key={group.category}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {sounds.map((sound, i) => {
                const on = sound.id === selected.id;
                const playing = sound.id === playingId;
                return (
                  <View key={sound.id} style={[styles.row, i < sounds.length - 1 && styles.rowDivider]}>
                    <Pressable
                      style={styles.main}
                      onPress={() => choose(sound)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${sound.name}. ${sound.description}`}
                    >
                      <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                      <View style={styles.text}>
                        <Text style={styles.name}>{sound.name}</Text>
                        <Text style={styles.caption} numberOfLines={1}>
                          {sound.description}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      style={[styles.play, playing && styles.playOn]}
                      onPress={() => void preview(sound)}
                      accessibilityRole="button"
                      accessibilityLabel={playing ? `Stop ${sound.name}` : `Play ${sound.name}`}
                      hitSlop={6}
                    >
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill={playing ? c.onPrimary : c.ink}>
                        {playing ? <Path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <Path d="M8 5.5v13l11-6.5z" />}
                      </Svg>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  // About five rows tall, so the list scrolls and the screen around it keeps its shape.
  list: { maxHeight: 340 },
  groupTitle: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', paddingTop: space.md, paddingBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 60 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onPrimary },
  text: { flex: 1, gap: 2 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  caption: { color: colors.muted, fontSize: 13 },
  play: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  playOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
