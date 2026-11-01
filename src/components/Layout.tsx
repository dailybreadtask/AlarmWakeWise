import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { colors, space } from '../theme/tokens';
import { PressScale } from './PressScale';

/**
 * The shared page, following the approved Swiss screens: paper ground, a header with a back arrow and the screen's
 * name, a scrolling body with even margins, and an optional bar fixed to the bottom for the screen's one main action.
 */
export function Page({ title, children, footer, back = true }: { title: string; children: ReactNode; footer?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        {back ? (
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={styles.back}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
              <Path d="M15 6l-6 6 6 6" />
            </Svg>
            <Text style={styles.title}>{title}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.title, styles.titleOnly]}>{title}</Text>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
    </View>
  );
}

/** A short paragraph under the header, in the quiet colour. */
export function Intro({ children }: { children: ReactNode }) {
  return <Text style={styles.intro}>{children}</Text>;
}

/** A small uppercase label above a group. */
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

/** A group of lines: no box, each line carries its own hairline. */
export function Lines({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}

/** A line with a title and a detail on the left and a control on the right, under a hairline. */
export function ControlLine({ title, detail, right, onPress, danger }: { title: string; detail?: string; right?: ReactNode; onPress?: () => void; danger?: boolean }) {
  const body = (
    <>
      <View style={styles.lineText}>
        <Text style={[styles.lineTitle, danger && styles.danger]}>{title}</Text>
        {detail ? <Text style={styles.lineDetail}>{detail}</Text> : null}
      </View>
      {right}
    </>
  );
  if (!onPress) return <View style={styles.line}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={styles.line}>
      {body}
    </Pressable>
  );
}

/** A line with a switch: ink track and a yellow thumb when on, as on the dashboard. */
export function SwitchLine({ title, detail, value, onChange, disabled }: { title: string; detail?: string; value: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <ControlLine
      title={title}
      detail={detail}
      right={<Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ false: '#DADAD4', true: colors.ink }} thumbColor={colors.primary} accessibilityLabel={title} />}
    />
  );
}

/** A labelled text field with a single line under it. */
export function Field({ label, error, ...input }: { label: string; error?: string | null } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} {...input} style={[styles.input, input.style]} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A few options in a row, as plain text with a rule under the chosen one. Used instead of pills. */
export function Options<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} disabled={o.disabled} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: o.disabled }} style={[styles.option, on && styles.optionOn]}>
            <Text style={[styles.optionText, on && styles.optionTextOn, o.disabled && styles.optionTextOff]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The one main action: a yellow pill. */
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PressScale style={[styles.primary, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.primaryText}>{label}</Text>
    </PressScale>
  );
}

/** A quieter action beside or below the main one: an outlined pill. */
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressScale style={styles.secondary} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.secondaryText}>{label}</Text>
    </PressScale>
  );
}

/** An underlined text action, for the smallest choices such as Delete and Cancel. */
export function TextLink({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.link}>
      <Text style={[styles.linkText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 12, paddingBottom: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: 6 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '600' },
  titleOnly: { minHeight: 44, paddingHorizontal: 6, textAlignVertical: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xl },
  footer: { paddingHorizontal: space.xl, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.paper },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  section: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#CFCFC9' },
  lineText: { flex: 1, gap: 2 },
  lineTitle: { color: colors.ink, fontSize: 17 },
  lineDetail: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  danger: { color: colors.danger },
  field: { gap: space.sm },
  fieldLabel: { color: colors.muted, fontSize: 14 },
  input: { minHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.ink, color: colors.ink, fontSize: 22, fontWeight: '300', paddingVertical: 0 },
  error: { color: colors.danger, fontSize: 14 },
  options: { flexDirection: 'row', gap: space.lg },
  option: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  optionOn: { borderBottomColor: colors.ink },
  optionText: { color: '#8A8A84', fontSize: 17 },
  optionTextOn: { color: colors.ink, fontWeight: '500' },
  optionTextOff: { color: '#C2C2BC' },
  primary: { minHeight: 58, borderRadius: 29, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(32,32,32,0.12)' },
  primaryText: { color: colors.onPrimary, fontSize: 18, fontWeight: '600' },
  secondary: { minHeight: 58, borderRadius: 29, borderWidth: 1, borderColor: '#CFCFC9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  secondaryText: { color: colors.ink, fontSize: 17 },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.ink, fontSize: 15, textDecorationLine: 'underline' },
  disabled: { opacity: 0.5 },
});
