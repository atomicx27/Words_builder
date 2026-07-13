import colyseusClient from '../network/ColyseusClient.js';
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
    this.overlay = document.getElementById('session-browser-overlay');

    // Button: Enter Global World
    document.getElementById('btn-join-global').addEventListener('click', () => {
      this.joinSession('global');
    });

    // Button: Join by Code
    document.getElementById('btn-join-code').addEventListener('click', () => {
      this.joinByInviteCode();
    });

    // Profile Pill: Show signup/login modal
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
        colyseusClient.leave();
        this.show();
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
    if (window.playerSession) {
      const name = window.playerSession.displayName;
      const isGuest = window.playerSession.isGuest;
      btn.textContent = isGuest ? `${name} (Guest)` : name;
      btn.style.borderColor = isGuest ? 'var(--border-color)' : 'var(--accent)';
    }
  }

  // Connect to Colyseus Room
  async joinSession(sessionId, isAdmin = false) {
    hud.showStatus('Connecting to world server...', 5000);
    try {
      window.isAdminOfSession = isAdmin;
      await colyseusClient.joinSession(sessionId, this.playerId);
      
      this.hide();
      if (this.onSessionJoinedCallback) {
        this.onSessionJoinedCallback(sessionId);
      }
    } catch (err) {
      hud.showStatus('Error: Failed to connect to server.');
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
      const res = await fetch(`/api/sessions/code/${code}`);
      const data = await res.json();
      
      if (!res.ok || !data.session) {
        hud.showStatus(data.error || 'Session not found.');
        return;
      }

      // Check if current user is admin of this session
      const isAdmin = data.session.adminPlayerId === this.playerId;
      await this.joinSession(data.session.id, isAdmin);
      input.value = '';
    } catch (err) {
      hud.showStatus('Error joining room by code.');
    }
  }

  // Fetch public sessions and render list
  async loadPublicSessions() {
    const listEl = document.getElementById('public-sessions-list');
    listEl.innerHTML = '<p class="loading-placeholder">Loading active worlds...</p>';

    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();

      if (!res.ok || !data.sessions) {
        listEl.innerHTML = '<p class="loading-placeholder">Failed to load public sessions.</p>';
        return;
      }

      listEl.innerHTML = '';
      if (data.sessions.length === 0) {
        listEl.innerHTML = '<p class="loading-placeholder">No active custom public worlds. Create one!</p>';
        return;
      }

      data.sessions.forEach(session => {
        const card = document.createElement('div');
        card.className = 'session-row-card';
        
        const details = document.createElement('div');
        details.className = 'session-card-details';
        
        const title = document.createElement('h5');
        title.textContent = session.name;
        details.appendChild(title);
        
        const meta = document.createElement('div');
        meta.className = 'session-card-meta';
        meta.innerHTML = `
          <span>Limit: ${session.config.dailyWordLimit} words/day</span> | 
          <span>Duration: ${session.config.duration.replace('_', ' ')}</span>
        `;
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
      listEl.innerHTML = '<p class="loading-placeholder">Error connecting to session API.</p>';
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
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          config: {
            duration,
            dailyWordLimit,
            dictionary,
            isPrivate,
            bonusSquares
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.session) {
        hud.showStatus(data.error || 'Failed to create session.');
        return;
      }

      // Hide modal
      document.getElementById('modal-container').classList.add('hidden');
      document.getElementById('create-session-modal').classList.add('hidden');

      // Join new session (user is admin)
      await this.joinSession(data.session.id, true);
    } catch (err) {
      hud.showStatus('Error creating custom session.');
    }
  }

  openAuthModal() {
    const modalContainer = document.getElementById('modal-container');
    const authModal = document.getElementById('auth-modal');
    
    // Hide other modals
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('create-session-modal').classList.add('hidden');

    modalContainer.classList.remove('hidden');
    authModal.classList.remove('hidden');
  }
}

const sessionBrowserInstance = new SessionBrowser();
export default sessionBrowserInstance;
export { SessionBrowser };
