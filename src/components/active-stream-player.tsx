import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Resolution = '720p' | '1080p';
type FrameRate = 30 | 60 | 90;

type StreamQuality = {
  resolution: Resolution;
  frameRate: FrameRate;
};

type NativeRecorder = {
  start: (stream: MediaStream) => Promise<void>;
  // Stop capture, save the resulting video on-device, and return its local URI.
  stop: () => Promise<string>;
};

type ActiveStreamPlayerProps = {
  // Pass the active local/outgoing MediaStream and saved connection name here.
  // Example: <ActiveStreamPlayer stream={localStream} connection={{ name: saved.name }} />
  stream: MediaStream | null;
  connection: { name: string };
  // Supply your WebRTC view (for example, RTCView) and native recorder adapter on iOS/Android.
  renderNativeVideo?: (stream: MediaStream, muted: boolean) => ReactNode;
  nativeRecorder?: NativeRecorder;
};

const qualityOptions: StreamQuality[] = [
  { resolution: '720p', frameRate: 30 },
  { resolution: '720p', frameRate: 60 },
  { resolution: '720p', frameRate: 90 },
  { resolution: '1080p', frameRate: 30 },
  { resolution: '1080p', frameRate: 60 },
  { resolution: '1080p', frameRate: 90 },
];

const webVideoStyle: CSSProperties = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  backgroundColor: '#050505',
};

export default function ActiveStreamPlayer({
  stream,
  connection,
  renderNativeVideo,
  nativeRecorder,
}: ActiveStreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [quality, setQuality] = useState<StreamQuality>({
    resolution: '720p',
    frameRate: 30,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [muted, setMuted] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || !videoRef.current || !stream) {
      return;
    }

    const videoElement = videoRef.current;
    videoElement.srcObject = stream;
    void videoElement.play().catch((error: unknown) => {
      setMessage(
        error instanceof Error
          ? `Could not play the camera feed: ${error.message}`
          : 'Could not play the camera feed.',
      );
    });

    return () => {
      videoElement.srcObject = null;
    };
  }, [stream]);

  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    },
    [],
  );

  const selectQuality = async (nextQuality: StreamQuality) => {
    const videoTrack = stream?.getVideoTracks()[0];
    try {
      if (videoTrack) {
        const [width, height] =
          nextQuality.resolution === '1080p' ? [1920, 1080] : [1280, 720];
        const constraints: MediaTrackConstraints = {
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: nextQuality.frameRate },
        };
        await videoTrack.applyConstraints(constraints);
      }

      setQuality(nextQuality);
      setMessage('');
      setSettingsOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not apply video quality: ${error.message}`
          : 'Could not apply video quality. Choose a supported setting.',
      );
    }
  };

  const startRecording = async () => {
    if (!stream) {
      setMessage('Start a camera stream before recording.');
      return;
    }

    setMessage('');
    try {
      if (Platform.OS === 'web') {
        if (typeof MediaRecorder === 'undefined') {
          throw new Error('MediaRecorder is not available in this browser.');
        }

        const mimeType = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        recordingChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordingChunksRef.current.push(event.data);
          }
        };
        recorder.onstop = () => {
          const blob = new Blob(recordingChunksRef.current, {
            type: recorder.mimeType || 'video/webm',
          });
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = `stream-recording-${Date.now()}.webm`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          recordingChunksRef.current = [];
          setMessage('Recording saved to your device.');
        };
        recorder.start();
        recorderRef.current = recorder;
      } else {
        if (!nativeRecorder) {
          throw new Error(
            'Pass a nativeRecorder adapter to record and save on this device.',
          );
        }
        await nativeRecorder.start(stream);
      }

      setIsRecording(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not start recording: ${error.message}`
          : 'Could not start recording.',
      );
    }
  };

  const stopRecording = async () => {
    try {
      if (Platform.OS === 'web') {
        if (recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      } else if (nativeRecorder) {
        const fileUri = await nativeRecorder.stop();
        setMessage(`Recording saved locally: ${fileUri}`);
      }
      setIsRecording(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Could not save recording: ${error.message}`
          : 'Could not save recording.',
      );
    }
  };

  const toggleRecording = () => {
    void (isRecording ? stopRecording() : startRecording());
  };

  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={styles.title}>{connection.name}</Text>
        <Text style={styles.liveLabel}>LIVE STREAM</Text>
      </View>

      <View style={styles.player}>
        {stream && Platform.OS === 'web' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            style={webVideoStyle}
          />
        ) : stream && renderNativeVideo ? (
          <View style={styles.nativeVideo}>
            {renderNativeVideo(stream, muted)}
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderIcon}>▶</Text>
            <Text style={styles.placeholderText}>
              {stream
                ? 'Connect a native video renderer to show the camera feed.'
                : 'Waiting for camera stream…'}
            </Text>
          </View>
        )}

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            onPress={toggleRecording}
            style={[styles.controlButton, isRecording && styles.recordingButton]}
          >
            <View
              style={[
                styles.recordIndicator,
                isRecording && styles.recordIndicatorActive,
              ]}
            />
            <Text style={styles.controlText}>
              {isRecording ? 'Stop' : 'Record'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMuted((current) => !current)}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>
              {muted ? 'Unmute preview' : 'Mute preview'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSettingsOpen(true)}
            style={styles.controlButton}
          >
            <Text style={styles.controlText}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.qualitySummary}>
        {quality.resolution} · {quality.frameRate} fps
      </Text>
      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={settingsOpen}
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close video settings"
          onPress={() => setSettingsOpen(false)}
          style={styles.modalBackdrop}
        >
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.settingsPanel}>
            <Text style={styles.settingsTitle}>Stream quality</Text>
            <Text style={styles.settingsLabel}>Resolution and frame rate</Text>
            <View style={styles.options}>
              {qualityOptions.map((option) => {
                const selected =
                  option.resolution === quality.resolution &&
                  option.frameRate === quality.frameRate;
                return (
                  <Pressable
                    key={`${option.resolution}-${option.frameRate}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => void selectQuality(option)}
                    style={[
                      styles.qualityOption,
                      selected && styles.qualityOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.qualityOptionText,
                        selected && styles.qualityOptionTextSelected,
                      ]}
                    >
                      {option.resolution} · {option.frameRate} fps
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettingsOpen(false)}
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    backgroundColor: '#111111',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  liveLabel: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderRadius: 14,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#303030',
  },
  nativeVideo: {
    ...StyleSheet.absoluteFill,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  placeholderIcon: {
    color: '#8a8a8a',
    fontSize: 36,
    marginBottom: 10,
  },
  placeholderText: {
    color: '#a3a3a3',
    fontSize: 14,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  controlButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#272727',
  },
  recordingButton: {
    backgroundColor: '#4b1717',
  },
  recordIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recordIndicatorActive: {
    backgroundColor: '#ff2525',
  },
  controlText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  qualitySummary: {
    color: '#b4b4b4',
    fontSize: 13,
    marginTop: 12,
  },
  message: {
    color: '#fca5a5',
    fontSize: 13,
    marginTop: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  settingsPanel: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#373737',
  },
  settingsTitle: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '600',
  },
  settingsLabel: {
    color: '#b4b4b4',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 14,
  },
  options: {
    gap: 8,
  },
  qualityOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#252525',
  },
  qualityOptionSelected: {
    backgroundColor: '#173c2a',
    borderWidth: 1,
    borderColor: '#16a34a',
  },
  qualityOptionText: {
    color: '#e5e5e5',
    fontSize: 14,
  },
  qualityOptionTextSelected: {
    color: '#bbf7d0',
    fontWeight: '600',
  },
  doneButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  doneText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
