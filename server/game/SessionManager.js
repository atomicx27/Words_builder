import { get, all, run } from '../db/db.js';
import { nanoid } from 'nanoid';

class SessionManager {
  // Ensure that the special Global World session exists in DB
  async initGlobalSession() {
    const globalId = 'global';
    const row = await get('SELECT id FROM sessions WHERE id = ?', [globalId]);
    
    if (!row) {
      console.log('Seeding Global World session into database...');
      const config = {
        name: 'Global World',
        duration: 'ONE_WEEK',
        dailyWordLimit: '10',
        dictionary: 'SOWPODS',
        bonusSquares: true,
        isPrivate: false
      };

      await run(
        `INSERT INTO sessions (id, name, invite_code, admin_player_id, config_json, created_at)
         VALUES (?, ?, ?, 'system', ?, ?)`,
        [globalId, 'Global World', 'GLOBAL', JSON.stringify(config), Date.now()]
      );
    }
  }

  // Create a new custom session
  async createSession(name, adminPlayerId, config) {
    const sessionId = nanoid(12);
    const inviteCode = nanoid(6).toUpperCase(); // 6-character alphanumeric code
    const now = Date.now();

    const finalConfig = {
      name,
      duration: config.duration || 'ONE_WEEK',
      dailyWordLimit: config.dailyWordLimit !== undefined ? String(config.dailyWordLimit) : '10',
      dictionary: config.dictionary || 'SOWPODS',
      bonusSquares: config.bonusSquares !== false,
      isPrivate: config.isPrivate === true
    };

    await run(
      `INSERT INTO sessions (id, name, invite_code, admin_player_id, config_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        name,
        inviteCode,
        adminPlayerId,
        JSON.stringify(finalConfig),
        now
      ]
    );

    return {
      id: sessionId,
      name,
      inviteCode,
      adminPlayerId,
      config: finalConfig,
      createdAt: now
    };
  }

  // Fetch session details by ID
  async getSession(sessionId) {
    const row = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      inviteCode: row.invite_code,
      adminPlayerId: row.admin_player_id,
      config: JSON.parse(row.config_json),
      createdAt: row.created_at
    };
  }

  // Fetch session details by invite code
  async getSessionByCode(inviteCode) {
    const row = await get('SELECT * FROM sessions WHERE invite_code = ?', [inviteCode.toUpperCase()]);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      inviteCode: row.invite_code,
      adminPlayerId: row.admin_player_id,
      config: JSON.parse(row.config_json),
      createdAt: row.created_at
    };
  }

  // List public sessions (invite_code != 'GLOBAL' and isPrivate = false)
  async getPublicSessions() {
    const rows = await all('SELECT * FROM sessions WHERE invite_code != \'GLOBAL\'');

    const sessions = [];
    for (const row of rows) {
      const config = JSON.parse(row.config_json);
      if (!config.isPrivate) {
        sessions.push({
          id: row.id,
          name: row.name,
          inviteCode: row.invite_code,
          adminPlayerId: row.admin_player_id,
          config,
          createdAt: row.created_at
        });
      }
    }
    return sessions;
  }

  // Update session settings (Admin only)
  async updateSessionConfig(sessionId, newConfig) {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    const mergedConfig = { ...session.config, ...newConfig };
    
    await run(
      'UPDATE sessions SET config_json = ?, name = ? WHERE id = ?',
      [JSON.stringify(mergedConfig), mergedConfig.name, sessionId]
    );
    return true;
  }
}

const sessionManagerInstance = new SessionManager();
export default sessionManagerInstance;
export { SessionManager };
