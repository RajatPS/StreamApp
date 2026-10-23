import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry } from '../src/room-registry.js';

function mockSocket() {
  return { sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
}

test('creates unique rooms and keeps host credentials out of public room data', () => {
  const registry = new RoomRegistry();
  const result = registry.create({ name: 'Host room' });

  assert.ok(result.room.id.length >= 6);
  assert.equal(result.room.name, 'Host room');
  assert.equal(result.room.hostConnected, false);
  assert.equal('hostToken' in result.room, false);
  assert.ok(result.hostToken.length >= 40);
  assert.equal(registry.get(result.room.id).id, result.room.id);
});

test('validates user-provided room IDs and prevents duplicate rooms', () => {
  const registry = new RoomRegistry();

  assert.match(registry.create({ roomId: 'bad id', name: 'Host' }).error, /Room ID/);
  assert.equal(registry.create({ roomId: 'room_123', name: 'Host' }).room.id, 'room_123');
  assert.equal(registry.create({ roomId: 'room_123', name: 'Other' }).status, 409);
});

test('requires host credentials and routes signaling only to room participants', () => {
  const registry = new RoomRegistry();
  const created = registry.create({ roomId: 'room_123', name: 'Host' });
  const host = mockSocket();
  const viewer = mockSocket();
  const otherViewer = mockSocket();

  assert.equal(registry.attachHost('room_123', 'incorrect-token', host), null);
  assert.ok(registry.attachHost('room_123', created.hostToken, host));
  assert.equal(registry.attachHost('room_123', created.hostToken, mockSocket()), null);

  const joinedViewer = registry.attachViewer('room_123', 'Viewer', viewer);
  const unrelatedViewer = registry.attachViewer('room_999', 'Other', otherViewer);
  assert.equal(unrelatedViewer, null);

  const offer = registry.routeSignal(
    { roomId: 'room_123', role: 'host' },
    { type: 'offer', to: joinedViewer.viewerId, data: { sdp: 'offer' } },
  );
  assert.equal(offer.socket, viewer);
  assert.equal(offer.from, 'host');
  assert.equal(
    registry.routeSignal(
      { roomId: 'room_123', role: 'host' },
      { type: 'offer', to: 'another-room-viewer', data: {} },
    ),
    null,
  );
  assert.equal(
    registry.routeSignal(
      { roomId: 'room_123', role: 'viewer', viewerId: joinedViewer.viewerId },
      { type: 'offer', data: {} },
    ),
    null,
  );
});

test('ends rooms only with the host credential and expires disconnected sessions', () => {
  const registry = new RoomRegistry();
  const created = registry.create({ roomId: 'room_123', name: 'Host' });
  const host = mockSocket();

  registry.attachHost('room_123', created.hostToken, host);
  assert.equal(registry.end('room_123', 'invalid'), null);
  assert.equal(registry.end('room_123', created.hostToken).sockets[0], host);
  assert.equal(registry.get('room_123'), null);

  const expiring = registry.create({ roomId: 'room_456', name: 'Other' });
  assert.deepEqual(
    registry.removeExpired(Date.now() + 31 * 60 * 1000).map(({ roomId }) => roomId),
    [expiring.room.id],
  );
});

test('keeps active hosts connected beyond the waiting-room expiry and allows reconnects', () => {
  const registry = new RoomRegistry();
  const created = registry.create({ roomId: 'room_123', name: 'Host' });
  const firstHost = mockSocket();
  registry.attachHost('room_123', created.hostToken, firstHost);

  assert.deepEqual(registry.removeExpired(Date.now() + 31 * 60 * 1000), []);
  registry.detach(firstHost, { role: 'host', roomId: 'room_123' });
  assert.ok(registry.attachHost('room_123', created.hostToken, mockSocket()));
});
