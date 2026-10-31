import dictionary from './Dictionary.js';
import { getBonusType } from '../board/ChunkManager.js';
import { LETTER_VALUES, BONUS_TYPES, DEFAULT_DAILY_LIMIT } from '../../../shared/constants.js';

export const BINGO_TILE_COUNT = 7;
export const BINGO_BONUS = 50;

// Authoritative placement validation + scoring.
// Ported from the former Node server's GameEngine. It is pure/synchronous so it can be
// re-run inside a Firestore transaction against freshly-read board chunks.
class GameEngine {
  /**
   * @param {object} p
   * @param {(x:number,y:number)=>object|null} p.getTile  Lookup of committed board tiles
   * @param {boolean} p.isFirstWord   True when the season board has no tiles yet
   * @param {Array}  p.rack           Player's stored rack (array of {letter,value,isWildcard})
   * @param {Array}  p.pendingTiles   Tiles the player wants to place [{x,y,letter,isWildcard}]
   * @param {string|number} p.dailyLimit
   * @param {number} p.wordsToday
   */
  validateAndScorePlacement({ getTile, isFirstWord, rack, pendingTiles, dailyLimit, wordsToday }) {
    const limit = dailyLimit ?? DEFAULT_DAILY_LIMIT;
    const isUnlimited = limit === 'Unlimited' || Number(limit) <= 0;

    // 1. Daily word limit
    if (!isUnlimited && wordsToday >= Number(limit)) {
      return {
        valid: false,
        error: `Daily word limit reached (${wordsToday}/${limit}). Resets at midnight UTC.`
      };
    }

    if (!Array.isArray(pendingTiles) || pendingTiles.length === 0) {
      return { valid: false, error: 'No tiles provided for placement.' };
    }
    if (!Array.isArray(rack)) {
      return { valid: false, error: 'Invalid player rack.' };
    }

    // 2. Rack verification (multiset match, so local shuffling is irrelevant)
    const remaining = rack.map(t => (t ? { ...t } : null));
    const usedRackIndices = [];
    const verifiedTiles = [];

    for (const tile of pendingTiles) {
      if (!tile || typeof tile.letter !== 'string') {
        return { valid: false, error: 'Invalid tile placement.' };
      }
      const placedLetter = tile.letter.toUpperCase();
      if (placedLetter.length !== 1 || placedLetter < 'A' || placedLetter > 'Z') {
        return { valid: false, error: 'Invalid tile placement: letter must be a single character A-Z.' };
      }
      if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
        return { valid: false, error: 'Invalid tile coordinates.' };
      }

      const idx = remaining.findIndex(r =>
        r && (tile.isWildcard ? r.isWildcard : (!r.isWildcard && r.letter === placedLetter))
      );
      if (idx === -1) {
        return {
          valid: false,
          error: `Tile "${tile.isWildcard ? '*' : placedLetter}" is not in your rack. Try reloading.`
        };
      }
      remaining[idx] = null;
      usedRackIndices.push(idx);

      verifiedTiles.push({
        x: tile.x,
        y: tile.y,
        letter: placedLetter,
        value: tile.isWildcard ? 0 : (LETTER_VALUES[placedLetter] ?? 0),
        isWildcard: !!tile.isWildcard
      });
    }

    const sortedTiles = [...verifiedTiles].sort((a, b) => a.x - b.x || a.y - b.y);

    // Duplicate coordinates
    const coordSet = new Set(sortedTiles.map(t => `${t.x},${t.y}`));
    if (coordSet.size !== sortedTiles.length) {
      return { valid: false, error: 'Two tiles cannot share the same square.' };
    }

    // 3. Collision check
    for (const tile of sortedTiles) {
      if (getTile(tile.x, tile.y)) {
        return {
          valid: false,
          error: `Space at (${tile.x}, ${tile.y}) was just taken by another player. Tiles returned.`
        };
      }
    }

    // 4. First word must cover the center
    if (isFirstWord && !sortedTiles.some(t => t.x === 0 && t.y === 0)) {
      return { valid: false, error: 'The first word of the season must cover the center star tile (0, 0).' };
    }

    // 5. Geometry: single straight line
    const firstTile = sortedTiles[0];
    const isHorizontal = sortedTiles.every(t => t.y === firstTile.y);
    const isVertical = sortedTiles.every(t => t.x === firstTile.x);
    if (!isHorizontal && !isVertical) {
      return { valid: false, error: 'Tiles must be placed in a single straight line (horizontal or vertical).' };
    }
    const direction = isHorizontal ? 'H' : 'V';

    // Combined lookup: pending first, then committed board
    const pendingMap = new Map(sortedTiles.map(t => [`${t.x},${t.y}`, t]));
    const getAny = (x, y) => pendingMap.get(`${x},${y}`) || getTile(x, y) || null;

