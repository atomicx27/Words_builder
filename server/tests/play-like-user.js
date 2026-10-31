import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIVE_URL = 'https://word-builder-6336b.web.app';

// Common 2-letter SOWPODS words
const SOWPODS_TWO_LETTER = new Set([
  'AA', 'AB', 'AD', 'AE', 'AG', 'AH', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY',
  'BA', 'BE', 'BI', 'BO', 'BY', 'CH', 'DA', 'DE', 'DI', 'DO', 'EA', 'ED', 'EE', 'EF', 'EH', 'EL',
  'EM', 'EN', 'ER', 'ES', 'ET', 'EX', 'FA', 'FE', 'FY', 'GI', 'GO', 'GU', 'HA', 'HE', 'HI', 'HM',
  'HO', 'ID', 'IF', 'IN', 'IO', 'IS', 'IT', 'JA', 'JO', 'KA', 'KI', 'KO', 'KY', 'LA', 'LI', 'LO',
  'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE', 'NO', 'NU', 'NY', 'OB', 'OD', 'OE', 'OF',
  'OH', 'OI', 'OM', 'ON', 'OO', 'OP', 'OR', 'OS', 'OU', 'OW', 'OX', 'OY', 'PA', 'PE', 'PI', 'PO',
  'QI', 'RE', 'SH', 'SI', 'SO', 'ST', 'TA', 'TE', 'TI', 'TO', 'UG', 'UH', 'UM', 'UN', 'UP', 'UR',
  'US', 'UT', 'WE', 'WO', 'XI', 'XU', 'YA', 'YE', 'YO', 'YU', 'ZA', 'ZO'
]);

