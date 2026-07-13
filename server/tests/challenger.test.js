import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert';

const testDbFile = `challenger_${Date.now()}_${Math.floor(Math.random() * 1000)}.db`;
process.env.DATABASE_URL = `file:${testDbFile}`;

const { initDb, db } = await import('../db/db.js');
const { default: dictionary } = await import('../game/Dictionary.js');
const { default: Board } = await import('../game/Board.js');
const { default: gameEngine } = await import('../game/GameEngine.js');
const { default: playerManager } = await import('../game/PlayerManager.js');
const { default: GameRoom } = await import('../rooms/GameRoom.js');
const { CLIENT_MESSAGES } = await import('../../shared/constants.js');

test.before(async () => {
  await initDb();
  await dictionary.init();
});

test.after(async () => {
  if (db && typeof db.close === 'function') {
    try {
      await db.close();
    } catch (e) {}
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  if (fs.existsSync(testDbFile)) {
    try {
      fs.unlinkSync(testDbFile);
    } catch (e) {}
  }
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

test('R1: Bad types input validation testing (Adversarial check)', async () => {
  const mockBoard = new Board('test_season_challenger');
  await mockBoard.load();

  const player = {
    rack: [
      { letter: 'A', value: 1, isWildcard: false },
      { letter: 'B', value: 3, isWildcard: false },
      { letter: '*', value: 0, isWildcard: true }
    ]
  };

  // Test: pendingTiles is not an array
  const resultNotArray = await gameEngine.validateAndScorePlacement(mockBoard, player, 'not-an-array');
  assert.strictEqual(resultNotArray.valid, false);
  assert.strictEqual(resultNotArray.error, 'Invalid tile placement: tiles must be an array.');

  // Test 1: tile is null
  const pendingTiles1 = [null];
  const result1 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles1);
  assert.strictEqual(result1.valid, false);
  assert.strictEqual(result1.error, 'Invalid tile placement: each tile must be a valid object.');

  // Test 2: tile.letter is an object {}
  const pendingTiles2 = [{ x: 0, y: 0, letter: {}, rackIndex: 0 }];
  const result2 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles2);
  assert.strictEqual(result2.valid, false);
  assert.strictEqual(result2.error, 'Invalid tile placement: letter must be a string character.');

  // Test 3: tile.letter is a number 123
  const pendingTiles3 = [{ x: 0, y: 0, letter: 123, rackIndex: 0 }];
  const result3 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles3);
  assert.strictEqual(result3.valid, false);
  assert.strictEqual(result3.error, 'Invalid tile placement: letter must be a string character.');

  // Test 4: tile.letter is undefined
  const pendingTiles4 = [{ x: 0, y: 0, letter: undefined, rackIndex: 0 }];
  const result4 = await gameEngine.validateAndScorePlacement(mockBoard, player, pendingTiles4);
  assert.strictEqual(result4.valid, false);
  assert.strictEqual(result4.error, 'Invalid tile placement: letter must be a string character.');
});

test('R1 / R2: Room message processing with bad types', async () => {
  const handlers = {};
  class TestGameRoom extends GameRoom {
    onMessage(messageType, callback) {
      handlers[messageType] = callback;
    }
    broadcast() {}
  }

  const room = new TestGameRoom();
  await room.onCreate({ sessionId: 'challenger-session' });

  const client = {
    send: (type, data) => { client.messages.push({ type, data }); },
    messages: [],
    userData: { playerId: 'player_challenger' }
  };
  await room.onJoin(client, { playerId: 'player_challenger' });

  const player = playerManager.getActivePlayer('player_challenger');
  player.rack = [
    { letter: 'A', value: 1, isWildcard: false }
  ];

  // Try submitting object for letter, causing validation failure
  handlers[CLIENT_MESSAGES.PLACE_WORD](client, {
    tiles: [{ x: 0, y: 0, letter: {}, rackIndex: 0 }]
  });

  await room.placementQueue;

  // Verify that the client received placement_error (due to validation)
  const errorMsg = client.messages.find(m => m.type === 'placement_error');
  assert.ok(errorMsg, "Client should receive placement_error");
  assert.ok(errorMsg.data.error.includes('letter must be a string character'));

  // Clear messages for next test
  client.messages = [];

  // Try submitting null to trigger unexpected error (TypeError)
  handlers[CLIENT_MESSAGES.PLACE_WORD](client, null);

  await room.placementQueue;

  // Verify that the client received placement_error (due to internal server error catch)
  const unexpectedErrorMsg = client.messages.find(m => m.type === 'placement_error');
  assert.ok(unexpectedErrorMsg, "Client should receive placement_error for unexpected errors");
  assert.ok(unexpectedErrorMsg.data.error.includes('Internal server error'));
});

test('R2: Race condition between PLACE_WORD and EXCHANGE_TILES', async () => {
  const handlers = {};
  class TestGameRoom extends GameRoom {
    onMessage(messageType, callback) {
      handlers[messageType] = callback;
    }
    broadcast() {}
  }

  const room = new TestGameRoom();
  await room.onCreate({ sessionId: 'challenger-session-race' });

  const client = {
    send: (type, data) => { client.messages.push({ type, data }); },
    messages: [],
    userData: { playerId: 'player_race' }
  };
  await room.onJoin(client, { playerId: 'player_race' });

  const player = playerManager.getActivePlayer('player_race');
  player.rack = [
    { letter: 'C', value: 3, isWildcard: false },
    { letter: 'A', value: 1, isWildcard: false },
    { letter: 'T', value: 1, isWildcard: false }
  ];

  // Player sends PLACE_WORD to place "CAT" covering center (0,0)
  const catTiles = [
    { x: -1, y: 0, letter: 'C', rackIndex: 0 },
    { x: 0, y: 0, letter: 'A', rackIndex: 1 },
    { x: 1, y: 0, letter: 'T', rackIndex: 2 }
  ];

  // First send PLACE_WORD (async queue)
  handlers[CLIENT_MESSAGES.PLACE_WORD](client, { tiles: catTiles });

  // Then send EXCHANGE_TILES immediately (processed synchronously right after onMessage resolves)
  handlers[CLIENT_MESSAGES.EXCHANGE_TILES](client);

  // Await the queue to complete processing
  await room.placementQueue;

  const placementError = client.messages.find(m => m.type === 'placement_error');
  assert.strictEqual(placementError, undefined, "There should be no placement error as they are queued sequentially");

  const successes = client.messages.filter(m => m.type === 'placement_success');
  assert.strictEqual(successes.length, 2, "Both PLACE_WORD and EXCHANGE_TILES should succeed sequentially");

  const firstSuccess = successes[0].data;
  assert.strictEqual(firstSuccess.score, 5, "First placement score should be 5");
  assert.strictEqual(firstSuccess.wordsToday, 1, "First placement should increment wordsToday to 1");

  const secondSuccess = successes[1].data;
  assert.strictEqual(secondSuccess.wordsToday, 2, "EXCHANGE_TILES should increment wordsToday to 2");
});
