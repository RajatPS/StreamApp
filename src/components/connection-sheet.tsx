import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, } from 'react-native';
import type { ConnectionValues, SavedConnection, } from '../utils/connection-storage';
import AppButton from './appbuton';

type ConnectionSheetProps = {
  visible: boolean;
  mode: 'default' | 'join';
  onClose: () => void;
  onSave: (values: ConnectionValues) => Promise<SavedConnection>;
  onJoin: (values: ConnectionValues) => Promise<void>;
};

type ConnectionFieldProps = { label: string; placeholder: string; keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean; };

const connectionFields: ConnectionFieldProps[] = [
  { label: 'Connection Name', placeholder: 'Enter a connection name' },
  { label: 'Room ID', placeholder: 'Enter a room ID' },
  { label: 'Signaling server URL', placeholder: 'wss://example.com', keyboardType: 'url', },
  { label: 'STUN/TURN server URL', placeholder: 'stun: or turn:', keyboardType: 'url', },
  { label: 'TURN username', placeholder: 'Optional' },
  { label: 'TURN credential', placeholder: 'Optional', secureTextEntry: true, },
];

const joinFields: ConnectionFieldProps[] = [
  { label: 'Stream ID', placeholder: 'Enter a stream ID' },
  { label: 'Display Name', placeholder: 'Enter your display name' },
];

export default function ConnectionSheet({
  visible,
  mode,
  onClose,
  onSave,
  onJoin,
}: ConnectionSheetProps) {
  const [values, setValues] = useState<ConnectionValues>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleCancel = () => {
    if (saving) {
      return;
    }

    setValues({});
    setSaveError('');
    onClose();
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onSave(values);
      setValues({});
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `Could not save connection: ${error.message}`
          : 'Could not save connection. Check device storage and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await onJoin(values);
      setValues({});
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `Could not join connection: ${error.message}`
          : 'Could not join connection. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const fields = mode === 'join' ? joinFields : connectionFields;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close connection setup" disabled={saving}
          onPress={handleCancel} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>
                {mode === 'join' ? 'JOIN SESSION' : 'NEW SESSION'}
              </Text>
              <Text style={styles.title}>
                {mode === 'join' ? 'Join a connection' : 'Create a connection'}
              </Text>
            </View>
          </View>

          <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator>
            {fields.map((field) => (
              <View key={field.label} style={styles.field}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput accessibilityLabel={field.label} autoCapitalize="none" autoCorrect={false} keyboardType={field.keyboardType}
                  onChangeText={(value) =>
                    setValues((currentValues) => ({
                      ...currentValues,
                      [field.label]: value,
                    }))
                  }
                  placeholder={field.placeholder} placeholderTextColor="#858585" secureTextEntry={field.secureTextEntry}
                  style={styles.input} value={values[field.label] ?? ''}
                />
              </View>
            ))}
          </ScrollView>
          {saveError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {saveError}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <AppButton
              title="Cancel" variant="secondary" disabled={saving} onPress={handleCancel}/>
            <AppButton
              title={
                mode === 'join'
                  ? saving
                    ? 'Joining…'
                    : 'Join'
                  : saving
                    ? 'Saving…'
                    : 'Save'
              }
              variant="success"
              disabled={saving}
              onPress={() =>
                void (mode === 'join' ? handleJoin() : handleSave())
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: '#171717',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: '#343434',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#686868',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  eyebrow: {
    color: '#b4b4b4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    color: '#ffffff',
    fontSize: 21,
    fontWeight: '600',
  },
  form: {
    flexShrink: 1,
  },
  formContent: {
    gap: 16,
    paddingBottom: 8,
  },
  field: {
    gap: 7,
  },
  label: {
    color: '#e7e7e7',
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    borderRadius: 8,
    backgroundColor: '#202020',
    color: '#ffffff',
    fontSize: 15,
    paddingHorizontal: 13,
  },
  error: {
    color: '#fca5a5',
    fontSize: 13,
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
});