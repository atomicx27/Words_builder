import colyseus from 'colyseus';
const { Room } = colyseus;

import { GameState, PlayerSchema, SessionConfigSchema } from './GameState.js';
import sessionManager from '../game/SessionManager.js';
import seasonManager from '../game/SeasonManager.js';
import playerManager from '../game/PlayerManager.js';
import gameEngine from '../game/GameEngine.js';
import tileBag from '../game/TileBag.js';
import Board from '../game/Board.js';
import { CLIENT_MESSAGES } from '../../shared/constants.js';

class GameRoom extends Room {
  async onCreate(options) {
    this.sessionId = options.sessionId || 'global';
    console.log(`Creating GameRoom for session ID: ${this.sessionId}`);

    // Load session config
    let session = await sessionManager.getSession(this.sessionId);
    if (!session) {
      // Seed and fetch global session
      await sessionManager.initGlobalSession();
      session = await sessionManager.getSession('global');
    }

    this.sessionConfig = session.config;

    // Load active season
    this.activeSeason = await seasonManager.getOrCreateActiveSeason(session);

    // Initialize board
    this.board = new Board(this.activeSeason.id);
    await this.board.load();

    // Set state
    this.setState(new GameState());
    this.state.seasonEndTime = this.activeSeason.endTime;
    
    // Copy config to state schema
    this.state.sessionConfig.duration = this.sessionConfig.duration;
    this.state.sessionConfig.dailyWordLimit = this.sessionConfig.dailyWordLimit;
    this.state.sessionConfig.dictionary = this.sessionConfig.dictionary;
    this.state.sessionConfig.bonusSquares = this.sessionConfig.bonusSquares;
    this.state.sessionConfig.isPrivate = this.sessionConfig.isPrivate;
    this.state.sessionConfig.name = session.name;

    // Register message handlers
    this.registerMessageHandlers();

    // Set auto-save / snapshot check interval (every 5 minutes)
    this.setSimulationInterval(() => this.checkSeasonExpiration(), 5000);
  }

  // Periodic check for season expiration
  async checkSeasonExpiration() {
    const now = Date.now();
    if (now >= this.activeSeason.endTime) {
      console.log(`Season ${this.activeSeason.id} has expired during gameplay. Archiving...`);
      
      // End season, create new one
      const session = await sessionManager.getSession(this.sessionId);
      this.activeSeason = await seasonManager.getOrCreateActiveSeason(session);
      
      // Load empty board for new season
      this.board = new Board(this.activeSeason.id);
      await this.board.load();

      // Reset state properties
      this.state.tiles.clear();
      this.state.seasonEndTime = this.activeSeason.endTime;

      // Reset player scores in memory
      for (const [playerId, playerSchema] of this.state.players.entries()) {
        playerSchema.score = 0;
        playerSchema.wordsToday = 0;
        
        // Refill player rack
        const player = playerManager.getActivePlayer(playerId);
        if (player) {
          player.score = 0;
          player.wordsToday = 0;
          player.rack = tileBag.generateNewRack();
          const client = this.clients.find(c => c.userData?.playerId === playerId);
          if (client) {
            client.send('new_rack', player.rack);
          }
        }
      }

      // Broadcast season reset
      this.broadcast('season_reset', {
        seasonEndTime: this.activeSeason.endTime
      });
    }
  }

