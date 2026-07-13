import { get, run } from '../db/db.js';
import tileBag from './TileBag.js';
import { DEFAULT_DAILY_LIMIT } from '../../shared/constants.js';

class PlayerManager {
  constructor() {
    this.activePlayers = new Map(); // key: playerId -> player object
  }

  // Generate a random guest name
  generateGuestName() {
    const nouns = ['Scribe', 'Lexicon', 'Speller', 'Grammar', 'Vowel', 'Syntax', 'Glyph', 'Bard', 'Scholar', 'Poet'];
    const adjectives = ['Swift', 'Clever', 'Bright', 'Glow', 'Cyber', 'Neon', 'Silent', 'Witty', 'Bold', 'Epic'];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${adj}${noun}_${rand}`;
  }

  // Create a new guest player in DB
  async createGuestPlayer(playerId) {
    const displayName = this.generateGuestName();
    const now = Date.now();
    
    await run(
      `INSERT INTO players (id, display_name, email, password_hash, is_guest, created_at) 
       VALUES (?, ?, NULL, NULL, 1, ?)`,
      [playerId, displayName, now]
    );

    // Create default rack and save it in memory/state
    const initialRack = tileBag.generateNewRack();
    
    const player = {
      id: playerId,
      displayName,
      isGuest: true,
      score: 0,
      wordsToday: 0,
      lastResetTime: now,
      rack: initialRack,
      isOnline: true
    };
    
    this.activePlayers.set(playerId, player);
    return player;
  }

  // Load player from database
  async loadPlayer(playerId) {
    // If already active in memory, return it
    if (this.activePlayers.has(playerId)) {
      const player = this.activePlayers.get(playerId);
      player.isOnline = true;
      this.checkDailyLimitReset(player);
      return player;
    }

    const row = await get('SELECT * FROM players WHERE id = ?', [playerId]);
    if (!row) return null;

    // Default values if no active session
    const player = {
      id: row.id,
      displayName: row.display_name,
      isGuest: row.is_guest === 1,
      score: 0, // Loads from season score later
      wordsToday: 0,
      lastResetTime: Date.now(),
      rack: tileBag.generateNewRack(), // Default rack, will be overwritten by active session if exists
      isOnline: true
    };

    this.checkDailyLimitReset(player);
    this.activePlayers.set(playerId, player);
    return player;
  }

  // Verify daily limit and reset if it's a new day (midnight UTC)
  checkDailyLimitReset(player) {
    const now = new Date();
    const lastReset = new Date(player.lastResetTime);
    
    // Check if day, month, or year in UTC has changed
    const dayChanged = now.getUTCDate() !== lastReset.getUTCDate() ||
                       now.getUTCMonth() !== lastReset.getUTCMonth() ||
                       now.getUTCFullYear() !== lastReset.getUTCFullYear();

    if (dayChanged) {
      player.wordsToday = 0;
      player.lastResetTime = Date.now();
    }
  }

  // Get active player from memory
  getActivePlayer(playerId) {
    const player = this.activePlayers.get(playerId);
    if (player) {
      this.checkDailyLimitReset(player);
    }
    return player;
  }

  // Increment word count for today
  incrementWordCount(playerId) {
    const player = this.getActivePlayer(playerId);
    if (player) {
      player.wordsToday++;
    }
  }

  // Set player offline
  setOffline(playerId) {
    const player = this.activePlayers.get(playerId);
    if (player) {
      player.isOnline = false;
    }
  }

  // Update display name
  async updateDisplayName(playerId, newName) {
    await run('UPDATE players SET display_name = ? WHERE id = ?', [newName, playerId]);
    const player = this.activePlayers.get(playerId);
    if (player) {
      player.displayName = newName;
    }
  }
}

const playerManagerInstance = new PlayerManager();
export default playerManagerInstance;
