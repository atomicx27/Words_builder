import dictionary from './Dictionary.js';
import { 
  LETTER_VALUES, 
  BONUS_TYPES, 
  DEFAULT_DAILY_LIMIT
} from '../../shared/constants.js';



// Deterministic seed generator for bonus squares based on coordinates
export function getBonusType(x, y) {
  // Center tile is a special starting tile (no bonus)
  if (x === 0 && y === 0) return BONUS_TYPES.NONE;

  // Pseudo-random value between 0 and 1 using coordinate math
  const val = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

  // Distribution: 2% Triple Word, 4% Double Word, 5% Triple Letter, 10% Double Letter
  if (val < 0.02) return BONUS_TYPES.TW;
  if (val < 0.06) return BONUS_TYPES.DW;
  if (val < 0.11) return BONUS_TYPES.TL;
  if (val < 0.21) return BONUS_TYPES.DL;
  
  return BONUS_TYPES.NONE;
}

class GameEngine {
  // Validate and calculate score for a word placement
  async validateAndScorePlacement(board, player, pendingTiles, sessionConfig = {}) {
    const dailyLimit = sessionConfig.dailyWordLimit ?? DEFAULT_DAILY_LIMIT;
    const isUnlimited = dailyLimit === 'Unlimited' || dailyLimit <= 0;

    // 1. Check daily word limit
    if (!isUnlimited && player.wordsToday >= dailyLimit) {
      return {
        valid: false,
        error: `Daily word limit reached (${player.wordsToday}/${dailyLimit}). Resets at midnight UTC.`
      };
    }

    if (!Array.isArray(pendingTiles)) {
      return { valid: false, error: 'Invalid tile placement: tiles must be an array.' };
    }

    if (pendingTiles.length === 0) {
      return { valid: false, error: 'No tiles provided for placement.' };
    }

    if (!player || !player.rack) {
      return { valid: false, error: 'Invalid player rack.' };
    }

    // --- R1: Server-side Rack verification ---
    const tempRack = [...player.rack];
    const verifiedTiles = [];
    const usedRackIndices = new Set();

    for (const tile of pendingTiles) {
      if (!tile || typeof tile !== 'object') {
        return { valid: false, error: 'Invalid tile placement: each tile must be a valid object.' };
      }
      const idx = tile.rackIndex;
      if (idx === undefined || idx < 0 || idx >= tempRack.length) {
        return { valid: false, error: 'Invalid tile placement: missing or invalid rack index.' };
      }
      if (usedRackIndices.has(idx)) {
        return { valid: false, error: 'Invalid tile placement: duplicate rack index used.' };
      }
      
      const serverTile = tempRack[idx];
      if (!serverTile) {
        return { valid: false, error: `Invalid tile placement: tile at rack index ${idx} is empty.` };
      }

      if (typeof tile.letter !== 'string') {
        return { valid: false, error: 'Invalid tile placement: letter must be a string character.' };
      }
      const placedLetter = tile.letter.toUpperCase();
      if (!placedLetter || placedLetter.length !== 1 || placedLetter < 'A' || placedLetter > 'Z') {
        return { valid: false, error: 'Invalid tile placement: letter must be a single character A-Z.' };
      }

      if (serverTile.isWildcard || serverTile.letter === '*') {
        // Enforce wildcard properties
        verifiedTiles.push({
          x: tile.x,
          y: tile.y,
          letter: placedLetter,
          value: 0,
          isWildcard: true,
          rackIndex: idx
        });
      } else {
        // Enforce standard tile properties matching server-side rack
        if (serverTile.letter !== placedLetter) {
          return {
            valid: false,
            error: `Invalid tile placement: letter "${placedLetter}" does not match rack tile "${serverTile.letter}".`
          };
        }
        verifiedTiles.push({
          x: tile.x,
          y: tile.y,
          letter: serverTile.letter,
          value: serverTile.value,
          isWildcard: false,
          rackIndex: idx
        });
      }

      tempRack[idx] = null;
      usedRackIndices.add(idx);
    }

    // Sort pending tiles to make checks easier
    // We sort by x, then by y
    const sortedTiles = [...verifiedTiles].sort((a, b) => a.x - b.x || a.y - b.y);

    // 2. Collision Check
    for (const tile of sortedTiles) {
      if (board.hasTile(tile.x, tile.y)) {
        return {
          valid: false,
          error: `Space at (${tile.x}, ${tile.y}) is already occupied. Conflicting tile returned.`
        };
      }
    }

    // 3. Check first word logic
    const isFirstWord = board.isEmpty();
    if (isFirstWord) {
      const coversCenter = sortedTiles.some(t => t.x === 0 && t.y === 0);
      if (!coversCenter) {
        return {
          valid: false,
          error: 'The first word of the season must cover the center star tile (0, 0).'
        };
      }
    }

    // 4. Geometry Check (Must be in a single straight line: H or V)
    const firstTile = sortedTiles[0];
    const isHorizontal = sortedTiles.every(t => t.y === firstTile.y);
    const isVertical = sortedTiles.every(t => t.x === firstTile.x);

    if (!isHorizontal && !isVertical) {
      return {
        valid: false,
        error: 'Tiles must be placed in a single straight line (horizontal or vertical).'
      };
    }

    const direction = isHorizontal ? 'H' : 'V';

    // 5. Gaps Check
    if (direction === 'H') {
      const y = firstTile.y;
      for (let x = sortedTiles[0].x; x <= sortedTiles[sortedTiles.length - 1].x; x++) {
        if (!board.hasTile(x, y) && !sortedTiles.some(t => t.x === x)) {
          return { valid: false, error: 'Word placement cannot contain empty gaps.' };
        }
      }
    } else {
      const x = firstTile.x;
      for (let y = sortedTiles[0].y; y <= sortedTiles[sortedTiles.length - 1].y; y++) {
        if (!board.hasTile(x, y) && !sortedTiles.some(t => t.y === y)) {
          return { valid: false, error: 'Word placement cannot contain empty gaps.' };
        }
      }
    }

    // 6. Extract Words Formed
    const wordsFormed = this.extractWords(board, sortedTiles, direction);
    
    if (wordsFormed.length === 0) {
      return { valid: false, error: 'A word must be at least 2 letters long.' };
    }

    // 7. Connectivity Check (Must connect to existing words unless it's the first word)
    if (!isFirstWord) {
      const connectsToExisting = wordsFormed.some(wf => 
        wf.tiles.some(t => board.hasTile(t.x, t.y))
      );
      if (!connectsToExisting) {
        return { valid: false, error: 'Your word must connect to an existing word on the board.' };
      }
    }

    // 8. Dictionary check
    for (const wf of wordsFormed) {
      const wordString = wf.word;
      if (!dictionary.isValid(wordString)) {
        return { valid: false, error: `"${wordString}" is not in the dictionary.` };
      }
    }

    // 9. Calculate Scoring
    let totalScore = 0;
    const scoresBreakdown = [];

    for (const wf of wordsFormed) {
      let wordScore = 0;
      let wordMultiplier = 1;

      // Calculate base letter scores and word multipliers
      for (const tile of wf.tiles) {
        // Is this a newly placed tile?
        const isNew = sortedTiles.some(t => t.x === tile.x && t.y === tile.y);
        
        let letterVal = LETTER_VALUES[tile.letter] ?? 0;
        if (tile.isWildcard) {
          letterVal = 0; // Wildcard is always 0 base points
        }

        if (isNew) {
          // Apply bonus squares
          const bonus = getBonusType(tile.x, tile.y);
          if (bonus === BONUS_TYPES.DL) {
            letterVal *= 2;
          } else if (bonus === BONUS_TYPES.TL) {
            letterVal *= 3;
          } else if (bonus === BONUS_TYPES.DW) {
            wordMultiplier *= 2;
          } else if (bonus === BONUS_TYPES.TW) {
            wordMultiplier *= 3;
          }
        }

        wordScore += letterVal;
      }

      // Apply word multipliers
      wordScore *= wordMultiplier;

      // Apply word-length multiplier
      const len = wf.word.length;
      let lengthMultiplier = 1.0;
      if (len >= 7) {
        lengthMultiplier = 2.0;
      } else if (len >= 5) {
        lengthMultiplier = 1.5;
      }
      
      wordScore = Math.round(wordScore * lengthMultiplier);

      totalScore += wordScore;
      scoresBreakdown.push({
        word: wf.word,
        score: wordScore,
        lengthMultiplier
      });
    }

    return {
      valid: true,
      score: totalScore,
      wordsFormed: scoresBreakdown,
      placedTiles: sortedTiles
    };
  }

