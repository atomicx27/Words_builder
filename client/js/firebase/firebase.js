import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase initialization.
//
// Config resolution order:
//   1. VITE_FIREBASE_* environment variables (used for local `npm run dev`, see .env.example)
//   2. Firebase Hosting's reserved auto-config URL `/__/firebase/init.json`
//      (available automatically once deployed to Firebase Hosting — zero config needed)

let db = null;

function configFromEnv() {
  const env = import.meta.env;
  if (!env.VITE_FIREBASE_PROJECT_ID) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };
}

async function configFromHosting() {
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error(`Hosting auto-config unavailable (HTTP ${res.status})`);
  return res.json();
}

export async function initFirebase() {
  if (db) return db;

  let config = configFromEnv();
  if (!config) {
    try {
      config = await configFromHosting();
    } catch (err) {
      throw new Error(
        'Firebase config not found. For local dev, copy .env.example to .env.local and fill in your Firebase web app config.'
      );
    }
  }

  const app = initializeApp(config);
  db = getFirestore(app);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Firebase not initialized. Call initFirebase() first.');
  return db;
}
