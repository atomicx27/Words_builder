# Words Builder — Infinite Multiplayer Word World

Words Builder is a real-time, infinite-board multiplayer word game. Players join a shared, continuous 2D board where they place words connecting to existing tiles, customize their profiles, and compete on a global scale.

## 🚀 Key Features

*   **Infinite 2D Board**: A virtually limitless coordinate grid built using a high-performance custom camera renderer (PixiJS v8) supporting responsive pan, zoom, and dynamic chunk loading.
*   **Real-Time Multiplayer**: WebSocket connections synchronization powered by the Colyseus game server. Placements and exchanges are synced instantly to all connected players.
*   **Authoritative Server Hardening**: 
    *   **Rack Validation**: Placed letters are authoritatively validated against the player's server-side tile rack (supporting wildcard `*` tiles).
    *   **Sequential Placement Queue**: Concurrent overlapping placements are processed sequentially using an in-memory critical section queue (First-Come-First-Served) to eliminate race conditions.
    *   **Spelling Verification**: All placed words are validated using a dictionary Trie loader loading 267,000+ words. Misspelled words are rejected cleanly with no tile loss (reclaimed to rack).
*   **Profile Customization**: Users can edit and update their display usernames in the lobby, which instantly synchronizes across active rooms.
*   **Persistent Storage**: Persistent SQLite-compatible schema storing coordinate data, player profiles, season sessions, and high scores.

---

## 🎮 Game Rules & How to Play

Words Builder adapts Scrabble word building into a continuous, real-time infinite board:

*   **Grid Connections**: The first word of a room must cover the origin star tile `(0,0)`. Subsequent words must connect to at least one existing tile on the board.
*   **The Cross-Word Rule**: Placed tiles must form valid words horizontally or vertically, and *all* adjacent side-words formed as a side-effect must also be valid in the dictionary.
*   **Exchanging Tiles**: You can swap your entire rack of 7 tiles at any time by clicking **Exchange** (costs 1 placement play).
*   **Safe Reclaims**: Rejects misspelled or disconnected words cleanly, returning tiles to the player's rack. Racks are refilled from the bag only after successful placements.
*   **Bingo Bonus**: Place all 7 tiles in a single turn to earn a massive **+50 point Bingo bonus**!
*   **Seeded Multipliers**: Place letters on multiplier squares to amplify your score:
    *   **DL / TL** (Double/Triple Letter Score): Multiplies the points of that single letter tile.
    *   **DW / TW** (Double/Triple Word Score): Multiplies the total score of the entire formed word.

---


## 🛠️ Technology Stack

### Frontend (Client)
*   **Core**: HTML5, Vanilla CSS (Glassmorphic dark design)
*   **Graphics & Viewport**: PixiJS v8 (Custom rendering camera container)
*   **Build System**: Vite (with ESM bundling)
*   **Network**: Colyseus.js client & Fetch API

### Backend (Server)
*   **Runtime**: Node.js
*   **Web Framework**: Fastify (CORS, cookies, routing)
*   **Game Server**: Colyseus (Room management & state sync)
*   **Database**: libSQL client (SQLite/Turso compatible)
*   **Word Validation**: Trie-based dictionary loader

---

## 💻 Local Development Setup

### Prerequisites
*   Node.js (version 18 or higher recommended)
*   npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/atomicx27/Words_builder.git
   cd Words_builder
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
Start the unified dev server (runs Fastify, Colyseus backend, and Vite frontend concurrently):
```bash
npm run dev
```

*   **Frontend**: accessible at [http://localhost:5173](http://localhost:5173)
*   **Backend API/WS**: running on [http://localhost:3001](http://localhost:3001)

---

## 🧪 Running Automated Tests

We maintain robust test suites testing rack checks, concurrent overlap queues, invalid coordinate submissions, and stress validation:

```bash
# Run core game loop & concurrency queue tests
node server/tests/game.test.js

# Run adversarial challenger validation checks
node server/tests/challenger.test.js

# Run thread-concurrency safety stress tests
node server/tests/stress.test.js
```

---

## ☁️ Deployment Guidelines

The codebase is configured for cloud deployment on free tiers:
1.  **Database**: Hosted on [Turso](https://turso.tech) (libSQL).
2.  **Backend Web Service**: Hosted on [Render](https://render.com) (Node/Colyseus WebSocket server).
3.  **Frontend assets**: Hosted on [Cloudflare Pages](https://pages.cloudflare.com) (Vite build folder `dist`).

> [!NOTE]
> For step-by-step instructions on setting up environment variables and building the cloud project, refer to the [Deployment Guide](.gemini/antigravity/brain/f1b799f8-0d3f-46b9-a7d1-77ab6eeff120/deployment_guide.md).
