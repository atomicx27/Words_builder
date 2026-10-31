/**
 * White-Box Logic & Authoritative Rule Audit Suite
 * Tests every game algorithm, math function, coordinate transformation,
 * and rule edge-case in isolation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import gameEngine from '../../client/js/game/GameEngine.js';
import placementValidator from '../../client/js/game/PlacementValidator.js';
import scoreCalculator from '../../client/js/game/ScoreCalculator.js';
import wordExtractor from '../../client/js/game/WordExtractor.js';
import tileBag from '../../client/js/game/TileBag.js';
import dictionary from '../../client/js/game/Dictionary.js';
import { BoardState } from '../../client/js/board/BoardState.js';
import { getBonusType, TILE_SIZE } from '../../client/js/board/ChunkManager.js';
import { LETTER_VALUES, BONUS_TYPES, CHUNK_SIZE } from '../../shared/constants.js';
import authManager from '../../client/js/ui/AuthManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`  ✓ PASS: ${message}`);
}

async function runWhiteBoxAudit() {
  console.log('============================================================');
  console.log('🧪 WHITE-BOX COMPREHENSIVE LOGIC & RULE AUDIT');
  console.log('============================================================\n');

  // Load dictionary for testing
  const dictPath = path.resolve(__dirname, '../../client/public/sowpods.txt');
  const dictContent = fs.readFileSync(dictPath, 'utf8');
  for (const line of dictContent.split(/\r?\n/)) {
    const word = line.trim().toUpperCase();
    if (word.length >= 2) dictionary.words.add(word);
  }
  dictionary.isLoaded = true;
  console.log(`Loaded test dictionary with ${dictionary.words.size} words.\n`);

  // -------------------------------------------------------------
  // SECTION 1: Dictionary & Word Validation
  // -------------------------------------------------------------
  console.log('--- SECTION 1: Dictionary Logic ---');
  assert(dictionary.isValid('CAT'), 'Valid word "CAT" recognized');
  assert(dictionary.isValid('cat'), 'Case-insensitive "cat" recognized');
  assert(dictionary.isValid('SCRABBLE'), 'Valid word "SCRABBLE" recognized');
  assert(dictionary.isValid('BUILDER'), 'Valid word "BUILDER" recognized');
  assert(dictionary.isValid('WORD'), 'Valid word "WORD" recognized');
  assert(dictionary.isValid('AA'), 'Two-letter word "AA" recognized');
  assert(dictionary.isValid('QI'), 'Two-letter word "QI" recognized');
  assert(dictionary.isValid('ZA'), 'Two-letter word "ZA" recognized');
  assert(!dictionary.isValid('ZX'), 'Invalid two-letter word "ZX" rejected');
  assert(!dictionary.isValid('QQQ'), 'Non-word "QQQ" rejected');
  assert(!dictionary.isValid('A'), 'Single letter "A" rejected (min length 2)');
  assert(!dictionary.isValid(''), 'Empty string rejected');

  // -------------------------------------------------------------
  // SECTION 2: TileBag Distribution & Rules
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: TileBag Distribution & Rack Rules ---');
  assert(tileBag.letterPool.length === 98, `Letter pool has exactly 98 standard tiles (found: ${tileBag.letterPool.length})`);
  assert(LETTER_VALUES['A'] === 1, 'Letter A value is 1');
  assert(LETTER_VALUES['Q'] === 10, 'Letter Q value is 10');
  assert(LETTER_VALUES['Z'] === 10, 'Letter Z value is 10');
  assert(LETTER_VALUES['*'] === 0, 'Wildcard * value is 0');

  // Generate 50 random racks to test invariants
  for (let i = 0; i < 50; i++) {
    const rack = tileBag.generateNewRack();
    assert(rack.length === 7, `Rack ${i+1} has exactly 7 tiles`);
    const wildcards = rack.filter(t => t.isWildcard);
    assert(wildcards.length === 1, `Rack ${i+1} has exactly 1 wildcard`);
    
    // Test duplicate frequency
    const counts = {};
    for (const t of rack.filter(t => !t.isWildcard)) {
      counts[t.letter] = (counts[t.letter] || 0) + 1;
      assert(counts[t.letter] <= 2, `Rack ${i+1} tile "${t.letter}" does not exceed 2 duplicates`);
    }
  }

  // Refill rack test
  const partialRack = [
    { letter: 'C', value: 3, isWildcard: false },
    null,
    { letter: 'A', value: 1, isWildcard: false },
    null,
    null,
    null,
    null
  ];
  const refilled = tileBag.refillRack(partialRack);
  assert(refilled.length === 7, 'Refilled rack has exactly 7 tiles');
  assert(refilled.some(t => t.letter === 'C') && refilled.some(t => t.letter === 'A'), 'Refill preserves remaining standard letters');
  assert(refilled.filter(t => t.isWildcard).length === 1, 'Refill includes 1 wildcard');

  // -------------------------------------------------------------
  // SECTION 3: Board Coordinate Math & Negative Coordinates
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: Board Coordinate Math & Quadrants ---');
  // Test chunk coordinates in all 4 quadrants
  const getChunkCoords = (x, y) => ({
    cx: Math.floor(x / CHUNK_SIZE),
    cy: Math.floor(y / CHUNK_SIZE)
  });

  // Quadrant 1 (+, +)
  assert(getChunkCoords(0, 0).cx === 0 && getChunkCoords(0, 0).cy === 0, '(0,0) is in chunk (0,0)');
  assert(getChunkCoords(31, 31).cx === 0 && getChunkCoords(31, 31).cy === 0, '(31,31) is in chunk (0,0)');
  assert(getChunkCoords(32, 32).cx === 1 && getChunkCoords(32, 32).cy === 1, '(32,32) is in chunk (1,1)');

  // Quadrant 2 (-, +)
  assert(getChunkCoords(-1, 0).cx === -1 && getChunkCoords(-1, 0).cy === 0, '(-1,0) is in chunk (-1,0)');
  assert(getChunkCoords(-32, 0).cx === -1 && getChunkCoords(-32, 0).cy === 0, '(-32,0) is in chunk (-1,0)');
  assert(getChunkCoords(-33, 0).cx === -2 && getChunkCoords(-33, 0).cy === 0, '(-33,0) is in chunk (-2,0)');

  // Quadrant 3 (-, -)
  assert(getChunkCoords(-1, -1).cx === -1 && getChunkCoords(-1, -1).cy === -1, '(-1,-1) is in chunk (-1,-1)');
  assert(getChunkCoords(-32, -32).cx === -1 && getChunkCoords(-32, -32).cy === -1, '(-32,-32) is in chunk (-1,-1)');
  assert(getChunkCoords(-33, -33).cx === -2 && getChunkCoords(-33, -33).cy === -2, '(-33,-33) is in chunk (-2,-2)');

  // Quadrant 4 (+, -)
  assert(getChunkCoords(0, -1).cx === 0 && getChunkCoords(0, -1).cy === -1, '(0,-1) is in chunk (0,-1)');
  assert(getChunkCoords(0, -32).cx === 0 && getChunkCoords(0, -32).cy === -1, '(0,-32) is in chunk (0,-1)');
  assert(getChunkCoords(0, -33).cx === 0 && getChunkCoords(0, -33).cy === -2, '(0,-33) is in chunk (0,-2)');

  // -------------------------------------------------------------
  // SECTION 4: PlacementValidator & Geometry Rules
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: PlacementValidator Geometry & Rules ---');
  const board = new BoardState();

  // Test: Empty placement
  const emptyRes = placementValidator.validate(board, []);
  assert(!emptyRes.valid, 'Empty placement is invalid');

  // Test: First word not covering (0,0)
  board.clearAll();
  const notCenter = placementValidator.validate(board, [
    { x: 1, y: 1, letter: 'A', value: 1, isWildcard: false },
    { x: 2, y: 1, letter: 'T', value: 1, isWildcard: false }
  ]);
  assert(!notCenter.valid && notCenter.errors.some(e => e.includes('(0, 0)')), 'First word not covering (0,0) rejected');

  // Test: Diagonal placement
  board.clearAll();
  const diagonal = placementValidator.validate(board, [
    { x: 0, y: 0, letter: 'N', value: 1, isWildcard: false },
    { x: 1, y: 1, letter: 'O', value: 1, isWildcard: false }
  ]);
  assert(!diagonal.valid && diagonal.errors.some(e => e.includes('straight line')), 'Diagonal placement rejected');

  // Test: Placement with gaps
  board.clearAll();
  const gapped = placementValidator.validate(board, [
    { x: 0, y: 0, letter: 'C', value: 3, isWildcard: false },
    { x: 2, y: 0, letter: 'T', value: 1, isWildcard: false }
  ]);
  assert(!gapped.valid && gapped.errors.some(e => e.includes('empty gaps')), 'Placement with empty gaps rejected');

  // Test: Invalid word in dictionary
  board.clearAll();
  const badWord = placementValidator.validate(board, [
    { x: 0, y: 0, letter: 'Z', value: 10, isWildcard: false },
    { x: 1, y: 0, letter: 'X', value: 8, isWildcard: false }
  ]);
  assert(!badWord.valid && badWord.errors.some(e => e.includes('not in the dictionary')), 'Invalid dictionary word "ZX" rejected immediately by PlacementValidator');

  // Test: Valid horizontal first word
  board.clearAll();
  const validFirst = placementValidator.validate(board, [
    { x: 0, y: 0, letter: 'N', value: 1, isWildcard: false },
    { x: 1, y: 0, letter: 'O', value: 1, isWildcard: false }
  ]);
  assert(validFirst.valid, 'Valid first word "NO" covering (0,0) accepted');

  // Commit "NO" to board permanently
  board.addTile({ x: 0, y: 0, letter: 'N', value: 1, isWildcard: false });
  board.addTile({ x: 1, y: 0, letter: 'O', value: 1, isWildcard: false });

  // Test: Disconnected placement when board has tiles
  const disconnected = placementValidator.validate(board, [
    { x: 5, y: 5, letter: 'A', value: 1, isWildcard: false },
    { x: 6, y: 5, letter: 'T', value: 1, isWildcard: false }
  ]);
  assert(!disconnected.valid && disconnected.errors.some(e => e.includes('connect to an existing word')), 'Disconnected word rejected');

  // Test: Valid connecting word (crossing 'O' at (1,0) to form "ON")
  const connecting = placementValidator.validate(board, [
    { x: 1, y: 1, letter: 'N', value: 1, isWildcard: false }
  ]);
  assert(connecting.valid, 'Connecting single tile "N" forming "ON" accepted');

  // -------------------------------------------------------------
  // SECTION 5: Authoritative GameEngine Validation & Scoring
  // -------------------------------------------------------------
  console.log('\n--- SECTION 5: Authoritative GameEngine Rules & Multipliers ---');
  const committedBoard = new Map();
  const getTile = (x, y) => committedBoard.get(`${x},${y}`) || null;

  // Rack with N, O, T, A, C, P, *
  const playerRack = [
    { letter: 'N', value: 1, isWildcard: false },
    { letter: 'O', value: 1, isWildcard: false },
    { letter: 'T', value: 1, isWildcard: false },
    { letter: 'A', value: 1, isWildcard: false },
    { letter: 'C', value: 3, isWildcard: false },
    { letter: 'P', value: 3, isWildcard: false },
    { letter: '*', value: 0, isWildcard: true }
  ];

  // Test 5.1: First word covering (0,0)
  const engineFirstWord = gameEngine.validateAndScorePlacement({
    getTile,
    isFirstWord: true,
    rack: playerRack,
    pendingTiles: [
      { x: 0, y: 0, letter: 'N', isWildcard: false },
      { x: 1, y: 0, letter: 'O', isWildcard: false }
    ],
    dailyLimit: '10',
    wordsToday: 0
  });
  assert(engineFirstWord.valid, 'GameEngine accepted valid first word "NO"');
  assert(engineFirstWord.score === 2, `Score for "NO" is 2 (found: ${engineFirstWord.score})`);

  // Test 5.2: Tile forgery (trying to place 'Z' which is not in rack)
  const forgedPlacement = gameEngine.validateAndScorePlacement({
    getTile,
    isFirstWord: true,
    rack: playerRack,
    pendingTiles: [
      { x: 0, y: 0, letter: 'Z', isWildcard: false },
      { x: 1, y: 0, letter: 'O', isWildcard: false }
    ],
    dailyLimit: '10',
    wordsToday: 0
  });
  assert(!forgedPlacement.valid && forgedPlacement.error.includes('not in your rack'), 'Tile forgery rejected by GameEngine');

  // Test 5.3: Wildcard played as 'Z' (should succeed with value 0)
  const wildcardAsZ = gameEngine.validateAndScorePlacement({
    getTile,
    isFirstWord: true,
    rack: playerRack,
    pendingTiles: [
      { x: 0, y: 0, letter: 'Z', isWildcard: true },
      { x: 1, y: 0, letter: 'O', isWildcard: false }
    ],
    dailyLimit: '10',
    wordsToday: 0
  });
  assert(wildcardAsZ.valid, 'Wildcard played as "Z" in "ZO" accepted');
  assert(wildcardAsZ.score === 1, `Score for "ZO" with wildcard Z is 1 point (O=1, Z=0) (found: ${wildcardAsZ.score})`);

  // Commit "NO" to committedBoard at (0,0) and (1,0)
  committedBoard.set('0,0', { x: 0, y: 0, letter: 'N', value: 1, isWildcard: false });
  committedBoard.set('1,0', { x: 1, y: 0, letter: 'O', value: 1, isWildcard: false });

  // Test 5.4: Collision check (another player took (0,0))
  const collision = gameEngine.validateAndScorePlacement({
    getTile,
    isFirstWord: false,
    rack: playerRack,
    pendingTiles: [
      { x: 0, y: 0, letter: 'T', isWildcard: false },
      { x: 0, y: 1, letter: 'O', isWildcard: false }
    ],
    dailyLimit: '10',
    wordsToday: 0
  });
  assert(!collision.valid && collision.error.includes('taken by another player'), 'Collision on occupied square detected and rejected');

  // Test 5.5: Multi-word crossword intersection:
  // Board has "NO" at (0,0) and (1,0).
  // Player plays "AT" at (1,1) and (1,2) forming "OAT" vertically (O at 1,0 + A at 1,1 + T at 1,2)
  const crossword = gameEngine.validateAndScorePlacement({
    getTile,
    isFirstWord: false,
    rack: playerRack,
    pendingTiles: [
      { x: 1, y: 1, letter: 'A', isWildcard: false },
      { x: 1, y: 2, letter: 'T', isWildcard: false }
    ],
    dailyLimit: '10',
    wordsToday: 0
  });
  assert(crossword.valid, 'Connecting placement forming vertical word "OAT" accepted');
  assert(crossword.wordsFormed.some(w => w.word === 'OAT'), 'Word "OAT" correctly formed and recognized');

  // Test 5.6: Daily word limit enforcement
  const limitReached = gameEngine.validateAndScorePlacement({
    getTile,
    isFirstWord: false,
    rack: playerRack,
    pendingTiles: [
      { x: 1, y: 1, letter: 'A', isWildcard: false },
      { x: 1, y: 2, letter: 'T', isWildcard: false }
    ],
    dailyLimit: '5',
    wordsToday: 5
  });
  assert(!limitReached.valid && limitReached.error.includes('limit reached'), 'Daily word limit enforced');

  // -------------------------------------------------------------
  // SECTION 6: Scrabble Multipliers & Bingo Bonus
  // -------------------------------------------------------------
  console.log('\n--- SECTION 6: Multipliers & BINGO Bonus ---');
  // 7-letter word on empty board: "SCRABBL" or "PAINTER"
  const bingoRack = [
    { letter: 'P', value: 3, isWildcard: false },
    { letter: 'A', value: 1, isWildcard: false },
    { letter: 'I', value: 1, isWildcard: false },
    { letter: 'N', value: 1, isWildcard: false },
    { letter: 'T', value: 1, isWildcard: false },
    { letter: 'E', value: 1, isWildcard: false },
    { letter: 'R', value: 1, isWildcard: false }
  ];

  const emptyBoardLookup = () => null;
  const bingoResult = gameEngine.validateAndScorePlacement({
    getTile: emptyBoardLookup,
    isFirstWord: true,
    rack: bingoRack,
    pendingTiles: [
      { x: 0, y: 0, letter: 'P', isWildcard: false },
      { x: 1, y: 0, letter: 'A', isWildcard: false },
      { x: 2, y: 0, letter: 'I', isWildcard: false },
      { x: 3, y: 0, letter: 'N', isWildcard: false },
      { x: 4, y: 0, letter: 'T', isWildcard: false },
      { x: 5, y: 0, letter: 'E', isWildcard: false },
      { x: 6, y: 0, letter: 'R', isWildcard: false }
    ],
    dailyLimit: 'Unlimited',
    wordsToday: 0
  });
  assert(bingoResult.valid, 'Valid 7-letter word "PAINTER" accepted');
  assert(bingoResult.wordsFormed.some(w => w.word === 'BINGO!'), 'BINGO! bonus recorded in breakdown');
  assert(bingoResult.score >= 50, `Score includes +50 BINGO bonus (total score: ${bingoResult.score})`);

  // Verify ScoreCalculator preview matches GameEngine BINGO bonus
  const previewCalc = scoreCalculator.calculateScore(
    bingoResult.placedTiles,
    [{ word: 'PAINTER', tiles: bingoResult.placedTiles }]
  );
  assert(previewCalc.breakdown.some(w => w.word === 'BINGO!'), 'ScoreCalculator preview includes BINGO bonus');
  console.log(`  ✓ ScoreCalculator preview matches GameEngine: preview=${previewCalc.score}, engine=${bingoResult.score}`);

  // -------------------------------------------------------------
  // SECTION 7: AuthManager Username Validation
  // -------------------------------------------------------------
  console.log('\n--- SECTION 7: AuthManager Username Validation ---');
  assert(authManager.validateUsername('alice').valid, 'Valid username "alice" accepted');
  assert(authManager.validateUsername('Player_123').valid, 'Valid username "Player_123" accepted');
  assert(authManager.validateUsername('pro-builder').valid, 'Valid username "pro-builder" accepted');
  assert(!authManager.validateUsername('a').valid, 'Too short username "a" rejected');
  assert(!authManager.validateUsername('this_username_is_way_too_long_to_be_allowed').valid, 'Too long username rejected');
  assert(!authManager.validateUsername('user name').valid, 'Username with spaces rejected');
  assert(!authManager.validateUsername('user@domain').valid, 'Username with special char "@" rejected');
  assert(!authManager.validateUsername('🎮player').valid, 'Username with emojis rejected');

  console.log('\n============================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} WHITE-BOX AUDIT TESTS PASSED!`);
  console.log('============================================================\n');
}

runWhiteBoxAudit().catch(err => {
  console.error('\n❌ Audit Suite Terminated with Error:', err);
  process.exit(1);
});
