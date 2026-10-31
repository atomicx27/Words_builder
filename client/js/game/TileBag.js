import { LETTER_VALUES, LETTER_DISTRIBUTION, WILDCARD_CHAR } from '../../../shared/constants.js';

// Infinite weighted tile bag (ported from the former Node server).
class TileBag {
  constructor() {
    this.letterPool = [];
    for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
      for (let i = 0; i < count; i++) {
        this.letterPool.push(letter);
      }
    }
  }

  // Draw a single random letter based on weighted distribution
  drawRandomLetter() {
    const index = Math.floor(Math.random() * this.letterPool.length);
    return this.letterPool[index];
  }

  makeTile(letter) {
    return { letter, value: LETTER_VALUES[letter], isWildcard: false };
  }

  makeWildcard() {
    return { letter: WILDCARD_CHAR, value: LETTER_VALUES[WILDCARD_CHAR], isWildcard: true };
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
          const newLetter = this.drawRandomLetter();
          rack[i] = this.makeTile(newLetter);
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
      rack.push(this.makeTile(this.drawRandomLetter()));
    }
    this.preventExcessiveDuplicates(rack);
    rack.push(this.makeWildcard());
    return rack;
  }

  // Refill a rack (with null holes for used tiles) back to 6 standard letters + 1 wildcard
  refillRack(currentTiles) {
    const standardTiles = currentTiles.filter(
      t => t && !t.isWildcard && t.letter !== WILDCARD_CHAR
    );

    const newRack = standardTiles.map(t => ({ letter: t.letter, value: t.value, isWildcard: false }));
    while (newRack.length < 6) {
      newRack.push(this.makeTile(this.drawRandomLetter()));
    }

    this.preventExcessiveDuplicates(newRack);
    newRack.push(this.makeWildcard());
    return newRack;
  }
}

const tileBagInstance = new TileBag();
export default tileBagInstance;
export { TileBag };
