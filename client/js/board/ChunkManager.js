import boardState from './BoardState.js';
import { CHUNK_SIZE, BONUS_TYPES } from '../../../shared/constants.js';

// Tile render size in pixels
export const TILE_SIZE = 64; 

// Deterministic seed generator matching server logic
export function getBonusType(x, y) {
  if (x === 0 && y === 0) return BONUS_TYPES.NONE;
  const val = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

  if (val < 0.02) return BONUS_TYPES.TW;
  if (val < 0.06) return BONUS_TYPES.DW;
  if (val < 0.11) return BONUS_TYPES.TL;
  if (val < 0.21) return BONUS_TYPES.DL;
  
  return BONUS_TYPES.NONE;
}

class ChunkManager {
  constructor() {
    this.loadedChunks = new Set(); // Stores "chunkX,chunkY" strings
    this.requestedChunks = new Set(); // Stores "chunkX,chunkY" strings to prevent duplicate requests
    this.onChunkDrawCallback = null;
  }

  // Set callback to invoke when a chunk is ready to draw
  onChunkDraw(callback) {
    this.onChunkDrawCallback = callback;
  }

  // Calculate and load visible chunks based on viewport bounds
  updateViewport(bounds, colyseusClient) {
    if (!colyseusClient || !colyseusClient.room) return;

    const chunkPixelSize = CHUNK_SIZE * TILE_SIZE; // 32 * 64 = 2048 pixels

    const minChunkX = Math.floor(bounds.left / chunkPixelSize);
    const maxChunkX = Math.floor(bounds.right / chunkPixelSize);
    const minChunkY = Math.floor(bounds.top / chunkPixelSize);
    const maxChunkY = Math.floor(bounds.bottom / chunkPixelSize);

    // Padding (load 1 extra chunk layer around the viewport for smooth panning)
    const padding = 1;

    for (let cx = minChunkX - padding; cx <= maxChunkX + padding; cx++) {
      for (let cy = minChunkY - padding; cy <= maxChunkY + padding; cy++) {
        const key = `${cx},${cy}`;
        if (!this.loadedChunks.has(key) && !this.requestedChunks.has(key)) {
          this.requestedChunks.add(key);
          // Request chunk data from server
          colyseusClient.room.send('request_chunk', { chunkX: cx, chunkY: cy });
        }
      }
    }
  }

  // Process chunk data returned by server
  onChunkLoaded(chunkX, chunkY, tiles) {
    const key = `${chunkX},${chunkY}`;
    this.loadedChunks.add(key);
    this.requestedChunks.delete(key);

    // Add tiles to local board state
    for (const tile of tiles) {
      boardState.addTile(tile);
    }

    // Trigger redraw for this chunk
    if (this.onChunkDrawCallback) {
      this.onChunkDrawCallback(chunkX, chunkY, tiles);
    }
  }

  // Reset chunk manager (on season reset or room change)
  clear() {
    this.loadedChunks.clear();
    this.requestedChunks.clear();
  }
}

const chunkManagerInstance = new ChunkManager();
export default chunkManagerInstance;
export { ChunkManager };
