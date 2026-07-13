import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert';

// Generate a unique test database filename to ensure clean runs and avoid locking issues
const testDbFile = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}.db`;
process.env.DATABASE_URL = `file:${testDbFile}`;

// Dynamic imports to guarantee that process.env.DATABASE_URL is set before db.js is evaluated
const { initDb, db } = await import('../db/db.js');
const { default: dictionary } = await import('../game/Dictionary.js');
const { default: Board } = await import('../game/Board.js');
const { default: gameEngine } = await import('../game/GameEngine.js');
const { default: playerManager } = await import('../game/PlayerManager.js');
const { default: GameRoom } = await import('../rooms/GameRoom.js');
const { CLIENT_MESSAGES } = await import('../../shared/constants.js');

// Setup database and dictionary
test.before(async () => {
  await initDb();
  await dictionary.init();
});

// Cleanup database and connection
test.after(async () => {
  if (db && typeof db.close === 'function') {
    try {
      await db.close();
      console.log('Database connection closed.');
    } catch (e) {
      console.error('Error closing database:', e);
    }
  }
  
  // Wait a brief moment for the database file lock to release
  await new Promise(resolve => setTimeout(resolve, 500));

  if (fs.existsSync(testDbFile)) {
    try {
      fs.unlinkSync(testDbFile);
    } catch (e) {
      console.warn(`Failed to delete test DB file ${testDbFile}:`, e.message);
    }
  }

  // Force exit to cleanup any pending C++ addon threads/handles
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

test('R1: Rack validation rejects invalid tiles and maps wildcard slots correctly', async () => {
  const mockBoard = new Board('test_season');
  await mockBoard.load();

  const player = {
    rack: [
      { letter: 'A', value: 1, isWildcard: false },
      { letter: 'B', value: 3, isWildcard: false },
      { letter: 'C', value: 3, isWildcard: false },
      { letter: 'D', value: 2, isWildcard: false },
      { letter: 'E', value: 1, isWildcard: false },
      { letter: 'F', value: 4, isWildcard: false },
      { letter: '*', value: 0, isWildcard: true }
    ]
  };

  // 1. Placing a letter not on the rack (e.g. Z)
  const pendingTiles1 = [{ x: 0, y: 0, letter: 'Z', rackIndex: 0 }];
  const result1 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles1);
  assert.strictEqual(result1.valid, false);
  assert.ok(result1.error.includes('does not match rack tile') || result1.error.includes('empty'));

  // 2. Placing a letter with mismatched letter (e.g. placing B at index 0 which has A)
  const pendingTiles2 = [{ x: 0, y: 0, letter: 'B', rackIndex: 0 }];
  const result2 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles2);
  assert.strictEqual(result2.valid, false);
  assert.ok(result2.error.includes('does not match rack tile'));

  // 3. Placing tiles with duplicate rack index
  const pendingTiles3 = [
    { x: 0, y: 0, letter: 'A', rackIndex: 0 },
    { x: 1, y: 0, letter: 'A', rackIndex: 0 }
  ];
  const result3 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles3);
  assert.strictEqual(result3.valid, false);
  assert.ok(result3.error.includes('duplicate rack index'));

  // 4. Placing a wildcard tile (rackIndex 6, letter '*') mapping to letter 'T' as part of a 2-letter word "AT"
  const pendingTiles4 = [
    { x: 0, y: 0, letter: 'A', rackIndex: 0 },
    { x: 1, y: 0, letter: 'T', rackIndex: 6 }
  ];
  const result4 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles4);
  assert.strictEqual(result4.valid, true);
  
  // In sorted placement, index 0 is 'A', index 1 is wildcard 'T'
  assert.strictEqual(result4.placedTiles[1].letter, 'T');
  assert.strictEqual(result4.placedTiles[1].value, 0);
  assert.strictEqual(result4.placedTiles[1].isWildcard, true);
});

test('R2 & R3 & R4: Overlapping concurrent placements, spelling validation, and tile reclaim', async () => {
  const handlers = {};
  
  // Custom mock of GameRoom subclass to intercept onMessage and broadcast
  class TestGameRoom extends GameRoom {
    onMessage(messageType, callback) {
      handlers[messageType] = callback;
    }
    broadcast(type, data) {
      this.broadcasts = this.broadcasts || [];
      this.broadcasts.push({ type, data });
    }
  }

  const room = new TestGameRoom();
  await room.onCreate({ sessionId: 'test-session' });

  // Mock clients
  const client1 = {
    send: (type, data) => { client1.messages.push({ type, data }); },
    messages: [],
    userData: { playerId: 'player1' }
  };
  const client2 = {
    send: (type, data) => { client2.messages.push({ type, data }); },
    messages: [],
    userData: { playerId: 'player2' }
  };

  // Join the clients
  await room.onJoin(client1, { playerId: 'player1' });
  await room.onJoin(client2, { playerId: 'player2' });

  // Setup deterministic racks for both active players
  const p1 = playerManager.getActivePlayer('player1');
  p1.rack = [
    { letter: 'C', value: 3, isWildcard: false },
    { letter: 'A', value: 1, isWildcard: false },
    { letter: 'T', value: 1, isWildcard: false },
    { letter: '*', value: 0, isWildcard: true },
    { letter: 'X', value: 8, isWildcard: false },
    { letter: 'Y', value: 4, isWildcard: false },
    { letter: 'Z', value: 10, isWildcard: false }
  ];

  const p2 = playerManager.getActivePlayer('player2');
  p2.rack = [
    { letter: 'D', value: 2, isWildcard: false },
    { letter: 'O', value: 1, isWildcard: false },
    { letter: 'G', value: 2, isWildcard: false },
    { letter: '*', value: 0, isWildcard: true },
    { letter: 'X', value: 8, isWildcard: false },
    { letter: 'Y', value: 4, isWildcard: false },
    { letter: 'Z', value: 10, isWildcard: false }
  ];

  // Verify misspelled word rejection and server-side rack reclaim (R3)
  // Let's place a misspelled word "CX" using index 0 and 4.
  const misspelledTiles = [
    { x: 0, y: 0, letter: 'C', rackIndex: 0 },
    { x: 1, y: 0, letter: 'X', rackIndex: 4 }
  ];
  await handlers[CLIENT_MESSAGES.PLACE_WORD](client1, { tiles: misspelledTiles });
  await room.placementQueue;

  // Verify that client1 received a placement_error
  const errorMsg = client1.messages.find(m => m.type === 'placement_error');
  assert.ok(errorMsg, "Should receive a placement_error");
  assert.ok(errorMsg.data.error.includes('not in the dictionary'), `Expected dictionary error, got: ${errorMsg.data.error}`);

  // Verify client1's server rack was NOT mutated (it was reclaimed)
  assert.strictEqual(p1.rack[0].letter, 'C');
  assert.strictEqual(p1.rack[4].letter, 'X');

  // Reset client1's messages
  client1.messages = [];

  // Submit two overlapping placements concurrently (R2)
  // Player 1 places "CAT" horizontally covering center: (-1, 0), (0, 0), (1, 0)
  const catTiles = [
    { x: -1, y: 0, letter: 'C', rackIndex: 0 },
    { x: 0, y: 0, letter: 'A', rackIndex: 1 },
    { x: 1, y: 0, letter: 'T', rackIndex: 2 }
  ];

  // Player 2 places "DOG" vertically covering center: (0, -1), (0, 0), (0, 1)
  const dogTiles = [
    { x: 0, y: -1, letter: 'D', rackIndex: 0 },
    { x: 0, y: 0, letter: 'O', rackIndex: 1 },
    { x: 0, y: 1, letter: 'G', rackIndex: 2 }
  ];

  // Trigger both placements concurrently without awaiting individual handlers
  handlers[CLIENT_MESSAGES.PLACE_WORD](client1, { tiles: catTiles });
  handlers[CLIENT_MESSAGES.PLACE_WORD](client2, { tiles: dogTiles });

  // Await the entire room queue to complete
  await room.placementQueue;

  // Player 1 should succeed
  const p1Success = client1.messages.find(m => m.type === 'placement_success');
  assert.ok(p1Success, "Player 1 placement should have succeeded");

  // Player 2 should fail with collision error since both cover (0,0)
  const p2Error = client2.messages.find(m => m.type === 'placement_error');
  assert.ok(p2Error, "Player 2 placement should have failed due to collision");
  assert.ok(p2Error.data.error.includes('occupied') || p2Error.data.error.includes('Conflicting tile'), `Expected collision error, got: ${p2Error.data.error}`);

  // Verify rack updates (R4)
  // Player 1 had successful placement: slots 0, 1, 2 should be refilled with new tiles (none of them should be null)
  assert.ok(p1.rack[0] !== null);
  assert.ok(p1.rack[1] !== null);
  assert.ok(p1.rack[2] !== null);

  // Player 2 had failed placement: rack should remain exactly original DOG...
  assert.strictEqual(p2.rack[0].letter, 'D');
  assert.strictEqual(p2.rack[1].letter, 'O');
  assert.strictEqual(p2.rack[2].letter, 'G');

  // Clear simulation interval to prevent keeping the event loop alive
  if (room._simulationInterval) {
    clearInterval(room._simulationInterval);
    room._simulationInterval = undefined;
  }
  if (room.clock) {
    room.clock.clear();
    room.clock.stop();
  }
});
