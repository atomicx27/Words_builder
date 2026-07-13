-- Players table (supports guests and registered users)
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,
    is_guest INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- Game Sessions table (global world plus custom sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    admin_player_id TEXT,
    config_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Seasons table (tracks time periods of a board for a session)
CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'ended', 'archived')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Season Scores (tracks leaderboard stats per player per season)
CREATE TABLE IF NOT EXISTS season_scores (
    season_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    words_placed INTEGER NOT NULL DEFAULT 0,
    rank INTEGER,
    PRIMARY KEY (season_id, player_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Board Snapshots (stores completed board state when a season ends)
CREATE TABLE IF NOT EXISTS board_snapshots (
    season_id TEXT PRIMARY KEY,
    tiles_json TEXT NOT NULL, -- Compressed / full JSON representation of all placed tiles
    created_at INTEGER NOT NULL,
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
);

-- Active Tiles (persists tiles of active seasons in real-time)
CREATE TABLE IF NOT EXISTS active_tiles (
    season_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    letter TEXT NOT NULL,
    value INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    is_wildcard INTEGER NOT NULL DEFAULT 0,
    placed_at INTEGER NOT NULL,
    PRIMARY KEY (season_id, x, y),
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_invite_code ON sessions(invite_code);
CREATE INDEX IF NOT EXISTS idx_seasons_session_active ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_scores_season_score ON season_scores(season_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_active_tiles_coords ON active_tiles(season_id, x, y);

