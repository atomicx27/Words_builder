import boardState from '../board/BoardState.js';
import tileRack from '../game/TileRack.js';
import placementValidator from '../game/PlacementValidator.js';
import scoreCalculator from '../game/ScoreCalculator.js';
import colyseusClient from '../network/ColyseusClient.js';
import hud from './HUD.js';

class ActionBar {
  constructor() {
    this.btnSubmit = null;
    this.btnRecall = null;
    this.btnShuffle = null;
    this.btnExchange = null;
    this.scorePreviewEl = null;
  }

  // Bind DOM elements and attach listeners
  init() {
    this.btnSubmit = document.getElementById('btn-submit');
    this.btnRecall = document.getElementById('btn-recall');
    this.btnShuffle = document.getElementById('btn-shuffle');
    this.btnExchange = document.getElementById('btn-exchange');
    this.scorePreviewEl = document.getElementById('submit-score-preview');

    // Recall pending tiles
    this.btnRecall.addEventListener('click', () => {
      tileRack.recallAll();
      this.updateControls();
    });

    // Shuffle rack
    this.btnShuffle.addEventListener('click', () => {
      tileRack.shuffle();
    });

    // Exchange all tiles
    this.btnExchange.addEventListener('click', () => {
      if (confirm('Exchange all tiles? This will swap your letters but cost you 1 word placement credit for today.')) {
        colyseusClient.exchangeTiles();
      }
    });

    // Submit word placement
    this.btnSubmit.addEventListener('click', () => {
      const pending = boardState.getPendingTilesArray();
      if (pending.length > 0) {
        this.btnSubmit.disabled = true;
        this.btnSubmit.querySelector('.btn-text').textContent = 'Validating...';
        
        // Send to server
        colyseusClient.submitWord(pending);
      }
    });

    // Listen to changes in the tile rack to re-evaluate placement
    tileRack.onRackChange(() => {
      this.updateControls();
    });
  }

  // Run validation and update button states
  updateControls() {
    const pending = boardState.getPendingTilesArray();

    // Reset button label
    this.btnSubmit.querySelector('.btn-text').textContent = 'Submit Word';

    if (pending.length === 0) {
      this.btnSubmit.disabled = true;
      this.scorePreviewEl.textContent = '';
      return;
    }

    // Run client side pre-validation
    const validation = placementValidator.validate(boardState, pending);

    if (validation.valid) {
      // Calculate preview score
      const calc = scoreCalculator.calculateScore(pending, validation.wordsFormed);
      
      this.btnSubmit.disabled = false;
      this.scorePreviewEl.textContent = `(+${calc.score})`;
      
      // Clear any previous error warnings
      this.clearValidationError();
    } else {
      this.btnSubmit.disabled = true;
      this.scorePreviewEl.textContent = '';
      
      // Display first validation error
      if (validation.errors.length > 0) {
        this.showValidationError(validation.errors[0]);
      }
    }
  }

  // Display validation warning toast
  showValidationError(errMessage) {
    hud.showStatus(`Warning: ${errMessage}`, 2500);
  }

  clearValidationError() {
    const toast = document.getElementById('status-toast');
    if (toast.textContent.startsWith('Warning:')) {
      toast.classList.add('hidden');
    }
  }

  // Lock UI if player is out of daily words
  disableAll(isDisabled) {
    this.btnSubmit.disabled = isDisabled;
    this.btnExchange.disabled = isDisabled;
  }
}

const actionBarInstance = new ActionBar();
export default actionBarInstance;
export { ActionBar };
