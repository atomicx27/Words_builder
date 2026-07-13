import { get, all, run } from '../db/db.js';
import { nanoid } from 'nanoid';
import { SEASON_DURATION_MS } from '../../shared/constants.js';

class SeasonManager {
  // Get the active season for a session, creating one if it doesn't exist
  async getOrCreateActiveSeason(session) {
    const now = Date.now();
    
    // Find active season
    let activeSeason = await get(
      'SELECT * FROM seasons WHERE session_id = ? AND status = \'active\'',
      [session.id]
    );


    if (activeSeason) {
      // Check if expired
      if (now >= activeSeason.end_time) {
        console.log(`Season ${activeSeason.id} has expired. Archiving...`);
        await this.archiveSeason(activeSeason.id);
        activeSeason = await this.startNewSeason(session);
      }
    } else {
      // No active season exists, create one
      activeSeason = await this.startNewSeason(session);
    }

    return {
      id: activeSeason.id,
      sessionId: activeSeason.session_id,
      startTime: activeSeason.start_time,
      endTime: activeSeason.end_time,
      status: activeSeason.status
    };
  }

  // Start a brand-new season
  async startNewSeason(session) {
    const seasonId = nanoid(12);
    const now = Date.now();
    
    // Calculate end time
    const duration = session.config.duration || 'ONE_WEEK';
    const durationMs = SEASON_DURATION_MS[duration] || SEASON_DURATION_MS.ONE_WEEK;
    const endTime = now + durationMs;

    await run(
      `INSERT INTO seasons (id, session_id, start_time, end_time, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [seasonId, session.id, now, endTime]
    );

    console.log(`Started new season ${seasonId} for session ${session.id} (ends ${new Date(endTime).toISOString()}).`);
    
    return {
      id: seasonId,
      session_id: session.id,
      start_time: now,
      end_time: endTime,
      status: 'active'
    };
  }

  // End and archive a season
  async archiveSeason(seasonId) {
    const now = Date.now();

    // 1. Get all tiles placed in this season
    const tiles = await all(
      'SELECT x, y, letter, value, player_id, is_wildcard, placed_at FROM active_tiles WHERE season_id = ?',
      [seasonId]
    );

    const tilesJson = JSON.stringify(tiles);

    // 2. Write snapshot
    await run(
      `INSERT INTO board_snapshots (season_id, tiles_json, created_at)
       VALUES (?, ?, ?)`,
      [seasonId, tilesJson, now]
    );

    // 3. Calculate ranks & update leaderboard
    const scores = await all(
      `SELECT player_id, score FROM season_scores 
       WHERE season_id = ? ORDER BY score DESC`,
      [seasonId]
    );

    for (let i = 0; i < scores.length; i++) {
      const rank = i + 1;
      await run(
        `UPDATE season_scores SET rank = ? 
         WHERE season_id = ? AND player_id = ?`,
        [rank, seasonId, scores[i].player_id]
      );
    }

    // 4. Update season status
    await run(
      'UPDATE seasons SET status = \'archived\' WHERE id = ?',
      [seasonId]
    );


    // 5. Delete active tiles (since they are now in the snapshot)
    await run(
      'DELETE FROM active_tiles WHERE season_id = ?',
      [seasonId]
    );

    console.log(`Season ${seasonId} archived successfully. Snapshot size: ${tiles.length} tiles.`);
  }

  // Increment a player's score for a season
  async addSeasonScore(seasonId, playerId, scoreIncrement) {
    const row = await get(
      'SELECT score, words_placed FROM season_scores WHERE season_id = ? AND player_id = ?',
      [seasonId, playerId]
    );

    if (row) {
      const newScore = row.score + scoreIncrement;
      const newWords = row.words_placed + 1;
      await run(
        `UPDATE season_scores SET score = ?, words_placed = ?
         WHERE season_id = ? AND player_id = ?`,
        [newScore, newWords, seasonId, playerId]
      );
      return { score: newScore, wordsPlaced: newWords };
    } else {
      await run(
        `INSERT INTO season_scores (season_id, player_id, score, words_placed, rank)
         VALUES (?, ?, ?, 1, NULL)`,
        [seasonId, playerId, scoreIncrement]
      );
      return { score: scoreIncrement, wordsPlaced: 1 };
    }
  }

  // Retrieve the leaderboard for a season
  async getLeaderboard(seasonId) {
    const rows = await all(
      `SELECT p.id as playerId, p.display_name as displayName, p.is_guest as isGuest, 
              s.score, s.words_placed as wordsPlaced, s.rank
       FROM season_scores s
       JOIN players p ON s.player_id = p.id
       WHERE s.season_id = ?
       ORDER BY s.score DESC`,
      [seasonId]
    );
    return rows;
  }

  // Get historical archived seasons for a session
  async getArchivedSeasons(sessionId) {
    const rows = await all(
      `SELECT id, start_time as startTime, end_time as endTime 
       FROM seasons WHERE session_id = ? AND status = 'archived'
       ORDER BY start_time DESC`,
      [sessionId]
    );

    return rows;
  }

  // Get snapshot details for an archived season
  async getSnapshot(seasonId) {
    const row = await get(
      'SELECT tiles_json FROM board_snapshots WHERE season_id = ?',
      [seasonId]
    );
    return row ? JSON.parse(row.tiles_json) : null;
  }

  // Force reset a season manually (Admin only)
  async forceResetSeason(session) {
    // Find active season
    const activeSeason = await get(
      'SELECT id FROM seasons WHERE session_id = ? AND status = \'active\'',
      [session.id]
    );


    if (activeSeason) {
      console.log(`Force resetting season ${activeSeason.id} for session ${session.id}...`);
      await this.archiveSeason(activeSeason.id);
    }
    
    // Start a new one
    return await this.startNewSeason(session);
  }
}

const seasonManagerInstance = new SeasonManager();
export default seasonManagerInstance;
export { SeasonManager };
