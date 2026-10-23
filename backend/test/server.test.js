import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createAppServer } from '../src/server.js';

function waitForMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for signaling message.'));
    }, 3000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

test('serves room lifecycle and relays signaling within one public room', async (t) => {
  const server = createAppServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const createResponse = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test host' }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.ok(created.id);
  assert.ok(created.hostToken);

  const invalidJoin = await fetch(`${baseUrl}/api/rooms/${created.id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: '' }),
  });
  assert.equal(invalidJoin.status, 400);

  const joinResponse = await fetch(`${baseUrl}/api/rooms/${created.id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: 'Viewer' }),
  });
  assert.equal(joinResponse.status, 200);
  assert.equal((await joinResponse.json()).name, 'Test host');

  const badEndResponse = await fetch(`${baseUrl}/api/rooms/${created.id}/end`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer invalid' },
  });
  assert.equal(badEndResponse.status, 403);

  const socketUrl = `ws://127.0.0.1:${address.port}/signal`;
  const host = new WebSocket(socketUrl);
  const viewer = new WebSocket(socketUrl);
  t.after(() => {
    host.close();
    viewer.close();
  });
  await Promise.all([once(host, 'open'), once(viewer, 'open')]);

  const hostJoined = waitForMessage(host, (message) => message.type === 'joined');
  host.send(JSON.stringify({
    type: 'join',
    roomId: created.id,
    role: 'host',
    hostToken: created.hostToken,
  }));
  await hostJoined;

  const viewerJoined = waitForMessage(viewer, (message) => message.type === 'joined');
  viewer.send(JSON.stringify({
    type: 'join',
    roomId: created.id,
    role: 'viewer',
    displayName: 'Viewer',
  }));
  const viewerInfo = await viewerJoined;
  const viewerNotice = await waitForMessage(
    host,
    (message) => message.type === 'viewer-joined',
  );
  assert.equal(viewerNotice.viewerId, viewerInfo.viewerId);

  const offerReceived = waitForMessage(viewer, (message) => message.type === 'signal');
  host.send(JSON.stringify({
    type: 'offer',
    to: viewerInfo.viewerId,
    data: { sdp: 'test-offer' },
  }));
  assert.deepEqual(await offerReceived, {
    type: 'signal',
    from: 'host',
    signalType: 'offer',
    data: { sdp: 'test-offer' },
  });

  const answerReceived = waitForMessage(host, (message) => message.type === 'signal');
  viewer.send(JSON.stringify({
    type: 'answer',
    data: { sdp: 'test-answer' },
  }));
  assert.deepEqual(await answerReceived, {
    type: 'signal',
    from: viewerInfo.viewerId,
    signalType: 'answer',
    data: { sdp: 'test-answer' },
  });

  const endResponse = await fetch(`${baseUrl}/api/rooms/${created.id}/end`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${created.hostToken}` },
  });
  assert.equal(endResponse.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/rooms/${created.id}`)).status, 404);
});
