import { getBonusType } from '../board/ChunkManager.js';
import { LETTER_VALUES, BONUS_TYPES } from '../../../shared/constants.js';

class ScoreCalculator {
  calculateScore(pendingTiles, wordsFormed) {
    if (pendingTiles.length === 0 || wordsFormed.length === 0) {
      return { score: 0, breakdown: [] };
    }

    let totalScore = 0;
    const breakdown = [];

    for (const wf of wordsFormed) {
      let wordScore = 0;
      let wordMultiplier = 1;

      for (const tile of wf.tiles) {
        // Is this a newly placed pending tile?
        const isNew = pendingTiles.some(t => t.x === tile.x && t.y === tile.y);
        
        let letterVal = LETTER_VALUES[tile.letter] ?? 0;
        if (tile.isWildcard) {
          letterVal = 0; // Wildcard is worth 0 points
        }

        if (isNew) {
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
      breakdown.push({
        word: wf.word,
        score: wordScore,
        lengthMultiplier
      });
    }

    // Bingo bonus: all 7 rack tiles used in a single play
    if (pendingTiles.length >= 7) {
      totalScore += 50;
      breakdown.push({
        word: 'BINGO!',
        score: 50,
        lengthMultiplier: 1.0
      });
    }

    return {
      score: totalScore,
      breakdown
    };
  }
}

const scoreCalculatorInstance = new ScoreCalculator();
export default scoreCalculatorInstance;
export { ScoreCalculator };
