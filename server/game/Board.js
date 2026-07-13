import { run, all } from '../db/db.js';
import { CHUNK_SIZE } from '../../shared/constants.js';

class Board {
  constructor(seasonId) {
    this.seasonId = seasonId;
    this.tiles = new Map(); // key: "x,y" -> tile object
  }

  // Load all tiles for this season from database
  async load() {
    this.tiles.clear();
    const rows = await all(
      'SELECT * FROM active_tiles WHERE season_id = ?', 
      [this.seasonId]
    );
    
    for (const row of rows) {
      this.tiles.set(`${row.x},${row.y}`, {
        x: row.x,
        y: row.y,
        letter: row.letter,
        value: row.value,
        playerId: row.player_id,
        isWildcard: row.is_wildcard === 1,
        placedAt: row.placed_at
      });
    }
    console.log(`Loaded ${this.tiles.size} tiles for season ${this.seasonId} from database.`);
  }

  // Check if board is empty
  isEmpty() {
    return this.tiles.size === 0;
  }

  // Get tile at coordinates
  getTile(x, y) {
    return this.tiles.get(`${x},${y}`);
  }

  // Check if tile exists at coordinates
  hasTile(x, y) {
    return this.tiles.has(`${x},${y}`);
  }

  // Place tiles on the board (persisted in DB and in-memory)
  async placeTiles(placedTiles) {
    for (const tile of placedTiles) {
      const key = `${tile.x},${tile.y}`;
      this.tiles.set(key, tile);
      
      // Persist to DB
      await run(
        `INSERT OR REPLACE INTO active_tiles (season_id, x, y, letter, value, player_id, is_wildcard, placed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.seasonId,
          tile.x,
          tile.y,
          tile.letter,
          tile.value,
          tile.playerId,
          tile.isWildcard ? 1 : 0,
          tile.placedAt
        ]
      );
    }
  }

  // Get all tiles within a 32x32 chunk
  getChunk(chunkX, chunkY) {
    const startX = chunkX * CHUNK_SIZE;
    const endX = (chunkX + 1) * CHUNK_SIZE - 1;
    const startY = chunkY * CHUNK_SIZE;
    const endY = (chunkY + 1) * CHUNK_SIZE - 1;
    
    const chunkTiles = [];
    
    // Scan our in-memory board (highly optimized compared to database queries)
    for (const tile of this.tiles.values()) {
      if (tile.x >= startX && tile.x <= endX && tile.y >= startY && tile.y <= endY) {
        chunkTiles.push(tile);
      }
    }
    
    return chunkTiles;
  }

  // Fetch all tiles as an array
  getAllTiles() {
    return Array.from(this.tiles.values());
  }

  // Clear all tiles (on season reset)
  async clear() {
    this.tiles.clear();
    await run('DELETE FROM active_tiles WHERE season_id = ?', [this.seasonId]);
  }
}

export default Board;
