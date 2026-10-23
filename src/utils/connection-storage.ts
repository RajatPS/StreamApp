import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type ConnectionValues = Record<string, string>;

export type SavedConnection = {
  id: number;
  name: string;
};

const savedCountKey = 'saved-connections-count-v1';
const getConnectionKey = (id: number) => `saved-connection-v1-${id}`;

async function getItem(key: string) {
  if (Platform.OS === 'web') {
    return globalThis.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function getSavedCount() {
  const savedCount = await getItem(savedCountKey);
  if (savedCount === null) {
    return 0;
  }

  const count = Number(savedCount);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Saved connection data is invalid.');
  }

  return count;
}

export async function getSavedConnections(): Promise<SavedConnection[]> {
  const count = await getSavedCount();

  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const id = index + 1;
      const storedValues = await getItem(getConnectionKey(id));
      const values: ConnectionValues =
        storedValues === null ? {} : JSON.parse(storedValues);

      return {
        id,
        name: values['Connection Name']?.trim() || `Connection ${id}`,
      };
    }),
  );
}

export async function getSavedConnectionValues(
  id: number,
): Promise<ConnectionValues> {
  const storedValues = await getItem(getConnectionKey(id));
  if (storedValues === null) {
    throw new Error('Saved connection was not found.');
  }

  const values: unknown = JSON.parse(storedValues);
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new Error('Saved connection data is invalid.');
  }

  const connectionValues: ConnectionValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string') {
      throw new Error('Saved connection data is invalid.');
    }
    connectionValues[key] = value;
  }
  return connectionValues;
}

export async function saveConnection(
  values: ConnectionValues,
): Promise<SavedConnection> {
  const id = (await getSavedCount()) + 1;
  const savedConnection = {
    id,
    name: values['Connection Name']?.trim() || `Connection ${id}`,
  };

  await setItem(getConnectionKey(id), JSON.stringify(values));
  await setItem(savedCountKey, String(id));

  return savedConnection;
}

export async function renameSavedConnection(
  id: number,
  newName: string,
): Promise<SavedConnection> {
  const trimmedName = newName.trim();

  if (!trimmedName) {
    throw new Error('Connection name cannot be empty.');
  }

  const storedValues = await getItem(getConnectionKey(id));
  const existingValues: ConnectionValues =
    storedValues === null ? {} : JSON.parse(storedValues);

  const updatedValues = {
    ...existingValues,
    'Connection Name': trimmedName,
  };

  await setItem(getConnectionKey(id), JSON.stringify(updatedValues));

  return {
    id,
    name: trimmedName,
  };
}
