export const LETTER_VALUES = {
  'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4, 'I': 1,
  'J': 8, 'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3, 'Q': 10, 'R': 1,
  'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4, 'Z': 10,
  '*': 0 // Wildcard tile has 0 value
};

export const LETTER_DISTRIBUTION = {
  'A': 9, 'B': 2, 'C': 2, 'D': 4, 'E': 12, 'F': 2, 'G': 3, 'H': 2, 'I': 9,
  'J': 1, 'K': 1, 'L': 4, 'M': 2, 'N': 6, 'O': 8, 'P': 2, 'Q': 1, 'R': 6,
  'S': 4, 'T': 6, 'U': 4, 'V': 2, 'W': 2, 'X': 1, 'Y': 2, 'Z': 1
};

export const RACK_SIZE = 7;
export const WILDCARD_CHAR = '*';
export const CHUNK_SIZE = 32;

export const BONUS_TYPES = {
  NONE: 'NONE',
  DL: 'DL', // Double Letter
  TL: 'TL', // Triple Letter
  DW: 'DW', // Double Word
  TW: 'TW'  // Triple Word
};

export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 2.0;

export const DEFAULT_DAILY_LIMIT = 10;

export const SEASON_DURATIONS = {
  THREE_DAYS: 'THREE_DAYS',
  ONE_WEEK: 'ONE_WEEK',
  TWO_WEEKS: 'TWO_WEEKS',
  ONE_MONTH: 'ONE_MONTH'
};

export const SEASON_DURATION_MS = {
  THREE_DAYS: 3 * 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  TWO_WEEKS: 14 * 24 * 60 * 60 * 1000,
  ONE_MONTH: 30 * 24 * 60 * 60 * 1000
};

export const COLYSEUS_ROOM_NAME = 'game_room';

// Event message types
export const CLIENT_MESSAGES = {
  PLACE_WORD: 'place_word',
  EXCHANGE_TILES: 'exchange_tiles',
  SET_WILDCARD: 'set_wildcard',
  REQUEST_CHUNK: 'request_chunk',
  ADMIN_RESET: 'admin_reset',
  ADMIN_KICK: 'admin_kick'
};
