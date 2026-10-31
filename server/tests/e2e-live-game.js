import { chromium } from 'playwright';

const LIVE_URL = 'https://word-builder-6336b.web.app';

async function runLiveGameTests() {
  console.log(`\n============================================================`);
  console.log(`🚀 Starting Comprehensive Live Game & Edge Case E2E Test`);
  console.log(`🌐 Target: ${LIVE_URL}`);
  console.log(`============================================================\n`);

  const browser = await chromium.launch({ headless: true });

  const errors = [];
  const logError = (msg) => {
    console.error(`❌ [TEST ERROR] ${msg}`);
    errors.push(msg);
  };

  try {
    // -------------------------------------------------------------
    // Test 1: First Visitor Auth & Profile Setup
    // -------------------------------------------------------------
    console.log(`[TEST 1] Setting up Player 1 (Alice)...`);
    const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await contextA.newPage();
    pageA.on('dialog', dialog => dialog.accept());

    const consoleErrorsA = [];
    pageA.on('console', msg => {
      console.log(`  [Console A ${msg.type()}]: ${msg.text()}`);
    });
    pageA.on('pageerror', err => {
      consoleErrorsA.push(`Page A unhandled: ${err.message}`);
      logError(`Page A unhandled exception: ${err.message}`);
    });

    await pageA.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    console.log(`  ✓ Page A loaded successfully`);

    // Verify username modal is shown for first-time visitor
    await pageA.waitForSelector('#auth-modal:not(.hidden)', { timeout: 8000 });
    console.log(`  ✓ Auth modal popped up as expected for new user`);

    // Submit username "Alice"
    await pageA.fill('#username-login-input', 'Alice');
    await pageA.click('#btn-login-submit');

    // Verify modal closes and profile pill updates
    await pageA.waitForSelector('#auth-modal', { state: 'hidden', timeout: 5000 });
    const profileTextA = await pageA.textContent('#btn-browser-profile');
    console.log(`  ✓ Profile pill updated: "${profileTextA.trim()}"`);
    if (!profileTextA.includes('Alice')) {
      throw new Error(`Expected profile to display "Alice", got "${profileTextA}"`);
    }

    // -------------------------------------------------------------
    // Test 2: Join Global World
    // -------------------------------------------------------------
    console.log(`\n[TEST 2] Joining "The Global World"...`);
    await pageA.click('#btn-join-global');

    // Wait for HUD and bottom shelf to be visible
    await pageA.waitForSelector('#hud:not(.hidden)', { timeout: 10000 });
    await pageA.waitForSelector('#bottom-shelf:not(.hidden)', { timeout: 10000 });

    const worldNameA = await pageA.textContent('#hud-session-name');
    console.log(`  ✓ Joined world: "${worldNameA}"`);

    // Wait for rack to be rendered
    await pageA.waitForTimeout(3000);
    const rackHtml = await pageA.evaluate(() => {
      const rackEl = document.getElementById('tile-rack');
      const playerObj = window.colyseusClientInstance ? window.colyseusClientInstance.seasonPlayer : null;
      return {
        html: rackEl ? rackEl.innerHTML : 'no rack el',
        seasonPlayer: playerObj,
        tilesCount: document.querySelectorAll('.rack-tile-slot .tile').length
      };
    });
    console.log(`  Rack diagnostic:`, JSON.stringify(rackHtml));

    // Verify 7 tiles exist in tile rack
    await pageA.waitForFunction(() => {
      const slots = document.querySelectorAll('.rack-tile-slot .tile');
      return slots.length === 7;
    }, { timeout: 8000 });

    const rackLettersA = await pageA.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.rack-tile-slot .tile'));
      return tiles.map(t => t.querySelector('.tile-letter').textContent.trim());
    });
    console.log(`  ✓ Rack populated with 7 tiles: [${rackLettersA.join(', ')}]`);
    if (rackLettersA.length !== 7) {
      throw new Error(`Expected 7 tiles, found ${rackLettersA.length}`);
    }
    if (!rackLettersA.includes('*')) {
      throw new Error(`Expected at least one wildcard tile '*' in initial rack`);
    }

    // -------------------------------------------------------------
    // Test 3: Edge Case - Rapid Button Spam & Controls
    // -------------------------------------------------------------
    console.log(`\n[TEST 3] Testing UI Edge Cases (Spam clicks & Controls)...`);

    // Spam submit button while no tiles placed (should stay disabled)
    for (let i = 0; i < 5; i++) {
      await pageA.click('#btn-submit', { force: true });
    }
    const isSubmitDisabled = await pageA.isDisabled('#btn-submit');
    if (!isSubmitDisabled) {
      throw new Error(`Submit button should be disabled when no tiles placed!`);
    }
    console.log(`  ✓ Submit button correctly remains disabled when no tiles placed`);

    // Test Shuffle button
    const beforeShuffle = await pageA.evaluate(() => {
      return Array.from(document.querySelectorAll('.rack-tile-slot .tile .tile-letter')).map(el => el.textContent);
    });
    await pageA.click('#btn-shuffle');
    await pageA.waitForTimeout(300);
    const afterShuffle = await pageA.evaluate(() => {
      return Array.from(document.querySelectorAll('.rack-tile-slot .tile .tile-letter')).map(el => el.textContent);
    });
    console.log(`  ✓ Tile rack shuffled: [${beforeShuffle.join('')}] -> [${afterShuffle.join('')}]`);

    // -------------------------------------------------------------
    // Test 4: Custom Room Creation & Administration
    // -------------------------------------------------------------
    console.log(`\n[TEST 4] Creating a Custom Word World...`);
    await pageA.click('#btn-show-browser');
    await pageA.waitForSelector('#session-browser-overlay:not(.hidden)');

    // Click Create World button
    await pageA.click('#btn-show-create-modal');
    await pageA.waitForSelector('#create-session-modal:not(.hidden)');

    const uniqueRoomName = `TestWorld_${Math.floor(1000 + Math.random() * 9000)}`;
    await pageA.fill('#room-name', uniqueRoomName);
    await pageA.selectOption('#room-duration', 'ONE_WEEK');
    await pageA.selectOption('#room-limit', '10');
    await pageA.selectOption('#room-privacy', 'true'); // Private room with invite code
    await pageA.click('#create-session-form button[type="submit"]');

    // Wait until room loads
    await pageA.waitForSelector('#hud:not(.hidden)', { timeout: 12000 });
    const currentWorldTitle = await pageA.textContent('#hud-session-name');
    console.log(`  ✓ Successfully created and entered room: "${currentWorldTitle}"`);

    // Extract Invite Code from HUD
    const codeElText = await pageA.textContent('#hud-session-code');
    const inviteCodeMatch = codeElText.match(/Invite Code:\s*([A-Za-z0-9]+)/i);
    if (!inviteCodeMatch) {
      throw new Error(`Failed to find invite code in HUD. Text was: "${codeElText}"`);
    }
    const inviteCode = inviteCodeMatch[1].trim();
    console.log(`  ✓ Room Invite Code generated: "${inviteCode}"`);

    // -------------------------------------------------------------
    // Test 5: Multiplayer - Second Player Joins With Invite Code
    // -------------------------------------------------------------
    console.log(`\n[TEST 5] Player 2 (Bob) joins via Invite Code "${inviteCode}"...`);
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageB = await contextB.newPage();
    pageB.on('dialog', dialog => dialog.accept());

    pageB.on('pageerror', err => logError(`Page B error: ${err.message}`));
    pageB.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        console.warn(`  [Console B error]: ${msg.text()}`);
      }
    });

    await pageB.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await pageB.waitForSelector('#auth-modal:not(.hidden)');

    // Login as Bob
    await pageB.fill('#username-login-input', 'Bob');
    await pageB.click('#btn-login-submit');
    await pageB.waitForSelector('#auth-modal', { state: 'hidden', timeout: 5000 });

    // Join room by invite code
    await pageB.fill('#invite-code-input', inviteCode);
    await pageB.click('#btn-join-code');

    await pageB.waitForSelector('#hud:not(.hidden)', { timeout: 12000 });
    const bobWorldTitle = await pageB.textContent('#hud-session-name');
    console.log(`  ✓ Bob entered the world: "${bobWorldTitle}"`);
    if (bobWorldTitle !== uniqueRoomName) {
      throw new Error(`Bob entered "${bobWorldTitle}", expected "${uniqueRoomName}"`);
    }

    // Verify online player count updates to at least 2
    console.log(`  ✓ Verifying real-time presence sync across both players...`);
    await pageA.waitForFunction(() => {
      const count = parseInt(document.getElementById('hud-online-count')?.textContent || '0');
      return count >= 2;
    }, { timeout: 8000 });
    console.log(`  ✓ Real-time player presence confirmed: 2 builders active in room`);

    // -------------------------------------------------------------
    // Test 6: Word Placement & Real-Time Sync to Opponent
    // -------------------------------------------------------------
    console.log(`\n[TEST 6] Testing Word Placement & Live Real-Time Sync...`);

    // Alice places the first word covering (0,0)
    // Let's inspect Alice's rack tiles and programmatically place a valid word
    const aliceRack = await pageA.evaluate(() => {
      return window.colyseusClientInstance.seasonPlayer.rack;
    });
    console.log(`  Alice's current rack:`, aliceRack.map(t => t.letter));

    // Place a valid 3-letter word using Alice's wildcard + letters
    // E.g. "CAT", "DOG", "STAR", or "GO"
    const placementSuccess = await pageA.evaluate(async () => {
      const rack = window.colyseusClientInstance.seasonPlayer.rack;
      const validPairs = {
        'A': 'T', 'B': 'E', 'C': 'H', 'D': 'O', 'E': 'N', 'F': 'A',
        'G': 'O', 'H': 'E', 'I': 'N', 'J': 'O', 'K': 'A', 'L': 'O',
        'M': 'Y', 'N': 'O', 'O': 'N', 'P': 'A', 'Q': 'I', 'R': 'E',
        'S': 'O', 'T': 'O', 'U': 'P', 'W': 'E', 'X': 'I', 'Y': 'E', 'Z': 'O'
      };

      // Find a rack tile that matches a key in validPairs, or use wildcard
      const validRackTile = rack.find(t => !t.isWildcard && validPairs[t.letter]);
      const wild = rack.find(t => t.isWildcard);
      const t0 = validRackTile || wild || rack[0];

      const c1 = t0.isWildcard ? 'A' : t0.letter;
      const c2 = validPairs[c1] || 'T';

      const pending = [
        { x: 0, y: 0, letter: c1, isWildcard: t0.isWildcard, value: t0.value },
        { x: 1, y: 0, letter: c2, isWildcard: true, value: 0 }
      ];

      // Submit via gameRoomService
      return new Promise((resolve) => {
        const handler = (event, data) => {
          if (event === 'placement_success') {
            resolve({ success: true, score: data.score, wordsFormed: data.wordsFormed, letterAt00: c1 });
          } else if (event === 'placement_error') {
            resolve({ success: false, error: data.error });
          }
        };
        window.colyseusClientInstance.onMessageReceived(handler);
        window.colyseusClientInstance.submitWord(pending);
      });
    });

    console.log(`  Placement result:`, placementSuccess);
    if (!placementSuccess.success) {
      throw new Error(`Alice word placement failed: ${placementSuccess.error}`);
    }
    console.log(`  ✓ Alice successfully placed word (+${placementSuccess.score} points)! Tile at (0,0) is '${placementSuccess.letterAt00}'`);

    // Verify Bob's board received the tiles in REAL TIME via Firestore snapshot!
    console.log(`  ✓ Verifying real-time broadcast sync on Bob's board...`);
    await pageB.waitForFunction(() => {
      const t0 = window.boardStateInstance ? window.boardStateInstance.getTile(0, 0) : null;
      return t0 && t0.letter;
    }, { timeout: 10000 });

    const bobNotification = await pageB.textContent('#notification-area');
    console.log(`  ✓ Bob received real-time sync & tile verified at (0,0)!`);

    // -------------------------------------------------------------
    // Test 7: Bob Connects a Word to Alice's Letters
    // -------------------------------------------------------------
    console.log(`\n[TEST 7] Bob places a connecting crossword in real time...`);
    const bobPlacement = await pageB.evaluate(async (aliceLetterAt00) => {
      const rack = window.colyseusClientInstance.seasonPlayer.rack;
      const wild = rack.find(t => t.isWildcard);
      if (!wild) return { success: false, error: 'No wildcard in rack' };

      // Look up what letter is currently at (0, 0)
      const t0 = window.boardStateInstance ? window.boardStateInstance.getTile(0, 0) : null;
      const baseLetter = (t0 && t0.letter) ? t0.letter : (aliceLetterAt00 || 'A');

      const validPairs = {
        'A': 'T', 'B': 'E', 'C': 'H', 'D': 'O', 'E': 'N', 'F': 'A',
        'G': 'O', 'H': 'E', 'I': 'N', 'J': 'O', 'K': 'A', 'L': 'O',
        'M': 'Y', 'N': 'O', 'O': 'N', 'P': 'A', 'Q': 'I', 'R': 'E',
        'S': 'O', 'T': 'O', 'U': 'P', 'W': 'E', 'X': 'I', 'Y': 'E', 'Z': 'O'
      };

      const connectingLetter = validPairs[baseLetter] || 'O';

      const pending = [
        { x: 0, y: 1, letter: connectingLetter, isWildcard: true, value: 0 }
      ];

      return new Promise((resolve) => {
        const handler = (event, data) => {
          if (event === 'placement_success') {
            resolve({ success: true, score: data.score, wordsFormed: data.wordsFormed });
          } else if (event === 'placement_error') {
            resolve({ success: false, error: data.error });
          }
        };
        window.colyseusClientInstance.onMessageReceived(handler);
        window.colyseusClientInstance.submitWord(pending);
      });
    }, placementSuccess.letterAt00);

    console.log(`  Bob placement result:`, bobPlacement);
    if (!bobPlacement.success) {
      throw new Error(`Bob connecting placement failed: ${bobPlacement.error}`);
    }
    console.log(`  ✓ Bob successfully connected word (+${bobPlacement.score} points)!`);

    // -------------------------------------------------------------
    // Test 8: Tile Exchange Feature
    // -------------------------------------------------------------
    console.log(`\n[TEST 8] Testing Tile Exchange...`);
    const exchangeResult = await pageA.evaluate(async () => {
      const beforeRack = window.colyseusClientInstance.seasonPlayer.rack.map(t => t.letter).join('');
      return new Promise((resolve) => {
        const handler = (event, data) => {
          if (event === 'placement_success') {
            const afterRack = data.rack.map(t => t.letter).join('');
            resolve({ success: true, before: beforeRack, after: afterRack, wordsToday: data.wordsToday });
          } else if (event === 'placement_error') {
            resolve({ success: false, error: data.error });
          }
        };
        window.colyseusClientInstance.onMessageReceived(handler);
        window.colyseusClientInstance.exchangeTiles();
      });
    });

    console.log(`  Exchange result:`, exchangeResult);
    if (!exchangeResult.success) {
      throw new Error(`Tile exchange failed: ${exchangeResult.error}`);
    }
    console.log(`  ✓ Tile rack exchanged successfully! Rack updated from [${exchangeResult.before}] -> [${exchangeResult.after}]`);

    // -------------------------------------------------------------
    // Verification of Console Health
    // -------------------------------------------------------------
    console.log(`\n[TEST 9] Checking Console Health & Unhandled Errors...`);
    if (consoleErrorsA.length > 0) {
      console.warn(`  Warnings/Errors logged on Page A:`, consoleErrorsA);
    } else {
      console.log(`  ✓ Zero client runtime errors detected on Page A!`);
    }

    console.log(`\n============================================================`);
    console.log(`🎉 ALL 9 LIVE END-TO-END TESTS PASSED CLEANLY!`);
    console.log(`============================================================\n`);

  } catch (err) {
    logError(err.stack || err.message);
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    console.error(`❌ Suite completed with ${errors.length} error(s).`);
    process.exit(1);
  } else {
    console.log(`✅ All test suites completed with 100% success!`);
    process.exit(0);
  }
}

runLiveGameTests();
