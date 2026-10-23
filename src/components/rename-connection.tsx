import { useEffect, useState } from 'react';
import {
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import AppButton from './appbuton';

type RenameConnectionProps = {
  currentName: string;
  onCancel: () => void;
  onSave: (newName: string) => Promise<void>;
};

export default function RenameConnection({ currentName, onCancel, onSave }: RenameConnectionProps) {
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(currentName);
    setError('');
  }, [currentName]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, [onCancel]);

  const handleSubmit = async () => {
    const trimmedName = value.trim();

    if (!trimmedName) {
      setError('Connection name cannot be empty.');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave(trimmedName);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not rename connection. Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled
      keyboardVerticalOffset={24}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Rename Connection</Text>

        <TextInput
          accessibilityLabel="Rename connection"
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          blurOnSubmit
          keyboardAppearance="dark"
          keyboardType="default"
          onChangeText={(nextValue) => {
            setValue(nextValue);
            if (error) {
              setError('');
            }
          }}
          onSubmitEditing={() => {
            void handleSubmit();
          }}
          placeholder="Enter a connection name"
          placeholderTextColor="#7a7a7a"
          returnKeyType="done"
          selectTextOnFocus
          style={styles.input}
          value={value}
        />

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            title="Cancel"
            variant="secondary"
            disabled={isSaving}
            onPress={onCancel}
          />
          <AppButton
            title={isSaving ? 'Saving...' : 'Save'}
            variant="success"
            disabled={isSaving}
            onPress={() => {
              void handleSubmit();
            }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  title: {
    color: '#f5f5f5',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 10,
    backgroundColor: '#202020',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
});
