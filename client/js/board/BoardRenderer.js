import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import boardState from './BoardState.js';
import chunkManager, { TILE_SIZE, getBonusType } from './ChunkManager.js';
import { BONUS_TYPES } from '../../../shared/constants.js';

// Theme colors mapping for PixiJS (hex numbers)
const THEME_COLORS = {
  'neon-dark': {
    bg: 0x0a0c16,
    grid: 0x141829,
    tileBg: 0x161b33,
    tileBorder: 0x00f0ff,
    tileText: 0xf8f9fa,
    tileValText: 0x858da8,
    star: 0xff007f,
    bonusBg: {
      DL: 0x00a8cc,
      TL: 0x005086,
      DW: 0xd9534f,
      TW: 0xa94442
    }
  },
  'classic': {
    bg: 0xf4ede4,
    grid: 0xe3dcd2,
    tileBg: 0xe6ccb2,
    tileBorder: 0x8d5b4c,
    tileText: 0x3d3025,
    tileValText: 0x705e50,
    star: 0x8d5b4c,
    bonusBg: {
      DL: 0xb5c99a,
      TL: 0x869860,
      DW: 0xe09f67,
      TW: 0xb07d62
    }
  },
  'minimalist': {
    bg: 0xffffff,
    grid: 0xe9ecef,
    tileBg: 0xf8f9fa,
    tileBorder: 0x6c757d,
    tileText: 0x212529,
    tileValText: 0x6c757d,
    star: 0x111111,
    bonusBg: {
      DL: 0xe9ecef,
      TL: 0xdee2e6,
      DW: 0xced4da,
      TW: 0xadb5bd
    }
  },
  'vibrant': {
    bg: 0x0b0214,
    grid: 0x1f0c2d,
    tileBg: 0x2b0e4a,
    tileBorder: 0xff00c8,
    tileText: 0xffffff,
    tileValText: 0xcfa8eb,
    star: 0x8b00ff,
    bonusBg: {
      DL: 0x3f0099,
      TL: 0x220055,
      DW: 0xbb0055,
      TW: 0x880022
    }
  }
};

class BoardRenderer {
  constructor() {
    this.app = null;
    this.viewport = null;
    this.gridTilingSprite = null;
    this.currentTheme = 'neon-dark';
    
    // Chunk container cache: key "chunkX,chunkY" -> PIXI.Container
    this.chunkContainers = new Map();
    
    // Pending tiles container (ghost tiles)
    this.pendingContainer = null;
    
    // Interaction callbacks
    this.onCellClickedCallback = null;
    this.onTileHoverCallback = null;
  }

  // Set click callback
  onCellClicked(callback) {
    this.onCellClickedCallback = callback;
  }

  // Set hover callback (shows who placed it)
  onTileHover(callback) {
    this.onTileHoverCallback = callback;
  }