async function playLikeUser() {
  console.log('============================================================');
  console.log('🎮 REAL HUMAN USER GAMEPLAY & MULTIPLAYER SIMULATION');
  console.log('============================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page1 = await context.newPage();
  page1.on('dialog', d => d.accept());

  const screenshotDir = path.resolve(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  try {
    // =========================================================
    // PHASE 1: Login as Player 1 ("Sam")
    // =========================================================
    console.log('[PHASE 1] Player 1 ("Sam") loading site and logging in...');
    await page1.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await page1.waitForSelector('#auth-modal:not(.hidden)', { timeout: 12000 });

    const samUsername = `Sam_${Math.floor(1000 + Math.random() * 9000)}`;
    await page1.fill('#username-login-input', samUsername);
    await page1.click('#btn-login-submit');
    await page1.waitForSelector('#auth-modal', { state: 'hidden', timeout: 6000 });

    await page1.screenshot({ path: path.join(screenshotDir, '01_logged_in_browser.png') });
    console.log(`  ✓ Logged in as "${samUsername}". Screenshot: 01_logged_in_browser.png`);

    // =========================================================
    // PHASE 2: Create Custom Room & Place First Word on (0,0)
    // =========================================================
    console.log('\n[PHASE 2] Creating fresh custom room and playing first word at center (0,0)...');
    await page1.click('#btn-show-create-modal');
    await page1.waitForSelector('#create-session-modal:not(.hidden)', { timeout: 4000 });

    const roomName = `Game_${Math.floor(1000 + Math.random() * 9000)}`;
    await page1.fill('#room-name', roomName);
    await page1.click('#create-session-form button[type="submit"]');

    await page1.waitForSelector('#hud:not(.hidden)', { timeout: 15000 });
    await page1.waitForSelector('#tile-rack .rack-tile-slot .tile', { timeout: 8000 });
    await page1.waitForTimeout(800);

    const inviteCodeRaw = await page1.textContent('#hud-session-code');
    const inviteCode = inviteCodeRaw.replace('Invite Code:', '').trim();
    console.log(`  ✓ Room "${roomName}" created! Room Invite Code: "${inviteCode}"`);

    await page1.screenshot({ path: path.join(screenshotDir, '02_fresh_room_entered.png') });

    // Inspect initial rack in UI
    const rack1 = await page1.$$eval('#tile-rack .rack-tile-slot', slots => {
      return slots.map((slot, idx) => {
        const tile = slot.querySelector('.tile');
        if (!tile) return null;
        const letter = tile.querySelector('.tile-letter')?.textContent || '';
        const value = parseInt(tile.querySelector('.tile-value')?.textContent || '0');
        const isWild = tile.classList.contains('wildcard');
        return { index: idx, letter, value, isWild };
      });
    });

    console.log('  Rack 1 tiles in UI:', rack1.map(t => t ? `${t.letter}(${t.value})` : 'empty'));

    // Find two tiles that form a valid 2-letter SOWPODS word
    let play1 = null;
    let play2 = null;
    let targetWord = '';

    // Check non-wild combinations
    for (const tA of rack1) {
      if (!tA || tA.isWild) continue;
      for (const tB of rack1) {
        if (!tB || tB.isWild || tA.index === tB.index) continue;
        const candidate = tA.letter + tB.letter;
        if (SOWPODS_TWO_LETTER.has(candidate)) {
          play1 = { ...tA };
          play2 = { ...tB };
          targetWord = candidate;
          break;
        }
      }
      if (play1) break;
    }

    // Fallback: use wildcard
    if (!play1) {
      const wild = rack1.find(t => t && t.isWild);
      const regular = rack1.find(t => t && !t.isWild);
      if (wild && regular) {
        // Try finding a letter to match regular
        for (const w of SOWPODS_TWO_LETTER) {
          if (w[0] === regular.letter) {
            play1 = { ...regular };
            play2 = { ...wild, wildcardLetter: w[1] };
            targetWord = w;
            break;
          } else if (w[1] === regular.letter) {
            play1 = { ...wild, wildcardLetter: w[0] };
            play2 = { ...regular };
            targetWord = w;
            break;
          }
        }
      }
    }

    if (!play1 || !play2) {
      throw new Error('Unable to find a valid 2-letter word combination from initial rack.');
    }

    console.log(`  Playing valid word "${targetWord}" using Slot ${play1.index} ("${play1.letter}") + Slot ${play2.index} ("${play2.letter}")`);

    // Get canvas dimensions and compute grid coordinates
    const canvasRect = await page1.$eval('#game-canvas-container canvas', el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

    const screenCenterX = canvasRect.left + canvasRect.width / 2;
    const screenCenterY = canvasRect.top + canvasRect.height / 2;

    const getScreenCoord = (gx, gy) => ({
      x: screenCenterX + (gx * 64) + 32,
      y: screenCenterY + (gy * 64) + 32
    });

    // 👆 User Action: Click Play 1 on rack
    console.log(`  👆 User clicks Slot ${play1.index} in rack...`);
    await page1.click(`#tile-rack .rack-tile-slot[data-index="${play1.index}"] .tile`);
    await page1.waitForSelector(`#tile-rack .rack-tile-slot[data-index="${play1.index}"] .tile.selected`, { timeout: 3000 });

    // 👆 User Action: Click Canvas at (0, 0)
    console.log('  👆 User clicks Canvas at center square (0, 0)...');
    const p00 = getScreenCoord(0, 0);
    await page1.mouse.click(p00.x, p00.y);

    if (play1.isWild) {
      await page1.waitForSelector('#wildcard-modal:not(.hidden)', { timeout: 3000 });
      await page1.click(`#wildcard-modal .letter-btn:text("${play1.wildcardLetter}")`);
      await page1.waitForSelector('#wildcard-modal', { state: 'hidden', timeout: 3000 });
    }

    await page1.waitForFunction(() => window.boardStateInstance.pendingTiles.size === 1, { timeout: 3000 });

    // 👆 User Action: Click Play 2 on rack
    console.log(`  👆 User clicks Slot ${play2.index} in rack...`);
    await page1.click(`#tile-rack .rack-tile-slot[data-index="${play2.index}"] .tile`);
    await page1.waitForSelector(`#tile-rack .rack-tile-slot[data-index="${play2.index}"] .tile.selected`, { timeout: 3000 });

    // 👆 User Action: Click Canvas at (1, 0)
    console.log('  👆 User clicks Canvas at square (1, 0)...');
    const p10 = getScreenCoord(1, 0);
    await page1.mouse.click(p10.x, p10.y);

    if (play2.isWild) {
      await page1.waitForSelector('#wildcard-modal:not(.hidden)', { timeout: 3000 });
      await page1.click(`#wildcard-modal .letter-btn:text("${play2.wildcardLetter}")`);
      await page1.waitForSelector('#wildcard-modal', { state: 'hidden', timeout: 3000 });
    }

    await page1.waitForFunction(() => window.boardStateInstance.pendingTiles.size === 2, { timeout: 3000 });

    await page1.screenshot({ path: path.join(screenshotDir, '03_tiles_placed_on_canvas.png') });
    console.log('  📸 Tiles placed visually on canvas! Screenshot: 03_tiles_placed_on_canvas.png');

    // Verify Submit Word button is active with score preview
    await page1.waitForFunction(() => {
      const btn = document.getElementById('btn-submit');
      return btn && !btn.disabled;
    }, { timeout: 4000 });

    const previewScore = await page1.textContent('#submit-score-preview');
    console.log(`  Submit button enabled! Score preview: "${previewScore}"`);

    // 👆 User Action: Click Submit Word!
    console.log('  👆 User clicks "Submit Word" button...');
    await page1.click('#btn-submit');

    // Wait for authoritative server confirmation and rack refill
    console.log('  ⏳ Waiting for word acceptance and rack refill...');
    await page1.waitForFunction(() => {
      const toast = document.getElementById('status-toast')?.textContent || '';
      return toast.includes('Word Accepted') || toast.includes('Error:');
    }, { timeout: 15000 });

    const toast1 = await page1.textContent('#status-toast');
    if (toast1.includes('Error:')) {
      throw new Error(`Word submission error: ${toast1}`);
    }
    console.log(`  ✓ Status Toast: "${toast1}"`);

    // Wait for rack to be refilled back to full 7 tiles
    await page1.waitForFunction(() => {
      const tiles = document.querySelectorAll('#tile-rack .rack-tile-slot .tile');
      return tiles.length === 7;
    }, { timeout: 10000 });

    const scoreAfterPlay1 = await page1.textContent('#hud-player-score');
    console.log(`  ✓ Word placed successfully! HUD Score: ${scoreAfterPlay1}`);

    await page1.screenshot({ path: path.join(screenshotDir, '04_word_submitted_points_awarded.png') });
    console.log('  📸 Screenshot: 04_word_submitted_points_awarded.png');

    // =========================================================
    // PHASE 3: Place a Connecting Crossword on the Board
    // =========================================================
    console.log('\n[PHASE 3] Playing a connecting crossword on the existing committed letters...');
    await page1.waitForTimeout(600);

    // Read committed board tiles
    const committedTiles = await page1.evaluate(() => {
      const res = [];
      for (const [key, t] of window.boardStateInstance.tiles.entries()) {
        res.push({ x: t.x, y: t.y, letter: t.letter });
      }
      return res;
    });

    console.log('  Committed board tiles:', committedTiles);

    // Read refilled rack tiles
    const refilledRack = await page1.$$eval('#tile-rack .rack-tile-slot', slots => {
      return slots.map((slot, idx) => {
        const tile = slot.querySelector('.tile');
        if (!tile) return null;
        const letter = tile.querySelector('.tile-letter')?.textContent || '';
        const value = parseInt(tile.querySelector('.tile-value')?.textContent || '0');
        const isWild = tile.classList.contains('wildcard');
        return { index: idx, letter, value, isWild };
      });
    });

    console.log('  Refilled rack tiles:', refilledRack.map(t => `${t.letter}(${t.value})`));

    // Form a connecting word below (0,0) at (0,1):
    // Letter at (0, 0) is known
    const t00 = committedTiles.find(t => t.x === 0 && t.y === 0);
    const letter00 = t00 ? t00.letter : 'A';

    // Find any tile from rack that connects vertically: letter00 + rackLetter
    let connectTile = refilledRack.find(t => t && !t.isWild && SOWPODS_TWO_LETTER.has(letter00 + t.letter));
    let assignedLetter = connectTile ? connectTile.letter : '';

    if (!connectTile) {
      // Use wildcard to form valid 2-letter word with letter00
      const wildTile = refilledRack.find(t => t && t.isWild);
      if (wildTile) {
        for (const w of SOWPODS_TWO_LETTER) {
          if (w[0] === letter00) {
            connectTile = wildTile;
            assignedLetter = w[1];
            break;
          }
        }
      }
    }

    if (!connectTile) {
      // Connect horizontally at (2,0)
      const t10 = committedTiles.find(t => t.x === 1 && t.y === 0);
      const letter10 = t10 ? t10.letter : 'O';
      connectTile = refilledRack.find(t => t && !t.isWild && SOWPODS_TWO_LETTER.has(letter10 + t.letter));
      assignedLetter = connectTile ? connectTile.letter : '';
    }

    console.log(`  Connecting tile found: Slot ${connectTile.index} ("${connectTile.letter}"), assigned="${assignedLetter}"`);

    // 👆 User Action: Click connect tile on rack
    await page1.click(`#tile-rack .rack-tile-slot[data-index="${connectTile.index}"] .tile`);
    await page1.waitForSelector(`#tile-rack .rack-tile-slot[data-index="${connectTile.index}"] .tile.selected`, { timeout: 3000 });

    // 👆 User Action: Click Canvas at (0, 1)
    const p01 = getScreenCoord(0, 1);
    await page1.mouse.click(p01.x, p01.y);

    if (connectTile.isWild) {
      await page1.waitForSelector('#wildcard-modal:not(.hidden)', { timeout: 3000 });
      await page1.click(`#wildcard-modal .letter-btn:text("${assignedLetter}")`);
      await page1.waitForSelector('#wildcard-modal', { state: 'hidden', timeout: 3000 });
    }

    await page1.waitForFunction(() => window.boardStateInstance.pendingTiles.size === 1, { timeout: 3000 });

    await page1.screenshot({ path: path.join(screenshotDir, '05_crossword_connecting_placed.png') });
    console.log('  📸 Connecting tile placed visually! Screenshot: 05_crossword_connecting_placed.png');

    // Verify Submit Word button enabled for connecting word
    await page1.waitForFunction(() => {
      const btn = document.getElementById('btn-submit');
      return btn && !btn.disabled;
    }, { timeout: 4000 });

    console.log('  👆 User clicks "Submit Word" button for crossword connection...');
    await page1.click('#btn-submit');

    await page1.waitForFunction(() => {
      const toast = document.getElementById('status-toast')?.textContent || '';
      return toast.includes('Word Accepted') || toast.includes('Error:');
    }, { timeout: 15000 });

    const toast2 = await page1.textContent('#status-toast');
    if (toast2.includes('Error:')) {
      throw new Error(`Connecting word placement error: ${toast2}`);
    }
    console.log(`  ✓ Status Toast: "${toast2}"`);

    const scoreAfterPlay2 = await page1.textContent('#hud-player-score');
    console.log(`  ✓ Crossword submitted successfully! Score increased to: ${scoreAfterPlay2}`);

    await page1.screenshot({ path: path.join(screenshotDir, '06_final_board_state.png') });
    console.log('  📸 Screenshot: 06_final_board_state.png');

    // =========================================================
    // PHASE 4: Multiplayer Join & Live Cross-Player Sync Verification
    // =========================================================
    console.log('\n[PHASE 4] Multiplayer Join: Player 2 ("Bob") joins the room via Invite Code...');
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await context2.newPage();
    page2.on('dialog', d => d.accept());

    await page2.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('#auth-modal:not(.hidden)', { timeout: 12000 });

    const bobUsername = `Bob_${Math.floor(1000 + Math.random() * 9000)}`;
    await page2.fill('#username-login-input', bobUsername);
    await page2.click('#btn-login-submit');
    await page2.waitForSelector('#auth-modal', { state: 'hidden', timeout: 6000 });
    console.log(`  ✓ Player 2 logged in as "${bobUsername}".`);

    // Enter invite code in session browser
    await page2.waitForSelector('#invite-code-input', { timeout: 4000 });
    await page2.fill('#invite-code-input', inviteCode);
    await page2.click('#btn-join-code');

    await page2.waitForSelector('#hud:not(.hidden)', { timeout: 15000 });
    await page2.waitForSelector('#tile-rack .rack-tile-slot .tile', { timeout: 8000 });
    console.log(`  ✓ Player 2 successfully joined room "${roomName}"!`);

    // Verify Bob's board state synchronizes Sam's committed tiles
    await page2.waitForFunction(() => {
      return window.boardStateInstance && window.boardStateInstance.tiles.size >= 3;
    }, { timeout: 10000 });

    const bobSeenTiles = await page2.evaluate(() => {
      const res = [];
      for (const [k, t] of window.boardStateInstance.tiles.entries()) {
        res.push(`${t.letter} at (${t.x},${t.y}) by ${t.playerId}`);
      }
      return res;
    });

    console.log('  ✓ Player 2 live board state received from Firestore sync:');
    bobSeenTiles.forEach(t => console.log(`    - ${t}`));

    await page2.screenshot({ path: path.join(screenshotDir, '07_player2_synced_board.png') });
    console.log('  📸 Screenshot: 07_player2_synced_board.png');

    // =========================================================
    // PHASE 5: Edge Case & Rapid Interaction Stress Testing
    // =========================================================
    console.log('\n[PHASE 5] Testing UI edge cases and rapid interactions...');

    // Edge Case 1: Rapidly click Shuffle button 5 times
    console.log('  Testing rapid shuffle clicks (x5)...');
    for (let i = 0; i < 5; i++) {
      await page2.click('#btn-shuffle');
      await page2.waitForTimeout(50);
    }
    const bobRackAfterShuffle = await page2.$$eval('#tile-rack .rack-tile-slot .tile', tiles => tiles.length);
    if (bobRackAfterShuffle !== 7) throw new Error('Shuffle corrupted the tile rack count!');
    console.log('  ✓ Rapid shuffle preserved 7 rack tiles perfectly.');

    // Edge Case 2: Click Recall button when nothing is pending
    console.log('  Testing recall with 0 pending tiles...');
    await page2.click('#btn-recall');
    const bobRackAfterRecall = await page2.$$eval('#tile-rack .rack-tile-slot .tile', tiles => tiles.length);
    if (bobRackAfterRecall !== 7) throw new Error('Recall with 0 pending broke the rack!');
    console.log('  ✓ Recall handled empty state gracefully without errors.');

    // Edge Case 3: Toggle Rules modal and Settings modal
    console.log('  Testing rules modal opening & closing...');
    await page2.click('#btn-rules');
    await page2.waitForSelector('#rules-modal:not(.hidden)', { timeout: 3000 });
    await page2.click('#rules-modal .close-btn');
    await page2.waitForSelector('#rules-modal', { state: 'hidden', timeout: 3000 });
    console.log('  ✓ Rules modal opened and closed cleanly.');

    console.log('  Testing settings modal opening & closing...');
    await page2.click('#btn-settings');
    await page2.waitForSelector('#settings-modal:not(.hidden)', { timeout: 3000 });
    await page2.click('#settings-modal .close-btn');
    await page2.waitForSelector('#settings-modal', { state: 'hidden', timeout: 3000 });
    console.log('  ✓ Settings modal opened and closed cleanly.');

    console.log('\n============================================================');
    console.log('🎉 REAL HUMAN USER GAMEPLAY SIMULATION COMPLETED 100%!');
    console.log('============================================================\n');

  } catch (err) {
    console.error('\n❌ Gameplay simulation failed:', err);
    await page1.screenshot({ path: path.join(screenshotDir, 'error_state.png') }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

playLikeUser();
