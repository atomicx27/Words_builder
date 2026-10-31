import gameRoomService from '../network/GameRoomService.js';
import sessionService from '../network/SessionService.js';
import authManager from './AuthManager.js';
import hud from './HUD.js';

class SessionBrowser {
  constructor() {
    this.overlay = null;
    this.playerId = null;
    this.onSessionJoinedCallback = null;
  }

  // Bind callback to execute when a room is entered
  onSessionJoined(callback) {
    this.onSessionJoinedCallback = callback;
  }

  init(playerId) {
    this.playerId = playerId;
    if (this.initialized) {
      this.updateProfileButton();
      return;
    }
    this.initialized = true;
    this.overlay = document.getElementById('session-browser-overlay');

    // Button: Enter Global World
    document.getElementById('btn-join-global').addEventListener('click', () => {
      this.joinSession('global');
    });

    // Button: Join by Code
    document.getElementById('btn-join-code').addEventListener('click', () => {
      this.joinByInviteCode();
    });

    // Profile Pill: Show username switch / login modal
    document.getElementById('btn-browser-profile').addEventListener('click', () => {
      this.openAuthModal();
    });

    // Create World Modal controls
    const btnShowCreate = document.getElementById('btn-show-create-modal');
    const createModal = document.getElementById('create-session-modal');
    const modalContainer = document.getElementById('modal-container');
    const closeCreate = createModal.querySelector('.close-btn');

    btnShowCreate.addEventListener('click', () => {
      // Hide other modals
      document.getElementById('settings-modal').classList.add('hidden');
      document.getElementById('auth-modal').classList.add('hidden');

      modalContainer.classList.remove('hidden');
      createModal.classList.remove('hidden');
    });

    closeCreate.addEventListener('click', () => {
      modalContainer.classList.add('hidden');
      createModal.classList.add('hidden');
    });

    // Create World Form Submit
    document.getElementById('create-session-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitCreateSession();
    });

    // Refresh browser profile text
    this.updateProfileButton();

    // Load public sessions list
    this.loadPublicSessions();

    // Setup HUD return to browser button
    document.getElementById('btn-show-browser').addEventListener('click', () => {
      if (confirm('Leave current word world and return to the session browser?')) {
        gameRoomService.leave();
        this.show();
      }
    });

