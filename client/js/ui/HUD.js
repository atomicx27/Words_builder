import boardRenderer from '../board/BoardRenderer.js';
import sessionBrowser from './SessionBrowser.js';
import authManager from './AuthManager.js';

class HUD {
  constructor() {
    this.timerInterval = null;
    this.tooltipEl = null;
    this.gameService = null;
  }

  // Initialize HUD overlays
  init(gameService) {
    this.gameService = gameService;
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

    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        this.openSettingsModal();
      });
    }

    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => {
        this.closeSettingsModal();
      });
    }

    // Setup rules modal toggle
    const btnRules = document.getElementById('btn-rules');
    const btnBrowserRules = document.getElementById('btn-browser-rules');
    const btnCloseRules = document.querySelector('#rules-modal .close-btn');
    const rulesModal = document.getElementById('rules-modal');

    const handleRulesOpen = () => {
      modalContainer.classList.remove('hidden');
      rulesModal.classList.remove('hidden');
    };

    if (btnRules) btnRules.addEventListener('click', handleRulesOpen);
    if (btnBrowserRules) btnBrowserRules.addEventListener('click', handleRulesOpen);
    if (btnCloseRules) {
      btnCloseRules.addEventListener('click', () => {
        modalContainer.classList.add('hidden');
        rulesModal.classList.add('hidden');
      });
    }

    // Admin action: Force reset season
    const btnAdminReset = document.getElementById('btn-admin-reset');
    if (btnAdminReset) {
      btnAdminReset.addEventListener('click', () => {
        if (confirm('Are you sure you want to FORCE RESET this season? This will archive the current board and start a fresh board.')) {
          this.gameService.adminReset();
          this.closeSettingsModal();
        }
      });
    }

    // Save username action from Settings modal
    const btnSaveUsername = document.getElementById('btn-save-username');
    const inputUsername = document.getElementById('settings-username-input');

    if (btnSaveUsername) {
      btnSaveUsername.addEventListener('click', async () => {
        const newName = inputUsername.value.trim();
        if (!newName) {
          this.showStatus('Username cannot be empty.');
          return;
        }

        btnSaveUsername.disabled = true;
        btnSaveUsername.textContent = 'Saving...';

        try {
          const player = await authManager.loginWithUsername(newName);

          // Sync to room if connected
          if (this.gameService && this.gameService.room) {
            this.gameService.room.send('change_username', { displayName: player.displayName });
          }

          // Update other UIs
          sessionBrowser.updateProfileButton();
          this.showStatus(`Username saved as "${player.displayName}"!`);
        } catch (err) {
          this.showStatus(err.message || 'Error updating username.');
        } finally {
          btnSaveUsername.disabled = false;
          btnSaveUsername.textContent = 'Save';
        }
      });
    }

    // Switch account button in settings
    const btnShowAuth = document.getElementById('btn-show-auth-modal');
    if (btnShowAuth) {
      btnShowAuth.textContent = 'Switch / Change Username';
      btnShowAuth.addEventListener('click', () => {
        this.closeSettingsModal();
        authManager.open(false);
      });
    }
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
    if (!tile || !this.gameService || !this.gameService.room) {
      this.tooltipEl.style.display = 'none';
      return;
    }

    const state = this.gameService.room.state;
    const player = state.players.get(tile.playerId);
    const displayName = player ? player.displayName : (tile.playerId || 'Builder');
    
    let text = `By ${displayName}`;
    if (tile.isPending) {
      text += ' <span style="color:var(--accent-alt)">(Pending)</span>';
    } else if (tile.placedAt) {
      text += ` (${new Date(tile.placedAt).toLocaleDateString()})`;
    }

    this.tooltipEl.innerHTML = text;
    this.tooltipEl.style.left = `${screenX}px`;
    this.tooltipEl.style.top = `${screenY}px`;
    this.tooltipEl.style.display = 'block';
  }

  // Bind room state modifications to update HUD UI
  syncRoomState(state, currentPlayerId) {
    // 1. Session Name & Code
    const nameEl = document.getElementById('hud-session-name');
    const codeEl = document.getElementById('hud-session-code');
    const sessionConfig = state.sessionConfig;

    if (nameEl) nameEl.textContent = sessionConfig.name || 'Word World';
    
    if (codeEl) {
      if (this.gameService.room.id === 'global') {
        codeEl.style.display = 'none';
      } else {
        codeEl.style.display = 'inline-block';
        const code = this.gameService.sessionData?.inviteCode || this.gameService.room.id.substring(0, 6).toUpperCase();
        codeEl.textContent = `Invite Code: ${code}`;
      }
    }

    // 2. Plays remaining today
    const playsLeftEl = document.getElementById('hud-plays-left');
    const currentPlayer = state.players.get(currentPlayerId);

    if (currentPlayer) {
      const scoreEl = document.getElementById('hud-player-score');
      if (scoreEl) scoreEl.textContent = String(currentPlayer.score);

      const dailyLimit = sessionConfig.dailyWordLimit;
      const isUnlimited = dailyLimit === 'Unlimited' || Number(dailyLimit) <= 0;
      
      if (playsLeftEl) {
        if (isUnlimited) {
          playsLeftEl.textContent = 'Unlimited';
        } else {
          const remaining = Math.max(0, Number(dailyLimit) - currentPlayer.wordsToday);
          playsLeftEl.textContent = `${remaining}/${dailyLimit}`;
        }
      }
    }

    // 3. Online player count
    let onlineCount = 0;
    state.players.forEach(p => {
      if (p.isOnline) onlineCount++;
    });
    const onlineEl = document.getElementById('hud-online-count');
    if (onlineEl) onlineEl.textContent = String(Math.max(1, onlineCount));

    // 4. Set countdown timer
    this.updateSeasonTimer(state.seasonEndTime);
  }

  // Update ticking season reset timer
  updateSeasonTimer(endTime) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const timerEl = document.getElementById('hud-season-timer');
    if (!timerEl) return;

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

    createModal.classList.add('hidden');
    authModal.classList.add('hidden');

    const player = authManager.getCurrentPlayer() || window.playerSession;
    if (player) {
      if (usernameInput) usernameInput.value = player.displayName;
      if (accountTypeEl) accountTypeEl.textContent = `Player: ${player.displayName}`;
    }

    if (this.gameService && this.gameService.room) {
      const isAdmin = window.isAdminOfSession;
      if (isAdmin && adminPanel) {
        adminPanel.classList.remove('hidden');
      } else if (adminPanel) {
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

  showStatus(text, duration = 3000) {
    const toast = document.getElementById('status-toast');
    if (!toast) return;
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
