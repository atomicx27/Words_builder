import boardRenderer from '../board/BoardRenderer.js';
import sessionBrowser from './SessionBrowser.js';


class HUD {
  constructor() {
    this.timerInterval = null;
    this.tooltipEl = null;
    this.colyseusClient = null;
  }

  // Initialize HUD overlays
  init(colyseusClient) {
    this.colyseusClient = colyseusClient;
    this.createTooltipElement();
    
    // Set up hover tooltip handler in BoardRenderer
    boardRenderer.onTileHover((tile, screenX, screenY) => {
      this.updateTooltip(tile, screenX, screenY);
    });

    // Setup settings gear toggle
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.querySelector('#settings-modal .close-btn');
    const modalContainer = document.getElementById('modal-container');
    const settingsModal = document.getElementById('settings-modal');

    btnSettings.addEventListener('click', () => {
      this.openSettingsModal();
    });

    btnCloseSettings.addEventListener('click', () => {
      this.closeSettingsModal();
    });

    // Admin action: Force reset season
    const btnAdminReset = document.getElementById('btn-admin-reset');
    btnAdminReset.addEventListener('click', () => {
      if (confirm('Are you sure you want to FORCE RESET this season? This will archive the current board snapshot, rank the leaderboard, and start a fresh board.')) {
        this.colyseusClient.adminReset();
        this.closeSettingsModal();
      }
    });

    // Save username action
    const btnSaveUsername = document.getElementById('btn-save-username');
    const inputUsername = document.getElementById('settings-username-input');

    btnSaveUsername.addEventListener('click', async () => {
      const newName = inputUsername.value.trim();
      if (!newName) {
        this.showStatus('Username cannot be empty.');
        return;
      }

      btnSaveUsername.disabled = true;
      btnSaveUsername.textContent = 'Saving...';

      try {
        const res = await fetch('/api/auth/username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ displayName: newName })
        });

        const data = await res.json();
        if (!res.ok) {
          this.showStatus(data.error || 'Failed to update username.');
          return;
        }

        // Save updated player
        window.playerSession = data.player;

        // Sync to Colyseus room if connected
        if (this.colyseusClient && this.colyseusClient.room) {
          this.colyseusClient.room.send('change_username', { displayName: newName });
        }

        // Update other UIs
        sessionBrowser.updateProfileButton();

        this.showStatus('Username updated successfully!');
      } catch (err) {
        this.showStatus('Network error during username update.');
      } finally {
        btnSaveUsername.disabled = false;
        btnSaveUsername.textContent = 'Save';
      }
    });
  }



  // Create absolute tooltip element in DOM
  createTooltipElement() {
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.position = 'fixed';
    this.tooltipEl.style.background = 'rgba(10, 12, 22, 0.95)';
    this.tooltipEl.style.border = '1px solid var(--border-color)';
    this.tooltipEl.style.color = '#fff';
    this.tooltipEl.style.padding = '6px 12px';
    this.tooltipEl.style.borderRadius = '6px';
    this.tooltipEl.style.fontSize = '0.75rem';
    this.tooltipEl.style.fontWeight = '600';
    this.tooltipEl.style.pointerEvents = 'none';
    this.tooltipEl.style.display = 'none';
    this.tooltipEl.style.zIndex = '500';
    this.tooltipEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
    this.tooltipEl.style.transform = 'translate(-50%, -120%)';
    document.body.appendChild(this.tooltipEl);
  }

  // Update hover tooltip contents and position
  updateTooltip(tile, screenX, screenY) {
    if (!tile || !this.colyseusClient || !this.colyseusClient.room) {
      this.tooltipEl.style.display = 'none';
      return;
    }

    const state = this.colyseusClient.room.state;
    const player = state.players.get(tile.playerId);
    const displayName = player ? player.displayName : 'Unknown Builder';
    
    let text = `By ${displayName}`;
    if (tile.isPending) {
      text += ' <span style="color:var(--accent-alt)">(Pending)</span>';
    } else {
      text += ` (${new Date(tile.placedAt).toLocaleDateString()})`;
    }

    this.tooltipEl.innerHTML = text;
    this.tooltipEl.style.left = `${screenX}px`;
    this.tooltipEl.style.top = `${screenY}px`;
    this.tooltipEl.style.display = 'block';
  }

  // Bind Colyseus Room state modifications to update HUD UI
  syncRoomState(state, currentPlayerId) {
    // 1. Session Name & Code
    const nameEl = document.getElementById('hud-session-name');
    const codeEl = document.getElementById('hud-session-code');
    const sessionConfig = state.sessionConfig;

    nameEl.textContent = sessionConfig.name || 'Word World';
    
    if (this.colyseusClient.room.id === 'global') {
      codeEl.style.display = 'none';
    } else {
      codeEl.style.display = 'inline-block';
      codeEl.textContent = `Invite Code: ${this.colyseusClient.room.id.substring(0, 6).toUpperCase()}`;
    }

    // 2. Plays remaining today
    const playsLeftEl = document.getElementById('hud-plays-left');
    const currentPlayer = state.players.get(currentPlayerId);

    if (currentPlayer) {
      // Score
      document.getElementById('hud-player-score').textContent = String(currentPlayer.score);

      // Remaining Daily placements
      const dailyLimit = sessionConfig.dailyWordLimit;
      const isUnlimited = dailyLimit === 'Unlimited' || Number(dailyLimit) <= 0;
      
      if (isUnlimited) {
        playsLeftEl.textContent = 'Unlimited';
      } else {
        const remaining = Math.max(0, Number(dailyLimit) - currentPlayer.wordsToday);
        playsLeftEl.textContent = `${remaining}/${dailyLimit}`;
      }
    }

    // 3. Online player count
    let onlineCount = 0;
    state.players.forEach(p => {
      if (p.isOnline) onlineCount++;
    });
    document.getElementById('hud-online-count').textContent = String(onlineCount);

    // 4. Set countdown timer
    this.updateSeasonTimer(state.seasonEndTime);
  }

  // Update ticking season reset timer
  updateSeasonTimer(endTime) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const timerEl = document.getElementById('hud-season-timer');

    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        timerEl.textContent = '00:00:00';
        clearInterval(this.timerInterval);
        return;
      }

      let seconds = Math.floor(diff / 1000);
      let minutes = Math.floor(seconds / 60);
      let hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      seconds %= 60;
      minutes %= 60;
      hours %= 24;

      if (days > 0) {
        timerEl.textContent = `${days}d ${hours}h ${minutes}m`;
      } else {
        const hStr = String(hours).padStart(2, '0');
        const mStr = String(minutes).padStart(2, '0');
        const sStr = String(seconds).padStart(2, '0');
        timerEl.textContent = `${hStr}:${mStr}:${sStr}`;
      }
    };

    tick();
    this.timerInterval = setInterval(tick, 1000);
  }

  // Options modal controls
  openSettingsModal() {
    const modalContainer = document.getElementById('modal-container');
    const settingsModal = document.getElementById('settings-modal');
    const createModal = document.getElementById('create-session-modal');
    const authModal = document.getElementById('auth-modal');
    const adminPanel = document.getElementById('admin-options-panel');
    
    const usernameInput = document.getElementById('settings-username-input');
    const accountTypeEl = document.getElementById('settings-account-type');

    // Hide other modals
    createModal.classList.add('hidden');
    authModal.classList.add('hidden');

    // Load credentials info
    if (window.playerSession) {
      usernameInput.value = window.playerSession.displayName;
      accountTypeEl.textContent = window.playerSession.isGuest ? 'Guest Account' : 'Registered Account';
      
      const upgradeBtn = document.getElementById('btn-show-auth-modal');
      if (window.playerSession.isGuest) {
        upgradeBtn.style.display = 'block';
      } else {
        upgradeBtn.style.display = 'none';
      }
    }


    // Toggle admin panel visibility if the current user is host admin
    if (this.colyseusClient && this.colyseusClient.room) {
      const state = this.colyseusClient.room.state;
      // We look up if adminPlayerId matches currentPlayerId
      // In room.state, sessionConfig doesn't expose adminPlayerId, so we get it from local cache
      const isAdmin = window.isAdminOfSession;
      if (isAdmin) {
        adminPanel.classList.remove('hidden');
      } else {
        adminPanel.classList.add('hidden');
      }
    }

    modalContainer.classList.remove('hidden');
    settingsModal.classList.remove('hidden');
  }

  closeSettingsModal() {
    const modalContainer = document.getElementById('modal-container');
    const settingsModal = document.getElementById('settings-modal');
    modalContainer.classList.add('hidden');
    settingsModal.classList.add('hidden');
  }

  // Display status overlays
  showStatus(text, duration = 3000) {
    const toast = document.getElementById('status-toast');
    toast.textContent = text;
    toast.classList.remove('hidden');

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  clear() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }
}

const hudInstance = new HUD();
export default hudInstance;
export { HUD };
