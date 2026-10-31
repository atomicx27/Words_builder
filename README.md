# Words Builder — Infinite Multiplayer Word World

**Live Production Game**: [https://word-builder-6336b.web.app](https://word-builder-6336b.web.app)

Words Builder is a real-time, infinite-board multiplayer crossword game. Players join a shared, continuous 2D board where they place words connecting to existing tiles, customize their profiles, create private rooms with invite codes or play in the Global World, and compete with live board synchronization.

The architecture is built on **Google Firebase (100% Spark Free Tier)**, featuring atomic Firestore transactions for concurrent board updates, live snapshot listeners for instant multi-client synchronization, and client-side authoritative game logic with zero required server maintenance.

---

## 🚀 Key Features

*   **Infinite 2D Board**: A virtually limitless coordinate grid built using a high-performance custom camera renderer (PixiJS v8) supporting responsive pan, zoom, coordinate projection, and dynamic 32×32 chunk loading.
*   **Real-Time Multiplayer Synchronization**: Reactive Cloud Firestore listeners (`onSnapshot`) stream chunk updates, player presence, and score leaderboards across all connected players with sub-second latency.
*   **Atomic Concurrency Control**: All word placements and tile transactions execute inside Firestore `runTransaction()` blocks, preventing race conditions or double-placement collisions even when multiple players submit tiles to the same coordinates simultaneously.
*   **Username-Only Authentication**: Frictionless onboarding allowing players to join by simply entering a username. Profiles and season statistics persist under `players/{username}` with no password or email required.
*   **Comprehensive SOWPODS Dictionary**: 267,751 valid words loaded client-side via optimized Set lookups, providing instant validation and score previews before submitting words.
*   **BINGO Bonus & Multipliers**: Seeded board multipliers (Double Letter, Triple Letter, Double Word, Triple Word) and a **+50 point BINGO bonus** for using all 7 tiles in a single turn.
*   **Room & Season System**: Create custom rooms with private 6-character invite codes or jump straight into the persistent Global World. Each room features customizable round durations, daily word limits, and season resets.
*   **Zero-Maintenance Serverless Infra**: Operates entirely within the Firebase Spark free tier without requiring Cloud Functions or Blaze billing.

---

## 🎮 Game Rules & How to Play

Words Builder adapts classic Scrabble word building into a continuous, real-time infinite board:

*   **Origin Star Placement `(0, 0)`**: The first word in any room or season must cover the center origin tile `(0, 0)`.
*   **The Crossword Rule**: Subsequent words must connect to at least one existing committed tile on the board. All words formed along the primary axis and all intersecting cross-words must be valid words in the SOWPODS dictionary.
*   **Tile Placement & Wildcards**:
    *   Click a tile on your 7-slot rack to select it, then click any empty grid square on the board to place it.
    *   Clicking a placed pending tile returns it to your rack.
    *   Wildcards (`*`) represent any letter `A`–`Z` (worth 0 points) and open an interactive letter selection modal when placed.
*   **Rack Refill**: Your rack is refilled back to 7 tiles (6 weighted standard letters + 1 wildcard) immediately after a successful placement.
*   **Tile Exchange & Shuffle**:
    *   **Shuffle**: Randomizes the order of letters in your rack at any time without penalty.
    *   **Exchange**: Swaps your entire rack for fresh letters (costs 1 daily placement credit).
*   **Daily Word Limits**: Rooms enforce a daily placement limit (default 10 words/day, resetting at UTC midnight) to keep games competitive and balanced.
*   **Seeded Multipliers**:
    *   **DL** (Double Letter Score): 2× letter value.
    *   **TL** (Triple Letter Score): 3× letter value.
    *   **DW** (Double Word Score): 2× total word score.
    *   **TW** (Triple Word Score): 3× total word score.
    *   **BINGO!**: Use all 7 rack tiles in a single placement for an instant **+50 point bonus**.

---

## 🛠️ Technology Stack

### Frontend (Client)
*   **Core**: HTML5, Vanilla CSS3 (Glassmorphic cyber/neon dark aesthetic)
*   **2D Graphics & Camera**: PixiJS v8 (Custom infinite viewport container with pan, zoom, grid tiling, and dirty-chunk batch rendering)
*   **Build System & Bundler**: Vite (ESM bundling with code splitting)
*   **Database & Network**: Firebase JS SDK v13 (Firestore realtime listeners, atomic transactions)
*   **Dictionary**: Client-side SOWPODS dictionary loader (267,751 words)

### Backend & Cloud Infrastructure
*   **Hosting**: Firebase Hosting with global CDN edge caching (`https://word-builder-6336b.web.app`)
*   **Database**: Cloud Firestore (Structured documents for `players`, `sessions`, `seasons`, and coordinate `chunks`)
*   **Security & Guardrails**: Hardened `firestore.rules` enforcing document schemas, monotonic counters, append-only committed chunk tiles, and payload size bounds.

---

## 💻 Local Development Setup

### Prerequisites
*   Node.js (version 18 or higher)
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

3. Configure Environment Variables:
   Copy `.env.example` to `.env.local` and configure your Firebase project credentials (optional for local dev if using Firebase Hosting auto-config):
   ```bash
   cp .env.example .env.local
   ```

### Running the App
Start the Vite local development server:
```bash
npm run dev
```

*   **Local App**: accessible at `http://localhost:5173`

---

## 🧪 Automated Testing Suites

We maintain rigorous white-box and black-box test suites to prevent regressions and verify game rules, network concurrency, and UI responsiveness.

### 1. White-Box Logic & Rule Audit (461 Tests)
Audits the SOWPODS dictionary, letter distribution, rack invariant rules, 4-quadrant chunk coordinate math, geometric placement rules, authoritative `GameEngine` scoring, BINGO bonuses, and username validation:
```bash
npm run test:whitebox
# or: npm test
```

### 2. Black-Box UI & Network Audit (27 Tests)
End-to-end headless browser test verifying DOM loading, auth persistence, modal systems, theme changes, camera zoom/pan, room creation, invite code joins, and 2-player live board synchronization with zero console exceptions:
```bash
npm run test:blackbox
```

### 3. Real Human User Gameplay Simulation
Simulates real human users interacting through genuine DOM clicks on rack tiles, PixiJS canvas coordinates at `(0, 0)` and connecting crossword squares, handling wildcard modals, submitting words, verifying rack refills, joining via invite code on a second browser, and stress testing edge cases:
```bash
npm run test:user
```

---

## ☁️ Deployment Guidelines

The application is deployed to **Firebase Hosting** with Cloud Firestore rules:

### Deploy Hosting & Firestore Rules
```bash
# 1. Build client bundle
npm run build

# 2. Deploy all services (Hosting + Firestore Rules + Indexes)
npm run deploy

# Or deploy individually:
npm run deploy:hosting
npm run deploy:rules
```

---

## 📂 Project Directory Structure

```text
Words_builder/
├── client/
│   ├── index.html              # Main HTML markup and modal structures
│   ├── css/                    # Glassmorphic cyber styles and responsive CSS
│   ├── js/
│   │   ├── board/              # PixiJS BoardRenderer, BoardState, ChunkManager
│   │   ├── firebase/           # Firebase initialization & auto-config
│   │   ├── game/               # SOWPODS Dictionary, GameEngine, TileBag, TileRack, Validator
│   │   ├── network/            # GameRoomService (Firestore real-time & transactions), SessionService
│   │   └── ui/                 # AuthManager, HUD, ActionBar, SessionBrowser, Modals
│   └── public/                 # Static assets (sowpods.txt dictionary)
├── server/
│   └── tests/                  # White-box, black-box, human-play, and E2E simulation suites
├── firestore.rules             # Production security rules and schema enforcement
├── firestore.indexes.json      # Firestore query indexes
├── firebase.json               # Firebase Hosting and Firestore configuration
├── .firebaserc                 # Firebase project target binding
└── package.json                # Project dependencies and test/build scripts
```
