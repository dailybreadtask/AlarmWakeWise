import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '../components/PressScale';
import {
  addPlace,
  deleteContext,
  deletePlace,
  listPlaces,
  loadPreferences,
  PLACE_KINDS,
  placeProblem,
  savePreference,
  type Preferences,
  type PlaceKind,
  type SavedPlace,
} from '../context/contextRepository';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, radius, space, type } from '../theme/tokens';

const KIND_LABEL: Record<PlaceKind, string> = { home: 'Home', work: 'Work', station: 'Station', other: 'Other' };

/** Your saved places and planning preferences. You can see, change and delete all of it. */
export default function ContextScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('');
  const [kind, setKind] = useState<PlaceKind>('work');
  const [crs, setCrs] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [wakeText, setWakeText] = useState('');

  const reload = useCallback(async () => {
    const [list, p] = await Promise.all([listPlaces(sql), loadPreferences(sql)]);
    setPlaces(list);
    setPrefs(p);
    setWakeText(p.earliestWake ?? '');
  }, [sql]);

  useEffect(() => {
    let active = true;
    void Promise.all([listPlaces(sql), loadPreferences(sql)]).then(([list, p]) => {
      if (!active) return;
      setPlaces(list);
      setPrefs(p);
      setWakeText(p.earliestWake ?? '');
    });
    return () => {
      active = false;
    };
  }, [sql]);

  async function save() {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const input = { id, label, area: area || null, kind, crs: kind === 'station' ? crs : null, createdAt: new Date().toISOString() };
    const problem = placeProblem(input);
    if (problem) return setFormError(problem);
    await addPlace(sql, input);
    setLabel('');
    setArea('');
    setCrs('');
    setFormError(null);
    await reload();
  }

  async function remove(place: SavedPlace) {
    await deletePlace(sql, place.id);
    await reload();
  }

  async function change(key: 'getReadyMinutes' | 'bufferMinutes', delta: number) {
    if (!prefs) return;
    const next = Math.min(240, Math.max(0, prefs[key] + delta));
    await savePreference(sql, key, next, new Date().toISOString());
    await reload();
  }

  async function saveWake() {
    const value = wakeText.trim();
    if (value !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return Alert.alert('Use 24-hour time, for example 06:15.');
    await savePreference(sql, 'earliestWake', value === '' ? null : value, new Date().toISOString());
    await reload();
  }

  function eraseAll() {
    Alert.alert('Delete your saved places and preferences?', 'Saved alarms stay, because iOS holds them. Everything else here is removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteContext(sql).then(reload);
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Your context' }} />
      <Text style={styles.body}>
        WakeWise keeps your places and planning times on this phone. Only a place’s name and area are sent with a request, never its address or coordinates. You can change or delete any of it here.
      </Text>

      <Text style={styles.heading}>Places</Text>
      {places.length === 0 ? <Text style={styles.body}>No places saved yet.</Text> : null}
      {places.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>{p.label}</Text>
            <Text style={styles.caption}>
              {KIND_LABEL[p.kind]}
              {p.crs ? ` · ${p.crs}` : ''}
              {p.area ? ` · ${p.area}` : ''}
            </Text>
          </View>
          <PressScale onPress={() => void remove(p)} accessibilityRole="button" accessibilityLabel={`Delete ${p.label}`} style={styles.small}>
            <Text style={styles.smallText}>Delete</Text>
          </PressScale>
        </View>
      ))}

      <Text style={styles.heading}>Add a place</Text>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Name, for example Work" placeholderTextColor={colors.muted} accessibilityLabel="Place name" />
      <View style={styles.chips}>
        {PLACE_KINDS.map((k) => (
          <PressScale key={k} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} style={[styles.chip, kind === k && styles.chipOn]}>
            <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>{KIND_LABEL[k]}</Text>
          </PressScale>
        ))}
      </View>
      {kind === 'station' ? (
        <TextInput style={styles.input} value={crs} onChangeText={(v) => setCrs(v.toUpperCase().slice(0, 3))} placeholder="Station code, for example BHG" placeholderTextColor={colors.muted} accessibilityLabel="Station code" autoCapitalize="characters" />
      ) : null}
      <TextInput style={styles.input} value={area} onChangeText={setArea} placeholder="Area (optional), for example Edinburgh" placeholderTextColor={colors.muted} accessibilityLabel="Area" />
      {formError ? <Text style={styles.error} accessibilityRole="alert">{formError}</Text> : null}
      <PressScale onPress={() => void save()} style={styles.primary} accessibilityRole="button">
        <Text style={styles.primaryText}>Save place</Text>
      </PressScale>

      <Text style={styles.heading}>Planning</Text>
      {prefs ? (
        <>
          <Stepper label="Time to get ready" value={`${prefs.getReadyMinutes} min`} onMinus={() => void change('getReadyMinutes', -5)} onPlus={() => void change('getReadyMinutes', 5)} />
          <Stepper label="Spare time before" value={`${prefs.bufferMinutes} min`} onMinus={() => void change('bufferMinutes', -5)} onPlus={() => void change('bufferMinutes', 5)} />
          <Text style={styles.label}>Never wake me before</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.flex]} value={wakeText} onChangeText={setWakeText} placeholder="06:15, or leave blank" placeholderTextColor={colors.muted} accessibilityLabel="Earliest wake time" keyboardType="numbers-and-punctuation" />
            <PressScale onPress={() => void saveWake()} style={styles.small} accessibilityRole="button">
              <Text style={styles.smallText}>Save</Text>
            </PressScale>
          </View>
        </>
      ) : null}

      <PressScale onPress={eraseAll} style={styles.danger} accessibilityRole="button" accessibilityLabel="Delete all saved places and preferences">
        <Text style={styles.dangerText}>Delete all my saved places and preferences</Text>
      </PressScale>
    </ScrollView>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, styles.flex]}>{label}</Text>
      <PressScale onPress={onMinus} style={styles.small} accessibilityRole="button" accessibilityLabel={`Less ${label.toLowerCase()}`}>
        <Text style={styles.smallText}>−</Text>
      </PressScale>
      <Text style={styles.value}>{value}</Text>
      <PressScale onPress={onPlus} style={styles.small} accessibilityRole="button" accessibilityLabel={`More ${label.toLowerCase()}`}>
        <Text style={styles.smallText}>+</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, backgroundColor: colors.paper, flexGrow: 1 },
  heading: { color: colors.ink, ...type.title, marginTop: space.lg },
  body: { color: colors.ink, ...type.body, lineHeight: 22 },
  label: { color: colors.ink, ...type.label },
  caption: { color: colors.muted, ...type.caption },
  error: { color: colors.danger, ...type.caption },
  value: { color: colors.ink, ...type.label, minWidth: 64, textAlign: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  input: { backgroundColor: colors.card, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line, padding: space.md, color: colors.ink, ...type.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, ...type.label },
  chipTextOn: { color: colors.onPrimary },
  small: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md, backgroundColor: colors.card },
  smallText: { color: colors.ink, ...type.label },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center' },
  primaryText: { color: colors.onPrimary, ...type.label },
  danger: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center', marginTop: space.xl },
  dangerText: { color: colors.danger, ...type.label },
});
