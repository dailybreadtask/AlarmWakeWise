import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { CollapsibleLine } from '../components/CollapsibleLine';
import { ControlLine, Field, Intro, Lines, Options, Page, PrimaryButton, SectionLabel, TextLink } from '../components/Layout';
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
import { placeSearch, type PlaceSuggestion } from '../places/placeSearch';
import { sqlFrom } from '../storage/sqlAdapter';
import { colors, space } from '../theme/tokens';

const KIND_LABEL: Record<PlaceKind, string> = { home: 'Home', work: 'Work', station: 'Station', other: 'Other' };

/** Your saved places and planning times. You can see, change and delete all of it. */
export default function ContextScreen() {
  const db = useSQLiteContext();
  const sql = useMemo(() => sqlFrom(db), [db]);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [area, setArea] = useState('');
  const [kind, setKind] = useState<PlaceKind>('work');
  const [crs, setCrs] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [wakeText, setWakeText] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  // Where the chosen suggestion is. Kept on this phone with the place. It is only used for the weather, if you allow that.
  const [found, setFound] = useState<{ latitude: number; longitude: number } | null>(null);

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

  // Suggestions from Apple Maps, a moment after typing stops.
  useEffect(() => {
    const timer = setTimeout(() => {
      void placeSearch.suggest(query).then(setSuggestions);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function pick(suggestion: PlaceSuggestion) {
    const resolved = await placeSearch.resolve(suggestion.id);
    if (!resolved) return;
    // The name is the person's own word for the place, so an existing one is kept.
    setLabel((current) => (current.trim() === '' ? resolved.name.slice(0, 30) : current));
    setArea(resolved.area);
    setFound({ latitude: resolved.latitude, longitude: resolved.longitude });
    setQuery('');
    setSuggestions([]);
  }

  async function save() {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const input = { id, label, area: area || null, kind, crs: kind === 'station' ? crs : null, latitude: found?.latitude ?? null, longitude: found?.longitude ?? null, createdAt: new Date().toISOString() };
    const problem = placeProblem(input);
    if (problem) return setFormError(problem);
    await addPlace(sql, input);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLabel('');
    setArea('');
    setCrs('');
    setFound(null);
    setFormError(null);
    setAdding(false);
    await reload();
  }

  async function remove(place: SavedPlace) {
    await deletePlace(sql, place.id);
    await reload();
  }

  async function change(key: 'getReadyMinutes' | 'bufferMinutes', delta: number) {
    if (!prefs) return;
    const next = Math.min(240, Math.max(0, prefs[key] + delta));
    void Haptics.selectionAsync();
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
    <Page title="Insights">
      <Intro>
        WakeWise keeps your places and planning times on this phone. Only a place’s name and area are sent with a request, never its address or coordinates. Addresses you search for are looked up by Apple Maps. The location it finds stays on this phone, except that your home’s location is used to look up the weather if you allow that in Speech and privacy.
      </Intro>

      <SectionLabel>Places</SectionLabel>
      <Lines>
        {places.length === 0 ? <Text style={styles.empty}>No places saved yet.</Text> : null}
        {places.map((p) => (
          <ControlLine
            key={p.id}
            title={p.label}
            detail={`${KIND_LABEL[p.kind]}${p.crs ? ` · ${p.crs}` : ''}${p.area ? ` · ${p.area}` : ''}`}
            right={<TextLink label="Delete" onPress={() => void remove(p)} />}
          />
        ))}
        <CollapsibleLine title="Add a place" open={adding} onToggle={() => setAdding((open) => !open)}>
          <View style={styles.form}>
            {placeSearch.isSupported() ? (
              <View>
                <Field label="Search for an address or place" value={query} onChangeText={setQuery} autoCorrect={false} placeholder="For example Glasgow Queen Street" />
                {suggestions.map((s) => (
                  <Pressable key={s.id} onPress={() => void pick(s)} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.subtitle}`} style={styles.suggestion}>
                    <Text style={styles.suggestionTitle}>{s.title}</Text>
                    {s.subtitle ? <Text style={styles.suggestionSub}>{s.subtitle}</Text> : null}
                  </Pressable>
                ))}
                {found ? <Text style={styles.found}>Location found. It is only used for the weather, if you allow it.</Text> : null}
              </View>
            ) : null}
            <Field label="Name" value={label} onChangeText={setLabel} placeholder="For example Work" maxLength={30} />
            <Options label="Kind of place" options={PLACE_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} value={kind} onChange={setKind} />
            {kind === 'station' ? <Field label="Station code" value={crs} onChangeText={(v) => setCrs(v.toUpperCase().slice(0, 3))} placeholder="For example BHG" autoCapitalize="characters" /> : null}
            <Field label="Area (optional)" value={area} onChangeText={setArea} placeholder="For example Edinburgh" error={formError} />
            <PrimaryButton label="Save place" onPress={() => void save()} />
          </View>
        </CollapsibleLine>
      </Lines>

      <SectionLabel>Planning</SectionLabel>
      {prefs ? (
        <Lines>
          <ControlLine title="Time to get ready" right={<Stepper value={`${prefs.getReadyMinutes} min`} label="time to get ready" onMinus={() => void change('getReadyMinutes', -5)} onPlus={() => void change('getReadyMinutes', 5)} />} />
          <ControlLine title="Spare time before" right={<Stepper value={`${prefs.bufferMinutes} min`} label="spare time" onMinus={() => void change('bufferMinutes', -5)} onPlus={() => void change('bufferMinutes', 5)} />} />
          <View style={styles.wakeRow}>
            <View style={styles.wakeField}>
              <Field label="Never wake me before" value={wakeText} onChangeText={setWakeText} placeholder="06:15, or leave blank" keyboardType="numbers-and-punctuation" />
            </View>
            <TextLink label="Save" onPress={() => void saveWake()} />
          </View>
        </Lines>
      ) : null}

      <TextLink label="Delete all my saved places and preferences" onPress={eraseAll} danger />
    </Page>
  );
}

function Stepper({ value, label, onMinus, onPlus }: { value: string; label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} accessibilityRole="button" accessibilityLabel={`Less ${label}`} style={styles.step}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onPlus} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={styles.step}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, fontSize: 15, paddingVertical: space.md },
  form: { gap: space.lg, paddingTop: space.sm },
  suggestion: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, gap: 2 },
  suggestionTitle: { color: colors.ink, fontSize: 16 },
  suggestionSub: { color: colors.muted, fontSize: 13 },
  found: { color: colors.muted, fontSize: 13, marginTop: space.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.ink, fontSize: 20 },
  stepValue: { color: colors.ink, fontSize: 17, fontWeight: '300', minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  wakeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingTop: space.lg },
  wakeField: { flex: 1 },
});
