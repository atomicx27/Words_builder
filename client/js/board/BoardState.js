class BoardState {
  constructor() {
    this.tiles = new Map(); // key: "x,y" -> permanent Tile
    this.pendingTiles = new Map(); // key: "x,y" -> pending Tile { letter, value, isWildcard, rackIndex }
  }

  // Get tile at coordinate (checks pending first, then permanent)
  getTile(x, y) {
    const key = `${x},${y}`;
    if (this.pendingTiles.has(key)) {
      return { ...this.pendingTiles.get(key), isPending: true };
    }
    const tile = this.tiles.get(key);
    return tile ? { ...tile, isPending: false } : null;
  }

  // Check if tile exists at coordinate
  hasTile(x, y) {
    const key = `${x},${y}`;
    return this.pendingTiles.has(key) || this.tiles.has(key);
  }

  // Add permanent tile (synced from server)
  addTile(tile) {
    const key = `${tile.x},${tile.y}`;
    this.tiles.set(key, tile);
    
    // If a permanent tile lands on top of a pending tile, remove the pending one
    if (this.pendingTiles.has(key)) {
      this.pendingTiles.delete(key);
    }
  }

  // Remove permanent tile
  removeTile(x, y) {
    this.tiles.delete(`${x},${y}`);
  }

  // Add a pending tile placed by current player
  setPendingTile(x, y, letter, value, isWildcard, rackIndex) {
    const key = `${x},${y}`;
    this.pendingTiles.set(key, {
      x,
      y,
      letter,
      value,
      isWildcard,
      rackIndex
    });
  }

  // Remove a pending tile
  removePendingTile(x, y) {
    const key = `${x},${y}`;
    const tile = this.pendingTiles.get(key);
    if (tile) {
      this.pendingTiles.delete(key);
      return tile;
    }
    return null;
  }

  // Get all pending tiles as an array
  getPendingTilesArray() {
    return Array.from(this.pendingTiles.values());
  }

  // Clear all pending tiles (returns them so they can be added back to the rack)
  clearPendingTiles() {
    const pending = Array.from(this.pendingTiles.values());
    this.pendingTiles.clear();
    return pending;
  }

  // Check if the board is empty
  isEmpty() {
    return this.tiles.size === 0 && this.pendingTiles.size === 0;
  }

  // Clear everything (on season resets)
  clearAll() {
    this.tiles.clear();
    this.pendingTiles.clear();
  }
}

const boardStateInstance = new BoardState();
export default boardStateInstance;
export { BoardState };
