import { chromium } from 'playwright';

const LIVE_URL = 'https://word-builder-6336b.web.app';

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

async function testPashinPlacement() {
  console.log('Testing word placement for "pashin" in Global World...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('dialog', d => d.accept());

  await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#auth-modal:not(.hidden)', { timeout: 10000 });

  // Login as "pashin"
  await page.fill('#username-login-input', 'pashin');
  await page.click('#btn-login-submit');
  await page.waitForSelector('#auth-modal', { state: 'hidden', timeout: 5000 });

  // Join Global World
  await page.click('#btn-join-global');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 12000 });
  await page.waitForSelector('#tile-rack .rack-tile-slot .tile', { timeout: 6000 });
  await page.waitForTimeout(2000);

  console.log('pashin joined Global World successfully');

  // Place tiles authoritatively
  const result = await page.evaluate(async (sowpodsList) => {
    const sowpods = new Set(sowpodsList);
    const rack = window.colyseusClientInstance.seasonPlayer.rack;
    const isBoardEmpty = window.boardStateInstance.isEmpty();
    const has00 = window.boardStateInstance.hasTile(0, 0);

    let placedTiles = [];

    if (!has00) {
      // First word on (0,0)
      const validPairs = {
        'A': 'T', 'B': 'E', 'C': 'H', 'D': 'O', 'E': 'N', 'F': 'A',
        'G': 'O', 'H': 'E', 'I': 'N', 'J': 'O', 'K': 'A', 'L': 'O',
        'M': 'Y', 'N': 'O', 'O': 'N', 'P': 'A', 'Q': 'I', 'R': 'E',
        'S': 'O', 'T': 'O', 'U': 'P', 'W': 'E', 'X': 'I', 'Y': 'E', 'Z': 'O'
      };

      const validRackTile = rack.find(t => !t.isWildcard && validPairs[t.letter]);
      const wild = rack.find(t => t.isWildcard);
      const t0 = validRackTile || wild || rack[0];

      const c1 = t0.isWildcard ? 'A' : t0.letter;
      const c2 = validPairs[c1] || 'T';

      window.boardStateInstance.setPendingTile(0, 0, c1, t0.value, t0.isWildcard, 0);
      window.boardStateInstance.setPendingTile(1, 0, c2, 0, true, 6);
    } else {
      // Connect to existing word at (0, 0)
      const t00 = window.boardStateInstance.getTile(0, 0);
      const letter00 = t00 ? t00.letter : 'T';

      // Find an open adjacent position: check (0, 1), (0, -1), (2, 0), (-1, 0)
      let openPos = null;
      let targetLetter = '';
      let usedTile = null;

      // Try (0, 1): word is letter00 + newLetter
      if (!window.boardStateInstance.hasTile(0, 1)) {
        for (let i = 0; i < rack.length; i++) {
          const r = rack[i];
          if (!r) continue;
          if (!r.isWildcard) {
            if (sowpods.has(letter00 + r.letter)) {
              openPos = { x: 0, y: 1 };
              targetLetter = r.letter;
              usedTile = { ...r, rackIndex: i };
              break;
            }
          } else {
            // Wildcard can be whatever makes a word
            for (const w of sowpods) {
              if (w[0] === letter00) {
                openPos = { x: 0, y: 1 };
                targetLetter = w[1];
                usedTile = { ...r, rackIndex: i, isWildcard: true };
                break;
              }
            }
          }
          if (openPos) break;
        }
      }

      if (!openPos) {
        // Fallback: use wildcard anywhere adjacent
        const wildIdx = rack.findIndex(t => t && t.isWildcard);
        openPos = { x: 0, y: 1 };
        targetLetter = 'O';
        usedTile = { ...rack[wildIdx >= 0 ? wildIdx : 0], rackIndex: wildIdx >= 0 ? wildIdx : 0, isWildcard: true };
      }

      window.boardStateInstance.setPendingTile(
        openPos.x,
        openPos.y,
        targetLetter,
        usedTile.isWildcard ? 0 : (usedTile.value || 1),
        !!usedTile.isWildcard,
        usedTile.rackIndex
      );
    }

    // Update controls (enables Submit button)
    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.disabled = false;

    // Click Submit via UI
    return new Promise((resolve) => {
      const handler = (event, data) => {
        if (event === 'placement_success') {
          resolve({ success: true, score: data.score, wordsFormed: data.wordsFormed });
        } else if (event === 'placement_error') {
          resolve({ success: false, error: data.error });
        }
      };
      window.colyseusClientInstance.onMessageReceived(handler);
      btnSubmit.click();
    });
  }, Array.from(SOWPODS_TWO_LETTER));

  console.log('Result of submitting word in Global World:', result);

  await browser.close();

  if (!result.success) {
    console.error('FAILED with error:', result.error);
    process.exit(1);
  } else {
    console.log('SUCCESS! Word placed cleanly in Global World!');
    process.exit(0);
  }
}

testPashinPlacement().catch(err => {
  console.error(err);
  process.exit(1);
});
