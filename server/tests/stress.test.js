import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert';

// Generate a unique test database filename to ensure clean runs and avoid locking issues
const testDbFile = `stress_${Date.now()}_${Math.floor(Math.random() * 1000)}.db`;
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

test('R1: Rack validation edge cases', async () => {
  const mockBoard = new Board('test_season_r1');
  await mockBoard.load();

  const player = {
    rack: [
      { letter: 'A', value: 1, isWildcard: false },
      { letter: 'B', value: 3, isWildcard: false },
      { letter: '*', value: 0, isWildcard: true },
      { letter: '*', value: 0, isWildcard: true },
      { letter: 'C', value: 3, isWildcard: false },
      { letter: 'D', value: 2, isWildcard: false },
      { letter: null, value: 0, isWildcard: false } // Empty slot
    ]
  };

  // 1. Placing multiple wildcard tiles to form the word "CAT"
  const pendingTiles1 = [
    { x: 0, y: 0, letter: 'C', rackIndex: 4 }, // 'C'
    { x: 1, y: 0, letter: 'A', rackIndex: 0 }, // 'A'
    { x: 2, y: 0, letter: 'T', rackIndex: 2 }  // wildcard mapped to 'T'
  ];
  const result1 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles1);
  assert.strictEqual(result1.valid, true);
  assert.strictEqual(result1.placedTiles[2].letter, 'T');
  assert.strictEqual(result1.placedTiles[2].value, 0);
  assert.strictEqual(result1.placedTiles[2].isWildcard, true);

  // 2. Reject out-of-bounds rack index (e.g. index 7 in a 7-element rack)
  const pendingTiles2 = [{ x: 0, y: 0, letter: 'A', rackIndex: 7 }];
  const result2 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles2);
  assert.strictEqual(result2.valid, false);
  assert.ok(result2.error.includes('missing or invalid rack index'));

  // 3. Reject negative rack index
  const pendingTiles3 = [{ x: 0, y: 0, letter: 'A', rackIndex: -1 }];
  const result3 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles3);
  assert.strictEqual(result3.valid, false);
  assert.ok(result3.error.includes('missing or invalid rack index'));

  // 4. Reject placing from an empty rack slot (index 6)
  const pendingTiles4 = [{ x: 0, y: 0, letter: 'A', rackIndex: 6 }];
  const result4 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles4);
  assert.strictEqual(result4.valid, false);
  assert.ok(result4.error.includes('empty') || result4.error.includes('does not match'));
});