    // Listen to auth changes
    authManager.onAuthChange((player) => {
      if (player) {
        this.playerId = player.id;
        this.updateProfileButton();
        this.loadPublicSessions();
      }
    });
  }

  // Show browser screen
  show() {
    this.overlay.classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('bottom-shelf').classList.add('hidden');
    this.loadPublicSessions();
    this.updateProfileButton();
  }

  // Hide browser screen (game starts)
  hide() {
    this.overlay.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('bottom-shelf').classList.remove('hidden');
  }

  updateProfileButton() {
    const btn = document.getElementById('btn-browser-profile');
    const player = authManager.getCurrentPlayer() || window.playerSession;
    if (player) {
      btn.textContent = `👤 ${player.displayName}`;
      btn.style.borderColor = 'var(--accent)';
    } else {
      btn.textContent = '👤 Enter Username';
      btn.style.borderColor = 'var(--border-color)';
    }
  }

  // Connect to Game Session
  async joinSession(sessionId, isAdmin = false) {
    if (this.isJoining) return;
    if (!this.playerId) {
      authManager.open(true);
      return;
    }

    this.isJoining = true;
    hud.showStatus('Connecting to word world...', 4000);
    try {
      window.isAdminOfSession = isAdmin;
      await gameRoomService.joinSession(sessionId, this.playerId);
      
      this.hide();
      if (this.onSessionJoinedCallback) {
        this.onSessionJoinedCallback(sessionId);
      }
    } catch (err) {
      console.error('Failed to join session:', err);
      hud.showStatus(`Error: ${err.message || 'Failed to connect to world.'}`, 5000);
    } finally {
      this.isJoining = false;
    }
  }

  // Join a custom room using invite code input
  async joinByInviteCode() {
    const input = document.getElementById('invite-code-input');
    const code = input.value.trim().toUpperCase();

    if (!code) {
      hud.showStatus('Please enter a valid room invite code.');
      return;
    }

    hud.showStatus('Locating session...');
    try {
      const session = await sessionService.getSessionByCode(code);
      if (!session) {
        hud.showStatus('Session not found for that invite code.', 4000);
        return;
      }

      const isAdmin = session.adminPlayerId === this.playerId;
      await this.joinSession(session.id, isAdmin);
      input.value = '';
    } catch (err) {
      console.error('Error joining by invite code:', err);
      hud.showStatus('Error joining room by code.');
    }
  }

  // Fetch public sessions and render list
  async loadPublicSessions() {
    const listEl = document.getElementById('public-sessions-list');
    listEl.innerHTML = '<p class="loading-placeholder">Loading active worlds...</p>';

    try {
      const sessions = await sessionService.getPublicSessions();

      listEl.innerHTML = '';
      if (!sessions || sessions.length === 0) {
        listEl.innerHTML = '<p class="loading-placeholder">No active custom public worlds. Create one!</p>';
        return;
      }

      sessions.forEach(session => {
        const card = document.createElement('div');
        card.className = 'session-row-card';
        
        const details = document.createElement('div');
        details.className = 'session-card-details';
        
        const title = document.createElement('h5');
        title.textContent = session.name;
        details.appendChild(title);
        
        const meta = document.createElement('div');
        meta.className = 'session-card-meta';
        const limitStr = session.config?.dailyWordLimit === '0' ? 'Unlimited' : `${session.config?.dailyWordLimit || '10'} words/day`;
        const durStr = (session.config?.duration || 'ONE_WEEK').replace('_', ' ');
        meta.innerHTML = `<span>Limit: ${limitStr}</span> | <span>Duration: ${durStr}</span>`;
        details.appendChild(meta);
        
        card.appendChild(details);

        const joinBtn = document.createElement('span');
        joinBtn.className = 'btn btn-secondary btn-sm';
        joinBtn.textContent = 'Enter';
        card.appendChild(joinBtn);

        // Click handler to join
        card.addEventListener('click', () => {
          const isAdmin = session.adminPlayerId === this.playerId;
          this.joinSession(session.id, isAdmin);
        });

        listEl.appendChild(card);
      });
    } catch (err) {
      console.error('Error loading public sessions:', err);
      listEl.innerHTML = '<p class="loading-placeholder">Error connecting to database.</p>';
    }
  }

  // Submit custom session creation form
  async submitCreateSession() {
    const name = document.getElementById('room-name').value.trim();
    const duration = document.getElementById('room-duration').value;
    const dailyWordLimitStr = document.getElementById('room-limit').value;
    const dailyWordLimit = dailyWordLimitStr === '0' ? 'Unlimited' : dailyWordLimitStr;
    const dictionary = document.getElementById('room-dict').value;
    const isPrivate = document.getElementById('room-privacy').value === 'true';
    const bonusSquares = document.getElementById('room-bonuses').checked;

    if (!name) return;

    hud.showStatus('Creating custom world...');

    try {
      const newSession = await sessionService.createSession(name, this.playerId, {
        duration,
        dailyWordLimit,
        dictionary,
        isPrivate,
        bonusSquares
      });

      // Hide modal
      document.getElementById('modal-container').classList.add('hidden');
      document.getElementById('create-session-modal').classList.add('hidden');

      // Join new session as admin
      await this.joinSession(newSession.id, true);
    } catch (err) {
      console.error('Error creating custom session:', err);
      hud.showStatus(`Error creating custom session: ${err.message || ''}`, 4000);
    }
  }

  openAuthModal() {
    authManager.open(false);
  }
}

const sessionBrowserInstance = new SessionBrowser();
export default sessionBrowserInstance;
export { SessionBrowser };