  registerMessageHandlers() {
    // 1. Client requests tiles for a 32x32 chunk
    this.onMessage(CLIENT_MESSAGES.REQUEST_CHUNK, (client, data) => {
      const { chunkX, chunkY } = data;
      const tiles = this.board.getChunk(chunkX, chunkY);
      client.send('chunk_data', { chunkX, chunkY, tiles });
    });

    // 2. Client submits a word placement
    this.onMessage(CLIENT_MESSAGES.PLACE_WORD, async (client, data) => {
      const playerId = client.userData.playerId;
      const player = playerManager.getActivePlayer(playerId);
      const pendingTiles = data.tiles;

      if (!player) {
        client.send('placement_error', { error: 'Player session not found.' });
        return;
      }

      // Authoritative verification and scoring
      const result = await gameEngine.validateAndScorePlacement(
        this.board,
        player,
        pendingTiles,
        this.sessionConfig
      );

      if (!result.valid) {
        client.send('placement_error', { error: result.error });
        return;
      }

      const now = Date.now();
      const placedTiles = result.placedTiles.map(t => ({
        ...t,
        playerId,
        placedAt: now
      }));

      // Commit tiles to board (DB + memory)
      await this.board.placeTiles(placedTiles);

      // Increment score in DB and memory
      const dbScore = await seasonManager.addSeasonScore(this.activeSeason.id, playerId, result.score);
      player.score = dbScore.score;
      playerManager.incrementWordCount(playerId);

      // Update state schema for delta sync
      const playerSchema = this.state.players.get(playerId);
      if (playerSchema) {
        playerSchema.score = player.score;
        playerSchema.wordsToday = player.wordsToday;
      }

      // Remove placed tiles from server-side player rack
      for (const tile of pendingTiles) {
        if (tile.rackIndex !== undefined && tile.rackIndex >= 0 && tile.rackIndex < player.rack.length) {
          player.rack[tile.rackIndex] = null;
        }
      }

      // Refill player's tile rack
      player.rack = tileBag.refillRack(player.rack);


      // Send success response to placer with their new rack and score breakdown
      client.send('placement_success', {
        rack: player.rack,
        score: player.score,
        wordsToday: player.wordsToday,
        wordsFormed: result.wordsFormed
      });

      // Broadcast newly placed tiles to everyone in the room
      this.broadcast('tiles_placed', {
        tiles: placedTiles,
        score: result.score,
        playerId,
        displayName: player.displayName
      });
    });

    // 3. Client exchanges tile rack (costs 1 daily word allowance)
    this.onMessage(CLIENT_MESSAGES.EXCHANGE_TILES, (client) => {
      const playerId = client.userData.playerId;
      const player = playerManager.getActivePlayer(playerId);

      if (!player) return;

      const dailyLimit = this.sessionConfig.dailyWordLimit ?? 10;
      const isUnlimited = dailyLimit === 'Unlimited' || dailyLimit <= 0;

      if (!isUnlimited && player.wordsToday >= dailyLimit) {
        client.send('placement_error', { error: 'Cannot exchange tiles: Daily limit reached.' });
        return;
      }

      // Generate a brand new rack
      player.rack = tileBag.generateNewRack();
      playerManager.incrementWordCount(playerId);

      // Update schema
      const playerSchema = this.state.players.get(playerId);
      if (playerSchema) {
        playerSchema.wordsToday = player.wordsToday;
      }

      client.send('placement_success', {
        rack: player.rack,
        score: player.score,
        wordsToday: player.wordsToday,
        wordsFormed: [] // No words formed
      });
    });

    // 4. Force reset season (Admin only)
    this.onMessage(CLIENT_MESSAGES.ADMIN_RESET, async (client) => {
      const playerId = client.userData.playerId;
      const session = await sessionManager.getSession(this.sessionId);
      
      if (!session || session.adminPlayerId !== playerId) {
        client.send('admin_error', { error: 'Unauthorized: Admin privileges required.' });
        return;
      }

      this.activeSeason = await seasonManager.forceResetSeason(session);
      
      // Reset board memory
      this.board = new Board(this.activeSeason.id);
      await this.board.load();

      // Reset state properties
      this.state.tiles.clear();
      this.state.seasonEndTime = this.activeSeason.endTime;

      // Reset players in state
      for (const [pId, playerSchema] of this.state.players.entries()) {
        playerSchema.score = 0;
        playerSchema.wordsToday = 0;
        const p = playerManager.getActivePlayer(pId);
        if (p) {
          p.score = 0;
          p.wordsToday = 0;
          p.rack = tileBag.generateNewRack();
          const cl = this.clients.find(c => c.userData?.playerId === pId);
          if (cl) {
            cl.send('new_rack', p.rack);
          }
        }
      }

      this.broadcast('season_reset', {
        seasonEndTime: this.activeSeason.endTime
      });
    });

    // 5. Change display name (real-time sync)
    this.onMessage('change_username', (client, data) => {
      const { displayName } = data;
      const playerId = client.userData.playerId;

      const playerSchema = this.state.players.get(playerId);
      if (playerSchema && displayName) {
        playerSchema.displayName = displayName;
        console.log(`Real-time username sync: Player ${playerId} changed name to ${displayName}`);
      }
    });
  }


  async onJoin(client, options) {
    const { playerId } = options;
    console.log(`Client connected: ${client.sessionId} (Player ID: ${playerId})`);
    
    // Store playerId on the connection metadata
    client.userData = { playerId };

    // Load or create player in database
    let player = await playerManager.loadPlayer(playerId);
    if (!player) {
      player = await playerManager.createGuestPlayer(playerId);
    }

    // Load their season score
    const scores = await seasonManager.getLeaderboard(this.activeSeason.id);
    const scoreRecord = scores.find(s => s.playerId === playerId);
    player.score = scoreRecord ? scoreRecord.score : 0;
    player.wordsToday = scoreRecord ? scoreRecord.wordsPlaced : 0;

    // Add to schema
    const playerSchema = new PlayerSchema(
      player.displayName,
      player.score,
      player.wordsToday,
      true
    );
    this.state.players.set(playerId, playerSchema);

    // Send initial rack directly to client
    client.send('new_rack', player.rack);
  }

  onLeave(client, consented) {
    const playerId = client.userData?.playerId;
    if (!playerId) return;

    console.log(`Client disconnected: ${client.sessionId} (Player ID: ${playerId})`);
    
    playerManager.setOffline(playerId);

    const playerSchema = this.state.players.get(playerId);
    if (playerSchema) {
      playerSchema.isOnline = false;
    }
  }
}

export default GameRoom;
export { GameRoom };
