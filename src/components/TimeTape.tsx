import { Ruler } from './Ruler';

const STEP_MINUTES = 5;
const pad = (n: number) => String(n).padStart(2, '0');
const hourLabel = (v: number) => pad((v * STEP_MINUTES) / 60);

interface Props {
  /** The time the tape rests on, in minutes after midnight. */
  value: number;
  /** Called as the person drags, once for each five minutes crossed. */
  onChange: (minutes: number) => void;
}

/** The day as a ruler, five minutes to a tick, hours long and every third hour numbered. Used on home to set an alarm quickly. */
export function TimeTape({ value, onChange }: Props) {
  return (
    <Ruler
      value={Math.round(value / STEP_MINUTES)}
      min={0}
      max={(24 * 60) / STEP_MINUTES - 1}
      onChange={(v) => onChange(v * STEP_MINUTES)}
      tickWidth={12}
      major={60 / STEP_MINUTES}
      medium={30 / STEP_MINUTES}
      labelEvery={180 / STEP_MINUTES}
      format={hourLabel}
      accessibilityLabel="Alarm time"
      valueText={(v) => `${pad(Math.floor((v * STEP_MINUTES) / 60))}:${pad((v * STEP_MINUTES) % 60)}`}
    />
  );
}
