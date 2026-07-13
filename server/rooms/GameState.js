import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

export class TileSchema extends Schema {
  constructor(letter = '', value = 0, playerId = '', isWildcard = false, placedAt = 0) {
    super();
    this.letter = letter;
    this.value = value;
    this.playerId = playerId;
    this.isWildcard = isWildcard;
    this.placedAt = placedAt;
  }
}
defineTypes(TileSchema, {
  letter: 'string',
  value: 'number',
  playerId: 'string',
  isWildcard: 'boolean',
  placedAt: 'number'
});

export class PlayerSchema extends Schema {
  constructor(displayName = '', score = 0, wordsToday = 0, isOnline = true) {
    super();
    this.displayName = displayName;
    this.score = score;
    this.wordsToday = wordsToday;
    this.isOnline = isOnline;
  }
}
defineTypes(PlayerSchema, {
  displayName: 'string',
  score: 'number',
  wordsToday: 'number',
  isOnline: 'boolean'
});

export class SessionConfigSchema extends Schema {
  constructor() {
    super();
    this.duration = 'ONE_WEEK';
    this.dailyWordLimit = '10';
    this.dictionary = 'SOWPODS';
    this.bonusSquares = true;
    this.isPrivate = false;
    this.name = 'Global World';
  }
}
defineTypes(SessionConfigSchema, {
  duration: 'string',
  dailyWordLimit: 'string',
  dictionary: 'string',
  bonusSquares: 'boolean',
  isPrivate: 'boolean',
  name: 'string'
});

export class GameState extends Schema {
  constructor() {
    super();
    this.tiles = new MapSchema();
    this.players = new MapSchema();
    this.seasonEndTime = 0;
    this.sessionConfig = new SessionConfigSchema();
  }
}
defineTypes(GameState, {
  tiles: { map: TileSchema },
  players: { map: PlayerSchema },
  seasonEndTime: 'number',
  sessionConfig: SessionConfigSchema
});
