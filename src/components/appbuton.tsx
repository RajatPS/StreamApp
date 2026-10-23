import { Pressable, StyleSheet, Text } from 'react-native';

type ButtonVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'secondary';

type AppButtonProps = {
  title: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  disabled?: boolean;
};

export default function AppButton({
  title,
  variant = 'primary',
  onPress,
  disabled = false,
}: AppButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, styles[variant], disabled && styles.disabled]}
    >
      <Text style={[styles.text, variant === 'secondary' && styles.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 5,
  },

  primary: {
    backgroundColor: '#2563EB',
  },

  success: {
    backgroundColor: '#16A34A',
  },

  warning: {
    backgroundColor: '#EAB308',
  },

  danger: {
    backgroundColor: '#DC2626',
  },

  secondary: {
    backgroundColor: '#D1D5DB',
  },

  disabled: {
    opacity: 0.55,
  },

  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  secondaryText: {
    color: '#111827',
  },
});