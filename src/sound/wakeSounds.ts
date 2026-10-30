/**
 * The alarm tones WakeWise ships. Five are original, synthesised by
 * tools/generate-sounds.py. Motivation is supplied by the team (licence to be confirmed).
 * Each has a .caf file for the alarm (bundled in the
 * native module) and an .m4a preview for the app. Ids are stored with alarms,
 * so never rename one.
 */
export type WakeSoundCategory = 'powerful' | 'gentle' | 'classic';

export interface WakeSound {
  id: string;
  name: string;
  category: WakeSoundCategory;
  description: string;
  /** File the native alarm plays. AlarmKit only plays files bundled with the app. */
  alarmFile: string;
  preview: number;
}

export const WAKE_SOUNDS: WakeSound[] = [
  { id: 'power-wake', name: 'Power Wake', category: 'powerful', description: 'Hard two-tone beeps', alarmFile: 'wakewise_power_wake.caf', preview: require('../../assets/sounds/preview/power-wake.m4a') },
  { id: 'pulse', name: 'Pulse', category: 'powerful', description: 'Driving low beat', alarmFile: 'wakewise_pulse.caf', preview: require('../../assets/sounds/preview/pulse.m4a') },
  { id: 'classic-bell', name: 'Classic Bell', category: 'classic', description: 'Twin-bell clock ring', alarmFile: 'wakewise_classic_bell.caf', preview: require('../../assets/sounds/preview/classic-bell.m4a') },
  { id: 'golden-morning', name: 'Golden Morning', category: 'gentle', description: 'Rising bell arpeggio', alarmFile: 'wakewise_golden_morning.caf', preview: require('../../assets/sounds/preview/golden-morning.m4a') },
  { id: 'soft-rise', name: 'Soft Rise', category: 'gentle', description: 'Slow marimba thirds', alarmFile: 'wakewise_soft_rise.caf', preview: require('../../assets/sounds/preview/soft-rise.m4a') },
  { id: 'motivation', name: 'Motivation', category: 'powerful', description: 'Driving motivational combo, 22 seconds', alarmFile: 'wakewise_motivation.caf', preview: require('../../assets/sounds/preview/motivation.m4a') },
  { id: 'angry-fists', name: 'Angry Fists', category: 'powerful', description: 'Heavy hits, short and sharp', alarmFile: 'wakewise_angry_fists.caf', preview: require('../../assets/sounds/preview/angry_fists.m4a') },
  { id: 'cinematic-booms', name: 'Cinematic Booms', category: 'powerful', description: 'Deep booming impacts', alarmFile: 'wakewise_cinematic_booms.caf', preview: require('../../assets/sounds/preview/cinematic_booms.m4a') },
  { id: 'cinematic-booms-2', name: 'Cinematic Booms 2', category: 'powerful', description: 'Deep booming impacts, variant', alarmFile: 'wakewise_cinematic_booms_2.caf', preview: require('../../assets/sounds/preview/cinematic_booms_2.m4a') },
  { id: 'frantic', name: 'Frantic', category: 'powerful', description: 'Fast, urgent pulses', alarmFile: 'wakewise_frantic.caf', preview: require('../../assets/sounds/preview/frantic.m4a') },
  { id: 'frantic-2', name: 'Frantic 2', category: 'powerful', description: 'Fast, urgent pulses, variant', alarmFile: 'wakewise_frantic_2.caf', preview: require('../../assets/sounds/preview/frantic_2.m4a') },
  { id: 'get-up-champion', name: 'Get Up Champion', category: 'powerful', description: 'Rising, energetic call to action', alarmFile: 'wakewise_get_up_champion.caf', preview: require('../../assets/sounds/preview/get_up_champion.m4a') },
  { id: 'get-up-soldier', name: 'Get Up Soldier', category: 'powerful', description: 'Drill call to get up, 24 seconds', alarmFile: 'wakewise_get_up_soldier.caf', preview: require('../../assets/sounds/preview/get_up_soldier.m4a') },
  { id: 'get-up-soldier-2', name: 'Get Up Soldier 2', category: 'powerful', description: 'Drill call to get up, variant', alarmFile: 'wakewise_get_up_soldier_2.caf', preview: require('../../assets/sounds/preview/get_up_soldier_2.m4a') },
  { id: 'good-m', name: 'Good Morning', category: 'gentle', description: 'Spoken morning greeting', alarmFile: 'wakewise_good_m.caf', preview: require('../../assets/sounds/preview/good_m.m4a') },
  { id: 'sassy-oh-so', name: 'Sassy', category: 'classic', description: 'Playful spoken line', alarmFile: 'wakewise_sassy_oh_so.caf', preview: require('../../assets/sounds/preview/sassy_oh_so.m4a') },
];

export const DEFAULT_WAKE_SOUND_ID = 'golden-morning';

export function soundById(id: string): WakeSound {
  return WAKE_SOUNDS.find((s) => s.id === id) ?? WAKE_SOUNDS.find((s) => s.id === DEFAULT_WAKE_SOUND_ID) ?? WAKE_SOUNDS[0];
}
