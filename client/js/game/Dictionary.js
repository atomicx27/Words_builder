// Client-side SOWPODS dictionary.
// The word list (data/sowpods.txt) is published as a static asset by Vite (publicDir)
// and served compressed + cached by Firebase Hosting, so there is no backend needed.

class Dictionary {
  constructor() {
    this.words = new Set();
    this.isLoaded = false;
    this.loadingPromise = null;
  }

  // Start loading (idempotent). Safe to call early and await later.
  load() {
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const res = await fetch('/sowpods.txt');
      if (!res.ok) throw new Error(`Failed to download dictionary (HTTP ${res.status})`);
      const text = await res.text();

      for (const line of text.split(/\r?\n/)) {
        const word = line.trim().toUpperCase();
        if (word.length >= 2) this.words.add(word);
      }
      this.isLoaded = true;
      console.log(`Dictionary loaded: ${this.words.size} words.`);
    })().catch(err => {
      // Allow a retry on the next call
      this.loadingPromise = null;
      throw err;
    });

    return this.loadingPromise;
  }

  isValid(word) {
    if (!word) return false;
    return this.words.has(word.toUpperCase());
  }
}

const dictionaryInstance = new Dictionary();
export default dictionaryInstance;
export { Dictionary };
