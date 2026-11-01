import { Appearance } from 'react-native';

import type { Appearance as AppearanceChoice } from '../context/contextRepository';

/** Night and day set the whole app's scheme. Automatic follows the phone. Colours and system alerts change together. */
export function applyAppearance(choice: AppearanceChoice): void {
  Appearance.setColorScheme(choice === 'night' ? 'dark' : choice === 'day' ? 'light' : 'unspecified');
}
