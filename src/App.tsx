import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc
} from 'firebase/firestore';

// ==========================================
// Firebase Initialization
// ==========================================

const getEnv = (key: string): string | undefined => {
  try {
    return (import.meta as any).env?.[key];
  } catch {
    return undefined;
  }
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID'),
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// Firestore Path 修正版
// ==========================================

const FAMILY_ID = 'oomine-study-2026';

// Firestore Path 固定（変更禁止）
const FIRESTORE_ROOT = ['families', FAMILY_ID] as const;

// Firestore Path Helpers
export const getTasksCol = () =>
  collection(db, ...FIRESTORE_ROOT, 'tasks');

export const getTestsCol = () =>
  collection(db, ...FIRESTORE_ROOT, 'tests');

export const getTaskDoc = (id: string) =>
  doc(db, ...FIRESTORE_ROOT, 'tasks', id);

export const getTestDoc = (id: string) =>
  doc(db, ...FIRESTORE_ROOT, 'tests', id);

// ==========================================
// App
// ==========================================

export default function App() {
  return (
    <div style={{
      padding: '40px',
      fontSize: '24px',
      fontWeight: 'bold'
    }}>
      Firestore 修正版 App.tsx
      <br />
      DB Path:
      <br />
      families/oomine-study-2026/tasks
    </div>
  );
}