test('R2: High pressure concurrency and conflict resolution', async () => {
  const handlers = {};
  
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
  await room.onCreate({ sessionId: 'stress-session' });

  // Create 10 mock clients
  const clients = [];
  for (let i = 1; i <= 10; i++) {
    const client = {
      send: (type, data) => { client.messages.push({ type, data }); },
      messages: [],
      userData: { playerId: `player_${i}` }
    };
    clients.push(client);
    await room.onJoin(client, { playerId: `player_${i}` });

    // Set a deterministic rack for each player
    const p = playerManager.getActivePlayer(`player_${i}`);
    p.rack = [
      { letter: 'C', value: 3, isWildcard: false }, // 0
      { letter: 'A', value: 1, isWildcard: false }, // 1
      { letter: 'T', value: 1, isWildcard: false }, // 2
      { letter: 'O', value: 1, isWildcard: false }, // 3
      { letter: 'Y', value: 4, isWildcard: false }, // 4
      { letter: 'B', value: 3, isWildcard: false }, // 5
      { letter: 'Z', value: 10, isWildcard: false } // 6
    ];
  }

  // Phase 1: Place the starting word "CAT" horizontally covering center star at (0, 0)
  // Let's use player_1 to place it.
  const startTiles = [
    { x: -1, y: 0, letter: 'C', rackIndex: 0 },
    { x: 0, y: 0, letter: 'A', rackIndex: 1 },
    { x: 1, y: 0, letter: 'T', rackIndex: 2 }
  ];
  await handlers[CLIENT_MESSAGES.PLACE_WORD](clients[0], { tiles: startTiles });
  await room.placementQueue;

  // Verify starting word succeeded
  const p1Success = clients[0].messages.find(m => m.type === 'placement_success');
  assert.ok(p1Success, "Starting word 'CAT' should succeed");
  
  // Clear messages for next phase
  clients.forEach(c => { c.messages = []; });

  // Phase 2: Send 50 concurrent overlapping and non-overlapping tile placement requests under pressure.
  // We will distribute the following tasks:
  // - Target A (Conflict group 1): Spells "TOY" vertically through 'T' (1, 0) by placing 'O' at (1, 1) and 'Y' at (1, 2)
  // - Target B (Conflict group 1): Spells "TOT" vertically through 'T' (1, 0) by placing 'O' at (1, 1) and 'T' at (1, 2)
  // - Target C (Conflict group 2): Spells "COT" vertically through 'C' (-1, 0) by placing 'O' at (-1, 1) and 'T' at (-1, 2)
  // - Target D (Conflict group 2): Spells "COB" vertically through 'C' (-1, 0) by placing 'O' at (-1, 1) and 'B' at (-1, 2)
  
  const targetA = [
    { x: 1, y: 1, letter: 'O', rackIndex: 3 },
    { x: 1, y: 2, letter: 'Y', rackIndex: 4 }
  ];
  const targetB = [
    { x: 1, y: 1, letter: 'O', rackIndex: 3 },
    { x: 1, y: 2, letter: 'T', rackIndex: 2 }
  ];
  const targetC = [
    { x: -1, y: 1, letter: 'O', rackIndex: 3 },
    { x: -1, y: 2, letter: 'T', rackIndex: 2 }
  ];
  const targetD = [
    { x: -1, y: 1, letter: 'O', rackIndex: 3 },
    { x: -1, y: 2, letter: 'B', rackIndex: 5 }
  ];

  // We have 10 players. Let's send the requests concurrently.
  // Each player fires 5 requests in parallel to stress test the room queue.
  for (let cycle = 0; cycle < 5; cycle++) {
    for (let clientIdx = 0; clientIdx < 10; clientIdx++) {
      const client = clients[clientIdx];
      let tiles;
      // Distribute targets to simulate overlap & non-overlap
      if (clientIdx % 4 === 0) tiles = targetA;
      else if (clientIdx % 4 === 1) tiles = targetB;
      else if (clientIdx % 4 === 2) tiles = targetC;
      else tiles = targetD;

      // Fire message handler synchronously (simulating concurrent network arrival)
      handlers[CLIENT_MESSAGES.PLACE_WORD](client, { tiles });
    }
  }

  // Await the entire room queue to complete
  await room.placementQueue;

  // Let's analyze the outcomes.
  // Group 1 (Target A vs Target B) should have exactly ONE successful placement, and all others fail.
  // Group 2 (Target C vs Target D) should have exactly ONE successful placement, and all others fail.
  let successCountA = 0;
  let successCountB = 0;
  let successCountC = 0;
  let successCountD = 0;
  let totalErrors = 0;
  let totalSuccesses = 0;

  for (let clientIdx = 0; clientIdx < 10; clientIdx++) {
    const client = clients[clientIdx];
    const successes = client.messages.filter(m => m.type === 'placement_success');
    const errors = client.messages.filter(m => m.type === 'placement_error');
    
    totalSuccesses += successes.length;
    totalErrors += errors.length;

    // Check which targets succeeded
    if (clientIdx % 4 === 0) successCountA += successes.length;
    else if (clientIdx % 4 === 1) successCountB += successes.length;
    else if (clientIdx % 4 === 2) successCountC += successes.length;
    else successCountD += successes.length;
  }

  console.log(`Concurrent placement execution summary:`);
  console.log(`- Successes: ${totalSuccesses}, Errors: ${totalErrors}`);
  console.log(`- Target A Successes: ${successCountA}, Target B Successes: ${successCountB}`);
  console.log(`- Target C Successes: ${successCountC}, Target D Successes: ${successCountD}`);

  // Assertions:
  // 1. Total successes from Group 1 must be exactly 1 (since they mutually conflict).
  assert.strictEqual(successCountA + successCountB, 1, "Exactly one of Target A or Target B must succeed");
  // 2. Total successes from Group 2 must be exactly 1 (since they mutually conflict).
  assert.strictEqual(successCountC + successCountD, 1, "Exactly one of Target C or Target D must succeed");
  // 3. Total successes must be exactly 2 across the 50 requests.
  assert.strictEqual(totalSuccesses, 2, "Exactly 2 of the 50 concurrent placements must succeed");
  // 4. Total errors must be exactly 48.
  assert.strictEqual(totalErrors, 48, "Exactly 48 of the 50 concurrent placements must fail");

  // Let's check Board integrity.
  // The board must contain the starting "CAT" word, plus the successful Group 1 word, plus the successful Group 2 word.
  // Reload board from DB to verify persistence consistency.
  const verifiedBoard = new Board(room.activeSeason.id);
  await verifiedBoard.load();

  // "CAT" at (-1, 0), (0, 0), (1, 0)
  assert.strictEqual(verifiedBoard.getTile(-1, 0).letter, 'C');
  assert.strictEqual(verifiedBoard.getTile(0, 0).letter, 'A');
  assert.strictEqual(verifiedBoard.getTile(1, 0).letter, 'T');

  // Verify Group 1:
  if (successCountA === 1) {
    // "TOY" placed: (1, 1) -> 'O', (1, 2) -> 'Y'
    assert.strictEqual(verifiedBoard.getTile(1, 1).letter, 'O');
    assert.strictEqual(verifiedBoard.getTile(1, 2).letter, 'Y');
  } else {
    // "TOT" placed: (1, 1) -> 'O', (1, 2) -> 'T'
    assert.strictEqual(verifiedBoard.getTile(1, 1).letter, 'O');
    assert.strictEqual(verifiedBoard.getTile(1, 2).letter, 'T');
  }

  // Verify Group 2:
  if (successCountC === 1) {
    // "COT" placed: (-1, 1) -> 'O', (-1, 2) -> 'T'
    assert.strictEqual(verifiedBoard.getTile(-1, 1).letter, 'O');
    assert.strictEqual(verifiedBoard.getTile(-1, 2).letter, 'T');
  } else {
    // "COB" placed: (-1, 1) -> 'O', (-1, 2) -> 'B'
    assert.strictEqual(verifiedBoard.getTile(-1, 1).letter, 'O');
    assert.strictEqual(verifiedBoard.getTile(-1, 2).letter, 'B');
  }

  // Clean up simulated room interval
  if (room._simulationInterval) {
    clearInterval(room._simulationInterval);
  }
});
