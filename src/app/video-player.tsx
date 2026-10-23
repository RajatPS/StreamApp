import { useEffect, useRef, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppButton from '../components/appbuton';
import {
  frameRates,
  getVideoPlayerSettings,
  receiveResolutions,
  saveVideoPlayerSettings,
  sourceResolutions,
  type VideoPlayerSettings,
} from '../utils/video-player-settings';
import {
  connectToSignaling,
  type SignalingMessage,
} from '../utils/room-client';

function SettingOptions<T extends string | number>({
  options,
  selected,
  onSelect,
  formatOption = String,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (option: T) => void;
  formatOption?: (option: T) => string;
}) {
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const isSelected = selected === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option)}
            style={[styles.option, isSelected && styles.selectedOption]}
          >
            <Text
              style={[
                styles.optionText,
                isSelected && styles.selectedOptionText,
              ]}
            >
              {formatOption(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function VideoPlayer() {
  const { streamId, displayName, backendUrl } = useLocalSearchParams<{
    streamId?: string;
    displayName?: string;
    backendUrl?: string;
  }>();
  const viewerSocket = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState(() =>
    streamId && backendUrl
      ? 'Checking room signaling…'
      : 'Room signaling configuration is missing.',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(getVideoPlayerSettings);
  const [draftSettings, setDraftSettings] =
    useState<VideoPlayerSettings>(settings);
  const [settingsStatus, setSettingsStatus] = useState('');
  const details = [
    { label: 'Stream ID', value: streamId },
    { label: 'Display Name', value: displayName },
  ].filter((detail) => detail.value?.trim());

  useEffect(() => {
    if (!streamId || !backendUrl) {
      return;
    }

    const socket = connectToSignaling({
      backendUrl,
      roomId: streamId,
      role: 'viewer',
      displayName: displayName ?? '',
      onMessage: (message: SignalingMessage) => {
        if (message.type === 'joined') {
          setConnectionStatus(
            message.hostConnected
              ? 'Room joined. Host is connected; live video media is not available in this build.'
              : 'Room joined. Waiting for the host; live video media is not available in this build.',
          );
        } else if (message.type === 'host-status') {
          setConnectionStatus(
            message.hostConnected
              ? 'Host connected; live video media is not available in this build.'
              : 'Host disconnected. Waiting for the host to reconnect.',
          );
        } else if (message.type === 'room-ended') {
          setConnectionStatus('The host ended this room.');
        } else if (message.type === 'signal') {
          setConnectionStatus(
            'Signaling message received; a WebRTC media adapter is not configured.',
          );
        }
      },
      onError: setConnectionStatus,
    });
    viewerSocket.current = socket;

    return () => {
      socket.close();
      if (viewerSocket.current === socket) {
        viewerSocket.current = null;
      }
    };
  }, [backendUrl, displayName, streamId]);

  const openSettings = () => {
    setDraftSettings(settings);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
  };

  const applySettings = () => {
    const savedSettings = saveVideoPlayerSettings(draftSettings);
    setSettings(savedSettings);
    setSettingsStatus('UI settings saved successfully.');
    setSettingsOpen(false);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>

        <Text style={styles.heading}>Watching Stream</Text>

        <View
          accessibilityLabel="Video player preview"
          style={styles.player}
        >
          <Pressable
            accessibilityLabel="Video player settings"
            accessibilityRole="button"
            onPress={openSettings}
            style={styles.settingsButton}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </Pressable>
          <View style={styles.playIcon}>
            <Text style={styles.play}>▶</Text>
          </View>
          <Text style={styles.previewMessage}>
            {connectionStatus}
          </Text>
        </View>

        <View style={styles.qualitySummary}>
          <Text style={styles.summaryTitle}>Video settings</Text>
          <Text style={styles.summaryText}>
            Stream Quality: {settings.receiveResolution} ·{' '}
            {settings.receiveFrameRate} FPS
          </Text>
          <Text style={styles.summaryText}>
            Source Camera & Recording: {settings.sourceResolution} ·{' '}
            {settings.sourceFrameRate} FPS
          </Text>
        </View>
        {settingsStatus ? (
          <Text accessibilityLiveRegion="polite" style={styles.statusMessage}>
            {settingsStatus}
          </Text>
        ) : null}

        <View style={styles.details}>
          {details.length > 0 ? (
            details.map(({ label, value }) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyDetails}>No stream details provided</Text>
          )}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={settingsOpen}
        onRequestClose={closeSettings}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            onPress={closeSettings}
            style={styles.modalBackdrop}
          />
          <View style={styles.settingsSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Video Player Settings</Text>
              <Pressable
                accessibilityRole="button"
                onPress={closeSettings}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.settingSection}>
                <Text style={styles.sectionTitle}>Stream Quality</Text>
                <Text style={styles.sectionDescription}>
                  Receiving Phone
                </Text>
                <Text style={styles.controlLabel}>Resolution</Text>
                <SettingOptions
                  options={receiveResolutions}
                  selected={draftSettings.receiveResolution}
                  onSelect={(receiveResolution) =>
                    setDraftSettings((current) => ({
                      ...current,
                      receiveResolution,
                    }))
                  }
                />
                <Text style={styles.controlLabel}>Frame Rate</Text>
                <SettingOptions
                  options={frameRates}
                  selected={draftSettings.receiveFrameRate}
                  formatOption={(frameRate) => `${frameRate} FPS`}
                  onSelect={(receiveFrameRate) =>
                    setDraftSettings((current) => ({
                      ...current,
                      receiveFrameRate,
                    }))
                  }
                />
              </View>

              <View style={styles.settingSection}>
                <Text style={styles.sectionTitle}>
                  Source Camera & Recording
                </Text>
                <Text style={styles.sectionDescription}>
                  Recording Phone
                </Text>
                <Text style={styles.controlLabel}>Recording Resolution</Text>
                <SettingOptions
                  options={sourceResolutions}
                  selected={draftSettings.sourceResolution}
                  onSelect={(sourceResolution) =>
                    setDraftSettings((current) => ({
                      ...current,
                      sourceResolution,
                    }))
                  }
                />
                <Text style={styles.controlLabel}>
                  Recording Frame Rate
                </Text>
                <SettingOptions
                  options={frameRates}
                  selected={draftSettings.sourceFrameRate}
                  formatOption={(frameRate) => `${frameRate} FPS`}
                  onSelect={(sourceFrameRate) =>
                    setDraftSettings((current) => ({
                      ...current,
                      sourceFrameRate,
                    }))
                  }
                />
                <Text style={styles.summaryText}>
                  Selected: {draftSettings.sourceResolution} ·{' '}
                  {draftSettings.sourceFrameRate} FPS
                </Text>
              </View>
            </ScrollView>

            <View style={styles.actions}>
              <AppButton
                title="Close"
                variant="secondary"
                onPress={closeSettings}
              />
              <AppButton
                title="Apply Settings"
                variant="success"
                onPress={applySettings}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 12,
  },
  backLabel: {
    color: '#d5d5d5',
    fontSize: 16,
  },
  heading: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 22,
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    minHeight: 190,
    maxHeight: 380,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#292929',
  },
  settingsButton: {
    position: 'absolute',
    zIndex: 1,
    top: 10,
    right: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(35, 35, 35, 0.9)',
  },
  settingsIcon: {
    color: '#ffffff',
    fontSize: 23,
  },
  playIcon: {
    width: 58,
    height: 58,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    color: '#ffffff',
    fontSize: 23,
    marginLeft: 4,
  },
  previewMessage: {
    color: '#a3a3a3',
    fontSize: 13,
    marginTop: 16,
  },
  details: {
    gap: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#1c1c1c',
  },
  detailRow: {
    gap: 5,
  },
  detailLabel: {
    color: '#a3a3a3',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 15,
  },
  emptyDetails: {
    color: '#a3a3a3',
    fontSize: 14,
  },
  qualitySummary: {
    gap: 6,
    marginTop: 20,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#1c1c1c',
  },
  summaryTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  summaryText: {
    color: '#b4b4b4',
    fontSize: 13,
  },
  statusMessage: {
    color: '#facc15',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  settingsSheet: {
    maxHeight: '90%',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#171717',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingLeft: 12,
  },
  closeText: {
    color: '#d5d5d5',
    fontSize: 15,
  },
  sheetContent: {
    gap: 20,
    paddingBottom: 12,
  },
  settingSection: {
    gap: 10,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionDescription: {
    color: '#a3a3a3',
    fontSize: 13,
    lineHeight: 19,
  },
  controlLabel: {
    color: '#d5d5d5',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#414141',
    borderRadius: 8,
    backgroundColor: '#222222',
  },
  selectedOption: {
    borderColor: '#60a5fa',
    backgroundColor: '#17304d',
  },
  optionText: {
    color: '#d5d5d5',
    fontSize: 13,
    fontWeight: '500',
  },
  selectedOptionText: {
    color: '#ffffff',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
});
