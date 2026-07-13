import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Trie from '@datastructures-js/trie';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DICTIONARY_URL = 'https://raw.githubusercontent.com/jesstess/Scrabble/master/scrabble/sowpods.txt';
const DATA_DIR = path.join(__dirname, '../../data');
const SOWPODS_PATH = path.join(DATA_DIR, 'sowpods.txt');

class Dictionary {
  constructor() {
    this.trie = new Trie();
    this.isLoaded = false;
  }

  async init() {
    if (this.isLoaded) return;

    try {
      await this.ensureDictionaryFileExists();
      await this.loadDictionary();
      this.isLoaded = true;
      console.log('Dictionary loaded successfully into Trie.');
    } catch (error) {
      console.error('Failed to initialize dictionary:', error);
      throw error;
    }
  }

  async ensureDictionaryFileExists() {
    if (fs.existsSync(SOWPODS_PATH)) {
      return;
    }

    console.log('SOWPODS dictionary not found locally. Downloading from GitHub...');
    
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const response = await fetch(DICTIONARY_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch SOWPODS dictionary: ${response.statusText}`);
    }

    const text = await response.text();
    fs.writeFileSync(SOWPODS_PATH, text, 'utf8');
    console.log(`Saved dictionary to ${SOWPODS_PATH}`);
  }

  async loadDictionary() {
    console.log('Reading dictionary file...');
    const fileContent = fs.readFileSync(SOWPODS_PATH, 'utf8');
    const words = fileContent.split(/\r?\n/);
    
    let count = 0;
    for (const word of words) {
      const trimmed = word.trim().toUpperCase();
      if (trimmed && trimmed.length >= 2) {
        this.trie.insert(trimmed);
        count++;
      }
    }
    console.log(`Inserted ${count} words into the Trie.`);
  }

  isValid(word) {
    if (!word) return false;
    return this.trie.has(word.toUpperCase());
  }

  isPrefix(prefix) {
    if (!prefix) return false;
    return this.trie.hasPrefix(prefix.toUpperCase());
  }
}

// Export singleton instance
const dictionaryInstance = new Dictionary();
export default dictionaryInstance;
