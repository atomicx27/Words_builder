import wordExtractor from './WordExtractor.js';
import dictionary from './Dictionary.js';

class PlacementValidator {
  validate(boardState, pendingTiles) {
    const errors = [];
    
    if (pendingTiles.length === 0) {
      return { valid: false, errors: [], wordsFormed: [] };
    }

    // Sort pending tiles: x ascending, then y
    const sorted = [...pendingTiles].sort((a, b) => a.x - b.x || a.y - b.y);

    // 1. First word must cover (0,0)
    const isFirstWord = boardState.isEmpty();
    if (isFirstWord) {
      const coversCenter = sorted.some(t => t.x === 0 && t.y === 0);
      if (!coversCenter) {
        errors.push('The first word of the season must cover the center star tile (0, 0).');
      }
    }

    // 2. Geometry check: Must be straight line
    const firstTile = sorted[0];
    const isHorizontal = sorted.every(t => t.y === firstTile.y);
    const isVertical = sorted.every(t => t.x === firstTile.x);

    if (!isHorizontal && !isVertical) {
      errors.push('Tiles must be placed in a single straight line (horizontal or vertical).');
      return { valid: false, errors, wordsFormed: [] };
    }

    const direction = isHorizontal ? 'H' : 'V';

    // 3. Gaps check (combined check: pendingMap or boardState)
    const pendingMap = new Map(sorted.map(t => [`${t.x},${t.y}`, t]));
    const hasAny = (x, y) => pendingMap.has(`${x},${y}`) || boardState.hasTile(x, y);

    if (direction === 'H') {
      const y = firstTile.y;
      for (let x = sorted[0].x; x <= sorted[sorted.length - 1].x; x++) {
        if (!hasAny(x, y)) {
          errors.push('Word placement cannot contain empty gaps.');
          break;
        }
      }
    } else {
      const x = firstTile.x;
      for (let y = sorted[0].y; y <= sorted[sorted.length - 1].y; y++) {
        if (!hasAny(x, y)) {
          errors.push('Word placement cannot contain empty gaps.');
          break;
        }
      }
    }

    // 4. Extract words formed
    const wordsFormed = wordExtractor.extractWords(boardState, sorted);
    if (wordsFormed.length === 0) {
      errors.push('A word must be at least 2 letters long.');
      return { valid: false, errors, wordsFormed: [] };
    }

    // 5. Connectivity check (must connect to at least one existing tile)
    if (!isFirstWord) {
      // An existing tile is one that is NOT in pendingMap
      const connectsToExisting = wordsFormed.some(wf =>
        wf.tiles.some(t => !pendingMap.has(`${t.x},${t.y}`))
      );
      if (!connectsToExisting) {
        errors.push('Your word must connect to an existing word on the board.');
      }
    }

    // 6. Dictionary verification (if dictionary is loaded)
    if (dictionary.isLoaded) {
      for (const wf of wordsFormed) {
        if (!dictionary.isValid(wf.word)) {
          errors.push(`"${wf.word}" is not in the dictionary.`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      wordsFormed
    };
  }
}

const placementValidatorInstance = new PlacementValidator();
export default placementValidatorInstance;
export { PlacementValidator };