  // Initialize PixiJS Application
  async init(containerEl, defaultTheme = 'neon-dark') {
    this.currentTheme = defaultTheme;

    // Create PixiJS App (Pixi v8 async init)
    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: containerEl,
      backgroundColor: THEME_COLORS[this.currentTheme].bg,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true
    });

    containerEl.appendChild(this.app.canvas);

    // Create Viewport
    this.viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: 1000000, // Large bounds for infinite panning
      worldHeight: 1000000,
      events: this.app.renderer.events, // Required for Pixi v8
      passiveWheel: false
    });

    this.app.stage.addChild(this.viewport);

    // Enable drag, pinch, wheel zoom, decel
    this.viewport
      .drag()
      .pinch()
      .wheel()
      .decelerate();

    // Center camera on (0, 0)
    this.viewport.moveCenter(0, 0);

    // Create container for pending/ghost tiles
    this.pendingContainer = new PIXI.Container();
    this.viewport.addChild(this.pendingContainer);

    // Draw background grid lines
    this.drawBackgroundGrid();

    // Set up ChunkManager draw callback
    chunkManager.onChunkDraw((chunkX, chunkY, tiles) => {
      this.drawChunk(chunkX, chunkY, tiles);
    });

    // Handle viewport changes to request new chunks
    this.viewport.on('moved', () => {
      this.handleViewportMoved();
    });

    // Handle clicks on the canvas
    this.viewport.on('clicked', (e) => {
      this.handleCanvasClicked(e);
    });

    // Track mouse pointer for tooltips/hover
    this.viewport.interactive = true;
    this.viewport.on('pointermove', (e) => {
      this.handlePointerMove(e);
    });

    // Trigger initial chunk request
    this.handleViewportMoved();
  }

  // Draw background grid lines
  drawBackgroundGrid() {
    if (this.gridTilingSprite) {
      this.viewport.removeChild(this.gridTilingSprite);
    }

    const theme = THEME_COLORS[this.currentTheme];

    // Create grid texture programmatically
    const gridGraphics = new PIXI.Graphics();
    gridGraphics.stroke({ width: 1, color: theme.grid, alpha: 0.8 });
    gridGraphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
    
    const texture = this.app.renderer.generateTexture(gridGraphics);
    
    // Create large tiling sprite
    this.gridTilingSprite = new PIXI.TilingSprite({
      texture: texture,
      width: 1000000,
      height: 1000000
    });

    // Align tiling sprite center to world origin (0, 0)
    this.gridTilingSprite.anchor.set(0.5);
    this.gridTilingSprite.position.set(0, 0);

    // Grid goes behind everything
    this.viewport.addChildAt(this.gridTilingSprite, 0);
  }

  // Viewport moved: update loaded chunks and update tiling sprite position
  handleViewportMoved() {
    const bounds = this.viewport.getVisibleBounds();
    
    // Request ChunkManager to fetch visible tiles
    if (window.colyseusClientInstance) {
      chunkManager.updateViewport(bounds, window.colyseusClientInstance);
    }
  }

  // Draw a 32x32 chunk of tiles and bonus squares
  drawChunk(chunkX, chunkY, tiles) {
    const key = `${chunkX},${chunkY}`;
    
    // Clear old container if it exists
    if (this.chunkContainers.has(key)) {
      const oldCont = this.chunkContainers.get(key);
      this.viewport.removeChild(oldCont);
      oldCont.destroy({ children: true });
    }

    const chunkContainer = new PIXI.Container();
    // Put behind pending tiles container
    this.viewport.addChildAt(chunkContainer, this.viewport.children.indexOf(this.pendingContainer));
    this.chunkContainers.set(key, chunkContainer);

    const theme = THEME_COLORS[this.currentTheme];
    const chunkPixelSize = 32 * TILE_SIZE;
    const startX = chunkX * chunkPixelSize;
    const startY = chunkY * chunkPixelSize;

    // 1. Draw Bonus Squares in this chunk
    const bonusGraphics = new PIXI.Graphics();
    chunkContainer.addChild(bonusGraphics);

    for (let x = 0; x < 32; x++) {
      const worldX = chunkX * 32 + x;
      for (let y = 0; y < 32; y++) {
        const worldY = chunkY * 32 + y;
        const bonus = getBonusType(worldX, worldY);

        const posX = startX + x * TILE_SIZE;
        const posY = startY + y * TILE_SIZE;

        // Draw start star on (0,0)
        if (worldX === 0 && worldY === 0) {
          bonusGraphics.fill({ color: theme.bg, alpha: 0.1 });
          bonusGraphics.rect(posX + 2, posY + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          
          // Draw a star shape
          bonusGraphics.fill({ color: theme.star, alpha: 0.3 });
          this.drawStar(bonusGraphics, posX + TILE_SIZE/2, posY + TILE_SIZE/2, 5, 14, 6);
        } else if (bonus !== BONUS_TYPES.NONE) {
          // Draw bonus color square
          const color = theme.bonusBg[bonus];
          bonusGraphics.fill({ color, alpha: 0.25 });
          bonusGraphics.rect(posX + 1.5, posY + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);

          // Add bonus text label
          const style = new PIXI.TextStyle({
            fontFamily: 'Outfit',
            fontSize: 12,
            fontWeight: 'bold',
            fill: color
          });
          const label = new PIXI.Text({ text: bonus, style });
          label.anchor.set(0.5);
          label.position.set(posX + TILE_SIZE / 2, posY + TILE_SIZE / 2);
          chunkContainer.addChild(label);
        }
      }
    }

    // 2. Draw Synced tiles
    for (const tile of tiles) {
      this.drawTile(chunkContainer, tile, false);
    }
  }

  // Draw star graphics helper
  drawStar(graphics, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    graphics.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      graphics.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      graphics.lineTo(x, y);
      rot += step;
    }
    graphics.lineTo(cx, cy - outerRadius);
    graphics.closePath();
  }

  // Draw individual tile sprite programmatically
  drawTile(container, tile, isPending = false) {
    const theme = THEME_COLORS[this.currentTheme];
    const posX = tile.x * TILE_SIZE;
    const posY = tile.y * TILE_SIZE;

    const tileGroup = new PIXI.Container();
    tileGroup.position.set(posX, posY);
    container.addChild(tileGroup);

    // Base background
    const gfx = new PIXI.Graphics();
    gfx.fill({ color: theme.tileBg, alpha: isPending ? 0.7 : 1 });
    // Border
    const borderColor = isPending ? theme.star : theme.tileBorder;
    gfx.stroke({ width: 2.5, color: borderColor, alpha: isPending ? 0.6 : 1 });
    gfx.rect(3, 3, TILE_SIZE - 6, TILE_SIZE - 6);
    tileGroup.addChild(gfx);

    // Letter Text
    const letterStyle = new PIXI.TextStyle({
      fontFamily: 'Outfit',
      fontSize: 28,
      fontWeight: '800',
      fill: tile.isWildcard ? theme.star : theme.tileText
    });
    const letterText = new PIXI.Text({ text: tile.letter, style: letterStyle });
    letterText.anchor.set(0.5);
    letterText.position.set(TILE_SIZE / 2, TILE_SIZE / 2 - 2);
    tileGroup.addChild(letterText);

    // Points value
    if (tile.value > 0) {
      const valStyle = new PIXI.TextStyle({
        fontFamily: 'Inter',
        fontSize: 10,
        fontWeight: 'bold',
        fill: theme.tileValText
      });
      const valText = new PIXI.Text({ text: String(tile.value), style: valStyle });
      valText.position.set(TILE_SIZE - 12, TILE_SIZE - 15);
      tileGroup.addChild(valText);
    }
  }

  // Canvas Click: calculates tile coordinate and triggers action
  handleCanvasClicked(e) {
    const worldPoint = this.viewport.toWorld(e.screen);
    const gridX = Math.floor(worldPoint.x / TILE_SIZE);
    const gridY = Math.floor(worldPoint.y / TILE_SIZE);

    if (this.onCellClickedCallback) {
      this.onCellClickedCallback(gridX, gridY);
    }
  }

  // Pointer move: detects hover on placed tiles to display tooltip
  handlePointerMove(e) {
    const worldPoint = this.viewport.toWorld(e.global);
    const gridX = Math.floor(worldPoint.x / TILE_SIZE);
    const gridY = Math.floor(worldPoint.y / TILE_SIZE);

    const tile = boardState.getTile(gridX, gridY);

    if (this.onTileHoverCallback) {
      this.onTileHoverCallback(tile, e.global.x, e.global.y);
    }
  }

  // Redraw pending tiles layer (ghost tiles)
  drawPendingTiles() {
    // Clear old sprites
    this.pendingContainer.removeChildren();
    
    const pending = boardState.getPendingTilesArray();
    for (const tile of pending) {
      this.drawTile(this.pendingContainer, tile, true);
    }
  }

  // Swap theme colors dynamically
  setTheme(themeName) {
    if (!THEME_COLORS[themeName]) return;
    this.currentTheme = themeName;
    
    this.app.renderer.background.color = THEME_COLORS[themeName].bg;
    this.drawBackgroundGrid();

    // Redraw all loaded chunks with new colors
    for (const [key, oldCont] of this.chunkContainers.entries()) {
      const [cx, cy] = key.split(',').map(Number);
      const tiles = boardState.getPendingTilesArray(); // We don't have all tiles inside boardState for this chunk
      // So let's reload chunk drawing
      const chunkTiles = [];
      for (const t of boardState.tiles.values()) {
        const startX = cx * 32;
        const endX = (cx + 1) * 32 - 1;
        const startY = cy * 32;
        const endY = (cy + 1) * 32 - 1;
        if (t.x >= startX && t.x <= endX && t.y >= startY && t.y <= endY) {
          chunkTiles.push(t);
        }
      }
      this.drawChunk(cx, cy, chunkTiles);
    }

    this.drawPendingTiles();
  }

  // Clear all rendered chunk containers
  clear() {
    for (const cont of this.chunkContainers.values()) {
      this.viewport.removeChild(cont);
      cont.destroy({ children: true });
    }
    this.chunkContainers.clear();
    this.pendingContainer.removeChildren();
    chunkManager.clear();
  }
}

const boardRendererInstance = new BoardRenderer();
export default boardRendererInstance;
export { BoardRenderer };
