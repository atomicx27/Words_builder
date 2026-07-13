import hud from './HUD.js';
import sessionBrowser from './SessionBrowser.js';
import { BACKEND_URL } from '../network/config.js';


class AuthManager {
  constructor() {
    this.modal = null;
    this.container = null;
  }

  // Auto sign-in or create guest on load
  async checkAuth() {
    const savedPlayerId = localStorage.getItem('playerId');
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/guest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playerId: savedPlayerId })
      });


      const data = await res.json();
      if (!res.ok || !data.player) {
        console.error('Failed to authenticate guest.');
        return null;
      }

      // Save player to window scope
      window.playerSession = data.player;
      localStorage.setItem('playerId', data.player.id);
      
      return data.player;
    } catch (err) {
      console.error('Network error during guest authentication:', err);
      return null;
    }
  }

  // Initialize UI event handlers
  init() {
    this.container = document.getElementById('modal-container');
    this.modal = document.getElementById('auth-modal');

    // Tab switching
    const tabRegister = document.getElementById('tab-register');
    const tabLogin = document.getElementById('tab-login');
    const formRegister = document.getElementById('form-register');
    const formLogin = document.getElementById('form-login');

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      formRegister.classList.remove('hidden');
      formLogin.classList.add('hidden');
    });

    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.classList.remove('hidden');
      formRegister.classList.add('hidden');
    });

    // Close button
    this.modal.querySelector('.close-btn').addEventListener('click', () => {
      this.close();
    });

    // Form Submit: Register/Upgrade
    formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleRegister();
    });

    // Form Submit: Login
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
  }

  close() {
    this.container.classList.add('hidden');
    this.modal.classList.add('hidden');
  }

  // Sign up guest -> permanent
  async handleRegister() {
    const displayName = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    if (!displayName || !email || !password) return;

    hud.showStatus('Creating account...');

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ displayName, email, password })
      });


      const data = await res.json();
      if (!res.ok) {
        hud.showStatus(data.error || 'Failed to create account.');
        return;
      }

      window.playerSession = data.player;
      
      hud.showStatus('Account upgraded successfully! 🔒');
      sessionBrowser.updateProfileButton();
      
      // Update settings UI
      const usernameInput = document.getElementById('settings-username-input');
      const accountTypeEl = document.getElementById('settings-account-type');
      if (usernameInput) usernameInput.value = displayName;
      if (accountTypeEl) accountTypeEl.textContent = 'Registered Account';

      this.close();

    } catch (err) {
      hud.showStatus('Network error during registration.');
    }
  }

  // Log in existing user
  async handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) return;

    hud.showStatus('Signing in...');

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });


      const data = await res.json();
      if (!res.ok) {
        hud.showStatus(data.error || 'Invalid credentials.');
        return;
      }

      window.playerSession = data.player;
      localStorage.setItem('playerId', data.player.id);
      
      hud.showStatus(`Welcome back, ${data.player.displayName}!`);
      
      // Update browser & settings UI
      sessionBrowser.playerId = data.player.id;
      sessionBrowser.updateProfileButton();
      
      const usernameInput = document.getElementById('settings-username-input');
      const accountTypeEl = document.getElementById('settings-account-type');
      if (usernameInput) usernameInput.value = data.player.displayName;
      if (accountTypeEl) accountTypeEl.textContent = 'Registered Account';

      this.close();

      
      // Re-trigger browser reload to fetch rooms under new ID
      sessionBrowser.loadPublicSessions();
    } catch (err) {
      hud.showStatus('Network error during login.');
    }
  }
}

const authManagerInstance = new AuthManager();
export default authManagerInstance;
export { AuthManager };
