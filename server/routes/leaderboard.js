import seasonManager from '../game/SeasonManager.js';

export default async function leaderboardRoutes(fastify, options) {
  
  // 1. Get leaderboard for a specific season
  fastify.get('/api/leaderboard/:seasonId', async (request, reply) => {
    const { seasonId } = request.params;
    try {
      const standings = await seasonManager.getLeaderboard(seasonId);
      return { leaderboard: standings };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to retrieve leaderboard.' });
    }
  });

  // 2. Get all archived seasons for a session
  fastify.get('/api/leaderboard/session/:sessionId/seasons', async (request, reply) => {
    const { sessionId } = request.params;
    try {
      const archives = await seasonManager.getArchivedSeasons(sessionId);
      return { seasons: archives };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to retrieve archived seasons.' });
    }
  });

  // 3. Get board snapshot for an archived season
  fastify.get('/api/leaderboard/season/:seasonId/snapshot', async (request, reply) => {
    const { seasonId } = request.params;
    try {
      const snapshot = await seasonManager.getSnapshot(seasonId);
      if (!snapshot) {
        reply.code(404).send({ error: 'Season snapshot not found.' });
        return;
      }
      return { snapshot };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to retrieve season board snapshot.' });
    }
  });
}
