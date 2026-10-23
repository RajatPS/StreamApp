import {
  createAssetAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library/legacy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useIsFocused, router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AppButton from '../components/appbuton';
import {
  applyVideoFilter,
  isVideoFilterProcessingAvailable,
} from '../../modules/video-filters';
import {
  connectToSignaling,
  endRoom,
  type SignalingMessage,
} from '../utils/room-client';
import {
  getSavedConnectionValues,
  type ConnectionValues,
} from '../utils/connection-storage';

const resolutions = ['720p', '1080p', '4K'] as const;
const filters = ['None', 'Grayscale', 'Sepia', 'Vintage', 'Cool', 'Warm'] as const;
type Resolution = (typeof resolutions)[number];
type VideoFilter = (typeof filters)[number];
type PreviewSize = 'compact' | 'half' | 'full';

const previewSizes: PreviewSize[] = ['compact', 'half', 'full'];

const filterPreviewColors: Partial<Record<VideoFilter, string>> = {
  Grayscale: 'rgba(96, 96, 96, 0.28)',
  Sepia: 'rgba(156, 94, 40, 0.22)',
  Vintage: 'rgba(178, 119, 55, 0.2)',
  Cool: 'rgba(53, 132, 219, 0.18)',
  Warm: 'rgba(255, 190, 71, 0.18)',
};

function getVideoQuality(resolution: Resolution): '720p' | '1080p' | '2160p' {
  return resolution === '4K' ? '2160p' : resolution;
}

function formatElapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function SelectionOptions<T extends string>({
  options,
  selected,
  onSelect,
  disabled = false,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (option: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const isSelected = selected === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled }}
            disabled={disabled}
            onPress={() => onSelect(option)}
            style={[
              styles.option,
              isSelected && styles.selectedOption,
              disabled && styles.disabledOption,
            ]}
          >
            <Text
              style={[
                styles.optionText,
                isSelected && styles.selectedOptionText,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function CameraPreview() {
  const { connectionId, connectionName } = useLocalSearchParams<{
    connectionId?: string;
    connectionName?: string;
  }>();
  const { height: windowHeight } = useWindowDimensions();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const permissionRequested = useRef(false);
  const recordingInProgress = useRef(false);
  const screenFocused = useRef(false);
  const hostSocket = useRef<WebSocket | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [isPreparingRecording, setIsPreparingRecording] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [filter, setFilter] = useState<VideoFilter>('None');
  const recordingFilter = useRef<VideoFilter>('None');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('compact');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnectingToSignaling, setIsConnectingToSignaling] = useState(false);
  const [hostSession, setHostSession] = useState<{
    roomId: string;
    hostToken: string;
    backendUrl: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusError, setStatusError] = useState(() => {
    const numericConnectionId = Number(connectionId);
    return connectionId &&
      (!Number.isSafeInteger(numericConnectionId) || numericConnectionId < 1)
      ? 'Saved connection ID is invalid.'
      : '';
  });

  useEffect(() => {
    if (!connectionId) {
      return;
    }

    let active = true;
    const numericConnectionId = Number(connectionId);
    if (!Number.isSafeInteger(numericConnectionId) || numericConnectionId < 1) {
      return;
    }

    getSavedConnectionValues(numericConnectionId)
      .then((values: ConnectionValues) => {
        if (!active) {
          return;
        }
        const roomId = values['Room ID']?.trim();
        const hostToken = values.__hostToken;
        const backendUrl = values.__backendUrl;
        if (roomId && hostToken && backendUrl) {
          setHostSession({ roomId, hostToken, backendUrl });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setStatusError(
            error instanceof Error
              ? `Could not load the saved room: ${error.message}`
              : 'Could not load the saved room.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [connectionId]);

  useEffect(
    () => () => {
      hostSocket.current?.close();
      hostSocket.current = null;
    },
    [],
  );

  useEffect(() => {
    if (
      permission &&
      !permission.granted &&
      permission.canAskAgain &&
      !permissionRequested.current
    ) {
      permissionRequested.current = true;
      requestPermission().catch((error: unknown) => {
        setStatusError(
          error instanceof Error
            ? `Could not request camera permission: ${error.message}`
            : 'Could not request camera permission.',
        );
      });
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecording]);

  useFocusEffect(
    useCallback(
      () => {
        screenFocused.current = true;
        return () => {
          screenFocused.current = false;
          cameraRef.current?.stopRecording();
        };
      },
      [],
    ),
  );

  const previewHeight =
    previewSize === 'compact'
      ? 240
      : previewSize === 'half'
        ? Math.round(windowHeight * 0.48)
        : Math.round(windowHeight * 0.72);

  const switchPreviewSize = () => {
    setPreviewSize((current) => {
      const currentIndex = previewSizes.indexOf(current);
      return previewSizes[(currentIndex + 1) % previewSizes.length];
    });
  };

  const startRecording = async () => {
    if (Platform.OS === 'web') {
      setStatusError(
        'Local video recording with Expo Camera is supported on iOS and Android only.',
      );
      return;
    }
    if (!cameraReady || !cameraRef.current) {
      setStatusError('Wait for the camera preview to be ready before recording.');
      return;
    }
    if (recordingInProgress.current) {
      return;
    }
    if (filter !== 'None' && !isVideoFilterProcessingAvailable()) {
      setStatusError(
        'Filtered recording requires an iOS or Android development build. Rebuild the app before recording with a filter.',
      );
      return;
    }

    recordingInProgress.current = true;
    setStatusError('');
    setStatusMessage('');
    setElapsedSeconds(0);
    setIsPreparingRecording(true);
    try {
      let mediaPermission = await getPermissionsAsync(true, ['video']);
      if (!mediaPermission.granted) {
        mediaPermission = await requestPermissionsAsync(true, ['video']);
      }
      if (!mediaPermission.granted) {
        throw new Error(
          'Video library permission was denied. Allow access to save recordings to your gallery.',
        );
      }
      if (!screenFocused.current || !cameraReady || !cameraRef.current) {
        throw new Error(
          'The camera screen is no longer active. Return to it and try again.',
        );
      }

      const camera = cameraRef.current;
      recordingFilter.current = filter;
      setIsPreparingRecording(false);
      setIsRecording(true);
      const recording = await camera.recordAsync();
      setIsRecording(false);
      if (!recording?.uri) {
        throw new Error('The camera did not return a recorded video file.');
      }

      setIsSaving(true);
      const filteredUri =
        recordingFilter.current === 'None'
          ? recording.uri
          : await applyVideoFilter(recording.uri, recordingFilter.current);
      await createAssetAsync(filteredUri);
      setStatusMessage('Video recording saved to your device library.');
    } catch (error) {
      setIsRecording(false);
      setIsPreparingRecording(false);
      setStatusError(
        error instanceof Error
          ? `Recording could not be completed: ${error.message}`
          : 'Recording could not be completed or saved.',
      );
    } finally {
      recordingInProgress.current = false;
      setIsRecording(false);
      setIsPreparingRecording(false);
      setIsSaving(false);
    }
  };

  const stopRecording = () => {
    if (!recordingInProgress.current) {
      return;
    }
    setIsRecording(false);
    setIsSaving(true);
    cameraRef.current?.stopRecording();
  };

  const startStreamSignaling = () => {
    if (isConnectingToSignaling || isStreaming) {
      return;
    }
    if (!hostSession) {
      setStatusError(
        'This connection has no registered backend room. Create or save it while the Node backend is reachable.',
      );
      return;
    }

    setStatusError('');
    setStatusMessage('Connecting to the room signaling service…');
    setIsConnectingToSignaling(true);
    const socket = connectToSignaling({
      backendUrl: hostSession.backendUrl,
      roomId: hostSession.roomId,
      role: 'host',
      hostToken: hostSession.hostToken,
      onMessage: (message: SignalingMessage) => {
        if (message.type === 'joined') {
          setIsConnectingToSignaling(false);
          setIsStreaming(true);
          setStatusMessage(
            'Signaling is connected. Live video is not available until a WebRTC media adapter is configured.',
          );
        } else if (message.type === 'viewer-joined') {
          const viewerName = message.displayName?.trim() || 'A viewer';
          setStatusMessage(`${viewerName} joined. Live video is not connected.`);
        } else if (message.type === 'viewer-left') {
          setStatusMessage('A viewer left the room.');
        } else if (message.type === 'room-ended') {
          setIsStreaming(false);
          setHostSession(null);
          setStatusMessage('The room has ended.');
          hostSocket.current = null;
        }
      },
      onError: (message) => {
        setIsConnectingToSignaling(false);
        setIsStreaming(false);
        setStatusError(message);
      },
      onClose: () => {
        if (hostSocket.current === socket) {
          hostSocket.current = null;
          setIsConnectingToSignaling(false);
          setIsStreaming(false);
          if (screenFocused.current) {
            setStatusMessage('Disconnected from room signaling.');
          }
        }
      },
    });
    hostSocket.current = socket;
  };

  const stopStreamSignaling = async () => {
    if (!hostSession) {
      hostSocket.current?.close();
      hostSocket.current = null;
      setIsStreaming(false);
      setIsConnectingToSignaling(false);
      return;
    }

    setStatusError('');
    try {
      await endRoom(
        hostSession.roomId,
        hostSession.hostToken,
        hostSession.backendUrl,
      );
      setStatusMessage('The room has ended.');
      setHostSession(null);
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? `Could not end the room: ${error.message}`
          : 'Could not end the room.',
      );
    } finally {
      hostSocket.current?.close();
      hostSocket.current = null;
      setIsStreaming(false);
      setIsConnectingToSignaling(false);
    }
  };

  const toggleStream = () => {
    if (isStreaming || isConnectingToSignaling) {
      void stopStreamSignaling();
    } else {
      startStreamSignaling();
    }
  };

  const cameraPermissionDenied = permission && !permission.granted;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          style={styles.backButton}
        >
          <Text style={styles.backLabel}>‹ Back</Text>
        </Pressable>

        <Text style={styles.heading}>
          {connectionName?.trim() || 'Camera Preview'}
        </Text>
        {connectionId ? (
          <Text style={styles.connectionId}>Connection #{connectionId}</Text>
        ) : null}

        <View style={[styles.preview, { height: previewHeight }]}>
          {permission?.granted && isFocused ? (
            <CameraView
              ref={cameraRef}
              active={isFocused}
              facing={facing}
              mode="video"
              mute
              videoQuality={getVideoQuality(resolution)}
              onCameraReady={() => {
                setCameraReady(true);
                setStatusError('');
              }}
              onMountError={({ message }) => {
                setCameraReady(false);
                setStatusError(`Could not start camera: ${message}`);
              }}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={styles.permissionPanel}>
              <Text style={styles.cameraIcon}>▣</Text>
              <Text style={styles.previewTitle}>Camera Preview</Text>
              <Text style={styles.previewMessage}>
                {cameraPermissionDenied
                  ? 'Camera permission is required to show the live preview.'
                  : permission
                    ? 'Waiting for camera permission…'
                    : 'Checking camera permission…'}
              </Text>
              {cameraPermissionDenied ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    permissionRequested.current = true;
                    requestPermission().catch((error: unknown) => {
                      setStatusError(
                        error instanceof Error
                          ? `Could not request camera permission: ${error.message}`
                          : 'Could not request camera permission.',
                      );
                    });
                  }}
                  style={styles.permissionButton}
                >
                  <Text style={styles.permissionButtonText}>
                    Allow Camera Access
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <Pressable
            accessibilityLabel={
              previewSize === 'full'
                ? 'Shrink camera preview'
                : `Expand camera preview to ${previewSize === 'compact' ? 'half screen' : 'full screen'}`
            }
            accessibilityRole="button"
            onPress={switchPreviewSize}
            style={styles.previewIconButton}
          >
            <Text style={styles.previewIcon}>
              {previewSize === 'full' ? '⤡' : '⤢'}
            </Text>
          </Pressable>
          {permission?.granted ? (
            <>
              <Pressable
                accessibilityLabel={`Switch to ${facing === 'back' ? 'front' : 'rear'} camera`}
                accessibilityRole="button"
                disabled={isPreparingRecording || isRecording || isSaving}
                onPress={() => {
                  setCameraReady(false);
                  setFacing((current) =>
                    current === 'back' ? 'front' : 'back',
                  );
                }}
                style={styles.switchCameraButton}
              >
                <Text style={styles.switchCameraText}>
                  {facing === 'back' ? 'Front' : 'Rear'}
                </Text>
              </Pressable>
            </>
          ) : null}

          {cameraReady && filterPreviewColors[filter] ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: filterPreviewColors[filter] },
              ]}
            />
          ) : null}
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>
              {cameraReady ? `Filter: ${filter}` : 'Camera preview'}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isStreaming }}
          onPress={toggleStream}
          style={[
            styles.streamButton,
            isStreaming && styles.streamButtonActive,
          ]}
        >
          <Text style={styles.streamButtonText}>
            {isConnectingToSignaling
              ? 'Connecting…'
              : isStreaming
                ? 'Stop Stream'
                : 'Start Stream'}
          </Text>
        </Pressable>
        <Text style={styles.streamNote}>
          {isStreaming
            ? 'Signaling is connected; video transport is not available in this build.'
            : 'Start Stream connects to the Node signaling service; a WebRTC media connection is not yet configured.'}
        </Text>

        <View style={styles.recordingStatus}>
          <View style={styles.recordingLabel}>
            <View
              style={[
                styles.recordingIndicator,
                isRecording && styles.recordingIndicatorActive,
              ]}
            />
            <Text style={styles.recordingText}>
              {isSaving
                ? 'Saving video…'
                : isPreparingRecording
                  ? 'Preparing recording…'
                  : isRecording
                  ? 'Recording'
                  : 'Not recording'}
            </Text>
          </View>
          <Text style={styles.timer}>{formatElapsedTime(elapsedSeconds)}</Text>
        </View>

        <View style={styles.recordingActions}>
          <AppButton
            title="Start Recording"
            variant="success"
            disabled={
              isPreparingRecording || isRecording || isSaving || !cameraReady
            }
            onPress={() => void startRecording()}
          />
          <AppButton
            title="Stop Recording"
            variant="danger"
            disabled={!isRecording || isSaving}
            onPress={stopRecording}
          />
        </View>

        {statusError ? (
          <Text accessibilityRole="alert" style={styles.statusError}>
            {statusError}
          </Text>
        ) : null}
        {statusMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.statusMessage}>
            {statusMessage}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recording Quality</Text>
          <Text style={styles.controlLabel}>Video resolution preset</Text>
          <View style={styles.options}>
            {resolutions.map((option) => {
              const isSelected = resolution === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelected,
                    disabled:
                      isPreparingRecording || isRecording || isSaving,
                  }}
                  disabled={isPreparingRecording || isRecording || isSaving}
                  onPress={() => setResolution(option)}
                  style={[
                    styles.option,
                    isSelected && styles.selectedOption,
                    (isPreparingRecording || isRecording || isSaving) &&
                      styles.disabledOption,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.selectedOptionText,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.selectedQuality}>
            Selected preset: {resolution} · Frame rate: Automatic
          </Text>
          <Text style={styles.sectionNote}>
            Expo Camera can request a video resolution preset, but does not
            enumerate supported video modes. If a preset is unavailable, the
            native camera may use its highest available quality.
          </Text>
          <Text style={styles.controlLabel}>Frame rate</Text>
          <Text style={styles.sectionNote}>
            Expo Camera does not expose a video FPS capability list or an FPS
            recording control on this SDK. The camera chooses its frame rate
            automatically; 30, 60, and 120 FPS cannot be verified or selected
            here.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Video Filters</Text>
          <Text style={styles.selectedQuality}>
            Selected filter: {filter}
          </Text>
          <SelectionOptions
            options={filters}
            selected={filter}
            onSelect={setFilter}
            disabled={isRecording || isSaving}
          />
          {isRecording ? (
            <Text style={styles.sectionNote}>
              Stop recording before changing filters. The selected filter is
              applied to the complete saved video.
            </Text>
          ) : null}
          <Text style={styles.sectionNote}>
            The saved video is processed with the selected filter after
            recording. Live preview tint is approximate; Expo Camera does not
            expose filtered camera frames.
          </Text>
          <Text style={styles.sectionNote}>
            Filtered recording requires a rebuilt iOS or Android development
            build. None continues to record without processing.
          </Text>
        </View>
      </ScrollView>
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
    fontSize: 24,
    fontWeight: '700',
    marginTop: 12,
  },
  connectionId: {
    color: '#a3a3a3',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 18,
  },
  preview: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#050505',
  },
  permissionPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  cameraIcon: {
    color: '#8b8b8b',
    fontSize: 40,
    marginBottom: 8,
  },
  previewTitle: {
    color: '#eeeeee',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewMessage: {
    color: '#b0b0b0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  permissionButton: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  previewIconButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
  },
  previewIcon: {
    color: '#ffffff',
    fontSize: 21,
  },
  switchCameraButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 1,
    minWidth: 56,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
  },
  switchCameraText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  filterBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(25, 25, 25, 0.9)',
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 12,
  },
  streamButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#16a34a',
  },
  streamButtonActive: {
    backgroundColor: '#dc2626',
  },
  streamButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  streamNote: {
    color: '#999999',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  recordingStatus: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#1c1c1c',
  },
  recordingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  recordingIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#777777',
  },
  recordingIndicatorActive: {
    backgroundColor: '#ef4444',
  },
  recordingText: {
    color: '#eeeeee',
    fontSize: 14,
    fontWeight: '500',
  },
  timer: {
    color: '#ffffff',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  recordingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  statusError: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  statusMessage: {
    color: '#86efac',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  section: {
    gap: 12,
    marginTop: 24,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#343434',
    backgroundColor: '#1c1c1c',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  controlLabel: {
    color: '#d5d5d5',
    fontSize: 13,
    fontWeight: '600',
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
  disabledOption: {
    opacity: 0.5,
  },
  optionText: {
    color: '#d5d5d5',
    fontSize: 13,
    fontWeight: '500',
  },
  selectedOptionText: {
    color: '#ffffff',
  },
  selectedQuality: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionNote: {
    color: '#999999',
    fontSize: 12,
    lineHeight: 18,
  },
});
