import sessionManager from '../game/SessionManager.js';

export default async function sessionRoutes(fastify, options) {
  
  // 1. List all public sessions
  fastify.get('/api/sessions', async (request, reply) => {
    try {
      const publicSessions = await sessionManager.getPublicSessions();
      return { sessions: publicSessions };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to retrieve sessions.' });
    }
  });

  // 2. Create custom session
  fastify.post('/api/sessions', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { name, config } = request.body || {};
    const adminPlayerId = request.user.id;

    if (!name) {
      reply.code(400).send({ error: 'Session name is required.' });
      return;
    }

    try {
      const newSession = await sessionManager.createSession(name, adminPlayerId, config || {});
      return { session: newSession };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to create session.' });
    }
  });

  // 3. Get session details by Invite Code
  fastify.get('/api/sessions/code/:code', async (request, reply) => {
    const { code } = request.params;
    
    if (!code) {
      reply.code(400).send({ error: 'Invite code is required.' });
      return;
    }

    try {
      const session = await sessionManager.getSessionByCode(code);
      if (!session) {
        reply.code(404).send({ error: 'Session not found for the given invite code.' });
        return;
      }
      return { session };
    } catch (err) {
      reply.code(500).send({ error: 'Failed to find session.' });
    }
  });

  // 4. Update session configuration (Admin only)
  fastify.patch('/api/sessions/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const { name, config } = request.body || {};
    const playerId = request.user.id;

    try {
      const session = await sessionManager.getSession(id);
      if (!session) {
        reply.code(404).send({ error: 'Session not found.' });
        return;
      }

      // Authorization check
      if (session.adminPlayerId !== playerId) {
        reply.code(403).send({ error: 'Forbidden: You are not the admin of this session.' });
        return;
      }

      const updateData = {};
      if (name) updateData.name = name;
      if (config) Object.assign(updateData, config);

      const success = await sessionManager.updateSessionConfig(id, updateData);
      if (!success) {
        reply.code(500).send({ error: 'Failed to update session settings.' });
        return;
      }

      const updated = await sessionManager.getSession(id);
      return { session: updated };
    } catch (err) {
      reply.code(500).send({ error: 'Error modifying session settings.' });
    }
  });
}
