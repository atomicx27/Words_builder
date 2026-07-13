# Words Builder — Task Checklist

## 1. Project Initialization & Git Setup
- [x] Initialize Git repository
- [x] Link to remote: `https://github.com/atomicx27/Words_builder`
- [x] Create `package.json` with dependencies
- [x] Create `vite.config.js`
- [x] Setup folder structure (client, server, shared, data)

## 2. Shared Constants & Dictionary
- [x] Create `shared/constants.js` (letter points, distribution, configurations)
- [x] Fetch or download SOWPODS word list (place in `data/sowpods.txt`)
- [x] Build `server/game/Dictionary.js` with Trie search (O(m) validation + prefix search)

## 3. Database Schema & Setup
- [x] Create `server/db/schema.sql` (libSQL/SQLite schema)
- [x] Create DB connection helper using `@libsql/client` (local `dev.db` by default)
- [x] Implement database initialization scripts

## 4. Server-Side Board State & Game Engine
- [x] Create `server/game/Board.js` (tile grid map, word extraction, adjacencies)
- [x] Create `server/game/TileBag.js` (Scrabble tile distribution)
- [x] Create `server/game/PlayerManager.js` (scores, guest names, daily word counts)
- [x] Create `server/game/GameEngine.js` (authoritative word placement validation, score calculation, limits)

## 5. Colyseus Room Setup
- [x] Create `server/rooms/GameState.js` (Colyseus Schema for tiles, players, config)
- [x] Create `server/rooms/GameRoom.js` (Colyseus Room, connection lifecycle, client events)
- [x] Bootstrap Fastify & Colyseus in `server/index.js`

## 6. Frontend Shell & Themes
- [x] Create `client/index.html` UI structure
- [x] Create `client/styles/main.css` with 4 CSS themes (Neon Dark, Classic, Minimalist, Vibrant)

## 7. PixiJS Rendering Engine & Camera
- [x] Create `client/js/board/BoardRenderer.js` (PixiJS App, tile sprites, animation)
- [x] Integrate `pixi-viewport` for zoom/pan/pinch
- [x] Create `client/js/board/ChunkManager.js` (32x32 chunk loading, seeded bonus squares)
- [x] Create `client/js/board/BoardState.js` (local client-side tile cache)

## 8. Client UI & Interactable Rack
- [x] Create `client/js/game/TileRack.js` (rack rendering, wildcard picker modal)
- [x] Implement placement UX (Desktop: click+type, Mobile: tap+direction+type)
- [x] Create `client/js/game/PlacementValidator.js` & `WordExtractor.js` (client-side pre-checks)
- [x] Create `client/js/game/ScoreCalculator.js` (score preview)

## 9. Client-Server Network Integration
- [x] Create `client/js/network/ColyseusClient.js` (WebSocket messages, chunk subscription)
- [x] Connect client board state with Colyseus room state updates

## 10. HUD, ActionBar & Session Browser
- [x] Create `client/js/ui/HUD.js` (scores, remaining words, season timer)
- [x] Create `client/js/ui/ActionBar.js` (submit, recall, shuffle, exchange)
- [x] Create `client/js/ui/SessionBrowser.js` (list rooms, create custom sessions modal, invite code)
- [x] Create `client/js/ui/ThemePicker.js` (runtime theme toggling)

## 11. Guest Auth & Session API Routes
- [x] Create `server/routes/auth.js` (guest login, JWT setup)
- [x] Create `server/routes/sessions.js` (list, create, edit sessions)
- [x] Create `server/routes/leaderboard.js` (season leaderboards)

## 12. Seasons & Administration
- [x] Create `server/game/SeasonManager.js` (timer, manual reset, archiving snapshots)
- [x] Implement admin controls (ban/kick, configuration)

## 13. End-to-End Verification & Polish
- [x] Test real-time sync with multiple sessions
- [x] Test mobile responsive UI and touches
- [x] Verify dictionary Trie and seeded bonus squares
- [x] Deploy locally and push codebase to Git repository
