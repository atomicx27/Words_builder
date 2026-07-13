import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import colyseus from 'colyseus';
import wsTransport from '@colyseus/ws-transport';
import jwt from 'jsonwebtoken';

const { Server } = colyseus;
const { WebSocketTransport } = wsTransport;

const JWT_SECRET = process.env.JWT_SECRET || 'words-builder-secret-key-2026';

// Database & Game imports
import { initDb } from './db/db.js';
import dictionary from './game/Dictionary.js';
import sessionManager from './game/SessionManager.js';
import GameRoom from './rooms/GameRoom.js';

// Route imports
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import leaderboardRoutes from './routes/leaderboard.js';

const fastify = Fastify({ logger: true });

// Setup global authentication decorator
fastify.decorate('authenticate', async (request, reply) => {
  try {
    let token = request.headers.authorization;
    if (token && token.startsWith('Bearer ')) {
      token = token.substring(7);
    } else if (request.cookies.token) {
      token = request.cookies.token;
    }

    if (!token) {
      reply.code(401).send({ error: 'Authentication token missing.' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    request.user = {
      id: decoded.sub,
      displayName: decoded.displayName,
      isGuest: decoded.isGuest
    };
  } catch (err) {
    reply.code(401).send({ error: 'Invalid or expired token.' });
  }
});


// Setup plugins
await fastify.register(cors, {
  origin: true, // Allow all origins in dev, can lock down in production env
  credentials: true
});

await fastify.register(cookie, {
  secret: 'words-builder-cookie-signing-key-2026',
  hook: 'onRequest'
});

// Register routes
await fastify.register(authRoutes);
await fastify.register(sessionRoutes);
await fastify.register(leaderboardRoutes);

// Health check route
fastify.get('/api/health', async () => {
  return { status: 'healthy', timestamp: Date.now() };
});

// Setup Colyseus Game Server mounted on Fastify's HTTP server
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: fastify.server
  })
});

// Define Colyseus Rooms
gameServer.define('game_room', GameRoom);

// Start server
const start = async () => {
  try {
    console.log('Initializing database...');
    await initDb();

    console.log('Loading dictionary Trie (this may take a few seconds)...');
    await dictionary.init();

    console.log('Seeding default sessions...');
    await sessionManager.initGlobalSession();

    const port = process.env.PORT || 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Words Builder Backend Server is listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
