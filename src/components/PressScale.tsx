import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Responds on press-in, not on release. Eased out, 120 ms down and 150 ms back. */
const PRESS_IN = { duration: 120, easing: Easing.bezier(0.23, 1, 0.32, 1) };
const PRESS_OUT = { duration: 150, easing: Easing.bezier(0.23, 1, 0.32, 1) };

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** How far the control shrinks while held. */
  scaleTo?: number;
}

/**
 * A pressable that shrinks slightly while held. With reduced motion on, it
 * keeps the press but drops the movement, as the system setting asks.
 */
export function PressScale({ style, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const reduced = useReducedMotion();
  const held = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.get() * (1 - scaleTo) }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      style={[style, !reduced && animated]}
      onPressIn={(e) => {
        if (!reduced) held.set(withTiming(1, PRESS_IN));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) held.set(withTiming(0, PRESS_OUT));
        onPressOut?.(e);
      }}
    />
  );
}
