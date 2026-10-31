import { initFirebase } from './firebase/firebase.js';
import dictionary from './game/Dictionary.js';
import authManager from './ui/AuthManager.js';
import themePicker from './ui/ThemePicker.js';
import sessionBrowser from './ui/SessionBrowser.js';
import hud from './ui/HUD.js';
import actionBar from './ui/ActionBar.js';
import boardRenderer from './board/BoardRenderer.js';
import boardState from './board/BoardState.js';
import tileRack from './game/TileRack.js';
import gameRoomService from './network/GameRoomService.js';

async function initGame() {
  console.log('Initializing Words Builder Client...');

  // 1. Initialize Firebase
  try {
    await initFirebase();
  } catch (err) {
    console.error('Firebase initialization error:', err);
    hud.showStatus(`Firebase error: ${err.message}`, 12000);
  }

  // 2. Start preloading the SOWPODS dictionary in background
  dictionary.load().catch(err => {
    console.warn('Dictionary background preload warning:', err);
  });

  // 3. Initialize UI Managers
  authManager.init();
  themePicker.init();
  actionBar.init();
  hud.init(gameRoomService);

  // 4. Initialize Board Renderer
  const canvasContainer = document.getElementById('game-canvas-container');
  const savedTheme = localStorage.getItem('theme') || 'neon-dark';
  await boardRenderer.init(canvasContainer, savedTheme);

  // 5. Setup Board Interactions (tile placing / clicking)
  setupBoardInteractions();

  // 6. Handle room join reset
  sessionBrowser.onSessionJoined((sessionId) => {
    boardState.clearAll();
    boardRenderer.clear();
    // rack preserved
    boardRenderer.handleViewportMoved();
  });

  // 7. Check for saved username, or prompt user to enter one
  const player = await authManager.checkAuth();
  if (player) {
    onUserAuthenticated(player);
  } else {
    // First time visitor: show simple username prompt
    sessionBrowser.init('');
    sessionBrowser.show();
    authManager.open(true);
  }

  // React to username login/changes
  authManager.onAuthChange((p) => {
    if (p && (!window.authenticatedPlayerId || window.authenticatedPlayerId !== p.id)) {
      onUserAuthenticated(p);
    }
  });
}

function onUserAuthenticated(player) {
  if (window.authenticatedPlayerId === player.id) return;
  window.authenticatedPlayerId = player.id;
  const playerId = player.id;
  sessionBrowser.init(playerId);
  setupNetworkListeners(playerId);
  sessionBrowser.show();
}

function setupBoardInteractions() {
  // Click cell on PixiJS canvas
  boardRenderer.onCellClicked((x, y) => {
    const tile = boardState.getTile(x, y);

    // Case A: User clicked on a pending tile -> Recall it to rack
    if (tile && tile.isPending) {
      boardState.removePendingTile(x, y);
      tileRack.markReturned(tile.rackIndex);
      boardRenderer.drawPendingTiles();
      actionBar.updateControls();
      return;
    }

    // Case B: Cell is occupied by a permanent tile -> Ignore
    if (tile && !tile.isPending) {
      return;
    }

    // Case C: Empty cell click -> Place selected tile from rack
    const selectedTile = tileRack.getSelectedTile();
    if (selectedTile) {
      if (selectedTile.isWildcard) {
        // Open wildcard letter picker
        openWildcardPicker(x, y, selectedTile.rackIndex);
      } else {
        // Normal tile placement
        boardState.setPendingTile(
          x,
          y,
          selectedTile.letter,
          selectedTile.value,
          false,
          selectedTile.rackIndex
        );
        tileRack.markPlaced(selectedTile.rackIndex);
        boardRenderer.drawPendingTiles();
        actionBar.updateControls();
      }
    }
  });
}

// Open wildcard letter modal picker A-Z
function openWildcardPicker(x, y, rackIndex) {
  const modalContainer = document.getElementById('modal-container');
  const wildcardModal = document.getElementById('wildcard-modal');
  const grid = wildcardModal.querySelector('.letter-grid');
  
  grid.innerHTML = '';
  
  // Create A-Z buttons
  for (let i = 65; i <= 90; i++) {
    const char = String.fromCharCode(i);
    const btn = document.createElement('button');
    btn.className = 'letter-btn';
    btn.textContent = char;
    
    btn.addEventListener('click', () => {
      // Place wildcard representing selected letter (value = 0)
      boardState.setPendingTile(x, y, char, 0, true, rackIndex);
      tileRack.markPlaced(rackIndex);
      
      // Close modal
      modalContainer.classList.add('hidden');
      wildcardModal.classList.add('hidden');
      
      boardRenderer.drawPendingTiles();
      actionBar.updateControls();
    });

    grid.appendChild(btn);
  }

  // Show modal
  document.getElementById('settings-modal').classList.add('hidden');
  document.getElementById('create-session-modal').classList.add('hidden');
  document.getElementById('auth-modal').classList.add('hidden');
  
  modalContainer.classList.remove('hidden');
  wildcardModal.classList.remove('hidden');
}

function setupNetworkListeners(playerId) {
  // Sync room state changes (Player list, scores, daily counts)
  gameRoomService.onStateChange((state) => {
    hud.syncRoomState(state, playerId);
  });

  // Handle room events
  gameRoomService.onMessageReceived((event, data) => {
    switch (event) {
      case 'placement_success':
        hud.showStatus(`Word Accepted! Score: ${data.score} pts`);
        if (data.wordsFormed && data.wordsFormed.length > 0) {
          showFloatingNotification(
            'Success', 
            `Formed: ${data.wordsFormed.map(w => `${w.word} (${w.score})`).join(', ')}`
          );
        }
        break;

      case 'placement_error':
        hud.showStatus(`Error: ${data.error}`, 4000);
        break;

      case 'tiles_placed':
        if (data.playerId !== playerId) {
          showFloatingNotification(
            'Word Placed', 
            `<strong>${data.displayName}</strong> placed a word (+${data.score} pts)`
          );
        }
        break;

      case 'season_reset':
        hud.showStatus('Season Ended! Loading fresh board...');
        break;

      case 'admin_error':
        hud.showStatus(`Admin Error: ${data.error}`, 4000);
        break;
    }
  });
}

// Display sliding notification in top-right corner
function showFloatingNotification(title, text) {
  const container = document.getElementById('notification-area');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'notification-toast';
  
  const header = document.createElement('div');
  header.className = 'notification-header';
  header.textContent = title;
  toast.appendChild(header);

  const body = document.createElement('div');
  body.className = 'notification-body';
  body.innerHTML = text;
  toast.appendChild(body);

  container.appendChild(toast);

  // Animate slide-out and remove after 4.5 seconds
  setTimeout(() => {
    toast.style.animation = 'slide-out 0.3s ease forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4500);
}

// Kickstart game on DOM Load
window.addEventListener('DOMContentLoaded', () => {
  initGame();
});
