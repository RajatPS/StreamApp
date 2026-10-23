import type { ConnectionValues } from './connection-storage';

export type RoomResponse = {
  id: string;
  name: string;
  hostConnected: boolean;
  viewerCount: number;
  status: 'waiting' | 'live';
  createdAt: number;
  displayName?: string;
};

export type CreatedRoom = RoomResponse & {
  hostToken: string;
  backendUrl: string;
};

export type SignalingMessage = {
  type: string;
  message?: string;
  hostConnected?: boolean;
  viewerCount?: number;
  viewerId?: string;
  displayName?: string;
  signalType?: string;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRoomResponse(value: unknown): value is RoomResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.hostConnected === 'boolean' &&
    typeof value.viewerCount === 'number' &&
    (value.status === 'waiting' || value.status === 'live') &&
    typeof value.createdAt === 'number'
  );
}

function isCreatedRoom(
  value: unknown,
): value is Omit<CreatedRoom, 'backendUrl'> {
  return (
    isRecord(value) &&
    typeof value.hostToken === 'string' &&
    isRoomResponse(value)
  );
}

function normalizeBackendUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid signaling server URL or configure EXPO_PUBLIC_API_URL.');
  }

  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('The signaling server URL must use HTTP, HTTPS, WS, or WSS.');
  }

  if (url.protocol === 'ws:') {
    url.protocol = 'http:';
  } else if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  }

  url.pathname = url.pathname.replace(/\/(api|signal)\/?$/, '').replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function resolveBackendUrl(override?: string) {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const url = override?.trim() || configuredUrl;
  if (!url) {
    throw new Error(
      'The Node backend is not configured. Set EXPO_PUBLIC_API_URL to its reachable LAN address and restart Expo.',
    );
  }
  return normalizeBackendUrl(url);
}

async function requestJson(
  backendUrl: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      'Could not reach the Node backend. Check that it is running and that this device can reach the configured server URL.',
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`The Node backend returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `The Node backend request failed (${response.status}).`;
    throw new Error(message);
  }

  return body;
}

export async function createRoom(values: ConnectionValues): Promise<CreatedRoom> {
  const backendUrl = resolveBackendUrl(values['Signaling server URL']);
  const response = await requestJson(
    backendUrl,
    '/api/rooms',
    {
      method: 'POST',
      body: JSON.stringify({
        name: values['Connection Name'],
        roomId: values['Room ID']?.trim() || undefined,
      }),
    },
  );
  if (!isCreatedRoom(response)) {
    throw new Error('The Node backend returned invalid room details.');
  }
  return { ...response, backendUrl };
}

export async function joinRoom(
  roomId: string,
  displayName: string,
): Promise<RoomResponse & { backendUrl: string }> {
  const backendUrl = resolveBackendUrl();
  const response = await requestJson(
    backendUrl,
    `/api/rooms/${encodeURIComponent(roomId.trim())}/join`,
    {
      method: 'POST',
      body: JSON.stringify({ displayName: displayName.trim() }),
    },
  );
  if (!isRoomResponse(response)) {
    throw new Error('The Node backend returned invalid room details.');
  }
  if (typeof response.displayName !== 'string') {
    throw new Error('The Node backend did not confirm the viewer name.');
  }
  return { ...response, backendUrl };
}

export async function endRoom(
  roomId: string,
  hostToken: string,
  backendUrl: string,
) {
  const response = await requestJson(
    backendUrl,
    `/api/rooms/${encodeURIComponent(roomId)}/end`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${hostToken}` },
    },
  );
  if (
    typeof response !== 'object' ||
    response === null ||
    !('status' in response) ||
    response.status !== 'ended'
  ) {
    throw new Error('The Node backend did not confirm that the room ended.');
  }
}

export function connectToSignaling({
  backendUrl,
  roomId,
  role,
  hostToken,
  displayName,
  onMessage,
  onError,
  onClose,
}: {
  backendUrl: string;
  roomId: string;
  role: 'host' | 'viewer';
  hostToken?: string;
  displayName?: string;
  onMessage: (message: SignalingMessage) => void;
  onError: (message: string) => void;
  onClose?: () => void;
}) {
  const url = new URL(backendUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/signal`;
  url.search = '';
  url.hash = '';

  const socket = new WebSocket(url.toString());
  let receivedMessage = false;
  const messageTimeout = setTimeout(() => {
    if (!receivedMessage) {
      onError('The signaling server did not respond in time.');
      socket.close();
    }
  }, 10_000);
  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: 'join',
        roomId,
        role,
        ...(hostToken ? { hostToken } : {}),
        ...(displayName ? { displayName } : {}),
      }),
    );
  };
  socket.onmessage = (event) => {
    receivedMessage = true;
    clearTimeout(messageTimeout);
    try {
      const message = JSON.parse(String(event.data)) as SignalingMessage;
      if (message.type === 'error') {
        onError(message.message ?? 'The signaling server rejected the request.');
        return;
      }
      onMessage(message);
    } catch {
      onError('The signaling server sent an invalid message.');
    }
  };
  socket.onerror = () => {
    onError('Could not connect to the signaling server.');
  };
  socket.onclose = () => {
    clearTimeout(messageTimeout);
    onClose?.();
  };
  return socket;
}
