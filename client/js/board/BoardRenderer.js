import * as PIXI from 'pixi.js';
import boardState from './BoardState.js';
import chunkManager, { TILE_SIZE, getBonusType } from './ChunkManager.js';
import { BONUS_TYPES, ZOOM_MIN, ZOOM_MAX } from '../../../shared/constants.js';

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

// Custom lightweight camera viewport for PixiJS v8 compatibility
class CustomViewport extends PIXI.Container {
  constructor(app, containerEl) {
    super();
    this.app = app;
    this.containerEl = containerEl;
    this.scale.set(1.0);
    this.position.set(0, 0);

    // Interaction states
    this.isDragging = false;
    this.lastPointerPos = { x: 0, y: 0 };
    this.touches = new Map(); // For multitouch pinch-to-zoom
    this.lastPinchDist = 0;

    // Enable interactions
    this.interactive = true;
    
    // Bind event listeners
    this.setupListeners();
  }

  setupListeners() {
    // 1. Mouse Wheel Zoom
    this.containerEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const rect = this.containerEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      this.zoomAt(mouseX, mouseY, zoomFactor);
    }, { passive: false });

    // 2. Drag & Drop Pan (Pixi Pointer Events)
    this.app.stage.interactive = true;
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e) => {
      const originalEvent = e.originalEvent;

      if (originalEvent instanceof TouchEvent) {
        // Track multiple touches
        for (let i = 0; i < originalEvent.changedTouches.length; i++) {
          const touch = originalEvent.changedTouches[i];
          this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
        }

        if (this.touches.size === 2) {
          // Multitouch starts
          this.isDragging = false;
          this.lastPinchDist = this.getPinchDistance();
        } else if (this.touches.size === 1) {
          this.isDragging = true;
          const touch = originalEvent.changedTouches[0];
          this.lastPointerPos = { x: touch.clientX, y: touch.clientY };
        }
      } else {
        // Mouse click
        this.isDragging = true;
        this.lastPointerPos = { x: e.global.x, y: e.global.y };
      }
    });

    this.app.stage.on('pointermove', (e) => {
      const originalEvent = e.originalEvent;

      if (originalEvent instanceof TouchEvent) {
        // Update tracked touch positions
        for (let i = 0; i < originalEvent.touches.length; i++) {
          const touch = originalEvent.touches[i];
          if (this.touches.has(touch.identifier)) {
            this.touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
          }
        }

        if (this.touches.size === 2) {
          // Process Pinch-to-Zoom
          const dist = this.getPinchDistance();
          if (this.lastPinchDist > 0 && dist > 0) {
            const zoomFactor = dist / this.lastPinchDist;
            
            // Get center point of pinch
            const touchArray = Array.from(this.touches.values());
            const rect = this.containerEl.getBoundingClientRect();
            const centerX = ((touchArray[0].x + touchArray[1].x) / 2) - rect.left;
            const centerY = ((touchArray[0].y + touchArray[1].y) / 2) - rect.top;

            this.zoomAt(centerX, centerY, zoomFactor);
          }
          this.lastPinchDist = dist;
        } else if (this.isDragging && this.touches.size === 1) {
          // Single-touch pan
          const touch = originalEvent.touches[0];
          const dx = touch.clientX - this.lastPointerPos.x;
          const dy = touch.clientY - this.lastPointerPos.y;
          
          this.x += dx;
          this.y += dy;
          this.lastPointerPos = { x: touch.clientX, y: touch.clientY };
          this.emit('moved');
        }
      } else {
        // Mouse drag pan
        if (this.isDragging) {
          const dx = e.global.x - this.lastPointerPos.x;
          const dy = e.global.y - this.lastPointerPos.y;
          
          this.x += dx;
          this.y += dy;
          this.lastPointerPos = { x: e.global.x, y: e.global.y };
          this.emit('moved');
        }
      }
    });

    // End drag/pinch
    const endPointer = (e) => {
      const originalEvent = e.originalEvent;
      if (originalEvent instanceof TouchEvent) {
        for (let i = 0; i < originalEvent.changedTouches.length; i++) {
          this.touches.delete(originalEvent.changedTouches[i].identifier);
        }
        if (this.touches.size < 2) {
          this.lastPinchDist = 0;
        }
        if (this.touches.size === 0) {
          this.isDragging = false;
        } else if (this.touches.size === 1) {
          this.isDragging = true;
          const remainingTouch = Array.from(this.touches.values())[0];
          this.lastPointerPos = { x: remainingTouch.x, y: remainingTouch.y };
        }
      } else {
        this.isDragging = false;
      }
    };

    this.app.stage.on('pointerup', endPointer);
    this.app.stage.on('pointerupoutside', endPointer);
  }

  // Calculate distance between two touches
  getPinchDistance() {
    if (this.touches.size < 2) return 0;
    const pts = Array.from(this.touches.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Stateless zoom centered on screen coordinates (pivot zoom)
  zoomAt(screenX, screenY, factor) {
    const worldX = (screenX - this.x) / this.scale.x;
    const worldY = (screenY - this.y) / this.scale.y;

    const oldScale = this.scale.x;
    const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldScale * factor));

    if (newScale === oldScale) return;

    this.scale.set(newScale);
    this.x = screenX - worldX * newScale;
    this.y = screenY - worldY * newScale;

    this.emit('moved');
  }

  // Move camera center to world coordinate (x,y)
  moveCenter(worldX, worldY) {
    const screenCenterX = this.app.screen.width / 2;
    const screenCenterY = this.app.screen.height / 2;

    this.x = screenCenterX - worldX * this.scale.x;
    this.y = screenCenterY - worldY * this.scale.y;
    
    this.emit('moved');
  }

  // Retrieve current world bounding box in viewport
  getVisibleBounds() {
    const left = (0 - this.x) / this.scale.x;
    const top = (0 - this.y) / this.scale.y;
    const right = (this.app.screen.width - this.x) / this.scale.x;
    const bottom = (this.app.screen.height - this.y) / this.scale.y;

    return { left, top, right, bottom };
  }

  // Map screen points to world coordinate space
  toWorld(screenPoint) {
    return {
      x: (screenPoint.x - this.x) / this.scale.x,
      y: (screenPoint.y - this.y) / this.scale.y
    };
  }
}

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

  onCellClicked(callback) {
    this.onCellClickedCallback = callback;
  }

  onTileHover(callback) {
    this.onTileHoverCallback = callback;
  }

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

    // Initialize custom camera Viewport
    this.viewport = new CustomViewport(this.app, containerEl);
    this.app.stage.addChild(this.viewport);

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
    this.app.stage.on('pointertap', (e) => {
      // Avoid firing clicks if we just panned/dragged the board
      if (this.viewport.isDragging) return;
      this.handleCanvasClicked(e);
    });

    // Track mouse pointer for tooltips/hover
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

  // Viewport moved: update loaded chunks
  handleViewportMoved() {
    const bounds = this.viewport.getVisibleBounds();
    
    if (window.colyseusClientInstance && window.colyseusClientInstance.sessionId && window.colyseusClientInstance.seasonId) {
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
          const color = theme.bonusBg[bonus];
          bonusGraphics.fill({ color, alpha: 0.25 });
          bonusGraphics.rect(posX + 1.5, posY + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);

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

  handleCanvasClicked(e) {
    const worldPoint = this.viewport.toWorld(e.global);
    const gridX = Math.floor(worldPoint.x / TILE_SIZE);
    const gridY = Math.floor(worldPoint.y / TILE_SIZE);

    if (this.onCellClickedCallback) {
      this.onCellClickedCallback(gridX, gridY);
    }
  }

  handlePointerMove(e) {
    const worldPoint = this.viewport.toWorld(e.global);
    const gridX = Math.floor(worldPoint.x / TILE_SIZE);
    const gridY = Math.floor(worldPoint.y / TILE_SIZE);

    const tile = boardState.getTile(gridX, gridY);

    if (this.onTileHoverCallback) {
      this.onTileHoverCallback(tile, e.global.x, e.global.y);
    }
  }

  drawPendingTiles() {
    this.pendingContainer.removeChildren();
    
    const pending = boardState.getPendingTilesArray();
    for (const tile of pending) {
      this.drawTile(this.pendingContainer, tile, true);
    }
  }

  redrawChunksForTiles(placedTiles) {
    const uniqueChunks = new Set();
    for (const tile of placedTiles) {
      const cx = Math.floor(tile.x / 32);
      const cy = Math.floor(tile.y / 32);
      uniqueChunks.add(`${cx},${cy}`);
    }

    for (const key of uniqueChunks) {
      const [cx, cy] = key.split(',').map(Number);
      const chunkTiles = [];
      const startX = cx * 32;
      const endX = (cx + 1) * 32 - 1;
      const startY = cy * 32;
      const endY = (cy + 1) * 32 - 1;

      for (const t of boardState.tiles.values()) {
        if (t.x >= startX && t.x <= endX && t.y >= startY && t.y <= endY) {
          chunkTiles.push(t);
        }
      }

      this.drawChunk(cx, cy, chunkTiles);
    }
  }

  setTheme(themeName) {

    if (!THEME_COLORS[themeName]) return;
    this.currentTheme = themeName;
    
    this.app.renderer.background.color = THEME_COLORS[themeName].bg;
    this.drawBackgroundGrid();

    for (const [key, oldCont] of this.chunkContainers.entries()) {
      const [cx, cy] = key.split(',').map(Number);
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
