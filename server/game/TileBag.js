import { LETTER_VALUES, LETTER_DISTRIBUTION, WILDCARD_CHAR } from '../../shared/constants.js';

class TileBag {
  constructor() {
    this.letterPool = [];
    this.initializePool();
  }

  initializePool() {
    this.letterPool = [];
    for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
      for (let i = 0; i < count; i++) {
        this.letterPool.push(letter);
      }
    }
  }

  // Draw a single random letter based on weighted distribution
  drawRandomLetter() {
    if (this.letterPool.length === 0) {
      this.initializePool(); // Reshuffle pool if depleted (infinite bag)
    }
    const index = Math.floor(Math.random() * this.letterPool.length);
    return this.letterPool[index];
  }

  // Prevent more than 2 of the same standard letter in a rack
  preventExcessiveDuplicates(rack) {
    let attempts = 0;
    while (attempts < 10) {
      const counts = {};
      for (const tile of rack) {
        counts[tile.letter] = (counts[tile.letter] || 0) + 1;
      }

      let hasExcess = false;
      for (let i = 0; i < rack.length; i++) {
        const tile = rack[i];
        if (counts[tile.letter] > 2) {
          // Redraw this tile
          const newLetter = this.drawRandomLetter();
          rack[i] = {
            letter: newLetter,
            value: LETTER_VALUES[newLetter],
            isWildcard: false
          };
          counts[tile.letter]--;
          counts[newLetter] = (counts[newLetter] || 0) + 1;
          hasExcess = true;
        }
      }

      if (!hasExcess) break;
      attempts++;
    }
    return rack;
  }

  // Generate a brand new rack: 6 standard letters + 1 wildcard
  generateNewRack() {
    const rack = [];
    for (let i = 0; i < 6; i++) {
      const letter = this.drawRandomLetter();
      rack.push({
        letter,
        value: LETTER_VALUES[letter],
        isWildcard: false
      });
    }

    // Limit duplicates of any letter to max 2
    this.preventExcessiveDuplicates(rack);

    // Add 1 wildcard
    rack.push({
      letter: WILDCARD_CHAR,
      value: LETTER_VALUES[WILDCARD_CHAR],
      isWildcard: true
    });
    return rack;
  }

  // Refill a rack to ensure it has 6 standard letters + 1 wildcard
  refillRack(currentTiles) {
    const rack = [...currentTiles];
    
    // Check if wildcard is present (checking that tile is not null first)
    const hasWildcard = rack.some(t => t && (t.isWildcard || t.letter === WILDCARD_CHAR));

    
    // Filter out empty slots (represented by null/undefined or missing elements)
    const activeTiles = rack.filter(t => t !== null && t !== undefined);
    
    // Count current standard letters
    const standardTiles = activeTiles.filter(t => !t.isWildcard && t.letter !== WILDCARD_CHAR);
    
    const newRack = [...standardTiles];
    
    // Draw standard tiles up to 6
    while (newRack.length < 6) {
      const letter = this.drawRandomLetter();
      newRack.push({
        letter,
        value: LETTER_VALUES[letter],
        isWildcard: false
      });
    }

    // Limit duplicates of any letter to max 2
    this.preventExcessiveDuplicates(newRack);
    
    // Ensure exactly 1 wildcard exists
    newRack.push({
      letter: WILDCARD_CHAR,
      value: LETTER_VALUES[WILDCARD_CHAR],
      isWildcard: true
    });
    
    return newRack;
  }

}

const tileBagInstance = new TileBag();
export default tileBagInstance;
