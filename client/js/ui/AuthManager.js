import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '../firebase/firebase.js';

const STORAGE_KEY = 'words_builder_username';

class AuthManager {
  constructor() {
    this.currentPlayer = null;
    this.modal = null;
    this.container = null;
    this.onAuthChangeCallbacks = [];
  }

  onAuthChange(callback) {
    this.onAuthChangeCallbacks.push(callback);
  }

  emitAuthChange() {
    for (const cb of this.onAuthChangeCallbacks) {
      try {
        cb(this.currentPlayer);
      } catch (err) {
        console.error('Error in onAuthChange callback:', err);
      }
    }
  }

  getCurrentPlayer() {
    return this.currentPlayer;
  }

  // Normalize username for document ID (must match firestore rules: ^[a-z0-9_-]{2,20}$)
  normalizePlayerId(username) {
    return username.trim().toLowerCase();
  }

  validateUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required.' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return { valid: false, error: 'Username must be between 2 and 20 characters.' };
    }
    const regex = /^[a-zA-Z0-9_-]{2,20}$/;
    if (!regex.test(trimmed)) {
      return { valid: false, error: 'Username can only contain letters, numbers, underscores, and dashes.' };
    }
    return { valid: true, username: trimmed };
  }

  // Attempt to restore saved username from localStorage
  async checkAuth() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const val = this.validateUsername(saved);
      if (val.valid) {
        try {
          const player = await this.loginWithUsername(val.username);
          return player;
        } catch (err) {
          console.warn('Auto-login with saved username failed:', err);
        }
      }
    }
    return null;
  }

  // Login or create player profile matching only the username in Firestore
  async loginWithUsername(rawUsername) {
    const val = this.validateUsername(rawUsername);
    if (!val.valid) {
      throw new Error(val.error);
    }

    const username = val.username;
    const playerId = this.normalizePlayerId(username);
    const db = getDb();
    const playerRef = doc(db, 'players', playerId);

    const now = Date.now();
    const snap = await getDoc(playerRef);

    let playerObj;
    if (snap.exists()) {
      // Existing profile found: match username, update lastLoginAt and continue
      const data = snap.data();
      await updateDoc(playerRef, {
        lastLoginAt: now,
        username: username // preserve latest casing
      });
      playerObj = {
        id: playerId,
        displayName: username,
        createdAt: data.createdAt || now,
        lastLoginAt: now
      };
    } else {
      // First time player: create new profile matching this username
      playerObj = {
        username: username,
        createdAt: now,
        lastLoginAt: now
      };
      await setDoc(playerRef, playerObj);
      playerObj = {
        id: playerId,
        displayName: username,
        createdAt: now,
        lastLoginAt: now
      };
    }

    this.currentPlayer = playerObj;
    window.playerSession = playerObj;
    localStorage.setItem(STORAGE_KEY, username);
    localStorage.setItem('playerId', playerId);

    this.emitAuthChange();
    return playerObj;
  }

  init() {
    this.container = document.getElementById('modal-container');
    this.modal = document.getElementById('auth-modal');

    // Close button
    const closeBtn = this.modal?.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (this.currentPlayer) {
          this.close();
        }
      });
    }

    // Simple username form submit
    const authForm = document.getElementById('simple-auth-form');
    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('username-login-input');
        const submitBtn = document.getElementById('btn-login-submit');
        const errEl = document.getElementById('auth-error-msg');
        if (!input) return;

        const username = input.value.trim();
        if (!username) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Continuing...';
        if (errEl) errEl.textContent = '';

        try {
          await this.loginWithUsername(username);
          this.close();
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Failed to continue with username.';
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Continue to Game';
        }
      });
    }
  }

  open(mandatory = false) {
    if (!this.container || !this.modal) return;
    this.container.classList.remove('hidden');
    this.modal.classList.remove('hidden');

    const closeBtn = this.modal.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.style.display = mandatory ? 'none' : 'block';
    }

    const input = document.getElementById('username-login-input');
    if (input) {
      input.value = this.currentPlayer ? this.currentPlayer.displayName : (localStorage.getItem(STORAGE_KEY) || '');
      setTimeout(() => input.focus(), 50);
    }
  }

  close() {
    if (this.container && this.modal) {
      this.container.classList.add('hidden');
      this.modal.classList.add('hidden');
    }
  }

  logout() {
    this.currentPlayer = null;
    window.playerSession = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('playerId');
    this.emitAuthChange();
    this.open(true);
  }
}

const authManagerInstance = new AuthManager();
export default authManagerInstance;
export { AuthManager };
