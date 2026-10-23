import { requireOptionalNativeModule } from 'expo-modules-core';

export type VideoFilter =
  | 'None'
  | 'Grayscale'
  | 'Sepia'
  | 'Vintage'
  | 'Cool'
  | 'Warm';

type VideoFiltersModule = {
  applyFilter: (sourceUri: string, filter: Exclude<VideoFilter, 'None'>) => Promise<string>;
};

const nativeModule =
  requireOptionalNativeModule<VideoFiltersModule>('ExpoVideoFilters');

export function isVideoFilterProcessingAvailable(): boolean {
  return nativeModule !== null;
}

export async function applyVideoFilter(
  sourceUri: string,
  filter: Exclude<VideoFilter, 'None'>,
): Promise<string> {
  if (!nativeModule) {
    throw new Error(
      'Video filter export requires an iOS or Android development build.',
    );
  }
  return nativeModule.applyFilter(sourceUri, filter);
}
