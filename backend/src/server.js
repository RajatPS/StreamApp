import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomRegistry } from './room-registry.js';

const MAX_BODY_BYTES = 16 * 1024;

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw Object.assign(new Error('Request body must be a JSON object.'), { status: 400 });
  }
  return body;
}

function sendSocket(socket, data) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function closeSocket(socket, code, reason) {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason);
  }
}

export function createAppServer({ registry = new RoomRegistry() } = {}) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY_BYTES });

  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9_-]{1,64})(?:\/(join|end))?$/);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    try {
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readJson(request);
        const result = registry.create({
          roomId: body.roomId,
          name: body.name,
        });
        if (result.error) {
          sendJson(response, result.status ?? 400, { error: result.error });
          return;
        }
        sendJson(response, 201, { ...result.room, hostToken: result.hostToken });
        return;
      }

      if (roomMatch && request.method === 'GET' && !roomMatch[2]) {
        const room = registry.get(roomMatch[1]);
        sendJson(response, room ? 200 : 404, room ?? { error: 'Room not found or expired.' });
        return;
      }

      if (roomMatch && request.method === 'POST' && roomMatch[2] === 'join') {
        const body = await readJson(request);
        const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
        if (!displayName || displayName.length > 80) {
          sendJson(response, 400, { error: 'Display Name is required and must be 80 characters or fewer.' });
          return;
        }
        const room = registry.get(roomMatch[1]);
        if (!room) {
          sendJson(response, 404, { error: 'Room not found or expired.' });
          return;
        }
        sendJson(response, 200, { ...room, displayName });
        return;
      }

      if (roomMatch && request.method === 'DELETE' && roomMatch[2] === 'end') {
        const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
        const result = registry.end(roomMatch[1], token);
        if (!result) {
          sendJson(response, 403, { error: 'Host authorization is invalid or the room has ended.' });
          return;
        }
        for (const socket of result.sockets) {
          sendSocket(socket, { type: 'room-ended' });
          closeSocket(socket, 1000, 'Room ended by host');
        }
        sendJson(response, 200, { status: 'ended' });
        return;
      }

      sendJson(response, 404, { error: 'Endpoint not found.' });
    } catch (error) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        Number.isInteger(error.status)
          ? error.status
          : null;
      if (status) {
        sendJson(response, status, {
          error: error instanceof Error ? error.message : 'Request could not be completed.',
        });
      } else {
        console.error(
          'Unhandled backend request failure:',
          error instanceof Error ? error.message : 'Unknown error.',
        );
        sendJson(response, 500, { error: 'Request could not be completed.' });
      }
    }
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/signal') {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (webSocket) => {
      sockets.emit('connection', webSocket);
    });
  });

  sockets.on('connection', (socket) => {
    let participant = null;
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        sendSocket(socket, { type: 'error', message: 'Signaling message must be valid JSON.' });
        closeSocket(socket, 1008, 'Invalid message');
        return;
      }
      if (typeof message !== 'object' || message === null || Array.isArray(message)) {
        sendSocket(socket, { type: 'error', message: 'Signaling message must be a JSON object.' });
        closeSocket(socket, 1008, 'Invalid message');
        return;
      }

      if (!participant) {
        if (message.type !== 'join' || typeof message.roomId !== 'string') {
          sendSocket(socket, { type: 'error', message: 'Join a room before sending signaling messages.' });
          closeSocket(socket, 1008, 'Join required');
          return;
        }
        if (message.role === 'host' && typeof message.hostToken === 'string') {
          const result = registry.attachHost(message.roomId, message.hostToken, socket);
          if (!result) {
            sendSocket(socket, { type: 'error', message: 'Host authorization failed or another host is connected.' });
            closeSocket(socket, 1008, 'Host authorization failed');
            return;
          }
          participant = { role: 'host', roomId: message.roomId };
          sendSocket(socket, { type: 'joined', ...result.room });
          for (const [viewerId, viewer] of registryViewers(registry, message.roomId)) {
            sendSocket(socket, { type: 'viewer-joined', viewerId, displayName: viewer.displayName });
          }
          for (const viewer of registryViewers(registry, message.roomId).values()) {
            sendSocket(viewer.socket, { type: 'host-status', hostConnected: true });
          }
          return;
        }
        if (message.role === 'viewer' && typeof message.displayName === 'string') {
          const displayName = message.displayName.trim();
          if (!displayName || displayName.length > 80) {
            sendSocket(socket, { type: 'error', message: 'Display Name is required and must be 80 characters or fewer.' });
            closeSocket(socket, 1008, 'Invalid Display Name');
            return;
          }
          const result = registry.attachViewer(message.roomId, displayName, socket);
          if (!result) {
            sendSocket(socket, { type: 'error', message: 'Room not found or expired.' });
            closeSocket(socket, 1008, 'Room unavailable');
            return;
          }
          participant = { role: 'viewer', roomId: message.roomId, viewerId: result.viewerId };
          sendSocket(socket, { type: 'joined', ...result.room, viewerId: result.viewerId });
          const roomHost = registryHost(registry, message.roomId);
          if (roomHost) {
            sendSocket(roomHost, { type: 'viewer-joined', viewerId: result.viewerId, displayName });
          }
          return;
        }

        sendSocket(socket, { type: 'error', message: 'A valid host or viewer role is required.' });
        closeSocket(socket, 1008, 'Invalid role');
        return;
      }

      const routed = registry.routeSignal(participant, message);
      if (!routed) {
        sendSocket(socket, { type: 'error', message: 'Signaling message is invalid for this room or participant.' });
        return;
      }
      sendSocket(routed.socket, {
        type: 'signal',
        from: routed.from,
        signalType: routed.type,
        data: routed.data,
      });
    });

    socket.on('close', () => {
      if (!participant) {
        return;
      }
      const detached = registry.detach(socket, participant);
      if (!detached) {
        return;
      }
      if (detached.role === 'host') {
        for (const viewer of registryViewers(registry, participant.roomId).values()) {
          sendSocket(viewer.socket, { type: 'host-status', hostConnected: false });
        }
      } else {
        const host = registryHost(registry, participant.roomId);
        if (host) {
          sendSocket(host, { type: 'viewer-left', viewerId: detached.viewerId });
        }
      }
    });
  });

  const cleanupTimer = setInterval(() => {
    const expiredRooms = registry.removeExpired();
    for (const { sockets: expiredSockets } of expiredRooms) {
      for (const socket of expiredSockets) {
        sendSocket(socket, { type: 'room-ended' });
        closeSocket(socket, 1000, 'Room expired');
      }
    }
  }, 30_000);
  cleanupTimer.unref();
  const heartbeatTimer = setInterval(() => {
    for (const socket of sockets.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  heartbeatTimer.unref();

  server.on('close', () => {
    clearInterval(cleanupTimer);
    clearInterval(heartbeatTimer);
  });

  return server;
}

function registryHost(registry, roomId) {
  return registry.getHostSocket?.(roomId) ?? null;
}

function registryViewers(registry, roomId) {
  return registry.getViewerSockets?.(roomId) ?? new Map();
}

export function startServer({
  host = process.env.HOST ?? '0.0.0.0',
  port = Number(process.env.PORT ?? 4000),
} = {}) {
  const server = createAppServer();
  server.listen(port, host, () => {
    console.log(`Streaming backend listening on ${host}:${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}