  // Extract all words formed by placing sortedTiles
  extractWords(board, sortedTiles, direction) {
    const words = [];
    const pendingSet = new Set(sortedTiles.map(t => `${t.x},${t.y}`));

    // Helper: get tile helper (checks pending first, then board)
    const getTileAt = (x, y) => {
      const pending = sortedTiles.find(t => t.x === x && t.y === y);
      if (pending) return pending;
      return board.getTile(x, y);
    };

    // If multiple tiles placed, we have a main word in the direction of placement
    if (sortedTiles.length > 1) {
      const mainWord = this.extractWordAt(getTileAt, sortedTiles[0].x, sortedTiles[0].y, direction);
      if (mainWord && mainWord.word.length >= 2) {
        words.push(mainWord);
      }
    }

    // For every newly placed tile, check the perpendicular direction for crossing words.
    // If only 1 tile is placed, we check both Horizontal and Vertical directions.
    const perpendicularDirection = direction === 'H' ? 'V' : 'H';

    for (const tile of sortedTiles) {
      if (sortedTiles.length === 1) {
        // Single tile: extract both Horizontal and Vertical words
        const hWord = this.extractWordAt(getTileAt, tile.x, tile.y, 'H');
        const vWord = this.extractWordAt(getTileAt, tile.x, tile.y, 'V');
        
        if (hWord && hWord.word.length >= 2) words.push(hWord);
        if (vWord && vWord.word.length >= 2) words.push(vWord);
      } else {
        // Multi-tile: extract perpendicular word only
        const crossWord = this.extractWordAt(getTileAt, tile.x, tile.y, perpendicularDirection);
        if (crossWord && crossWord.word.length >= 2) {
          words.push(crossWord);
        }
      }
    }

    return words;
  }

  // Extract a word at coordinates in direction
  extractWordAt(getTileAt, startX, startY, direction) {
    const tiles = [];
    
    if (direction === 'H') {
      // Walk left
      let x = startX;
      while (getTileAt(x - 1, startY)) {
        x--;
      }
      // Gather right
      while (getTileAt(x, startY)) {
        tiles.push(getTileAt(x, startY));
        x++;
      }
    } else {
      // Walk up
      let y = startY;
      while (getTileAt(startX, y - 1)) {
        y--;
      }
      // Gather down
      while (getTileAt(startX, y)) {
        tiles.push(getTileAt(startX, y));
        y++;
      }
    }

    if (tiles.length < 2) return null;

    const word = tiles.map(t => t.letter).join('').toUpperCase();
    return {
      word,
      tiles,
      direction
    };
  }
}

const gameEngineInstance = new GameEngine();
export default gameEngineInstance;
export { GameEngine };
