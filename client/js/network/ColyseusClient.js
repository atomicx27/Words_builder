import * as Colyseus from 'colyseus.js';
import chunkManager from '../board/ChunkManager.js';
import boardState from '../board/BoardState.js';
import boardRenderer from '../board/BoardRenderer.js';
import tileRack from '../game/TileRack.js';
import { CLIENT_MESSAGES } from '../../../shared/constants.js';
import { BACKEND_URL } from './config.js';

class ColyseusClient {
  constructor() {
    // Convert HTTP protocol of BACKEND_URL to WS protocol
    const wsUrl = BACKEND_URL.replace(/^http/, 'ws');
    
    this.endpoint = wsUrl;
    console.log(`Connecting to Colyseus endpoint: ${this.endpoint}`);
    
    this.client = new Colyseus.Client(this.endpoint);

    this.room = null;
    
    // Status callbacks
    this.onStateChangeCallback = null;
    this.onMessageCallback = null;
  }

  // Bind state and message listeners
  onStateChange(callback) {
    this.onStateChangeCallback = callback;
  }

  onMessageReceived(callback) {
    this.onMessageCallback = callback;
  }

  // Join or Create a game session
  async joinSession(sessionId, playerId) {
    try {
      if (this.room) {
        await this.room.leave();
      }

      console.log(`Joining session: ${sessionId} for player: ${playerId}`);
      this.room = await this.client.joinOrCreate('game_room', {
        sessionId,
        playerId
      });

      console.log(`Successfully joined room: ${this.room.id}`);
      this.setupRoomListeners();

      return this.room;
    } catch (error) {
      console.error('Failed to join game session:', error);
      throw error;
    }
  }

  setupRoomListeners() {
    if (!this.room) return;

    // 1. Direct message: new tile rack sent by server
    this.room.onMessage('new_rack', (rack) => {
      console.log('Received new tile rack:', rack);
      tileRack.setTiles(rack);
    });

    // 2. Direct message: chunk data requested by viewport
    this.room.onMessage('chunk_data', (data) => {
      const { chunkX, chunkY, tiles } = data;
      chunkManager.onChunkLoaded(chunkX, chunkY, tiles);
    });

    // 3. Broadcast message: another player placed a word
    this.room.onMessage('tiles_placed', (data) => {
      const { tiles, score, displayName } = data;
      console.log(`Tiles placed by ${displayName}:`, tiles);
      
      // Add tiles to local board state
      for (const tile of tiles) {
        boardState.addTile(tile);
      }

      // Re-draw board at pending container index
      boardRenderer.redrawChunksForTiles(tiles);
      boardRenderer.drawPendingTiles();

      // Trigger custom UI notification
      if (this.onMessageCallback) {
        this.onMessageCallback('tiles_placed', { displayName, score, tiles });
      }
    });

    // 4. Direct message: client placement accepted
    this.room.onMessage('placement_success', (data) => {
      const { rack, score, wordsToday, wordsFormed } = data;
      console.log('Placement successful! New rack:', rack);

      // Lock new tiles on board
      const pending = boardState.getPendingTilesArray();
      for (const tile of pending) {
        // Find user letter (revert wildcard representation if necessary)
        const updatedTile = {
          ...tile,
          isPending: false
        };
        boardState.addTile(updatedTile);
      }

      boardState.pendingTiles.clear();
      boardRenderer.redrawChunksForTiles(pending);
      boardRenderer.drawPendingTiles();

      // Set new rack
      tileRack.setTiles(rack);

      if (this.onMessageCallback) {
        this.onMessageCallback('placement_success', { score, wordsToday, wordsFormed });
      }
    });


    // 5. Direct message: client placement rejected
    this.room.onMessage('placement_error', (data) => {
      const { error } = data;
      console.warn('Placement rejected:', error);

      // Reclaim tiles back to rack
      tileRack.recallAll();

      if (this.onMessageCallback) {
        this.onMessageCallback('placement_error', { error });
      }
    });

    // 6. Broadcast message: season has reset
    this.room.onMessage('season_reset', (data) => {
      const { seasonEndTime } = data;
      console.log('Season has reset! Reloading board...');

      boardState.clearAll();
      boardRenderer.clear();
      tileRack.selectedIndex = -1;

      this.room.state.seasonEndTime = seasonEndTime;

      if (this.onMessageCallback) {
        this.onMessageCallback('season_reset', { seasonEndTime });
      }
    });

    // 7. Direct message: admin error
    this.room.onMessage('admin_error', (data) => {
      const { error } = data;
      if (this.onMessageCallback) {
        this.onMessageCallback('admin_error', { error });
      }
    });

    // Schema sync listener: Player joins, leaves, or scores change
    this.room.onStateChange((state) => {
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(state);
      }
    });
  }

  // Send a word placement request
  submitWord(tiles) {
    if (!this.room) return;
    this.room.send(CLIENT_MESSAGES.PLACE_WORD, { tiles });
  }

  // Send a tile exchange request
  exchangeTiles() {
    if (!this.room) return;
    this.room.send(CLIENT_MESSAGES.EXCHANGE_TILES);
  }

  // Send an admin manual reset request
  adminReset() {
    if (!this.room) return;
    this.room.send(CLIENT_MESSAGES.ADMIN_RESET);
  }

  // Disconnect from room
  leave() {
    if (this.room) {
      this.room.leave();
      this.room = null;
    }
  }
}

const colyseusClientInstance = new ColyseusClient();
// Bind globally so BoardRenderer can access it for chunk requests on viewport drag
window.colyseusClientInstance = colyseusClientInstance;

export default colyseusClientInstance;
export { ColyseusClient };
