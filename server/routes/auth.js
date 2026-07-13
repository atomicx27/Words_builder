import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { get, run } from '../db/db.js';
import playerManager from '../game/PlayerManager.js';

const JWT_SECRET = process.env.JWT_SECRET || 'words-builder-secret-key-2026';

export default async function authRoutes(fastify, options) {
  
  // Helper: Generate JWT token
  const generateToken = (player) => {
    return jwt.sign(
      { 
        sub: player.id, 
        displayName: player.displayName, 
        isGuest: player.isGuest 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
  };

  // 1. Generate or load Guest Account

  fastify.post('/api/auth/guest', async (request, reply) => {
    const { playerId } = request.body || {};
    let player;

    if (playerId) {
      // Load existing
      player = await playerManager.loadPlayer(playerId);
    }

    if (!player) {
      // Create new guest
      const newId = 'guest_' + nanoid(12);
      player = await playerManager.createGuestPlayer(newId);
    }

    const token = generateToken(player);
    
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return {
      token,
      player: {
        id: player.id,
        displayName: player.displayName,
        isGuest: player.isGuest
      }
    };
  });

  // 2. Register Guest Account
  fastify.post('/api/auth/register', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { email, password, displayName } = request.body || {};
    const playerId = request.user.id;

    if (!email || !password || !displayName) {
      reply.code(400).send({ error: 'Missing required fields (email, password, displayName).' });
      return;
    }

    // Check if email already taken
    const existing = await get('SELECT id FROM players WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      reply.code(400).send({ error: 'Email address is already in use.' });
      return;
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // Upgrade guest player row
    await run(
      `UPDATE players 
       SET display_name = ?, email = ?, password_hash = ?, is_guest = 0
       WHERE id = ?`,
      [displayName, email.toLowerCase(), passwordHash, playerId]
    );

    // Update PlayerManager memory cache
    const activePlayer = playerManager.getActivePlayer(playerId);
    if (activePlayer) {
      activePlayer.displayName = displayName;
      activePlayer.isGuest = false;
    }

    const updatedPlayer = {
      id: playerId,
      displayName,
      isGuest: false
    };

    const token = generateToken(updatedPlayer);

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60
    });

    return {
      token,
      player: updatedPlayer
    };
  });

  // 3. Login to registered Account
  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password) {
      reply.code(400).send({ error: 'Missing email or password.' });
      return;
    }

    const row = await get('SELECT * FROM players WHERE email = ?', [email.toLowerCase()]);
    if (!row) {
      reply.code(400).send({ error: 'Invalid email address or password.' });
      return;
    }

    // Verify password
    const match = bcrypt.compareSync(password, row.password_hash);
    if (!match) {
      reply.code(400).send({ error: 'Invalid email address or password.' });
      return;
    }

    const player = {
      id: row.id,
      displayName: row.display_name,
      isGuest: row.is_guest === 1
    };

    const token = generateToken(player);

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60
    });

    return {
      token,
      player
    };
  });

  // 4. Verify token and return user details
  fastify.get('/api/auth/me', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    return { player: request.user };
  });
}
