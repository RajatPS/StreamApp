import { randomBytes, timingSafeEqual } from 'node:crypto';

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const ROOM_TTL_MS = 30 * 60 * 1000;
const HOST_RECONNECT_GRACE_MS = 60 * 1000;

function createToken() {
  return randomBytes(32).toString('base64url');
}

function tokensMatch(expected, actual) {
  if (typeof actual !== 'string') {
    return false;
  }

  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

function toPublicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    status: room.host ? 'live' : 'waiting',
    hostConnected: Boolean(room.host),
    viewerCount: room.viewers.size,
    createdAt: room.createdAt,
  };
}

export class RoomRegistry {
  #rooms = new Map();

  create({ roomId, name }) {
    const id = roomId || randomBytes(9).toString('base64url');
    if (!ROOM_ID_PATTERN.test(id)) {
      return { error: 'Room ID must be 6-64 letters, numbers, dashes, or underscores.' };
    }
    if (this.#rooms.has(id)) {
      return { error: 'That Room ID is already in use.', status: 409 };
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length > 80) {
      return { error: 'Connection Name is required and must be 80 characters or fewer.' };
    }

    const hostToken = createToken();
    const room = {
      id,
      name: trimmedName,
      hostToken,
      createdAt: Date.now(),
      host: null,
      hostDisconnectedAt: null,
      viewers: new Map(),
    };
    this.#rooms.set(id, room);

    return { room: toPublicRoom(room), hostToken };
  }

  get(roomId) {
    const room = this.#rooms.get(roomId);
    return room ? toPublicRoom(room) : null;
  }

  getHostSocket(roomId) {
    return this.#rooms.get(roomId)?.host ?? null;
  }

  getViewerSockets(roomId) {
    return this.#rooms.get(roomId)?.viewers ?? new Map();
  }

  attachHost(roomId, token, socket) {
    const room = this.#rooms.get(roomId);
    if (!room || !tokensMatch(room.hostToken, token) || room.host) {
      return null;
    }

    room.host = socket;
    room.hostDisconnectedAt = null;
    return { room: toPublicRoom(room) };
  }

  attachViewer(roomId, displayName, socket) {
    const room = this.#rooms.get(roomId);
    if (!room) {
      return null;
    }

    const viewerId = randomBytes(9).toString('base64url');
    room.viewers.set(viewerId, { socket, displayName });
    return { room: toPublicRoom(room), viewerId };
  }

  detach(socket, participant) {
    const room = this.#rooms.get(participant.roomId);
    if (!room) {
      return null;
    }

    if (participant.role === 'host' && room.host === socket) {
      room.host = null;
      room.hostDisconnectedAt = Date.now();
      return { room: toPublicRoom(room), role: 'host' };
    }

    if (participant.role === 'viewer' && room.viewers.delete(participant.viewerId)) {
      return { room: toPublicRoom(room), role: 'viewer', viewerId: participant.viewerId };
    }

    return null;
  }

  routeSignal(participant, message) {
    const room = this.#rooms.get(participant.roomId);
    if (!room || !['offer', 'answer', 'ice-candidate'].includes(message.type)) {
      return null;
    }

    if (participant.role === 'host') {
      if (message.type === 'answer' || typeof message.to !== 'string') {
        return null;
      }
      const viewer = room.viewers.get(message.to);
      return viewer ? { socket: viewer.socket, from: 'host', type: message.type, data: message.data } : null;
    }

    if (message.type === 'offer' || message.to !== undefined || !room.host) {
      return null;
    }
    return { socket: room.host, from: participant.viewerId, type: message.type, data: message.data };
  }

  end(roomId, token) {
    const room = this.#rooms.get(roomId);
    if (!room || !tokensMatch(room.hostToken, token)) {
      return null;
    }

    this.#rooms.delete(roomId);
    return { room: toPublicRoom(room), sockets: [room.host, ...[...room.viewers.values()].map(({ socket }) => socket)].filter(Boolean) };
  }

  removeExpired(now = Date.now()) {
    const expiredRooms = [];
    for (const [roomId, room] of this.#rooms) {
      const waitingExpired =
        !room.host &&
        room.hostDisconnectedAt === null &&
        now - room.createdAt > ROOM_TTL_MS;
      const reconnectExpired =
        room.hostDisconnectedAt !== null &&
        now - room.hostDisconnectedAt > HOST_RECONNECT_GRACE_MS;
      if (waitingExpired || reconnectExpired) {
        this.#rooms.delete(roomId);
        expiredRooms.push({
          roomId,
          sockets: [room.host, ...[...room.viewers.values()].map(({ socket }) => socket)].filter(Boolean),
        });
      }
    }
    return expiredRooms;
  }
}
