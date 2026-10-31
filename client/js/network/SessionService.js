import {
  doc, getDoc, getDocs, collection, query, where, limit,
  runTransaction, setDoc
} from 'firebase/firestore';
import { getDb } from '../firebase/firebase.js';
import { SEASON_DURATION_MS } from '../../../shared/constants.js';

// Firestore data model
// ────────────────────
// players/{playerId}                                   username-only "accounts"
// sessions/{sessionId}                                 world config + pointer to current season
// sessions/{sessionId}/seasons/{seasonId}              season meta (end time, tileCount, lastPlacement)
// sessions/{sessionId}/seasons/{seasonId}/chunks/{cx_cy}   32x32 board chunk, tiles stored as a map
// sessions/{sessionId}/seasons/{seasonId}/players/{playerId}  per-season score, rack, daily count

export const GLOBAL_SESSION_ID = 'global';

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

export function randomId(length = 12, alphabet = ALPHANUM) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const sessionRef = (sessionId) => doc(getDb(), 'sessions', sessionId);
export const seasonRef = (sessionId, seasonId) => doc(getDb(), 'sessions', sessionId, 'seasons', seasonId);
export const chunksCol = (sessionId, seasonId) => collection(getDb(), 'sessions', sessionId, 'seasons', seasonId, 'chunks');
export const chunkRef = (sessionId, seasonId, chunkId) => doc(chunksCol(sessionId, seasonId), chunkId);
export const seasonPlayersCol = (sessionId, seasonId) => collection(getDb(), 'sessions', sessionId, 'seasons', seasonId, 'players');
export const seasonPlayerRef = (sessionId, seasonId, playerId) => doc(seasonPlayersCol(sessionId, seasonId), playerId);

function toSession(snap) {
  const data = snap.data();
  return { id: snap.id, ...data };
}

class SessionService {
  // Create the shared Global World session the first time anyone enters it
  async ensureGlobalSession() {
    const ref = sessionRef(GLOBAL_SESSION_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) return toSession(snap);

    const config = {
      name: 'Global World',
      duration: 'ONE_WEEK',
      dailyWordLimit: '10',
      dictionary: 'SOWPODS',
      bonusSquares: true,
      isPrivate: false
    };

    try {
      await setDoc(ref, {
        name: 'Global World',
        inviteCode: 'GLOBAL',
        isPrivate: false,
        adminPlayerId: 'system',
        config,
        createdAt: Date.now(),
        currentSeasonId: null,
        seasonEndTime: 0
      }, { merge: true });
    } catch (err) {
      console.warn('ensureGlobalSession notice:', err);
    }

    return toSession(await getDoc(ref));
  }

  async getSession(sessionId) {
    const snap = await getDoc(sessionRef(sessionId));
    return snap.exists() ? toSession(snap) : null;
  }

  async getSessionByCode(inviteCode) {
    const q = query(
      collection(getDb(), 'sessions'),
      where('inviteCode', '==', inviteCode.toUpperCase()),
      limit(1)
    );
    const res = await getDocs(q);
    return res.empty ? null : toSession(res.docs[0]);
  }

  async getPublicSessions() {
    const q = query(collection(getDb(), 'sessions'), where('isPrivate', '==', false));
    const res = await getDocs(q);
    return res.docs
      .map(toSession)
      .filter(s => s.id !== GLOBAL_SESSION_ID)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async createSession(name, adminPlayerId, config = {}) {
    const sessionId = randomId(12);
    const inviteCode = sessionId.substring(0, 6).toUpperCase();

    const finalConfig = {
      name,
      duration: config.duration || 'ONE_WEEK',
      dailyWordLimit: config.dailyWordLimit !== undefined ? String(config.dailyWordLimit) : '10',
      dictionary: config.dictionary || 'SOWPODS',
      bonusSquares: config.bonusSquares !== false,
      isPrivate: config.isPrivate === true
    };

    const session = {
      name,
      inviteCode,
      isPrivate: finalConfig.isPrivate,
      adminPlayerId,
      config: finalConfig,
      createdAt: Date.now(),
      currentSeasonId: null,
      seasonEndTime: 0
    };

    await setDoc(sessionRef(sessionId), session);
    return { id: sessionId, ...session };
  }

  /**
   * Make sure the session has a live (non-expired) season. Archives the old one if needed.
   * Safe to call concurrently from many clients — the transaction guarantees only one rollover.
   *
   * @param {string} sessionId
   * @param {{force?: boolean, expectedSeasonId?: string}} opts
   *   force + expectedSeasonId: admin reset — rolls over only if the season is still `expectedSeasonId`.
   */
  async ensureActiveSeason(sessionId, { force = false, expectedSeasonId = null } = {}) {
    const sRef = sessionRef(sessionId);

    return runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(sRef);
      if (!snap.exists()) throw new Error('Session not found.');
      const session = snap.data();
      const now = Date.now();

      const hasSeason = !!session.currentSeasonId;
      const expired = hasSeason && now >= session.seasonEndTime;
      const forced = force && hasSeason && session.currentSeasonId === expectedSeasonId;

      if (hasSeason && !expired && !forced) {
        return { seasonId: session.currentSeasonId, endTime: session.seasonEndTime, rolledOver: false };
      }

      if (hasSeason) {
        tx.update(seasonRef(sessionId, session.currentSeasonId), {
          status: 'archived',
          archivedAt: now
        });
      }

      const durationMs = SEASON_DURATION_MS[session.config?.duration] || SEASON_DURATION_MS.ONE_WEEK;
      const newSeasonId = randomId(12);
      const endTime = now + durationMs;

      tx.set(seasonRef(sessionId, newSeasonId), {
        startTime: now,
        endTime,
        status: 'active',
        tileCount: 0,
        lastPlacement: null
      });
      tx.update(sRef, { currentSeasonId: newSeasonId, seasonEndTime: endTime });

      return { seasonId: newSeasonId, endTime, rolledOver: true };
    });
  }
}

const sessionServiceInstance = new SessionService();
export default sessionServiceInstance;
export { SessionService };
