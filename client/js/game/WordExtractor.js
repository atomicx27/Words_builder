class WordExtractor {
  // Extract all words formed by pending tiles
  extractWords(boardState, pendingTiles) {
    if (pendingTiles.length === 0) return [];

    // Sort pending tiles: x ascending, then y ascending
    const sortedTiles = [...pendingTiles].sort((a, b) => a.x - b.x || a.y - b.y);

    const firstTile = sortedTiles[0];
    const isHorizontal = sortedTiles.every(t => t.y === firstTile.y);
    const isVertical = sortedTiles.every(t => t.x === firstTile.x);

    // If not horizontal and not vertical, it's invalid geometry (will be caught by validator)
    if (!isHorizontal && !isVertical) return [];

    const direction = isHorizontal ? 'H' : 'V';
    const words = [];

    // Combined lookup: pending first, then committed boardState
    const pendingMap = new Map(sortedTiles.map(t => [`${t.x},${t.y}`, t]));
    const getTileAt = (x, y) => {
      return pendingMap.get(`${x},${y}`) || boardState.getTile(x, y);
    };

    // If multiple tiles are placed, there is a main word in the direction of placement
    if (sortedTiles.length > 1) {
      const mainWord = this.extractWordAt(getTileAt, sortedTiles[0].x, sortedTiles[0].y, direction);
      if (mainWord) {
        words.push(mainWord);
      }
    }

    // For every newly placed tile, check the perpendicular direction for crossing words.
    // If only 1 tile is placed, we check both Horizontal and Vertical directions.
    const perpendicularDirection = direction === 'H' ? 'V' : 'H';

    for (const tile of sortedTiles) {
      if (sortedTiles.length === 1) {
        // Single tile: extract both Horizontal and Vertical words
        const hWord = this.extractWordAt(getTileAt, tile.x, tile.y, 'H');
        const vWord = this.extractWordAt(getTileAt, tile.x, tile.y, 'V');
        
        if (hWord) words.push(hWord);
        if (vWord) words.push(vWord);
      } else {
        // Multi-tile: extract perpendicular word only
        const crossWord = this.extractWordAt(getTileAt, tile.x, tile.y, perpendicularDirection);
        if (crossWord) {
          words.push(crossWord);
        }
      }
    }

    return words;
  }

  // Extract a single word containing coordinates (x,y) in direction
  extractWordAt(getTileAt, startX, startY, direction) {
    const tiles = [];
    
    if (direction === 'H') {
      // Walk left
      let x = startX;
      while (getTileAt(x - 1, startY)) {
        x--;
      }
      // Gather right
      while (getTileAt(x, startY)) {
        tiles.push({
          ...getTileAt(x, startY),
          x,
          y: startY
        });
        x++;
      }
    } else {
      // Walk up
      let y = startY;
      while (getTileAt(startX, y - 1)) {
        y--;
      }
      // Gather down
      while (getTileAt(startX, y)) {
        tiles.push({
          ...getTileAt(startX, y),
          x: startX,
          y
        });
        y++;
      }
    }

    // Word must be at least 2 letters long
    if (tiles.length < 2) return null;

    const word = tiles.map(t => t.letter).join('').toUpperCase();
    return {
      word,
      tiles,
      direction
    };
  }
}

const wordExtractorInstance = new WordExtractor();
export default wordExtractorInstance;
export { WordExtractor };