    // 6. Gaps
    const last = sortedTiles[sortedTiles.length - 1];
    if (direction === 'H') {
      for (let x = firstTile.x; x <= last.x; x++) {
        if (!getAny(x, firstTile.y)) return { valid: false, error: 'Word placement cannot contain empty gaps.' };
      }
    } else {
      for (let y = firstTile.y; y <= last.y; y++) {
        if (!getAny(firstTile.x, y)) return { valid: false, error: 'Word placement cannot contain empty gaps.' };
      }
    }

    // 7. Extract words
    const wordsFormed = this.extractWords(getAny, sortedTiles, direction);
    if (wordsFormed.length === 0) {
      return { valid: false, error: 'A word must be at least 2 letters long.' };
    }

    // 8. Connectivity
    if (!isFirstWord) {
      const connects = wordsFormed.some(wf => wf.tiles.some(t => !pendingMap.has(`${t.x},${t.y}`)));
      if (!connects) {
        return { valid: false, error: 'Your word must connect to an existing word on the board.' };
      }
    }

    // 9. Dictionary
    for (const wf of wordsFormed) {
      if (!dictionary.isValid(wf.word)) {
        return { valid: false, error: `"${wf.word}" is not in the dictionary.` };
      }
    }

    // 10. Scoring
    const { score, breakdown } = this.scoreWords(wordsFormed, pendingMap, sortedTiles.length);

    return {
      valid: true,
      score,
      wordsFormed: breakdown,
      placedTiles: sortedTiles,
      usedRackIndices,
      // All coordinates involved in the formed words (used to detect concurrent board changes)
      involvedCells: wordsFormed.flatMap(wf => wf.tiles.map(t => ({ x: t.x, y: t.y })))
    };
  }

  scoreWords(wordsFormed, pendingMap, placedCount) {
    let totalScore = 0;
    const breakdown = [];

    for (const wf of wordsFormed) {
      let wordScore = 0;
      let wordMultiplier = 1;

      for (const tile of wf.tiles) {
        let letterVal = tile.isWildcard ? 0 : (LETTER_VALUES[tile.letter] ?? 0);

        if (pendingMap.has(`${tile.x},${tile.y}`)) {
          const bonus = getBonusType(tile.x, tile.y);
          if (bonus === BONUS_TYPES.DL) letterVal *= 2;
          else if (bonus === BONUS_TYPES.TL) letterVal *= 3;
          else if (bonus === BONUS_TYPES.DW) wordMultiplier *= 2;
          else if (bonus === BONUS_TYPES.TW) wordMultiplier *= 3;
        }
        wordScore += letterVal;
      }

      wordScore *= wordMultiplier;

      const len = wf.word.length;
      const lengthMultiplier = len >= 7 ? 2.0 : len >= 5 ? 1.5 : 1.0;
      wordScore = Math.round(wordScore * lengthMultiplier);

      totalScore += wordScore;
      breakdown.push({ word: wf.word, score: wordScore, lengthMultiplier });
    }

    // Bingo bonus: all 7 rack tiles used in a single play
    if (placedCount >= BINGO_TILE_COUNT) {
      totalScore += BINGO_BONUS;
      breakdown.push({ word: 'BINGO!', score: BINGO_BONUS, lengthMultiplier: 1 });
    }

    return { score: totalScore, breakdown };
  }

  extractWords(getAny, sortedTiles, direction) {
    const words = [];

    if (sortedTiles.length > 1) {
      const mainWord = this.extractWordAt(getAny, sortedTiles[0].x, sortedTiles[0].y, direction);
      if (mainWord) words.push(mainWord);
    }

    const perpendicular = direction === 'H' ? 'V' : 'H';
    for (const tile of sortedTiles) {
      if (sortedTiles.length === 1) {
        const h = this.extractWordAt(getAny, tile.x, tile.y, 'H');
        const v = this.extractWordAt(getAny, tile.x, tile.y, 'V');
        if (h) words.push(h);
        if (v) words.push(v);
      } else {
        const cross = this.extractWordAt(getAny, tile.x, tile.y, perpendicular);
        if (cross) words.push(cross);
      }
    }
    return words;
  }

  extractWordAt(getAny, startX, startY, direction) {
    const tiles = [];
    if (direction === 'H') {
      let x = startX;
      while (getAny(x - 1, startY)) x--;
      while (getAny(x, startY)) {
        tiles.push({ ...getAny(x, startY), x, y: startY });
        x++;
      }
    } else {
      let y = startY;
      while (getAny(startX, y - 1)) y--;
      while (getAny(startX, y)) {
        tiles.push({ ...getAny(startX, y), x: startX, y });
        y++;
      }
    }
    if (tiles.length < 2) return null;
    return { word: tiles.map(t => t.letter).join('').toUpperCase(), tiles, direction };
  }
}

const gameEngineInstance = new GameEngine();
export default gameEngineInstance;
export { GameEngine };
