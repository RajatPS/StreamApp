export const receiveResolutions = ['1080p', '720p', '480p', '360p'] as const;
export const frameRates = [30, 60, 120] as const;
export const sourceResolutions = ['720p', '1080p', '4K'] as const;

export type ReceiveResolution = (typeof receiveResolutions)[number];
export type FrameRate = (typeof frameRates)[number];
export type SourceResolution = (typeof sourceResolutions)[number];

export type VideoPlayerSettings = {
  receiveResolution: ReceiveResolution;
  receiveFrameRate: FrameRate;
  sourceResolution: SourceResolution;
  sourceFrameRate: FrameRate;
};

const defaultSettings: VideoPlayerSettings = {
  receiveResolution: '720p',
  receiveFrameRate: 30,
  sourceResolution: '1080p',
  sourceFrameRate: 30,
};

let currentSettings = { ...defaultSettings };

export function getVideoPlayerSettings(): VideoPlayerSettings {
  return { ...currentSettings };
}

export function saveVideoPlayerSettings(
  settings: VideoPlayerSettings,
): VideoPlayerSettings {
  currentSettings = { ...settings };
  return getVideoPlayerSettings();
}
