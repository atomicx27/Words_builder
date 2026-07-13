import boardRenderer from '../board/BoardRenderer.js';

class ThemePicker {
  init() {
    const themeOptions = document.querySelectorAll('.theme-option');
    const savedTheme = localStorage.getItem('theme') || 'neon-dark';

    // Apply saved theme on startup
    this.applyTheme(savedTheme);

    themeOptions.forEach(btn => {
      // Set active state on button
      if (btn.getAttribute('data-theme') === savedTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      btn.addEventListener('click', () => {
        const theme = btn.getAttribute('data-theme');
        
        // Remove active class from all
        themeOptions.forEach(o => o.classList.remove('active'));
        btn.classList.add('active');

        this.applyTheme(theme);
        localStorage.setItem('theme', theme);
      });
    });
  }

  applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    
    // If boardRenderer is initialized, swap colors
    if (boardRenderer.app) {
      boardRenderer.setTheme(themeName);
    }
  }
}

const themePickerInstance = new ThemePicker();
export default themePickerInstance;
export { ThemePicker };
