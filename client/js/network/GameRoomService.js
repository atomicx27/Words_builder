import {
  doc, collection, onSnapshot, runTransaction, getDoc, setDoc, updateDoc
} from 'firebase/firestore';
import { getDb } from '../firebase/firebase.js';
import sessionService, {
  sessionRef, seasonRef, chunkRef, seasonPlayerRef, seasonPlayersCol
} from './SessionService.js';
import tileBag from '../game/TileBag.js';
import gameEngine from '../game/GameEngine.js';
import tileRack from '../game/TileRack.js';
import chunkManager from '../board/ChunkManager.js';
import boardState from '../board/BoardState.js';
import boardRenderer from '../board/BoardRenderer.js';
import { CHUNK_SIZE } from '../../../shared/constants.js';

function getUtcDayKey(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class GameRoomService {
  constructor() {
    this.sessionId = null;
    this.seasonId = null;
    this.playerId = null;
    this.sessionData = null;
    this.seasonData = null;
    this.seasonPlayer = null;

    // Unsubscribe functions for active Firestore listeners
    this.unsubs = [];
    this.chunkUnsubs = new Map(); // "cx_cy" -> unsub function

    // Callbacks matching the former Colyseus client contract
    this.onStateChangeCallback = null;
    this.onMessageCallback = null;

    // Simulated room object to keep HUD / Board interactions fully compatible
    this.room = {
      id: null,
      state: {
        players: new Map(),
        sessionConfig: {
          name: 'World',
          dailyWordLimit: '10',
          duration: 'ONE_WEEK',
          dictionary: 'SOWPODS',
          bonusSquares: true,
          isPrivate: false
        },
        seasonEndTime: 0
      },
      send: (type, data) => {
        if (type === 'request_chunk') {
          this.requestChunk(data.chunkX, data.chunkY);
        } else if (type === 'change_username') {
          this.changeUsername(data.displayName);
        }
      }
    };

    // Heartbeat timer for player presence
    this.presenceInterval = null;
    this.lastProcessedPlacementTime = 0;
  }

  onStateChange(callback) {
    this.onStateChangeCallback = callback;
  }

  onMessageReceived(callback) {
    this.onMessageCallback = callback;
  }

  emitMessage(event, data) {
    if (this.onMessageCallback) {
      try {
        this.onMessageCallback(event, data);
      } catch (err) {
        console.error('Error in onMessageCallback:', err);
      }
    }
  }

  emitStateChange() {
    if (this.onStateChangeCallback) {
      try {
        this.onStateChangeCallback(this.room.state);
      } catch (err) {
        console.error('Error in onStateChangeCallback:', err);
      }
    }
  }

  async joinSession(sessionId, playerId) {
    this.leave();

    this.sessionId = sessionId;
    this.playerId = playerId;
    this.room.id = sessionId;

    console.log(`[GameRoomService] Joining session "${sessionId}" as player "${playerId}"...`);

    // 1. Ensure Global session exists if entering global
    if (sessionId === 'global') {
      await sessionService.ensureGlobalSession();
    }

    // 2. Ensure an active season exists
    const active = await sessionService.ensureActiveSeason(sessionId);
    this.seasonId = active.seasonId;
    this.room.state.seasonEndTime = active.endTime;

    // 3. Load or initialize player record for this season
    await this.initSeasonPlayer();

    // 4. Attach real-time listeners (Session, Season, Players)
    this.listenToSession();
    this.listenToSeason();
    this.listenToPlayers();

    // 5. Start presence heartbeat (every 30s)
    this.startPresenceHeartbeat();

    console.log(`[GameRoomService] Successfully joined room "${sessionId}" (Season: ${this.seasonId})`);
    return this.room;
  }

  async initSeasonPlayer() {
    const db = getDb();
    const pRef = seasonPlayerRef(this.sessionId, this.seasonId, this.playerId);
    const snap = await getDoc(pRef);
    const todayKey = getUtcDayKey();
    const now = Date.now();

    const storedUser = window.playerSession?.displayName || this.playerId;

    if (snap.exists()) {
      const data = snap.data();
      const needsDayReset = data.dayKey !== todayKey;
      const updatedWordsToday = needsDayReset ? 0 : data.wordsToday;
      const updatedRack = data.rack && data.rack.length > 0 ? data.rack : tileBag.generateNewRack();

      this.seasonPlayer = {
        ...data,
        displayName: storedUser,
        wordsToday: updatedWordsToday,
        dayKey: todayKey,
        rack: updatedRack,
        lastSeen: now
      };

      await updateDoc(pRef, {
        displayName: storedUser,
        wordsToday: updatedWordsToday,
        dayKey: todayKey,
        rack: updatedRack,
        lastSeen: now
      });
    } else {
      const initialRack = tileBag.generateNewRack();
      this.seasonPlayer = {
        playerId: this.playerId,
        displayName: storedUser,
        score: 0,
        wordsPlaced: 0,
        wordsToday: 0,
        dayKey: todayKey,
        rack: initialRack,
        lastSeen: now,
        createdAt: now
      };
      await setDoc(pRef, this.seasonPlayer);
    }

    // Feed player rack to local TileRack
    tileRack.setTiles(this.seasonPlayer.rack);
  }

  listenToSession() {
    const ref = sessionRef(this.sessionId);
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      this.sessionData = data;

      // Update room schema config
      if (data.config) {
        Object.assign(this.room.state.sessionConfig, data.config);
      }
      this.room.state.sessionConfig.name = data.name || this.room.state.sessionConfig.name;
      this.room.state.seasonEndTime = data.seasonEndTime || 0;

      // Check for season rollover (new season started)
      if (data.currentSeasonId && data.currentSeasonId !== this.seasonId) {
        console.log(`[GameRoomService] Season changed from ${this.seasonId} to ${data.currentSeasonId}!`);
        this.seasonId = data.currentSeasonId;
        this.clearChunkSubscriptions();
        boardState.clearAll();
        boardRenderer.clear();
        tileRack.clear();

        await this.initSeasonPlayer();
        this.listenToSeason();
        this.listenToPlayers();

        this.emitMessage('season_reset', { seasonEndTime: data.seasonEndTime });
      }

      this.emitStateChange();
    }, (err) => console.error('Error in session snapshot listener:', err));

    this.unsubs.push(unsub);
  }

  listenToSeason() {
    const ref = seasonRef(this.sessionId, this.seasonId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      this.seasonData = data;

      // Check for another player's word placement
      const lp = data.lastPlacement;
      if (lp && lp.at && lp.at > this.lastProcessedPlacementTime) {
        this.lastProcessedPlacementTime = lp.at;
        // Don't toast ourselves, since we already got immediate local placement feedback
        if (lp.playerId !== this.playerId) {
          this.emitMessage('tiles_placed', {
            playerId: lp.playerId,
            displayName: lp.displayName,
            score: lp.score,
            tiles: []
          });
        }
      }
    }, (err) => console.error('Error in season snapshot listener:', err));

    this.unsubs.push(unsub);
  }

  listenToPlayers() {
    const col = seasonPlayersCol(this.sessionId, this.seasonId);
    const unsub = onSnapshot(col, (snap) => {
      const now = Date.now();
      const playersMap = new Map();

      snap.forEach((docSnap) => {
        const p = docSnap.data();
        const isOnline = (now - (p.lastSeen || 0)) < 90000; // active in last 90 seconds
        playersMap.set(p.playerId, {
          displayName: p.displayName || p.playerId,
          score: Math.round(p.score || 0),
          wordsToday: Math.round(p.wordsToday || 0),
          isOnline: isOnline
        });

        if (p.playerId === this.playerId) {
          this.seasonPlayer = p;
        }
      });

      this.room.state.players = playersMap;
      this.emitStateChange();
    }, (err) => console.error('Error in season players listener:', err));

    this.unsubs.push(unsub);
  }

  // Real-time chunk loader
  requestChunk(cx, cy) {
    if (!this.sessionId || !this.seasonId) {
      return;
    }
    const key = `${cx}_${cy}`;
    if (this.chunkUnsubs.has(key)) return;

    const ref = chunkRef(this.sessionId, this.seasonId, key);
    const unsub = onSnapshot(ref, (snap) => {
      let tilesArray = [];
      if (snap.exists()) {
        const data = snap.data();
        if (data && data.tiles) {
          tilesArray = Object.values(data.tiles);
        }
      }
      chunkManager.onChunkLoaded(cx, cy, tilesArray);
    }, (err) => {
      console.warn(`Error loading chunk ${key}:`, err);
    });

    this.chunkUnsubs.set(key, unsub);
  }

  clearChunkSubscriptions() {
    for (const unsub of this.chunkUnsubs.values()) {
      try { unsub(); } catch (_) {}
    }
    this.chunkUnsubs.clear();
  }

  startPresenceHeartbeat() {
    if (this.presenceInterval) clearInterval(this.presenceInterval);
    this.presenceInterval = setInterval(async () => {
      if (!this.sessionId || !this.seasonId || !this.playerId) return;
      try {
        const pRef = seasonPlayerRef(this.sessionId, this.seasonId, this.playerId);
        await updateDoc(pRef, { lastSeen: Date.now() });
      } catch (err) {
        // Silent fail on heartbeat
      }
    }, 30000);
  }

  // Change username in real-time
  async changeUsername(newDisplayName) {
    if (!newDisplayName || !this.sessionId || !this.seasonId || !this.playerId) return;
    try {
      const pRef = seasonPlayerRef(this.sessionId, this.seasonId, this.playerId);
      await updateDoc(pRef, { displayName: newDisplayName, lastSeen: Date.now() });
    } catch (err) {
      console.warn('Failed to update displayName in current season:', err);
    }
  }

  // Submit word placement via atomic transaction
  async submitWord(pendingTiles) {
    if (!this.sessionId || !this.seasonId || !this.playerId) {
      this.emitMessage('placement_error', { error: 'Not connected to a game room.' });
      return;
    }

    try {
      const db = getDb();
      const pRef = seasonPlayerRef(this.sessionId, this.seasonId, this.playerId);
      const sRef = seasonRef(this.sessionId, this.seasonId);

      // Group placed tiles by chunk ID (cx_cy) and include adjacent boundary chunks
      const chunkKeys = new Set();
      for (const t of pendingTiles) {
        const cx = Math.floor(t.x / CHUNK_SIZE);
        const cy = Math.floor(t.y / CHUNK_SIZE);
        chunkKeys.add(`${cx}_${cy}`);
        const modX = ((t.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const modY = ((t.y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        if (modX === 0) chunkKeys.add(`${cx - 1}_${cy}`);
        if (modX === CHUNK_SIZE - 1) chunkKeys.add(`${cx + 1}_${cy}`);
        if (modY === 0) chunkKeys.add(`${cx}_${cy - 1}`);
        if (modY === CHUNK_SIZE - 1) chunkKeys.add(`${cx}_${cy + 1}`);
      }

      const txResult = await runTransaction(db, async (tx) => {
        // 1. Read player doc
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) throw new Error('Player profile not found in season.');
        const playerData = pSnap.data();

        // 2. Read season doc
        const sSnap = await tx.get(sRef);
        if (!sSnap.exists()) throw new Error('Active season not found.');
        const sData = sSnap.data();
        if (sData.status !== 'active') throw new Error('Season has ended.');

        // 3. Read relevant chunks
        const chunksData = new Map();
        for (const cKey of chunkKeys) {
          const cRef = chunkRef(this.sessionId, this.seasonId, cKey);
          const cSnap = await tx.get(cRef);
          chunksData.set(cKey, cSnap.exists() ? cSnap.data() : { cx: parseInt(cKey.split('_')[0]), cy: parseInt(cKey.split('_')[1]), tiles: {} });
        }

        // Helper: retrieve committed tile from read chunks or local board
        const getCommittedTile = (x, y) => {
          const cx = Math.floor(x / CHUNK_SIZE);
          const cy = Math.floor(y / CHUNK_SIZE);
          const cKey = `${cx}_${cy}`;
          const c = chunksData.get(cKey);
          if (c && c.tiles) {
            const t = c.tiles[`${x}_${y}`];
            if (t) return t;
          }
          return boardState.getPermanentTile(x, y);
        };

        const isFirstWord = (sData.tileCount || 0) === 0;

        // 4. Validate & calculate score using authoritative engine
        const dailyLimit = this.sessionData?.config?.dailyWordLimit ?? '10';
        const vResult = gameEngine.validateAndScorePlacement({
          getTile: getCommittedTile,
          isFirstWord,
          rack: playerData.rack,
          pendingTiles,
          dailyLimit,
          wordsToday: playerData.wordsToday || 0
        });

        if (!vResult.valid) {
          throw new Error(vResult.error);
        }

        const now = Date.now();
        const placedWithMeta = vResult.placedTiles.map(t => ({
          x: Math.round(t.x),
          y: Math.round(t.y),
          letter: t.letter,
          value: Math.round(t.value),
          isWildcard: !!t.isWildcard,
          playerId: this.playerId,
          placedAt: now
        }));

        // 5. Commit tiles to chunks
        for (const tile of placedWithMeta) {
          const cx = Math.floor(tile.x / CHUNK_SIZE);
          const cy = Math.floor(tile.y / CHUNK_SIZE);
          const cKey = `${cx}_${cy}`;
          const cData = chunksData.get(cKey) || { cx, cy, tiles: {} };
          if (!cData.tiles) cData.tiles = {};
          cData.tiles[`${tile.x}_${tile.y}`] = tile;
        }

        for (const [cKey, cData] of chunksData.entries()) {
          const cRef = chunkRef(this.sessionId, this.seasonId, cKey);
          tx.set(cRef, {
            cx: Math.round(cData.cx),
            cy: Math.round(cData.cy),
            tiles: cData.tiles
          }, { merge: true });
        }

        // 6. Refill player rack & increment score/counts
        const remainingRack = [...playerData.rack];
        for (const rIdx of vResult.usedRackIndices) {
          remainingRack[rIdx] = null;
        }
        const newRack = tileBag.refillRack(remainingRack);

        const newScore = Math.round((playerData.score || 0) + vResult.score);
        const newWordsPlaced = Math.round((playerData.wordsPlaced || 0) + 1);
        const newWordsToday = Math.round((playerData.wordsToday || 0) + 1);

        tx.update(pRef, {
          score: newScore,
          wordsPlaced: newWordsPlaced,
          wordsToday: newWordsToday,
          rack: newRack,
          lastSeen: now
        });

        // 7. Update season meta (tileCount + lastPlacement)
        const newTileCount = Math.round((sData.tileCount || 0) + placedWithMeta.length);
        const wordsList = vResult.wordsFormed.map(w => w.word).slice(0, 20);

        tx.update(sRef, {
          tileCount: newTileCount,
          lastPlacement: {
            playerId: this.playerId,
            displayName: playerData.displayName || this.playerId,
            score: Math.round(vResult.score),
            words: wordsList,
            at: now
          }
        });

        return {
          score: newScore,
          wordsToday: newWordsToday,
          wordsFormed: vResult.wordsFormed,
          rack: newRack,
          placedTiles: placedWithMeta
        };
      });

      // Update local board state immediately
      for (const t of txResult.placedTiles) {
        boardState.addTile(t);
      }
      boardState.clearPendingTiles();
      boardRenderer.redrawChunksForTiles(txResult.placedTiles);
      boardRenderer.drawPendingTiles();

      // Update player rack
      tileRack.setTiles(txResult.rack);
      if (this.seasonPlayer) {
        this.seasonPlayer.rack = txResult.rack;
      }

      // Emit success
      this.emitMessage('placement_success', {
        score: txResult.score,
        wordsToday: txResult.wordsToday,
        wordsFormed: txResult.wordsFormed,
        rack: txResult.rack
      });

    } catch (err) {
      console.warn('[GameRoomService] Word placement rejected:', err);
      tileRack.recallAll();
      this.emitMessage('placement_error', { error: err.message || 'Placement error.' });
    }
  }

  // Exchange all tiles for a fresh rack (costs 1 placement play)
  async exchangeTiles() {
    if (!this.sessionId || !this.seasonId || !this.playerId) return;

    try {
      const db = getDb();
      const pRef = seasonPlayerRef(this.sessionId, this.seasonId, this.playerId);

      const result = await runTransaction(db, async (tx) => {
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) throw new Error('Player profile not found.');
        const pData = pSnap.data();

        const dailyLimit = this.sessionData?.config?.dailyWordLimit ?? '10';
        const isUnlimited = dailyLimit === 'Unlimited' || Number(dailyLimit) <= 0;

        if (!isUnlimited && (pData.wordsToday || 0) >= Number(dailyLimit)) {
          throw new Error('Cannot exchange tiles: Daily placement limit reached.');
        }

        const newRack = tileBag.generateNewRack();
        const updatedWordsToday = Math.round((pData.wordsToday || 0) + 1);

        tx.update(pRef, {
          rack: newRack,
          wordsToday: updatedWordsToday,
          lastSeen: Date.now()
        });

        return {
          rack: newRack,
          score: Math.round(pData.score || 0),
          wordsToday: updatedWordsToday
        };
      });

      tileRack.setTiles(result.rack);
      if (this.seasonPlayer) {
        this.seasonPlayer.rack = result.rack;
      }
      this.emitMessage('placement_success', {
        score: result.score,
        wordsToday: result.wordsToday,
        wordsFormed: [],
        rack: result.rack
      });
    } catch (err) {
      this.emitMessage('placement_error', { error: err.message || 'Failed to exchange tiles.' });
    }
  }

  // Admin force season reset
  async adminReset() {
    if (!this.sessionId || !this.seasonId) return;
    try {
      await sessionService.ensureActiveSeason(this.sessionId, {
        force: true,
        expectedSeasonId: this.seasonId
      });
    } catch (err) {
      this.emitMessage('admin_error', { error: err.message || 'Failed to reset season.' });
    }
  }

  leave() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    for (const unsub of this.unsubs) {
      try { unsub(); } catch (_) {}
    }
    this.unsubs = [];
    this.clearChunkSubscriptions();

    this.sessionId = null;
    this.seasonId = null;
    this.room.id = null;
  }
}

const gameRoomServiceInstance = new GameRoomService();
window.colyseusClientInstance = gameRoomServiceInstance; // keep backward compatibility for BoardRenderer
export default gameRoomServiceInstance;
export { GameRoomService };
