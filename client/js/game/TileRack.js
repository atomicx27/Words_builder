import boardState from '../board/BoardState.js';
import boardRenderer from '../board/BoardRenderer.js';
import { WILDCARD_CHAR } from '../../../shared/constants.js';

class TileRack {
  constructor() {
    this.tiles = Array(7).fill(null); // Local copy of 7 tiles: { letter, value, isWildcard, isPlaced }
    this.selectedIndex = -1; // Index of selected tile in rack (-1 if none)
    this.onRackChangeCallback = null;
  }

  // Set callback on rack mutations
  onRackChange(callback) {
    this.onRackChangeCallback = callback;
  }

  // Set rack tiles from server message
  setTiles(newTiles) {
    this.selectedIndex = -1;
    this.tiles = newTiles.map((tile, index) => {
      if (!tile) return null;
      return {
        letter: tile.letter,
        value: tile.value,
        isWildcard: tile.isWildcard,
        isPlaced: false,
        rackIndex: index
      };
    });
    this.render();
    if (this.onRackChangeCallback) this.onRackChangeCallback();
  }

  // Draw tile rack UI in DOM
  render() {
    const rackEl = document.getElementById('tile-rack');
    rackEl.innerHTML = '';

    this.tiles.forEach((tile, index) => {
      const slot = document.createElement('div');
      slot.className = 'rack-tile-slot';
      slot.setAttribute('data-index', index);

      if (tile && !tile.isPlaced) {
        const tileEl = document.createElement('div');
        tileEl.className = `tile ${tile.isWildcard ? 'wildcard' : ''} ${this.selectedIndex === index ? 'selected' : ''}`;
        tileEl.setAttribute('data-index', index);
        
        const letter = document.createElement('span');
        letter.className = 'tile-letter';
        letter.textContent = tile.letter;
        tileEl.appendChild(letter);

        if (tile.value > 0) {
          const value = document.createElement('span');
          value.className = 'tile-value';
          value.textContent = tile.value;
          tileEl.appendChild(value);
        }

        // Click handler to select
        tileEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectTile(index);
        });

        slot.appendChild(tileEl);
      }

      rackEl.appendChild(slot);
    });
  }

  // Handle tile selection logic
  selectTile(index) {
    if (index === this.selectedIndex) {
      // Toggle off
      this.selectedIndex = -1;
    } else {
      this.selectedIndex = index;
    }
    this.render();
  }

  // Get selected tile data
  getSelectedTile() {
    if (this.selectedIndex >= 0 && this.selectedIndex < 7) {
      return this.tiles[this.selectedIndex];
    }
    return null;
  }

  // Mark a tile as placed on the board
  markPlaced(index) {
    if (this.tiles[index]) {
      this.tiles[index].isPlaced = true;
      this.selectedIndex = -1;
      this.render();
      if (this.onRackChangeCallback) this.onRackChangeCallback();
    }
  }

  // Mark a tile as returned from the board
  markReturned(index, originalLetter = WILDCARD_CHAR) {
    if (this.tiles[index]) {
      this.tiles[index].isPlaced = false;
      // If it was a wildcard, revert its letter representation back to "*"
      if (this.tiles[index].isWildcard) {
        this.tiles[index].letter = originalLetter;
      }
      this.render();
      if (this.onRackChangeCallback) this.onRackChangeCallback();
    }
  }

  // Recall all pending tiles back to rack
  recallAll() {
    const pending = boardState.clearPendingTiles();
    for (const tile of pending) {
      this.markReturned(tile.rackIndex);
    }
    boardRenderer.drawPendingTiles();
    if (this.onRackChangeCallback) this.onRackChangeCallback();
  }

  // Local rack shuffling
  shuffle() {
    // Collect unplaced tiles
    const unplacedIndices = [];
    this.tiles.forEach((tile, index) => {
      if (tile && !tile.isPlaced) {
        unplacedIndices.push(index);
      }
    });

    // Shuffle their positions in the rack array
    if (unplacedIndices.length > 1) {
      const originalTiles = [...this.tiles];
      
      // Fisher-Yates shuffle on indices
      for (let i = unplacedIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const idxI = unplacedIndices[i];
        const idxJ = unplacedIndices[j];
        
        // Swap values
        const temp = this.tiles[idxI];
        this.tiles[idxI] = this.tiles[idxJ];
        this.tiles[idxJ] = temp;
      }

      // Re-map rackIndices to their new indices
      this.tiles.forEach((tile, index) => {
        if (tile) tile.rackIndex = index;
      });
    }

    this.selectedIndex = -1;
    this.render();
  }

  // Reset/clear rack state
  clear() {
    this.tiles = Array(7).fill(null);
    this.selectedIndex = -1;
    this.render();
  }
}

const tileRackInstance = new TileRack();
export default tileRackInstance;
export { TileRack };
