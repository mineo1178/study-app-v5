import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Clock, Play, Pause, Plus, Trash2, CheckCircle, Circle, Edit2,
  ChevronDown, Award, X, Zap, Layers, History, LayoutDashboard, 
  TrendingUp, Calendar as CalendarIcon, PieChart as PieChartIcon, BarChart2,
  AlertTriangle, RefreshCw, CloudOff, Cloud, FileText, FlaskConical, LogIn, LogOut
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, query
} from 'firebase/firestore';

// ==========================================
// Firebase Initialization (Vite + Vercel)
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

const hasFirebaseConfig =
  !!firebaseConfig.apiKey &&
  !!firebaseConfig.authDomain &&
  !!firebaseConfig.projectId &&
  !!firebaseConfig.appId;

let app = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

if (hasFirebaseConfig) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase init error", e);
  }
}

// ==========================================
// 1. Type Definitions & Constants
// ==========================================

const FAMILY_ID = 'oomine-study-2026';

// Firestore Path 固定（変更禁止）
// 実DB構造:
// families/oomine-study-2026/tasks
// families/oomine-study-2026/tests
const FIRESTORE_ROOT = ['families', FAMILY_ID] as const;

// Safe DB Wrapper
const getSafeDb = () => {
  if (!db) {
    console.warn("Firestore not initialized");
    return null;
  }
  return db;
};

// Firestore Path Helpers
const getTasksCol = (database: any) =>
  collection(database, ...FIRESTORE_ROOT, 'tasks');

const getTestsCol = (database: any) =>
  collection(database, ...FIRESTORE_ROOT, 'tests');

const getTaskDoc = (database: any, id: string) =>
  doc(database, ...FIRESTORE_ROOT, 'tasks', id);

const getTestDoc = (database: any, id: string) =>
  doc(database, ...FIRESTORE_ROOT, 'tests', id);

// Cache Keys
const CACHE_KEY_TASKS = `study-app-v5-${FAMILY_ID}-tasks`;
const CACHE_KEY_TESTS = `study-app-v5-${FAMILY_ID}-tests`;
const IDLE_LIMIT_MS = 5 * 60 * 1000;

type Subject = 'math' | 'japanese' | 'science' | 'social';

interface SubjectConfig {
  id: Subject; label: string; short: string; color: string; bg: string; lightBg: string; border: string; hex: string;
}

interface Task {
  id: string;
  unit: string;
  subject: Subject;
  category: string;
  title: string;
  materialName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  currentDuration: number;
  sessionStartTime: number | null; 
  isRunning: boolean;
  lastActivityAt?: number;
  lastUpdatedAt: number; 
  currentMemo: string;
  history: { id: string; date: string; duration: number; memo: string; startAt?: number; endAt?: number }[];
  createdAt: string;
}

interface TestResult {
  id: string;
  date: string;
  name: string;
  type: string;
  subjects: Record<Subject, { score: number; avg: number; dev: number; rank?: string }>;
  total4: { score: number; avg: number; dev: number; rank: string };
}

const SUBJECT_CONFIG: Record<Subject, SubjectConfig> = {
  math: { id: 'math', label: '算数', short: '算', color: 'text-blue-600', bg: 'bg-blue-500', lightBg: 'bg-blue-50', border: 'border-blue-200', hex: '#2563eb' },
  japanese: { id: 'japanese', label: '国語', short: '国', color: 'text-rose-600', bg: 'bg-rose-500', lightBg: 'bg-rose-50', border: 'border-rose-200', hex: '#e11d48' },
  science: { id: 'science', label: '理科', short: '理', color: 'text-amber-600', bg: 'bg-amber-500', lightBg: 'bg-amber-50', border: 'border-amber-200', hex: '#d97706' },
  social: { id: 'social', label: '社会', short: '社', color: 'text-emerald-600', bg: 'bg-emerald-500', lightBg: 'bg-emerald-50', border: 'border-emerald-200', hex: '#059669' },
};

const TEST_TYPE_CONFIG: Record<string, { label: string; color: string; activeClass: string }> = {
  kumiwake: { label: '組分け', color: 'text-purple-700', activeClass: 'bg-purple-600 text-white border-purple-600' },
  curriculum: { label: 'カリテ', color: 'text-slate-700', activeClass: 'bg-slate-600 text-white border-slate-600' },
  hantei: { label: '判定', color: 'text-orange-700', activeClass: 'bg-orange-600 text-white border-orange-600' },
};

const CURRICULUM_PRESETS: Record<Subject, { category: string; items: string[] }[]> = {
  math: [
    { category: '予習シリーズ', items: ['類題', '基本問題', '練習問題'] },
    { category: '演習問題集', items: ['基本問題', '練習問題', 'トレーニング', '実戦演習'] },
    { category: '計算', items: ['①', '②', '③', '④', '⑤', '⑥', '⑦'] },
    { category: 'プリント', items: ['確認テストB', '確認テストS', '確認テストA', '計算テストS', '計算テストA'] },
  ],
  japanese: [
    { category: '予習シリーズ', items: ['基本問題', '発展問題', '言語知識'] },
    { category: '漢字とことば', items: ['漢字練習', '漢字確認'] },
    { category: '演習問題集', items: ['演習問題集'] },
    { category: '練成問題', items: ['言語知識', '文章問題'] },
  ],
  science: [
    { category: '予習シリーズ', items: ['要点チェック'] },
    { category: '演習問題集', items: ['まとめてみよう', '基本問題', '練習問題', '発展問題'] },
    { category: 'プリント', items: ['確認テストB', '確認テストS', '確認テストA'] },
    { category: '練成問題', items: ['トレーニング', '基本問題', '練習問題'] },
  ],
  social: [
    { category: '予習シリーズ', items: ['要点チェック'] },
    { category: '演習問題集', items: ['まとめてみよう', '練習問題', '発展問題'] },
    { category: 'プリント', items: ['確認テストB', '確認テストS', '確認テストA'] },
    { category: '練成問題', items: ['トレーニング', '基本問題', '練習問題'] },
  ]
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m${s}s`;
};

// ==========================================
// Local Storage Cache Helpers
// ==========================================
const getCache = (key: string) => {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; } catch { return null; }
};
const setCache = (key: string, val: any) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// ==========================================
// Helper: Generate Dummy Data
// ==========================================
const generateDummyTasks = (): Task[] => {
  const tasks: Task[] = [];
  const subjects: Subject[] = ['math', 'japanese', 'science', 'social'];
  const today = new Date();
  
  [14, 13].forEach(unitNum => {
    const unit = `第${unitNum}回`;
    subjects.forEach(subj => {
      const presets = CURRICULUM_PRESETS[subj];
      presets.forEach(cat => {
        cat.items.forEach((item, idx) => {
          const hasHistory = Math.random() > 0.3;
          const history = [];
          
          if (hasHistory) {
            const entries = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < entries; i++) {
              const daysAgo = Math.floor(Math.random() * 30);
              const date = new Date(today);
              date.setDate(today.getDate() - daysAgo);
              const duration = (Math.floor(Math.random() * 40) + 10) * 60;
              const startAt = new Date(date).setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 4) * 15, 0, 0);
              const endAt = startAt + duration * 1000;
              history.push({
                id: Math.random().toString(36).substr(2, 9),
                date: `${date.getMonth() + 1}/${date.getDate()}`,
                duration,
                memo: Math.random() > 0.7 ? '難しかった' : '',
                startAt,
                endAt
              });
            }
            history.sort((a, b) => {
               const [ma, da] = a.date.split('/').map(Number);
               const [mb, db] = b.date.split('/').map(Number);
               return (ma * 31 + da) - (mb * 31 + db);
            });
          }

          tasks.push({
            id: `${unitNum}-${subj}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
            unit,
            subject: subj,
            category: cat.category,
            title: item,
            materialName: `${cat.category} - ${item}`,
            status: hasHistory ? (Math.random() > 0.5 ? 'completed' : 'in_progress') : 'not_started',
            currentDuration: 0,
            sessionStartTime: null,
            isRunning: false,
            lastUpdatedAt: Date.now(),
            currentMemo: '',
            history,
            createdAt: `${today.getMonth() + 1}/${today.getDate()}`
          });
        });
      });
    });
  });
  return tasks;
};

const INITIAL_TASKS: Task[] = generateDummyTasks();

const INITIAL_TESTS: TestResult[] = [
  {
    id: 't20261109', date: '2026/11/09', name: '5年公開組分-07', type: 'kumiwake',
    subjects: {
      math: { score: 90, avg: 97.1, dev: 48.1, rank: '6082/10342' },
      japanese: { score: 75, avg: 69.4, dev: 52.3, rank: '4080/10342' },
      science: { score: 70, avg: 62.9, dev: 53.8, rank: '3805/10069' },
      social: { score: 87, avg: 60.7, dev: 61.4, rank: '1279/10001' },
    },
    total4: { score: 322, avg: 290.7, dev: 53.4, rank: '3844/10001' }
  },
  {
    id: 't20261005', date: '2026/10/05', name: '5年公開組分-06', type: 'kumiwake',
    subjects: {
      math: { score: 72, avg: 90.9, dev: 44.6, rank: '7317/10413' },
      japanese: { score: 98, avg: 85.8, dev: 54.8, rank: '3473/10413' },
      science: { score: 76, avg: 77.8, dev: 48.9, rank: '6301/10152' },
      social: { score: 81, avg: 66.8, dev: 55.9, rank: '3457/10075' },
    },
    total4: { score: 327, avg: 322.1, dev: 50.5, rank: '5210/10075' }
  },
];


// ==========================================
// Strict Anti-Cheat Timer Component
// ==========================================
const StrictTimer = React.memo(({ 
  task, updateLocalTask, syncTaskToCloud, onSaveRecord, pauseAllOtherTasks
}: { 
  task: Task; 
  updateLocalTask: (id: string, updates: Partial<Task>) => void;
  syncTaskToCloud: (id: string, cloudUpdates: any) => void;
  onSaveRecord: (task: Task) => void;
  pauseAllOtherTasks: (id: string) => Promise<void>;
}) => {
  const [localSeconds, setLocalSeconds] = useState(task.currentDuration);
  const [showAutoPauseAlert, setShowAutoPauseAlert] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActive = useRef(Date.now());
  const isRunning = task.isRunning;

  // 正確な現在秒数を計算するヘルパー（バックグラウンド等で表示が遅延しても正しい秒数を得る）
  const getAccurateSeconds = useCallback(() => {
    if (isRunning && task.sessionStartTime) {
      return task.currentDuration + Math.floor((Date.now() - task.sessionStartTime) / 1000);
    }
    return task.currentDuration;
  }, [isRunning, task.sessionStartTime, task.currentDuration]);

  useEffect(() => {
    if (!isRunning) setLocalSeconds(task.currentDuration);
    else setLocalSeconds(getAccurateSeconds());
  }, [task.currentDuration, isRunning, getAccurateSeconds]);

  useEffect(() => {
    const handleActivity = () => {
      const now = Date.now();
      lastActive.current = now;
      if (task.isRunning && now - (task.lastActivityAt || 0) > 1000) {
        updateLocalTask(task.id, { lastActivityAt: now });
      }
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [task.id, task.isRunning, task.lastActivityAt, updateLocalTask]);

  // Timer Loop & Idle Check
  useEffect(() => {
    if (isRunning) {
      const startTime = task.sessionStartTime || Date.now();
      const initialSec = task.currentDuration;
      
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        const accurateSecs = initialSec + elapsed;
        
        setLocalSeconds(accurateSecs);
        
        if (elapsed > 0 && elapsed % 10 === 0) {
           updateLocalTask(task.id, { lastUpdatedAt: now });
        }

        // バックグラウンド時（document.hidden === true）は自動停止の判定を行わない
        if (!document.hidden && now - lastActive.current > 5 * 60 * 1000) {
          updateLocalTask(task.id, { 
            isRunning: false, 
            currentDuration: accurateSecs,
            sessionStartTime: null,
            lastUpdatedAt: now
          });
          syncTaskToCloud(task.id, {
            isRunning: false,
            currentDuration: accurateSecs,
            sessionStartTime: null,
            lastUpdatedAt: now
          });
          setShowAutoPauseAlert(true);
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, task.sessionStartTime, task.currentDuration, task.id, updateLocalTask, syncTaskToCloud]);

  // バックグラウンド・スリープから復帰した時の処理
  useEffect(() => {
    const handleVis = () => {
      if (!document.hidden && task.isRunning) {
        lastActive.current = Date.now(); // 復帰時にアクティブ時間を更新し、即座に自動停止するのを防ぐ
        setLocalSeconds(getAccurateSeconds()); // 表示秒数も復帰時に即補正する
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [task.isRunning, getAccurateSeconds]);

  const handlePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    lastActive.current = Date.now();
    
    // タイマー排他制御：他のタイマーをすべてストップさせる
    await pauseAllOtherTasks(task.id);
    
    const startTime = Date.now();
    
    updateLocalTask(task.id, { 
      isRunning: true, 
      sessionStartTime: startTime,
      lastActivityAt: startTime,
      lastUpdatedAt: startTime,
      status: task.status === 'not_started' ? 'in_progress' : task.status
    });

    syncTaskToCloud(task.id, {
      isRunning: true,
      sessionStartTime: startTime,
      lastActivityAt: startTime,
      lastUpdatedAt: startTime,
      status: task.status === 'not_started' ? 'in_progress' : task.status
    });
  };

  const handlePauseClick = () => {
    const accurateSecs = getAccurateSeconds();
    const now = Date.now();
    
    updateLocalTask(task.id, { 
      isRunning: false, 
      currentDuration: accurateSecs,
      sessionStartTime: null,
      lastActivityAt: now,
      lastUpdatedAt: now
    });
    
    syncTaskToCloud(task.id, {
      isRunning: false,
      currentDuration: accurateSecs,
      sessionStartTime: null,
      lastActivityAt: now,
      lastUpdatedAt: now
    });
  };

  const handleStopAndSave = () => {
    const finalDuration = getAccurateSeconds(); // 古いlocalSecondsではなく正確な時間を再計算
    const now = Date.now();
    
    updateLocalTask(task.id, { isRunning: false, currentDuration: finalDuration, sessionStartTime: null, lastActivityAt: now, lastUpdatedAt: now });
    syncTaskToCloud(task.id, { isRunning: false, currentDuration: finalDuration, sessionStartTime: null, lastActivityAt: now, lastUpdatedAt: now });
    
    setTimeout(() => {
      onSaveRecord({ 
        ...task, 
        currentDuration: finalDuration, 
        isRunning: false,
        sessionStartTime: null 
      });
    }, 100);
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4 w-full relative">
       <div className="flex items-center justify-between bg-slate-50 rounded-2xl md:rounded-3xl p-3 md:p-5 lg:p-6 border border-slate-200 shadow-inner w-full">
          <div className="flex-1 text-center">
             <span className={`font-mono text-3xl md:text-4xl lg:text-5xl font-black tracking-widest ${isRunning ? 'text-blue-600' : 'text-slate-700'}`}>
                {formatTime(localSeconds)}
             </span>
             {isRunning && <div className="text-[9px] md:text-[10px] lg:text-xs text-blue-500 font-bold mt-1 md:mt-2 animate-pulse">計測中 (サボり検知ON)</div>}
          </div>
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4 pr-2 md:pr-3">
             {!isRunning ? (
               <button onClick={handlePlay} className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 hover:bg-blue-700 transition-all">
                  <Play className="ml-1 w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" fill="currentColor" />
               </button>
             ) : (
               <button onClick={handlePauseClick} className="w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 flex items-center justify-center rounded-full bg-amber-500 text-white shadow-lg active:scale-95 hover:bg-amber-600 transition-all">
                  <Pause className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" fill="currentColor" />
               </button>
             )}
          </div>
       </div>

       {showAutoPauseAlert && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 backdrop-blur-sm rounded-2xl md:rounded-3xl p-4 md:p-5 shadow-lg border border-amber-200 animate-in fade-in zoom-in-95">
            <div className="text-center">
               <div className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-3"><AlertTriangle className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" /></div>
               <p className="text-xs md:text-sm lg:text-base font-bold text-slate-700 mb-3 md:mb-4">5分以上操作がなかったため<br/>自動的に一時停止しました</p>
               <button onClick={() => setShowAutoPauseAlert(false)} className="bg-amber-500 text-white px-5 py-2 md:px-6 md:py-2.5 lg:px-8 lg:py-3 rounded-xl md:rounded-2xl text-sm md:text-base lg:text-lg font-bold shadow-md active:scale-95 w-full">確認</button>
            </div>
          </div>
       )}

       <button 
         onClick={handleStopAndSave} 
         disabled={localSeconds === 0} 
         className="w-full bg-slate-800 text-white font-bold py-3.5 md:py-4 lg:py-5 text-base md:text-lg lg:text-xl rounded-2xl md:rounded-3xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 md:gap-2.5 disabled:opacity-50 mt-2 md:mt-3"
       >
         <History className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" /> 計測を終了して記録を保存
       </button>
    </div>
  );
});
StrictTimer.displayName = 'StrictTimer';


// ==========================================
// Generic Modals
// ==========================================
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm md:max-w-md lg:max-w-lg rounded-3xl md:rounded-[2rem] p-6 md:p-8 lg:p-10 shadow-2xl scale-100 animate-in zoom-in-95">
        <div className="flex flex-col items-center text-center mb-6 md:mb-8">
          <div className="w-16 h-16 md:w-18 md:h-18 lg:w-20 lg:h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4 md:mb-5">
            <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12" />
          </div>
          <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-slate-800 mb-2 md:mb-3">{title}</h3>
          <p className="text-slate-500 text-sm md:text-base lg:text-lg whitespace-pre-wrap">{message}</p>
        </div>
        <div className="flex gap-3 md:gap-4">
          <button onClick={onClose} className="flex-1 py-3 md:py-3.5 lg:py-4 rounded-xl md:rounded-2xl text-sm md:text-base lg:text-lg font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">キャンセル</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-3 md:py-3.5 lg:py-4 rounded-xl md:rounded-2xl text-sm md:text-base lg:text-lg font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-colors">実行する</button>
        </div>
      </div>
    </div>
  );
};

const CreateUnitOverlay = ({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (n: number) => void }) => {
  const [unitNumber, setUnitNumber] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm md:max-w-md lg:max-w-xl rounded-3xl md:rounded-[2rem] p-6 md:p-8 lg:p-10 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <h3 className="text-xl md:text-2xl lg:text-3xl font-black text-slate-800 flex items-center"><Layers className="mr-2 md:mr-3 w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-blue-600" /> 新しい回を追加</h3>
          <button onClick={onClose}><X className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-slate-400 hover:text-slate-600" /></button>
        </div>
        <div className="mb-6 md:mb-8 bg-slate-50 rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 border border-slate-100 text-center">
          <label className="block text-xs md:text-sm lg:text-base font-bold text-slate-400 mb-2 md:mb-3 uppercase tracking-wider">Unit Number</label>
          <div className="flex items-center justify-center gap-3 md:gap-4">
            <span className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-300">第</span>
            <input type="number" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="?" className="w-24 md:w-28 lg:w-32 bg-white border-2 border-blue-100 rounded-xl md:rounded-2xl px-2 py-3 md:px-3 md:py-3 text-3xl md:text-4xl lg:text-5xl font-black text-center text-blue-600 focus:outline-none focus:border-blue-500" autoFocus />
            <span className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-300">回</span>
          </div>
        </div>
        <button onClick={() => { if (parseInt(unitNumber) > 0) { onCreate(parseInt(unitNumber)); setUnitNumber(''); onClose(); } }} disabled={!unitNumber} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 md:py-4 lg:py-5 text-base md:text-lg lg:text-xl rounded-xl md:rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 md:gap-3 disabled:opacity-50">
          <Zap className="w-5 h-5 md:w-5 md:h-5 lg:w-6 lg:h-6" fill="currentColor"/> カリキュラムを作成
        </button>
      </div>
    </div>
  );
};

const AddCustomTaskModal = ({ isOpen, onClose, onAdd }: any) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('予習シリーズ');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm md:max-w-md lg:max-w-xl rounded-3xl md:rounded-[2rem] p-6 md:p-8 lg:p-10 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h3 className="text-lg md:text-2xl lg:text-3xl font-black text-slate-800">タスクを追加</h3>
          <button onClick={onClose}><X className="w-5 h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-slate-400 hover:text-slate-600" /></button>
        </div>
        <div className="space-y-4 md:space-y-6">
          <div>
            <label className="block text-xs md:text-sm lg:text-base font-bold text-slate-400 mb-1 md:mb-2">カテゴリ</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-50 border rounded-xl md:rounded-2xl px-3 py-2 md:px-4 md:py-3 text-sm md:text-base lg:text-lg font-bold">
              <option value="予習シリーズ">予習シリーズ</option>
              <option value="演習問題集">演習問題集</option>
              <option value="練成問題">練成問題</option>
              <option value="計算">計算</option>
              <option value="漢字とことば">漢字とことば</option>
              <option value="プリント">プリント</option>
              <option value="その他">その他</option>
            </select>
          </div>
          <div>
            <label className="block text-xs md:text-sm lg:text-base font-bold text-slate-400 mb-1 md:mb-2">タイトル</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 追加問題..." className="w-full bg-slate-50 border rounded-xl md:rounded-2xl px-3 py-2 md:px-4 md:py-3 text-sm md:text-base lg:text-lg font-bold" autoFocus />
          </div>
          <button onClick={() => { if (title) { onAdd(title, category); setTitle(''); setCategory('予習シリーズ'); onClose(); } }} disabled={!title} className="w-full bg-blue-600 text-white font-bold py-3 md:py-4 lg:py-5 text-base md:text-lg lg:text-xl rounded-xl md:rounded-2xl shadow-lg mt-2 md:mt-3">追加</button>
        </div>
      </div>
    </div>
  );
};

const TestResultModal = ({ isOpen, onClose, onSave, initialData }: { isOpen: boolean, onClose: () => void, onSave: (data: TestResult) => void, initialData?: TestResult | null }) => {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('curriculum');
  const [devs, setDevs] = useState({ math: '', japanese: '', science: '', social: '' });
  const [totalDev, setTotalDev] = useState('');
  const [totalRank, setTotalRank] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialData) {
      setDate(initialData.date.replace(/\//g, '-')); 
      setName(initialData.name);
      setType(initialData.type);
      setDevs({
        math: initialData.subjects.math.dev.toString(),
        japanese: initialData.subjects.japanese.dev.toString(),
        science: initialData.subjects.science.dev.toString(),
        social: initialData.subjects.social.dev.toString(),
      });
      setTotalDev(initialData.total4.dev.toString());
      setTotalRank(initialData.total4.rank || '');
      setErrorMsg('');
    } else {
      setDate(new Date().toISOString().split('T')[0]);
      setName('');
      setType('curriculum');
      setDevs({ math: '', japanese: '', science: '', social: '' });
      setTotalDev('');
      setTotalRank('');
      setErrorMsg('');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!name || !date) { 
       setErrorMsg("日付とテスト名は必須です。"); 
       return; 
    }
    setErrorMsg('');
    
    const resultData: TestResult = {
      id: initialData ? initialData.id : Date.now().toString(), 
      date: date.replace(/-/g, '/'), 
      name, 
      type,
      subjects: {
        math: { score: initialData?.subjects.math.score || 0, avg: initialData?.subjects.math.avg || 0, dev: Number(devs.math) }, 
        japanese: { score: initialData?.subjects.japanese.score || 0, avg: initialData?.subjects.japanese.avg || 0, dev: Number(devs.japanese) },
        science: { score: initialData?.subjects.science.score || 0, avg: initialData?.subjects.science.avg || 0, dev: Number(devs.science) }, 
        social: { score: initialData?.subjects.social.score || 0, avg: initialData?.subjects.social.avg || 0, dev: Number(devs.social) },
      },
      total4: { score: initialData?.total4.score || 0, avg: initialData?.total4.avg || 0, dev: Number(totalDev), rank: totalRank }
    };
    onSave(resultData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm md:max-w-xl lg:max-w-2xl rounded-3xl md:rounded-[2rem] p-5 md:p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <h3 className="text-lg md:text-2xl font-black text-slate-800">{initialData ? 'テスト結果を編集' : 'テスト結果を追加'}</h3>
          <button onClick={onClose} className="p-1 md:p-2 rounded-full bg-slate-100 text-slate-400 active:scale-95 hover:text-slate-600"><X className="w-4 h-4 md:w-5 md:h-5" /></button>
        </div>
        <div className="space-y-3 md:space-y-5">
          <div className="grid grid-cols-2 gap-3 md:gap-5">
            <div>
              <label className="block text-[10px] md:text-xs lg:text-sm font-bold text-slate-400 mb-1 md:mb-2">実施日</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-sm md:text-base font-bold focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-[10px] md:text-xs lg:text-sm font-bold text-slate-400 mb-1 md:mb-2">種類</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-sm md:text-base font-bold focus:outline-none focus:border-blue-400">
                {Object.entries(TEST_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] md:text-xs lg:text-sm font-bold text-slate-400 mb-1 md:mb-2">テスト名</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例: 第14回 カリテ" className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-sm md:text-base font-bold focus:outline-none focus:border-blue-400" />
          </div>
          
          <div className="border-t border-slate-100 pt-3 md:pt-5">
            <h4 className="font-bold text-slate-600 mb-2 md:mb-3 text-xs md:text-sm">各教科の偏差値</h4>
            <div className="grid grid-cols-4 gap-2 md:gap-3">
              {(['math', 'japanese', 'science', 'social'] as Subject[]).map(subj => (
                <div key={subj}>
                  <label className={`block text-[10px] md:text-xs lg:text-sm text-center font-bold ${SUBJECT_CONFIG[subj].color} mb-1 md:mb-2`}>{SUBJECT_CONFIG[subj].short}</label>
                  <input type="number" step="0.1" value={devs[subj]} onChange={e => setDevs({ ...devs, [subj]: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-1 py-1.5 md:px-2 md:py-2 text-xs md:text-sm text-center font-bold focus:outline-none focus:border-blue-400" />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3 md:pt-5">
             <h4 className="font-bold text-slate-600 mb-2 md:mb-3 text-xs md:text-sm">4科合計</h4>
             <div className="grid grid-cols-2 gap-3 md:gap-5">
               <div><label className="block text-[10px] md:text-xs lg:text-sm font-bold text-slate-400 mb-1 md:mb-2">偏差値</label><input type="number" step="0.1" value={totalDev} onChange={e => setTotalDev(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-sm md:text-base font-bold focus:outline-none focus:border-blue-400" /></div>
               <div><label className="block text-[10px] md:text-xs lg:text-sm font-bold text-slate-400 mb-1 md:mb-2">順位</label><input type="text" value={totalRank} onChange={e => setTotalRank(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-2 py-1.5 md:px-3 md:py-2 text-sm md:text-base font-bold focus:outline-none focus:border-blue-400" /></div>
             </div>
          </div>
          
          {errorMsg && <div className="text-xs md:text-sm text-red-500 font-bold text-center mt-2 md:mt-3">{errorMsg}</div>}
          
          <button onClick={handleSubmit} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 md:py-4 text-base md:text-lg rounded-xl md:rounded-2xl shadow-lg mt-2 md:mt-4 active:scale-95 transition-colors">
             {initialData ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
};


// ==========================================
// Views & Sub-components
// ==========================================

const TaskCard = ({ task, cycleStatus, setDetailTaskId }: any) => {
  return (
    <div 
      onClick={() => setDetailTaskId(task.id)}
      className={`relative group rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 shadow-sm border transition-all active:scale-[0.98] cursor-pointer flex flex-col gap-2 md:gap-3 overflow-hidden ${
        task.status === 'completed' ? 'opacity-60 bg-slate-50 border-slate-200' : 
        task.isRunning ? 'bg-blue-50/50 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)] ring-1 ring-blue-400' : 
        'bg-white border-slate-200 hover:border-blue-200 hover:-translate-y-0.5 hover:shadow-md'
      }`}
    >
      {task.isRunning && (
        <>
          <div className="absolute inset-0 bg-blue-400/10 animate-pulse pointer-events-none" />
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] pointer-events-none" />
        </>
      )}
      <div className="flex items-start gap-2 md:gap-3 relative z-10">
        <button onClick={(e) => { e.stopPropagation(); cycleStatus(task); }} className="p-1 md:p-1.5 -ml-1 md:-ml-1.5 mt-0.5 rounded-full active:scale-90 flex-shrink-0">
          {task.status === 'completed' ? <CheckCircle className="text-green-500 w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" fill="#f0fdf4" /> : task.status === 'in_progress' ? <Zap className="text-blue-500 w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" fill="currentColor" /> : <Circle className="text-slate-200 w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" />}
        </button>
        <div className="flex-1 min-w-0 pt-0.5 md:pt-1">
          <h4 className={`font-bold text-sm md:text-base lg:text-lg text-slate-800 leading-tight ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>{task.title}</h4>
          <div className="flex flex-wrap items-center gap-2 md:gap-2 mt-1.5 md:mt-2">
             <span className="text-[9px] md:text-[10px] lg:text-xs font-bold text-slate-400 bg-slate-100/80 backdrop-blur-sm px-1.5 py-0.5 md:px-2 md:py-0.5 lg:px-2 lg:py-1 rounded flex items-center gap-1">
               <History className="w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3" /> {task.history.length}回
             </span>
             {task.currentDuration > 0 && <span className={`text-[9px] md:text-[10px] lg:text-xs font-bold font-mono px-1.5 py-0.5 md:px-2 md:py-0.5 lg:px-2 lg:py-1 rounded flex items-center gap-1 backdrop-blur-sm ${task.isRunning ? 'bg-blue-100/80 text-blue-700' : 'bg-amber-50 text-amber-600'}`}><Clock className="w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3" /> {formatTime(task.currentDuration)}</span>}
             {task.isRunning && (
               <span className="text-[9px] md:text-[10px] lg:text-xs font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 px-2 py-0.5 md:px-2 md:py-0.5 lg:px-3 lg:py-1 rounded shadow-sm flex items-center gap-1 animate-pulse">
                 <Play className="w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3" fill="currentColor" /> 計測中
               </span>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TaskDetailModal = ({ task, onClose, updateLocalTask, syncTaskToCloud, onSaveRecord, onDelete, pauseAllOtherTasks }: any) => {
  if (!task) return null;
  const conf = SUBJECT_CONFIG[task.subject as Subject];
  
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative bg-slate-50 w-full max-w-md md:max-w-xl lg:max-w-3xl xl:max-w-4xl h-[90vh] sm:h-[85vh] md:h-[80vh] sm:rounded-3xl md:rounded-[2rem] rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-10">
        <div className="bg-white px-5 py-4 md:px-7 md:py-5 lg:px-8 lg:py-6 rounded-t-3xl md:rounded-t-[2rem] border-b border-slate-200 flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center gap-2 md:gap-3 mb-1.5 md:mb-2">
              <span className={`text-[9px] md:text-[10px] lg:text-xs font-black px-1.5 py-0.5 md:px-2 md:py-0.5 rounded ${conf.lightBg} ${conf.color} border ${conf.border}`}>{conf.label}</span>
              <span className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400">{task.unit} - {task.category}</span>
            </div>
            <h3 className="text-lg md:text-xl lg:text-2xl font-black text-slate-800 leading-tight pr-4 md:pr-6">{task.title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 md:p-2 bg-slate-100 rounded-full text-slate-400 active:scale-95"><X className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7 md:py-7 lg:px-8 lg:py-8 space-y-6 md:space-y-7 lg:space-y-8 scroll-smooth pb-10 md:pb-12">
          <div className="space-y-2 md:space-y-3">
            <label className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 uppercase tracking-wider px-1 md:px-2">状態</label>
            <div className="flex gap-2 md:gap-3">
              {[
                { id: 'not_started', label: '未着手', icon: Circle, active: 'bg-slate-200 text-slate-700 border-slate-300' },
                { id: 'in_progress', label: '勉強中', icon: Zap, active: 'bg-blue-500 text-white border-blue-600' },
                { id: 'completed', label: '完了', icon: CheckCircle, active: 'bg-green-500 text-white border-green-600' },
              ].map(s => (
                <button key={s.id} 
                  onClick={() => {
                    updateLocalTask(task.id, { status: s.id as any, lastUpdatedAt: Date.now() });
                  }}
                  className={`flex-1 py-2.5 md:py-3 lg:py-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm lg:text-base flex flex-col items-center justify-center gap-1 md:gap-1.5 border transition-all ${
                    task.status === s.id ? s.active : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <s.icon className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" />{s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 md:space-y-3 bg-white p-4 md:p-5 lg:p-6 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
            <label className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 md:gap-2"><Clock className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5" /> 計測タイマー (不正防止対応)</label>
            <StrictTimer task={task} updateLocalTask={updateLocalTask} syncTaskToCloud={syncTaskToCloud} onSaveRecord={onSaveRecord} pauseAllOtherTasks={pauseAllOtherTasks} />
          </div>

          <div className="space-y-2 md:space-y-3">
            <label className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 uppercase tracking-wider px-1 md:px-2">メモ</label>
            <textarea
              value={task.currentMemo} onChange={(e) => updateLocalTask(task.id, { currentMemo: e.target.value })}
              placeholder="ここにつまづいた、次はこうする..."
              className="w-full bg-white border border-slate-200 rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 text-sm md:text-base font-medium text-slate-700 focus:outline-none focus:border-blue-500 resize-none h-20 md:h-28 lg:h-32 shadow-sm"
            />
          </div>
          
          <div className="space-y-3 md:space-y-4 pt-2 md:pt-3">
            <label className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 uppercase tracking-wider px-1 md:px-2">過去の履歴 ({task.history.length})</label>
            {task.history.length === 0 ? (
              <div className="text-center py-6 md:py-8 text-slate-300 text-xs md:text-sm lg:text-base font-bold bg-white rounded-xl md:rounded-2xl border border-dashed border-slate-200">記録なし</div>
            ) : (
              <div className="space-y-2 md:space-y-3">
                {[...task.history].reverse().map((h: any, i: number) => (
                  <div key={h.id} className="bg-white border border-slate-200 rounded-xl md:rounded-2xl p-3 md:p-4 flex gap-3 md:gap-4">
                    <div className="flex flex-col items-center justify-center px-1 md:px-2 border-r border-slate-100 min-w-[2.5rem] md:min-w-[3.5rem]">
                      <span className="text-[8px] md:text-[10px] lg:text-xs font-bold text-slate-400">回目</span>
                      <span className="text-base md:text-lg lg:text-xl font-black text-slate-700">{task.history.length - i}</span>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-1 md:mb-1.5">
                        <span className="text-[9px] md:text-[10px] lg:text-xs font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 md:px-2 md:py-0.5 rounded">{h.date}</span>
                        <span className="text-xs md:text-sm lg:text-base font-bold text-blue-600 font-mono flex items-center gap-1 md:gap-1.5"><Clock className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />{formatTime(h.duration)}</span>
                      </div>
                      {h.memo && <p className="text-[10px] md:text-xs lg:text-sm text-slate-600 bg-slate-50 p-1.5 md:p-2 rounded md:rounded-lg mt-1 md:mt-1.5 truncate">{h.memo}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 md:p-5 lg:p-6 border-t border-slate-200 bg-white sm:rounded-b-3xl md:rounded-b-[2rem] shrink-0 flex gap-3 md:gap-4 pb-safe-bottom">
           <button onClick={onDelete} className="text-red-500 bg-red-50 hover:bg-red-100 p-3 md:p-3.5 lg:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm lg:text-base flex items-center justify-center gap-1.5 md:gap-2 transition-colors">
             <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 lg:w-5 lg:h-5" /> 削除
           </button>
           <button onClick={onClose} className="bg-slate-800 text-white font-bold py-3 md:py-3.5 lg:py-4 rounded-xl md:rounded-2xl text-sm md:text-base lg:text-lg flex-1 shadow-lg active:scale-95 transition-transform">閉じる</button>
        </div>
      </div>
    </div>
  );
};


const SubjectSection = ({ unit, subject, tasks, cycleStatus, setDetailTaskId, onAddCustomTask }: any) => {
  const [filter, setFilter] = useState<'all' | 'not_started' | 'in_progress' | 'completed'>('all');
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  
  const subjTasks = tasks.filter((t: Task) => t.unit === unit && t.subject === subject);
  if (subjTasks.length === 0 && filter === 'all') return null;

  const totalDuration = subjTasks.reduce((acc: number, curr: Task) => acc + curr.currentDuration + curr.history.reduce((hAcc, h) => hAcc + h.duration, 0), 0);
  const completedCount = subjTasks.filter((t: Task) => t.status === 'completed').length;
  const progress = subjTasks.length > 0 ? Math.round((completedCount / subjTasks.length) * 100) : 0;
  
  const conf = SUBJECT_CONFIG[subject as Subject];
  const filteredTasks = subjTasks.filter((t: Task) => filter === 'all' ? true : t.status === filter);

  const tasksByCategory: Record<string, Task[]> = {};
  filteredTasks.forEach((task: Task) => {
     if (!tasksByCategory[task.category]) tasksByCategory[task.category] = [];
     tasksByCategory[task.category].push(task);
  });

  return (
    <div className="relative">
       <div className="flex flex-col gap-2 md:gap-3 mb-3 md:mb-5">
          <div className="flex flex-col px-3 py-3 md:px-4 md:py-4 lg:px-5 lg:py-5 bg-white rounded-xl md:rounded-2xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-2 md:mb-3">
                 <div className="flex items-center gap-2 md:gap-2.5">
                   <div className={`w-2 h-6 md:w-2.5 md:h-7 rounded-full ${conf.bg}`} />
                   <h3 className={`font-black text-lg md:text-xl lg:text-xl ${conf.color}`}>{conf.label}</h3>
                 </div>
                 <div className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-500 font-mono bg-slate-50 px-2 py-0.5 md:px-2.5 md:py-1 rounded">
                   計: {Math.floor(totalDuration / 3600)}h {Math.floor((totalDuration % 3600) / 60)}m
                 </div>
             </div>
             <div className="flex items-center gap-2 md:gap-3">
                 <div className="flex-1 h-1.5 md:h-2 bg-slate-100 rounded-full overflow-hidden">
                     <div className={`h-full ${conf.bg}`} style={{ width: `${progress}%` }} />
                 </div>
                 <span className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 font-mono w-6 md:w-8 text-right">{progress}%</span>
             </div>
          </div>
          
          <div className="flex items-center justify-between px-1">
            <div className="flex gap-1 bg-white p-0.5 md:p-1 rounded-lg border border-slate-200">
                {(['all', 'not_started', 'in_progress', 'completed'] as const).map(f => (
                  <button 
                    key={f} onClick={() => setFilter(f)}
                    className={`px-2 py-1 md:px-3 md:py-1.5 text-[9px] md:text-[10px] lg:text-xs font-bold rounded-md transition-all ${filter === f ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    {f === 'all' ? '全て' : f === 'not_started' ? '未着手' : f === 'in_progress' ? '勉強中' : '完了'}
                  </button>
                ))}
            </div>
            <button onClick={() => setAddModalOpen(true)} className="flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-white border border-slate-200 text-blue-600 rounded-lg text-[10px] md:text-xs lg:text-sm font-bold active:bg-blue-50 transition-colors">
              <Plus className="w-3 h-3 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" /> 追加
            </button>
          </div>
       </div>

       <div className="space-y-4 md:space-y-5 lg:space-y-6 pl-1 md:pl-2 lg:pl-2.5 border-l-2 md:border-l-4 border-slate-100 ml-2 md:ml-3 lg:ml-4">
         {Object.keys(tasksByCategory).length === 0 ? (
           <div className="text-center py-6 md:py-8 text-slate-400 text-[10px] md:text-xs lg:text-sm font-bold">タスクがありません</div>
         ) : (
           Object.keys(tasksByCategory).map(cat => (
              <div key={cat} className="pl-3 md:pl-4 lg:pl-5">
                 <h4 className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 mb-2 md:mb-3">{cat}</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 md:gap-4 lg:gap-5">
                   {tasksByCategory[cat].map((task: Task) => (
                      <TaskCard 
                        key={task.id} task={task} 
                        cycleStatus={cycleStatus} setDetailTaskId={setDetailTaskId} 
                      />
                   ))}
                 </div>
              </div>
           ))
         )}
       </div>

       <AddCustomTaskModal 
         isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} 
         unit={unit} subject={subject}
         onAdd={(title: string, category: string) => onAddCustomTask(unit, subject, title, category)}
       />
    </div>
  );
};


type TodayTimelineSession = {
  id: string;
  subject: Subject;
  title: string;
  unit: string;
  category: string;
  duration: number;
  startAt: number;
  endAt: number;
  isRunning?: boolean;
};


const ActiveStudyTimerPanel = ({ tasks }: { tasks: Task[] }) => {
  const runningTask = [...tasks]
    .filter((task: Task) => task.isRunning && task.sessionStartTime)
    .sort((a: Task, b: Task) => (b.lastUpdatedAt || b.sessionStartTime || 0) - (a.lastUpdatedAt || a.sessionStartTime || 0))[0];
  const [now, setNow] = useState(Date.now());
  const [lastVisibleActivityAt, setLastVisibleActivityAt] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!runningTask) return;
    const initialActivityAt = runningTask.lastActivityAt || Date.now();
    setLastVisibleActivityAt(initialActivityAt);

    const handleActivity = () => setLastVisibleActivityAt(Date.now());
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('scroll', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [runningTask?.id, runningTask?.lastActivityAt]);

  if (!runningTask || !runningTask.sessionStartTime) return null;

  const conf = SUBJECT_CONFIG[runningTask.subject];
  const currentSeconds = runningTask.currentDuration + Math.floor((now - runningTask.sessionStartTime) / 1000);
  const historyTotalSeconds = runningTask.history.reduce((sum, h) => sum + h.duration, 0);
  const cumulativeSeconds = historyTotalSeconds + currentSeconds;
  const remainingSeconds = Math.max(0, Math.floor((IDLE_LIMIT_MS - (now - lastVisibleActivityAt)) / 1000));
  const remainingLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="bg-white rounded-3xl p-5 md:p-7 lg:p-8 shadow-md border border-blue-100 ring-1 ring-blue-50">
      <div className="flex items-start gap-3 mb-4 md:mb-5">
        <div className={`w-2.5 h-2.5 rounded-full mt-2 ${conf.bg} animate-pulse`} />
        <div className="min-w-0">
          <div className="text-[10px] md:text-xs font-bold text-slate-400 mb-0.5">現在学習中</div>
          <h2 className="text-lg md:text-2xl lg:text-3xl font-black text-slate-900 leading-tight truncate">
            {runningTask.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] md:text-xs font-bold text-slate-400">
            <span className={`${conf.lightBg} ${conf.color} border ${conf.border} rounded-full px-2 py-0.5`}>{conf.label}</span>
            <span>{runningTask.unit}</span>
            <span>{runningTask.category}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 md:p-5 text-center">
          <div className="text-[10px] md:text-xs font-black text-blue-400 mb-2">現在</div>
          <div className="text-2xl md:text-3xl lg:text-4xl font-black text-blue-600 font-mono tracking-tight">
            {formatTime(currentSeconds)}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 md:p-5 text-center">
          <div className="text-[10px] md:text-xs font-black text-slate-400 mb-2">停止まで</div>
          <div className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-800 font-mono tracking-tight">
            {remainingLabel}
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 md:p-5 text-center">
          <div className="text-[10px] md:text-xs font-black text-slate-400 mb-2">累計</div>
          <div className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 font-mono tracking-tight">
            {formatTime(cumulativeSeconds)}
          </div>
        </div>
      </div>
    </div>
  );
};

const TodayStudyTimeline = ({ tasks }: { tasks: Task[] }) => {
  const now = Date.now();
  const todayLabel = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const todayAltLabel = `${new Date().getMonth() + 1}/${new Date().getDate()}`;

  const sessions = useMemo<TodayTimelineSession[]>(() => {
    const list: TodayTimelineSession[] = [];

    tasks.forEach((task: Task) => {
      task.history.forEach((h) => {
        const isToday = h.date === todayLabel || h.date === todayAltLabel || h.date.endsWith(`/${todayAltLabel}`);
        if (!isToday || !h.duration) return;

        const endAt = h.endAt || Date.now();
        const startAt = h.startAt || (endAt - h.duration * 1000);

        list.push({
          id: `${task.id}-${h.id}`,
          subject: task.subject,
          title: task.title,
          unit: task.unit,
          category: task.category,
          duration: h.duration,
          startAt,
          endAt,
        });
      });

      if (task.isRunning && task.sessionStartTime) {
        const runningDuration = task.currentDuration + Math.floor((Date.now() - task.sessionStartTime) / 1000);
        list.push({
          id: `${task.id}-running`,
          subject: task.subject,
          title: task.title,
          unit: task.unit,
          category: task.category,
          duration: runningDuration,
          startAt: task.sessionStartTime,
          endAt: Date.now(),
          isRunning: true,
        });
      }
    });

    return list.sort((a, b) => a.startAt - b.startAt);
  }, [tasks, todayLabel, todayAltLabel, now]);

  const totalSeconds = sessions.reduce((sum, s) => sum + s.duration, 0);

  const range = useMemo(() => {
    if (sessions.length === 0) {
      const base = new Date();
      base.setHours(6, 0, 0, 0);
      const end = new Date(base);
      end.setHours(22, 0, 0, 0);
      return { start: base.getTime(), end: end.getTime() };
    }

    const minStart = Math.min(...sessions.map(s => s.startAt));
    const maxEnd = Math.max(...sessions.map(s => s.endAt));
    const startDate = new Date(minStart - 30 * 60 * 1000);
    startDate.setMinutes(0, 0, 0);
    const endDate = new Date(maxEnd + 30 * 60 * 1000);
    endDate.setMinutes(0, 0, 0);
    endDate.setHours(endDate.getHours() + 1);

    if (endDate.getTime() - startDate.getTime() < 60 * 60 * 1000) {
      endDate.setHours(startDate.getHours() + 1);
    }

    return { start: startDate.getTime(), end: endDate.getTime() };
  }, [sessions]);

  const hourLabels = useMemo(() => {
    const labels: number[] = [];
    const startHour = new Date(range.start);
    startHour.setMinutes(0, 0, 0);
    for (let t = startHour.getTime(); t <= range.end; t += 60 * 60 * 1000) {
      labels.push(t);
    }
    return labels;
  }, [range]);

  const formatClock = (time: number) => {
    const d = new Date(time);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const groupedSessions = (Object.keys(SUBJECT_CONFIG) as Subject[]).map(subject => ({
    subject,
    sessions: sessions.filter(s => s.subject === subject),
  }));

  return (
    <div className="bg-white rounded-3xl p-5 md:p-7 lg:p-8 shadow-md border border-slate-200">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4 mb-5 md:mb-6">
        <div>
          <h2 className="text-sm md:text-base lg:text-lg font-black text-slate-800 flex items-center gap-1.5 md:gap-2">
            <Clock className="text-blue-500 w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" />
            今日の学習タイムライン
          </h2>
          <p className="text-[10px] md:text-xs lg:text-sm font-bold text-slate-400 mt-1">
            何時にどの教科を勉強したかを表示します
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-right">
          <div className="text-[10px] md:text-xs font-bold text-blue-400 mb-0.5">本日の総勉強時間</div>
          <div className="text-2xl md:text-3xl lg:text-4xl font-black text-blue-600 font-mono">
            {Math.floor(totalSeconds / 3600)}<span className="text-xs md:text-sm text-blue-300 mx-0.5">h</span>
            {Math.floor((totalSeconds % 3600) / 60)}<span className="text-xs md:text-sm text-blue-300 ml-0.5">m</span>
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8 md:py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <div className="text-sm md:text-base font-bold text-slate-400">本日の学習記録はまだありません</div>
          <div className="text-[10px] md:text-xs text-slate-300 mt-1">タイマーで記録を保存すると、ここに時間帯が表示されます</div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[680px]">
            <div className="ml-12 md:ml-14 relative h-7 border-b border-slate-200">
              {hourLabels.map((t) => {
                const left = ((t - range.start) / (range.end - range.start)) * 100;
                return (
                  <div key={t} className="absolute top-0 -translate-x-1/2 text-[10px] md:text-xs font-bold text-slate-400" style={{ left: `${left}%` }}>
                    {new Date(t).getHours()}時
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 mt-3">
              {groupedSessions.map(({ subject, sessions: subjectSessions }) => {
                const conf = SUBJECT_CONFIG[subject];
                return (
                  <div key={subject} className="flex items-center gap-3">
                    <div className={`w-9 md:w-11 text-xs md:text-sm font-black text-center ${conf.color}`}>{conf.short}</div>
                    <div className="relative flex-1 h-10 md:h-12 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                      {hourLabels.map((t) => {
                        const left = ((t - range.start) / (range.end - range.start)) * 100;
                        return <div key={t} className="absolute top-0 bottom-0 w-px bg-slate-200/70" style={{ left: `${left}%` }} />;
                      })}
                      {subjectSessions.map((s) => {
                        const left = Math.max(0, ((s.startAt - range.start) / (range.end - range.start)) * 100);
                        const width = Math.max(2.5, ((s.endAt - s.startAt) / (range.end - range.start)) * 100);
                        return (
                          <div
                            key={s.id}
                            className={`absolute top-1.5 bottom-1.5 ${conf.bg} text-white rounded-lg shadow-sm px-2 flex items-center overflow-hidden ${s.isRunning ? 'animate-pulse ring-2 ring-blue-200' : ''}`}
                            style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                            title={`${conf.label} ${s.unit} ${s.title} ${formatClock(s.startAt)}-${formatClock(s.endAt)} ${formatTime(s.duration)}`}
                          >
                            <span className="text-[10px] md:text-xs font-black truncate">
                              {formatClock(s.startAt)} {s.title} {s.isRunning ? '計測中' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {sessions.map((s) => {
                const conf = SUBJECT_CONFIG[s.subject];
                return (
                  <div key={`detail-${s.id}`} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`shrink-0 text-[10px] font-black text-white ${conf.bg} rounded px-1.5 py-0.5`}>{conf.short}</span>
                      <span className="truncate text-xs md:text-sm font-bold text-slate-700">{s.unit} / {s.title}</span>
                    </div>
                    <div className="shrink-0 text-[10px] md:text-xs font-mono font-bold text-slate-500">
                      {formatClock(s.startAt)}-{formatClock(s.endAt)} / {formatTime(s.duration)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


const DailyView = ({ 
  tasks, cycleStatus, deleteUnitTasks,
  setAddModalOpen, selectedUnit, setSelectedUnit, unitsWithTasks, onAddCustomTask, setDetailTaskId, setDeleteConfirmation
}: any) => {

  const getStats = (targetTasks: Task[]) => {
    if (targetTasks.length === 0) return { progress: 0, totalTime: 0 };
    const completed = targetTasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completed / targetTasks.length) * 100);
    const totalTime = targetTasks.reduce((acc, curr) => acc + curr.history.reduce((hAcc, h) => hAcc + h.duration, 0) + curr.currentDuration, 0);
    return { progress, totalTime };
  };

  const allStats = useMemo(() => {
      const total = getStats(tasks);
      const subjects = (Object.keys(SUBJECT_CONFIG) as Subject[]).map(subj => ({
        id: subj, ...getStats(tasks.filter((t: Task) => t.subject === subj))
      }));
      return { total, subjects };
  }, [tasks]);

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-20 px-4 py-3 md:px-6 md:py-4 lg:px-8 lg:py-5 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="flex gap-2 md:gap-3">
          <button onClick={() => setSelectedUnit(null)} className={`px-4 py-2.5 md:px-5 md:py-3 lg:px-6 lg:py-3.5 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm lg:text-base flex items-center justify-center transition-all ${!selectedUnit ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
            <LayoutDashboard className="mr-1.5 w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5 lg:mr-2"/> 全体
          </button>
          <div className="flex-1 relative">
            <select
              value={selectedUnit || ''}
              onChange={(e) => e.target.value === 'NEW' ? setAddModalOpen(true) : setSelectedUnit(e.target.value)}
              className={`w-full h-full appearance-none rounded-xl md:rounded-2xl font-bold text-xs md:text-sm lg:text-base pl-3 pr-8 md:pl-4 md:pr-9 focus:outline-none transition-all cursor-pointer ${selectedUnit ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              <option value="" disabled>回を選択...</option>
              <optgroup label="学習中の回">
                  {unitsWithTasks.map((w: string) => <option key={w} value={w} className="text-slate-800 bg-white">{w}</option>)}
              </optgroup>
              <optgroup label="アクション"><option value="NEW" className="text-blue-600 bg-white">+ 新しい回を追加</option></optgroup>
            </select>
            <ChevronDown className={`absolute right-3 md:right-4 top-1/2 -translate-y-1/2 pointer-events-none w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5 ${selectedUnit ? 'text-white' : 'text-slate-400'}`} />
          </div>
        </div>
      </div>

      <div className="pt-4 px-4 md:px-6 lg:px-8 md:pt-6 lg:pt-8 space-y-6 md:space-y-8 lg:space-y-10 pb-32 md:pb-40">
        {selectedUnit ? (
          <div className="space-y-6 md:space-y-8 lg:space-y-10 animate-in fade-in slide-in-from-bottom-4">
              {(() => {
                const unitTasks = tasks.filter((t: Task) => t.unit === selectedUnit);
                const { progress, totalTime } = getStats(unitTasks);
                return (
                  <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-6 lg:p-8 shadow-sm border border-slate-200 relative overflow-hidden">
                    <div className="flex justify-between items-end mb-3 md:mb-4">
                        <div>
                            <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-slate-800">{selectedUnit}</h2>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-800 tracking-tight">{progress}<span className="text-sm md:text-lg lg:text-xl font-bold text-slate-400 ml-0.5 md:ml-1">%</span></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center mb-1.5 md:mb-2">
                       <span className="text-[10px] md:text-xs lg:text-sm font-bold text-slate-400">全体進捗</span>
                       <span className="text-[10px] md:text-xs lg:text-sm font-bold font-mono text-blue-600">計 {Math.floor(totalTime / 3600)}h {Math.floor((totalTime % 3600) / 60)}m</span>
                    </div>
                    <div className="h-2 md:h-2.5 lg:h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })()}

              {(Object.keys(SUBJECT_CONFIG) as Subject[]).map(subj => (
                <SubjectSection 
                  key={subj} unit={selectedUnit} subject={subj} tasks={tasks}
                  cycleStatus={cycleStatus} setDetailTaskId={setDetailTaskId}
                  onAddCustomTask={onAddCustomTask}
                />
              ))}
          </div>
        ) : (
          <div className="space-y-5 md:space-y-7 animate-in fade-in">
              <div className="bg-white rounded-3xl p-5 md:p-7 lg:p-8 shadow-md border border-slate-200">
                 <h2 className="text-sm md:text-base lg:text-lg font-black text-slate-800 mb-3 md:mb-5 flex items-center gap-1.5 md:gap-2"><Award className="text-blue-500 w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" /> 全期間サマリー</h2>
                 <div className="flex justify-between items-end mb-4 md:mb-6 pb-4 md:pb-6 border-b border-slate-100">
                     <div>
                         <div className="text-[10px] md:text-xs lg:text-sm text-slate-400 font-bold mb-0.5 md:mb-1">全体完了率</div>
                         <div className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-800">{allStats.total.progress}<span className="text-sm md:text-lg lg:text-xl text-slate-400 ml-0.5 md:ml-1">%</span></div>
                     </div>
                     <div className="text-right">
                         <div className="text-[10px] md:text-xs lg:text-sm text-slate-400 font-bold mb-0.5 md:mb-1">総勉強時間</div>
                         <div className="text-xl md:text-2xl lg:text-3xl font-black text-blue-600 font-mono">
                            {Math.floor(allStats.total.totalTime / 3600)}<span className="text-xs md:text-sm lg:text-base text-slate-400 mx-0.5 md:mx-1">h</span>
                            {Math.floor((allStats.total.totalTime % 3600) / 60)}<span className="text-xs md:text-sm lg:text-base text-slate-400 ml-0.5 md:ml-1">m</span>
                         </div>
                     </div>
                 </div>
                 <div className="space-y-2.5 md:space-y-3 lg:space-y-4">
                    {allStats.subjects.map(s => {
                       const conf = SUBJECT_CONFIG[s.id as Subject];
                       return (
                          <div key={s.id} className="flex items-center gap-2 md:gap-3 lg:gap-4">
                             <span className={`text-[10px] md:text-[11px] lg:text-xs font-bold w-6 md:w-8 lg:w-10 ${conf.color}`}>{conf.short}</span>
                             <div className="flex-1 h-1.5 md:h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${conf.bg}`} style={{ width: `${s.progress}%` }} />
                             </div>
                             <span className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 w-12 md:w-14 lg:w-16 text-right font-mono">
                                {Math.floor(s.totalTime / 3600)}h{Math.floor((s.totalTime % 3600) / 60)}m
                             </span>
                          </div>
                       )
                    })}
                 </div>
              </div>

              <ActiveStudyTimerPanel tasks={tasks} />

              <TodayStudyTimeline tasks={tasks} />

              <h3 className="font-bold text-slate-500 text-xs md:text-sm lg:text-base pl-1 md:pl-2">学習回ごとの詳細</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5 lg:gap-6">
                {unitsWithTasks.map((unit: string) => {
                  const unitTasks = tasks.filter((t: Task) => t.unit === unit);
                  const { progress, totalTime } = getStats(unitTasks);
                  const subjStats = (Object.keys(SUBJECT_CONFIG) as Subject[]).map(subj => ({ id: subj, ...getStats(unitTasks.filter((t: Task) => t.subject === subj)) }));

                  return (
                    <div key={unit} onClick={() => setSelectedUnit(unit)} className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-5 lg:p-6 shadow-sm border border-slate-200 active:scale-[0.98] transition-all cursor-pointer relative">
                       <button 
                           onClick={(e) => { 
                             e.stopPropagation(); 
                             setDeleteConfirmation({
                               title: `「${unit}」の削除`, message: `本当に「${unit}」を削除しますか？\nタスクと履歴がすべて消去されます。`,
                               onConfirm: () => deleteUnitTasks(unit)
                             });
                           }} 
                           className="absolute top-3 md:top-4 right-3 md:right-4 p-1.5 md:p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                       >
                           <Trash2 className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                       </button>
                       <div className="flex justify-between items-center mb-3 md:mb-4 pr-8 md:pr-8">
                          <div className="font-black text-lg md:text-xl lg:text-2xl text-slate-800">{unit}</div>
                          <div className="text-[10px] md:text-[11px] lg:text-xs font-bold text-slate-400 font-mono">{Math.floor(totalTime / 3600)}h {Math.floor((totalTime % 3600) / 60)}m</div>
                       </div>
                       <div className="mb-3 md:mb-4">
                          <div className="flex justify-between text-[10px] md:text-[11px] lg:text-xs font-bold mb-1 md:mb-1.5">
                            <span className="text-slate-400">全体進捗</span>
                            <span className="text-blue-600">{progress}%</span>
                          </div>
                          <div className="h-1.5 md:h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                       </div>
                       <div className="grid grid-cols-4 gap-2 md:gap-3 pt-3 md:pt-4 border-t border-slate-50">
                          {subjStats.map(s => {
                             const conf = SUBJECT_CONFIG[s.id as Subject];
                             return (
                                 <div key={s.id} className="flex flex-col gap-1 md:gap-1.5">
                                     <div className="flex justify-between items-center text-[9px] md:text-[10px] lg:text-[11px] font-bold">
                                         <span className={conf.color}>{conf.short}</span>
                                         <span className="text-slate-400">{s.progress}%</span>
                                     </div>
                                     <div className="h-1 md:h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                         <div className={`h-full ${conf.bg}`} style={{ width: `${s.progress}%` }} />
                                     </div>
                                 </div>
                             );
                          })}
                       </div>
                    </div>
                  );
                })}
              </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TestsView = ({ tests, onSaveTest, onDeleteTest }: any) => {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['4ko']);
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<TestResult | null>(null);
  const [filterType, setFilterType] = useState('all');

  const toggleSubject = (subj: string) => { setSelectedSubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]); };

  const chartData = useMemo(() => {
    let filtered = filterType !== 'all' ? tests.filter((t:TestResult) => t.type === filterType) : [...tests];
    return filtered.sort((a:TestResult, b:TestResult) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((t:TestResult) => {
       const dp: any = { name: t.date.slice(5), testName: t.name };
       if (selectedSubjects.includes('4ko')) dp['4ko'] = t.total4.dev;
       ['math', 'japanese', 'science', 'social'].forEach(s => { if (selectedSubjects.includes(s)) dp[s] = t.subjects[s as Subject].dev; });
       return dp;
    });
  }, [tests, selectedSubjects, filterType]);

  const tableData = [...tests].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="flex flex-col h-full bg-slate-50">
       <div className="bg-white sticky top-0 z-20 px-4 py-3 md:px-6 md:py-4 lg:px-8 lg:py-4 border-b border-slate-200 shadow-sm space-y-2.5 md:space-y-3">
          <div className="flex justify-between items-center gap-2 md:gap-3">
             <div className="flex gap-1.5 md:gap-2">
               <button onClick={() => setFilterType('all')} className={`px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-[11px] lg:text-xs font-bold border ${filterType === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>全て</button>
               {Object.entries(TEST_TYPE_CONFIG).map(([k, v]) => <button key={k} onClick={() => setFilterType(k)} className={`px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-[11px] lg:text-xs font-bold border ${filterType === k ? v.activeClass : 'bg-white border-slate-200 text-slate-500'}`}>{v.label}</button>)}
             </div>
             <button onClick={() => { setEditingTest(null); setModalOpen(true); }} className="bg-blue-50 text-blue-600 p-1.5 md:p-2 lg:p-2.5 rounded-lg active:scale-95"><Plus className="w-[18px] h-[18px] md:w-4 md:h-4 lg:w-5 lg:h-5" /></button>
          </div>
          <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-0.5 md:pb-1 no-scrollbar">
             <button onClick={() => toggleSubject('4ko')} className={`flex-1 py-1.5 px-2 md:py-1.5 md:px-3 rounded-lg text-[10px] md:text-[11px] lg:text-xs font-bold whitespace-nowrap transition-colors ${selectedSubjects.includes('4ko') ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>4科</button>
             {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => <button key={s} onClick={() => toggleSubject(s)} className={`flex-1 py-1.5 px-2 md:py-1.5 md:px-3 rounded-lg text-[10px] md:text-[11px] lg:text-xs font-bold whitespace-nowrap transition-colors ${selectedSubjects.includes(s) ? `${SUBJECT_CONFIG[s].bg} text-white` : 'bg-slate-100 text-slate-500'}`}>{SUBJECT_CONFIG[s].short}</button>)}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8 space-y-5 md:space-y-6 lg:space-y-8 pb-20 md:pb-32">
          <div className="bg-white p-3 md:p-5 lg:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 h-56 md:h-80 lg:h-[28rem] shrink-0">
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="name" tick={{fontSize: 9}} axisLine={false} tickLine={false} />
                   <YAxis domain={['auto', 'auto']} tick={{fontSize: 9}} axisLine={false} tickLine={false} />
                   <Tooltip contentStyle={{borderRadius: '8px', fontSize:'10px', padding:'4px 8px'}} />
                   <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="3 3" />
                   {selectedSubjects.includes('4ko') && <Line type="monotone" dataKey="4ko" name="4科" stroke="#334155" strokeWidth={2.5} dot={{r:3}} />}
                   {selectedSubjects.includes('math') && <Line type="monotone" dataKey="math" name={SUBJECT_CONFIG.math.label} stroke={SUBJECT_CONFIG.math.hex} strokeWidth={2} dot={false} />}
                   {selectedSubjects.includes('japanese') && <Line type="monotone" dataKey="japanese" name={SUBJECT_CONFIG.japanese.label} stroke={SUBJECT_CONFIG.japanese.hex} strokeWidth={2} dot={false} />}
                   {selectedSubjects.includes('science') && <Line type="monotone" dataKey="science" name={SUBJECT_CONFIG.science.label} stroke={SUBJECT_CONFIG.science.hex} strokeWidth={2} dot={false} />}
                   {selectedSubjects.includes('social') && <Line type="monotone" dataKey="social" name={SUBJECT_CONFIG.social.label} stroke={SUBJECT_CONFIG.social.hex} strokeWidth={2} dot={false} />}
                </LineChart>
             </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="font-bold text-slate-700 text-xs md:text-sm lg:text-base px-3 pt-3 pb-2 md:px-5 md:pt-5 md:pb-3 lg:px-6 lg:pt-6 flex items-center gap-1.5 md:gap-2"><TrendingUp className="text-blue-500 w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5"/> 偏差値履歴</h3>
            <table className="w-full text-center text-[10px] md:text-xs lg:text-sm">
               <thead className="text-slate-400 bg-slate-50 border-y border-slate-100"><tr><th className="py-2 md:py-3 lg:py-4 pl-3 md:pl-5 text-left font-bold">テスト名</th><th className="py-2 md:py-3 lg:py-4 font-bold">4科</th>{(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => <th key={s} className={`py-2 md:py-3 lg:py-4 font-bold ${SUBJECT_CONFIG[s].color}`}>{SUBJECT_CONFIG[s].short}</th>)}<th className="py-2 w-12 md:w-16"></th></tr></thead>
               <tbody>
                  {tableData.map(t => (
                     <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                        <td className="py-2 md:py-3 lg:py-4 pl-3 md:pl-5 text-left"><div className="text-[8px] md:text-[9px] lg:text-[10px] text-slate-400 font-bold">{t.date}</div><div className="font-bold text-slate-700 truncate max-w-[80px] md:max-w-none">{t.name}</div></td>
                        <td className="py-2 md:py-3 lg:py-4 font-black text-slate-700 bg-slate-50/50">{t.total4.dev}</td>
                        {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => <td key={s} className={`py-2 md:py-3 lg:py-4 font-bold ${t.subjects[s].dev >= 60 ? 'text-rose-500' : 'text-slate-500'}`}>{t.subjects[s].dev}</td>)}
                        <td className="py-2 md:py-3 lg:py-4 pr-2 md:pr-3">
                           <div className="flex flex-col md:flex-row gap-1 md:gap-1.5 items-end md:items-center justify-end opacity-100">
                             <button onClick={() => { setEditingTest(t); setModalOpen(true); }} className="p-1 md:p-1.5 text-slate-400 hover:text-blue-500 bg-white rounded md:rounded-md shadow-sm border border-slate-200"><Edit2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" /></button>
                             <button onClick={() => onDeleteTest(t.id)} className="p-1 md:p-1.5 text-slate-400 hover:text-red-500 bg-white rounded md:rounded-md shadow-sm border border-slate-200"><Trash2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" /></button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
       </div>
       <TestResultModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} onSave={onSaveTest} initialData={editingTest} />
    </div>
  );
};

const AchievementsView = ({ tasks }: { tasks: Task[] }) => {
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['math', 'japanese', 'science', 'social']);

  const toggleSubject = (subj: string) => { setSelectedSubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]); };

  const setPresetRange = (days: number) => {
    const end = new Date(); const start = new Date(); start.setDate(end.getDate() - days);
    setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
  };

  const { chartData, pieData, maxStats } = useMemo(() => {
    const start = new Date(dateRange.start); const end = new Date(dateRange.end); end.setHours(23, 59, 59, 999);
    const dateMap = new Map<string, any>();
    const totalBySubject: Record<string, number> = { math: 0, japanese: 0, science: 0, social: 0 };
    
    tasks.forEach(task => {
       task.history.forEach(h => {
          const [m, d] = h.date.split('/').map(Number);
          const hDate = new Date(new Date().getFullYear(), m - 1, d);
          if (new Date().getMonth() < 3 && m > 9) hDate.setFullYear(hDate.getFullYear() - 1);
          if (hDate >= start && hDate <= end) {
             const key = `${m}/${d}`;
             if (!dateMap.has(key)) dateMap.set(key, { name: key, math: 0, japanese: 0, science: 0, social: 0, total: 0 });
             const entry = dateMap.get(key);
             const mins = Math.floor(h.duration / 60);
             entry[task.subject] += mins; entry.total += mins; totalBySubject[task.subject] += mins;
          }
       });
    });

    const data = []; const loopDate = new Date(start);
    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)); 
    for(let i = 0; i <= diffDays; i++) {
       const key = `${loopDate.getMonth() + 1}/${loopDate.getDate()}`;
       data.push(dateMap.has(key) ? dateMap.get(key) : { name: key, math: 0, japanese: 0, science: 0, social: 0, total: 0 });
       loopDate.setDate(loopDate.getDate() + 1);
    }

    const totalMins = Object.values(totalBySubject).reduce((a, b) => a + b, 0);
    const pData = Object.entries(totalBySubject).filter(([k, v]) => selectedSubjects.includes(k) && v > 0).map(([k, v]) => ({ 
         name: SUBJECT_CONFIG[k as Subject].label, value: v, color: SUBJECT_CONFIG[k as Subject].hex,
         percent: totalMins > 0 ? Math.round((v / totalMins) * 100) : 0
    }));

    let maxTotal = { val: 0, date: '-' };
    const maxSubj = { math: {val:0, date:'-'}, japanese: {val:0, date:'-'}, science: {val:0, date:'-'}, social: {val:0, date:'-'} };
    for (const d of dateMap.values()) {
       if (d.total > maxTotal.val) maxTotal = { val: d.total, date: d.name };
       (['math', 'japanese', 'science', 'social'] as Subject[]).forEach(s => { if (d[s] > maxSubj[s].val) maxSubj[s] = { val: d[s], date: d.name }; });
    }
    return { chartData: data, pieData: pData, maxStats: { total: maxTotal, subjects: maxSubj } };
  }, [tasks, dateRange, selectedSubjects]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
       <div className="bg-white sticky top-0 z-20 px-4 py-3 md:px-6 md:py-4 lg:px-8 lg:py-4 border-b border-slate-200 shadow-sm space-y-2.5 md:space-y-3">
          <div className="flex gap-2 md:gap-3">
             <div className="flex-1 flex justify-between items-center bg-slate-50 p-1.5 md:p-2 lg:p-2.5 rounded-lg md:rounded-xl border border-slate-200">
                <div className="flex gap-1.5 md:gap-2 items-center">
                   <CalendarIcon className="text-slate-400 ml-1 w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                   <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-[10px] md:text-xs lg:text-sm font-bold text-slate-600 outline-none w-20 md:w-28 lg:w-32" />
                   <span className="text-slate-300">-</span>
                   <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-[10px] md:text-xs lg:text-sm font-bold text-slate-600 outline-none w-20 md:w-28 lg:w-32" />
                </div>
             </div>
             
             <div className="flex gap-2 md:gap-2.5 lg:gap-3">
                {[
                  { l: '1週間', d: 7 }, 
                  { l: '2週間', d: 14 }, 
                  { l: '1ヶ月', d: 30 }
                ].map(r => (
                  <button 
                    key={r.l} 
                    onClick={() => setPresetRange(r.d)} 
                    className="flex-1 py-1.5 md:py-2 lg:py-2.5 px-2 md:px-3 lg:px-4 bg-white border border-slate-100 text-xs md:text-[13px] lg:text-sm font-bold rounded-lg md:rounded-xl text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shadow-sm"
                  >
                    {r.l}
                  </button>
                ))}
             </div>
          </div>

          <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-0.5 md:pb-1 no-scrollbar">
             {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => (
               <button key={s} onClick={() => toggleSubject(s)} className={`flex-1 py-1.5 px-2 md:py-2 md:px-3 rounded-lg md:rounded-xl text-[10px] md:text-xs lg:text-sm font-bold whitespace-nowrap transition-colors ${selectedSubjects.includes(s) ? `${SUBJECT_CONFIG[s].bg} text-white` : 'bg-slate-100 text-slate-400'}`}>{SUBJECT_CONFIG[s].short}</button>
             ))}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8 space-y-4 md:space-y-6 lg:space-y-8 pb-20 md:pb-32">
          <div className="bg-white p-3 md:p-5 lg:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 h-52 md:h-80 lg:h-[28rem] shrink-0">
             <h3 className="text-[10px] md:text-sm lg:text-base font-bold text-slate-500 mb-1 md:mb-3 flex items-center gap-1 md:gap-1.5"><BarChart2 className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5"/> 学習時間 (分)</h3>
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="name" tick={{fontSize: 9}} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={15} />
                   <YAxis tick={{fontSize: 9}} axisLine={false} tickLine={false} />
                   <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', fontSize: '10px', padding: '4px 8px'}} />
                   {selectedSubjects.includes('math') && <Bar dataKey="math" name={SUBJECT_CONFIG.math.label} stackId="a" fill={SUBJECT_CONFIG.math.hex} />}
                   {selectedSubjects.includes('japanese') && <Bar dataKey="japanese" name={SUBJECT_CONFIG.japanese.label} stackId="a" fill={SUBJECT_CONFIG.japanese.hex} />}
                   {selectedSubjects.includes('science') && <Bar dataKey="science" name={SUBJECT_CONFIG.science.label} stackId="a" fill={SUBJECT_CONFIG.science.hex} />}
                   {selectedSubjects.includes('social') && <Bar dataKey="social" name={SUBJECT_CONFIG.social.label} stackId="a" fill={SUBJECT_CONFIG.social.hex} />}
                </BarChart>
             </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 lg:gap-6">
             <div className="bg-white p-3 md:p-5 lg:p-6 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 min-h-[12rem] md:min-h-[14rem] lg:min-h-[16rem] flex flex-col lg:col-span-1">
                <h3 className="text-[10px] md:text-sm lg:text-base font-bold text-slate-500 mb-1 md:mb-3 flex items-center gap-1 md:gap-1.5"><PieChartIcon className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5"/> 比率</h3>
                {pieData.length > 0 ? (
                  <>
                    <div className="flex-1 w-full relative mb-1 md:mb-3 min-h-[80px]">
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={20} outerRadius={35} paddingAngle={2} dataKey="value">{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={{borderRadius:'8px', fontSize:'9px', padding:'2px 4px'}} itemStyle={{padding:0}} /></PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1 md:gap-2">
                        {pieData.map(d => (
                            <div key={d.name} className="flex justify-between items-center text-[9px] md:text-xs lg:text-sm">
                                <div className="flex items-center gap-1 md:gap-1.5"><div className="w-1.5 h-1.5 md:w-2 md:h-2 lg:w-2.5 lg:h-2.5 rounded-full" style={{ backgroundColor: d.color }} /><span className="font-bold text-slate-600">{d.name}</span></div>
                                <span className="font-mono font-bold text-slate-700">{Math.floor(d.value/60)}h{d.value%60}m <span className="text-slate-400 font-normal">({d.percent}%)</span></span>
                            </div>
                        ))}
                    </div>
                  </>
                ) : <div className="text-[10px] md:text-xs lg:text-sm text-slate-300 mt-4 md:mt-6 text-center">データなし</div>}
             </div>

             <div className="space-y-3 md:space-y-5 lg:space-y-6 lg:col-span-2 flex flex-col justify-between">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl md:rounded-3xl p-3 md:p-5 lg:p-6 text-white shadow-md flex-1 flex flex-col justify-center">
                   <div className="text-[9px] md:text-xs lg:text-sm text-slate-300 font-bold mb-0.5 md:mb-1.5">期間内ベスト(1日)</div>
                   <div className="text-xl md:text-3xl lg:text-4xl font-black">{Math.floor(maxStats.total.val / 60)}<span className="text-[10px] md:text-sm lg:text-base font-normal opacity-70">h</span>{maxStats.total.val % 60}<span className="text-[10px] md:text-sm lg:text-base font-normal opacity-70">m</span></div>
                   <div className="text-[9px] md:text-xs lg:text-sm text-slate-400 text-right mt-0.5 md:mt-1.5">{maxStats.total.date}</div>
                </div>
                <div className="bg-white rounded-2xl md:rounded-3xl p-2.5 md:p-5 lg:p-6 border border-slate-200 shadow-sm flex-1 flex flex-col justify-center">
                   <div className="text-[9px] md:text-xs lg:text-sm text-slate-400 font-bold mb-1.5 md:mb-3">科目別ベスト</div>
                   <div className="space-y-1 md:space-y-2">
                      {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => (
                         selectedSubjects.includes(s) && maxStats.subjects[s].val > 0 && (
                            <div key={s} className="flex justify-between items-center text-[9px] md:text-xs lg:text-sm">
                               <span className={`font-bold ${SUBJECT_CONFIG[s].color}`}>{SUBJECT_CONFIG[s].short}</span>
                               <span className="font-mono font-bold">{maxStats.subjects[s].val}m <span className="text-[8px] md:text-[10px] lg:text-xs text-slate-300 font-normal">({maxStats.subjects[s].date})</span></span>
                            </div>
                         )
                      ))}
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};

// ==========================================
// User Authentication (Login View)
// ==========================================
const LoginForm = ({ onLogin, onSampleMode }: { onLogin: (e:string, p:string) => Promise<void>, onSampleMode: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email || !password) { setError('メールアドレスとパスワードを入力してください'); return; }
    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm md:max-w-md lg:max-w-lg bg-white rounded-3xl md:rounded-[2rem] shadow-xl p-8 md:p-10 lg:p-12">
        <div className="text-center mb-8 md:mb-10">
          <div className="w-16 h-16 md:w-18 md:h-18 lg:w-20 lg:h-20 bg-blue-100 text-blue-600 rounded-2xl md:rounded-3xl flex items-center justify-center mx-auto mb-4 md:mb-6">
            <Award className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10" />
          </div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-slate-800 tracking-tight">Level Up Study</h1>
          <p className="text-sm md:text-base lg:text-lg text-slate-500 mt-2 md:mt-3 font-bold">学習管理へログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6 mb-6 md:mb-8">
          <div>
            <label className="block text-xs md:text-sm lg:text-base font-bold text-slate-500 mb-1.5 md:mb-2 ml-1">メールアドレス</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 text-sm md:text-base lg:text-lg font-medium text-slate-700 focus:outline-none focus:border-blue-500" placeholder="family@example.com" />
          </div>
          <div>
            <label className="block text-xs md:text-sm lg:text-base font-bold text-slate-500 mb-1.5 md:mb-2 ml-1">パスワード</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 text-sm md:text-base lg:text-lg font-medium text-slate-700 focus:outline-none focus:border-blue-500" placeholder="••••••••" />
          </div>
          {error && <div className="text-xs md:text-sm lg:text-base text-red-500 font-bold px-1">{error}</div>}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 md:py-4 lg:py-5 text-base md:text-lg lg:text-xl rounded-xl md:rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-all flex justify-center items-center gap-2 md:gap-3 mt-2 md:mt-4">
            <LogIn className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" /> ログイン
          </button>
        </form>
        
        <div className="relative flex items-center py-4 md:py-6">
          <div className="flex-grow border-t border-slate-100"></div>
          <span className="flex-shrink-0 mx-4 text-slate-400 text-xs md:text-sm lg:text-base font-bold">または</span>
          <div className="flex-grow border-t border-slate-100"></div>
        </div>

        <button onClick={onSampleMode} className="w-full bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold py-3.5 md:py-4 lg:py-5 text-base md:text-lg lg:text-xl rounded-xl md:rounded-2xl active:scale-95 transition-all flex justify-center items-center gap-2 md:gap-3">
          <FlaskConical className="w-[18px] h-[18px] md:w-5 md:h-5 lg:w-6 lg:h-6" /> サンプルデータで試す
        </button>
      </div>
    </div>
  );
};


// ==========================================
// Main Application Entry
// ==========================================
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [syncState, setSyncState] = useState<'synced' | 'syncing' | 'offline'>('synced');
  const [lastSync, setLastSync] = useState(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
  const [isSampleMode, setIsSampleMode] = useState(false);
  
  const [activeTab, setActiveTab] = useState('daily');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tests, setTests] = useState<TestResult[]>([]);
  
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  
  const [confirmModalData, setConfirmModalData] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);

  const tasksRef = useRef<Task[]>([]);
  const globalLastActivityAtRef = useRef(Date.now());
  const lastActivityLocalUpdateAtRef = useRef(0);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Authentication & Initialization
  useEffect(() => {
    if (!auth) {
       setIsSampleMode(true);
       setTasks(INITIAL_TASKS);
       setTests(INITIAL_TESTS);
       setIsAuthChecking(false);
       return;
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const handleEmailLogin = async (email: string, pass: string) => {
    if (!auth) return;
    setIsAuthChecking(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      setIsAuthChecking(false);
      throw new Error("ログインに失敗しました。メールアドレスとパスワードを確認してください。");
    }
  };

  const handleLogout = () => {
    if (!auth) return;
    setConfirmModalData({
      title: 'ログアウト',
      message: '本当にログアウトしますか？',
      onConfirm: async () => {
        await signOut(auth);
        setTasks([]);
        setTests([]);
        setIsSampleMode(false);
      }
    });
  };

  const fetchData = useCallback(async (isSilent = false) => {
    const dbInstance = getSafeDb();
    if (!dbInstance || !auth?.currentUser || isSampleMode) {
      if (!dbInstance && !isSilent) console.warn('Firebase未設定のため、データ取得をスキップしサンプルモードで動作します');
      return;
    }
    
    if (!isSilent) setSyncState('syncing');
    
    try {
      const taskSnap = await getDocs(query(getTasksCol(dbInstance)));
      const testSnap = await getDocs(query(getTestsCol(dbInstance)));
      
      const fetchedTasks = taskSnap.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as Task;
      });
      const fetchedTests = testSnap.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as TestResult;
      });

      setTasks(fetchedTasks);
      setTests(fetchedTests);
      
      setCache(CACHE_KEY_TASKS, fetchedTasks);
      setCache(CACHE_KEY_TESTS, fetchedTests);
      
      setSyncState('synced');
      setLastSync(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error(err);
      setSyncState('offline');
      const ctTasks = getCache(CACHE_KEY_TASKS);
      const ctTests = getCache(CACHE_KEY_TESTS);
      if (ctTasks) setTasks(ctTasks);
      if (ctTests) setTests(ctTests);
    }
  }, [user, isSampleMode]);

  useEffect(() => {
    if (user && !isSampleMode) {
      const ctTasks = getCache(CACHE_KEY_TASKS);
      const ctTests = getCache(CACHE_KEY_TESTS);
      if (ctTasks) setTasks(ctTasks);
      if (ctTests) setTests(ctTests);
      fetchData();
    }
  }, [user, fetchData, isSampleMode]);

  useEffect(() => {
    if (!isSampleMode && tasks.length > 0) {
      setCache(CACHE_KEY_TASKS, tasks);
      setCache(CACHE_KEY_TESTS, tests);
    }
  }, [tasks, tests, isSampleMode]);

  useEffect(() => {
    if (isSampleMode) return;
    const interval = setInterval(() => {
       setTasks(prev => {
          let changed = false;
          const now = Date.now();
          const next = prev.map(t => {
             if (t.isRunning && t.sessionStartTime && (now - t.lastUpdatedAt > 10 * 60 * 1000)) {
                changed = true;
                const abnormalDuration = t.currentDuration + Math.floor((t.lastUpdatedAt - t.sessionStartTime)/1000);
                return { 
                  ...t, isRunning: false, sessionStartTime: null, 
                  currentDuration: abnormalDuration, lastUpdatedAt: now 
                };
             }
             return t;
          });
          return changed ? next : prev;
       });
    }, 60000);
    return () => clearInterval(interval);
  }, [isSampleMode]);

  // ==========================================
  // Cloud Sync Optimizations
  // ==========================================
  
  const updateLocalTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const syncTaskToCloud = useCallback(async (id: string, cloudUpdates: any) => {
    const dbInstance = getSafeDb();
    if (!dbInstance || !auth?.currentUser || isSampleMode) return;
    try {
      const taskRef = getTaskDoc(dbInstance, id);
      await updateDoc(taskRef, cloudUpdates);
      setSyncState('synced');
      setLastSync(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setSyncState('offline');
    }
  }, [isSampleMode]);

  // グローバル操作監視：詳細モーダルを閉じていても、操作があれば稼働中タイマーの無操作判定をリセットする
  useEffect(() => {
    const handleGlobalActivity = () => {
      const now = Date.now();
      globalLastActivityAtRef.current = now;

      // マウス移動等で過剰に再描画しないよう、ローカル更新は1秒に1回まで
      if (now - lastActivityLocalUpdateAtRef.current < 1000) return;
      lastActivityLocalUpdateAtRef.current = now;

      setTasks(prev => {
        let changed = false;
        const next = prev.map(t => {
          if (t.isRunning && t.sessionStartTime) {
            changed = true;
            return { ...t, lastActivityAt: now };
          }
          return t;
        });
        return changed ? next : prev;
      });
    };

    window.addEventListener('mousemove', handleGlobalActivity);
    window.addEventListener('keydown', handleGlobalActivity);
    window.addEventListener('touchstart', handleGlobalActivity);
    window.addEventListener('scroll', handleGlobalActivity);
    return () => {
      window.removeEventListener('mousemove', handleGlobalActivity);
      window.removeEventListener('keydown', handleGlobalActivity);
      window.removeEventListener('touchstart', handleGlobalActivity);
      window.removeEventListener('scroll', handleGlobalActivity);
    };
  }, []);

  // グローバルタイマー制御：
  // 1) 稼働中タイマーは常に最新1件だけに補正
  // 2) 詳細画面を閉じていても、5分無操作で自動停止
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const currentTasks = tasksRef.current;
      const runningTasks = currentTasks.filter(t => t.isRunning && t.sessionStartTime);
      if (runningTasks.length === 0) return;

      const latestRunningTask = [...runningTasks].sort(
        (a, b) => (b.lastUpdatedAt || b.sessionStartTime || 0) - (a.lastUpdatedAt || a.sessionStartTime || 0)
      )[0];

      const updatesToSync: { id: string; updates: Partial<Task> }[] = [];

      runningTasks.forEach(t => {
        const idleBase = t.lastActivityAt || globalLastActivityAtRef.current || t.sessionStartTime || now;
        const shouldForceStopBecauseDuplicated = t.id !== latestRunningTask.id;
        const shouldStopBecauseIdle = !document.hidden && t.id === latestRunningTask.id && now - idleBase >= IDLE_LIMIT_MS;

        if (shouldForceStopBecauseDuplicated || shouldStopBecauseIdle) {
          const elapsed = t.sessionStartTime ? Math.max(0, Math.floor((now - t.sessionStartTime) / 1000)) : 0;
          updatesToSync.push({
            id: t.id,
            updates: {
              isRunning: false,
              currentDuration: t.currentDuration + elapsed,
              sessionStartTime: null,
              lastActivityAt: now,
              lastUpdatedAt: now,
            }
          });
        }
      });

      if (updatesToSync.length === 0) return;

      setTasks(prev => prev.map(t => {
        const hit = updatesToSync.find(u => u.id === t.id);
        return hit ? { ...t, ...hit.updates } : t;
      }));

      updatesToSync.forEach(({ id, updates }) => {
        syncTaskToCloud(id, updates);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [syncTaskToCloud]);

  const saveTestToCloud = async (testResult: TestResult) => {
    setTests(prev => {
      const existing = prev.find(t => t.id === testResult.id);
      if (existing) {
        return prev.map(t => t.id === testResult.id ? testResult : t);
      }
      return [testResult, ...prev];
    });

    const dbInstance = getSafeDb();
    if (!dbInstance || !auth?.currentUser || isSampleMode) return;
    try {
      const testRef = getTestDoc(dbInstance, testResult.id);
      await setDoc(testRef, {
        ...testResult,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSyncState('synced');
      setLastSync(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setSyncState('offline');
    }
  };

  const deleteTestFromCloud = (id: string) => {
    setConfirmModalData({
      title: 'テスト記録の削除',
      message: '本当にこのテスト記録を削除しますか？\nこの操作は取り消せません。',
      onConfirm: async () => {
        setTests(prev => prev.filter(t => t.id !== id));
        const dbInstance = getSafeDb();
        if (!dbInstance || !auth?.currentUser || isSampleMode) return;
        try {
          const testRef = getTestDoc(dbInstance, id);
          await deleteDoc(testRef);
          setSyncState('synced');
          setLastSync(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
        } catch (e) {
          setSyncState('offline');
        }
      }
    });
  };

  // ==========================================

  const cycleStatus = (task: Task) => {
    const next = task.status === 'not_started' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'not_started';
    updateLocalTask(task.id, { status: next, lastUpdatedAt: Date.now() });
  };

  const saveHistoryRecord = async (task: Task) => {
    if (task.currentDuration === 0) return;
    const endAt = Date.now();
    const startAt = task.sessionStartTime || (endAt - task.currentDuration * 1000);
    const newHistory = {
      id: endAt.toString(),
      date: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
      duration: task.currentDuration,
      memo: task.currentMemo,
      startAt,
      endAt
    };
    
    const updates = { 
      history: [...task.history, newHistory], 
      currentDuration: 0, 
      currentMemo: '', 
      isRunning: false,
      sessionStartTime: null,
      lastActivityAt: Date.now(),
      lastUpdatedAt: Date.now(),
      status: task.status === 'not_started' ? 'in_progress' : task.status
    };
    const cloudUpdates = {
      ...updates,
      lastUpdatedAt: serverTimestamp()
    }
    
    updateLocalTask(task.id, updates as Partial<Task>);
    if (!isSampleMode) {
      await syncTaskToCloud(task.id, cloudUpdates);
    }
    setDetailTaskId(null);
  };

  // タイマー排他制御：指定したタスク以外の稼働中タスクをすべてストップさせる
  const pauseAllOtherTasks = useCallback(async (currentTaskId: string) => {
    const now = Date.now();
    let tasksToPause: Task[] = [];
    
    setTasks(prev => {
      tasksToPause = prev.filter(t => t.isRunning && t.id !== currentTaskId);
      if (tasksToPause.length === 0) return prev;

      return prev.map(t => {
        if (t.isRunning && t.id !== currentTaskId) {
          const elapsed = t.sessionStartTime ? Math.floor((now - t.sessionStartTime) / 1000) : 0;
          return {
            ...t,
            isRunning: false,
            currentDuration: t.currentDuration + elapsed,
            sessionStartTime: null,
            lastActivityAt: now,
            lastUpdatedAt: now
          };
        }
        return t;
      });
    });

    if (tasksToPause.length > 0) {
      const dbInstance = getSafeDb();
      if (dbInstance && auth?.currentUser && !isSampleMode) {
        try {
          const batch = writeBatch(dbInstance);
          tasksToPause.forEach(t => {
            const elapsed = t.sessionStartTime ? Math.floor((now - t.sessionStartTime) / 1000) : 0;
            batch.update(getTaskDoc(dbInstance, t.id), {
              isRunning: false,
              currentDuration: t.currentDuration + elapsed,
              sessionStartTime: null,
              lastActivityAt: now,
              lastUpdatedAt: now
            });
          });
          await batch.commit();
        } catch (e) {
          console.error("Batch update failed", e);
        }
      }
    }
  }, [isSampleMode]);


  const addUnitWithPresets = async (unitNumber: number) => {
    const unitName = `第${unitNumber}回`;
    const newTasks: Task[] = [];
    (Object.keys(SUBJECT_CONFIG) as Subject[]).forEach(subject => {
        CURRICULUM_PRESETS[subject as Subject].forEach(preset => {
            preset.items.forEach((item, index) => {
                newTasks.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9) + index,
                    unit: unitName, subject: subject as Subject, category: preset.category, title: item,
                    materialName: `${preset.category} - ${item}`, status: 'not_started',
                    currentDuration: 0, sessionStartTime: null, isRunning: false,
                    lastUpdatedAt: Date.now(), currentMemo: '', history: [], createdAt: new Date().toISOString()
                });
            });
        });
    });
    
    setTasks(prev => [...newTasks, ...prev]);
    setSelectedUnit(unitName);
    
    const dbInstance = getSafeDb();
    if (!dbInstance || !auth?.currentUser || isSampleMode) return;
    const batch = writeBatch(dbInstance);
    newTasks.forEach(t => batch.set(getTaskDoc(dbInstance, t.id), { ...t, lastUpdatedAt: serverTimestamp() }));
    await batch.commit();
  };

  const deleteUnitTasks = async (unit: string) => {
    const toDelete = tasks.filter(t => t.unit === unit);
    setTasks(prev => prev.filter(t => t.unit !== unit));
    if (selectedUnit === unit) setSelectedUnit(null);
    
    const dbInstance = getSafeDb();
    if (!dbInstance || !auth?.currentUser || isSampleMode) return;
    const batch = writeBatch(dbInstance);
    toDelete.forEach(t => batch.delete(getTaskDoc(dbInstance, t.id)));
    await batch.commit();
  };

  const onAddCustomTask = async (unit: string, subject: Subject, title: string, category: string) => {
    const newTask: Task = {
      id: Date.now().toString(), unit, subject, category, title, materialName: `${category} - ${title}`,
      status: 'not_started', currentDuration: 0, sessionStartTime: null, isRunning: false, lastUpdatedAt: Date.now(),
      currentMemo: '', history: [], createdAt: new Date().toISOString()
    };
    setTasks(prev => [...prev, newTask]);

    const dbInstance = getSafeDb();
    if (!dbInstance || !auth?.currentUser || isSampleMode) return;
    await setDoc(getTaskDoc(dbInstance, newTask.id), { ...newTask, lastUpdatedAt: serverTimestamp() });
  };


  const unitsWithTasks = useMemo(() => Array.from(new Set(tasks.map(t => t.unit))).sort((a, b) => {
    const numA = parseInt(a.replace('第', '').replace('回', '')) || 0;
    const numB = parseInt(b.replace('第', '').replace('回', '')) || 0;
    return numB - numA;
  }), [tasks]);

  // --- Routing / Auth Gate ---
  if (isAuthChecking) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400 font-bold">起動中...</div>;

  if (!user && !isSampleMode) {
    return <LoginForm onLogin={handleEmailLogin} onSampleMode={() => { setIsSampleMode(true); setTasks(INITIAL_TASKS); setTests(INITIAL_TESTS); }} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 max-w-[1600px] mx-auto shadow-2xl overflow-x-hidden relative">
      {isSampleMode && (
        <div className="bg-amber-100 text-amber-800 text-[10px] md:text-xs lg:text-sm font-bold text-center py-1 md:py-2 flex items-center justify-center gap-1.5 z-40 relative">
          <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5" />
          サンプルモード表示中（データは保存されません）
        </div>
      )}
      <header className="bg-white/80 backdrop-blur-xl pt-4 md:pt-6 lg:pt-8 sticky top-0 z-30 border-b border-slate-100">
        <div className="h-14 md:h-16 lg:h-20 flex items-center justify-between px-5 md:px-8 lg:px-10">
          <div>
            <h1 className="font-black text-lg md:text-2xl lg:text-3xl text-slate-800 tracking-tight flex items-center gap-2 md:gap-3">
              Level Up Study<span className="bg-blue-100 text-blue-600 px-2 py-0.5 md:px-3 md:py-1 rounded text-[10px] md:text-sm lg:text-base">v5</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4 lg:gap-6">
             {!isSampleMode ? (
               <div className="flex items-center gap-2 md:gap-4">
                 <div className="flex flex-col items-end mr-1 md:mr-2">
                    <div className="text-[9px] md:text-xs lg:text-sm text-slate-400 font-bold mb-0.5 md:mb-1 flex items-center gap-1 md:gap-1.5">
                      {syncState === 'syncing' ? <RefreshCw className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 animate-spin text-blue-500" /> :
                       syncState === 'offline' ? <CloudOff className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 text-red-400"/> : <Cloud className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 text-green-500"/>}
                      {lastSync} 同期
                    </div>
                    <button onClick={() => fetchData(false)} className="text-[10px] md:text-xs lg:text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 md:px-3 md:py-1.5 rounded font-bold transition-colors flex items-center gap-1 active:scale-95">
                      手動更新
                    </button>
                 </div>
                 <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 p-1 md:p-2" title="ログアウト">
                    <LogOut className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" />
                 </button>
               </div>
             ) : (
                <button 
                  onClick={() => { setIsSampleMode(false); fetchData(true); }}
                  className="text-[10px] md:text-xs lg:text-sm bg-slate-800 text-white px-3 py-1.5 md:px-4 md:py-2 rounded font-bold transition-colors active:scale-95"
                >
                  データに戻る
                </button>
             )}
             <button 
                onClick={() => {
                  if (!isSampleMode) {
                    setIsSampleMode(true);
                    setTasks(generateDummyTasks());
                    setTests(INITIAL_TESTS);
                  } else {
                    setIsSampleMode(false);
                    fetchData(true);
                  }
                }}
                className={`text-[10px] md:text-xs lg:text-sm px-2 py-2 md:px-3 md:py-2.5 rounded-lg font-bold transition-colors flex items-center gap-1 md:gap-2 active:scale-95 ${isSampleMode ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                title="サンプル表示"
              >
                <FlaskConical className="w-3.5 h-3.5 md:w-4 md:h-4 lg:w-5 lg:h-5" />
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain no-scrollbar flex flex-col pb-24 md:pb-32 lg:pb-40">
        {activeTab === 'daily' ? (
          <DailyView 
            tasks={tasks} updateLocalTask={updateLocalTask} syncTaskToCloud={syncTaskToCloud} cycleStatus={cycleStatus} 
            saveHistoryRecord={saveHistoryRecord} deleteUnitTasks={deleteUnitTasks} 
            deleteTask={(id: string) => { 
               setConfirmModalData({
                 title: 'タスクの削除', message: '本当にこのタスクを削除しますか？',
                 onConfirm: async () => {
                    setTasks(prev => prev.filter(t => t.id !== id));
                    const dbInstance = getSafeDb();
                    if(dbInstance && user && !isSampleMode) await deleteDoc(getTaskDoc(dbInstance, id));
                 }
               });
            }}
            setAddModalOpen={setAddModalOpen} 
            selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} 
            unitsWithTasks={unitsWithTasks} onAddCustomTask={onAddCustomTask}
            setDetailTaskId={setDetailTaskId} setDeleteConfirmation={setConfirmModalData}
            pauseAllOtherTasks={pauseAllOtherTasks}
          />
        ) : activeTab === 'tests' ? (
          <TestsView tests={tests} onSaveTest={saveTestToCloud} onDeleteTest={deleteTestFromCloud} />
        ) : (
          <AchievementsView tasks={tasks} />
        )}
      </main>

      <nav className="bg-white/90 backdrop-blur-lg border-t border-slate-100 fixed bottom-0 left-0 right-0 z-40 pb-6 md:pb-8 lg:pb-8 w-full max-w-[1600px] mx-auto rounded-t-3xl md:rounded-t-[2rem] shadow-[0_-10px_30px_rgba(0,0,0,0.04)]">
        <div className="h-16 md:h-20 lg:h-24 flex justify-around items-center px-2 md:px-6 lg:px-10">
          <button onClick={() => setActiveTab('daily')} className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 md:space-y-2 transition-all duration-300 ${activeTab === 'daily' ? 'text-blue-600 -translate-y-1 md:-translate-y-2' : 'text-slate-400 hover:text-slate-500'}`}>
            <div className={`p-1.5 md:p-3 rounded-xl md:rounded-2xl ${activeTab === 'daily' ? 'bg-blue-50' : ''}`}><FileText className="w-[22px] h-[22px] md:w-6 md:h-6 lg:w-7 lg:h-7" strokeWidth={activeTab === 'daily' ? 2.5 : 2} fill={activeTab === 'daily' ? "currentColor" : "none"} /></div><span className="text-[10px] md:text-sm lg:text-base font-bold">学習</span>
          </button>
          <button onClick={() => setActiveTab('achievements')} className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 md:space-y-2 transition-all duration-300 ${activeTab === 'achievements' ? 'text-blue-600 -translate-y-1 md:-translate-y-2' : 'text-slate-400 hover:text-slate-500'}`}>
             <div className={`p-1.5 md:p-3 rounded-xl md:rounded-2xl ${activeTab === 'achievements' ? 'bg-blue-50' : ''}`}><BarChart2 className="w-[22px] h-[22px] md:w-6 md:h-6 lg:w-7 lg:h-7" strokeWidth={activeTab === 'achievements' ? 2.5 : 2} /></div><span className="text-[10px] md:text-sm lg:text-base font-bold">実績</span>
          </button>
          <button onClick={() => setActiveTab('tests')} className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 md:space-y-2 transition-all duration-300 ${activeTab === 'tests' ? 'text-blue-600 -translate-y-1 md:-translate-y-2' : 'text-slate-400 hover:text-slate-500'}`}>
             <div className={`p-1.5 md:p-3 rounded-xl md:rounded-2xl ${activeTab === 'tests' ? 'bg-blue-50' : ''}`}><Award className="w-[22px] h-[22px] md:w-6 md:h-6 lg:w-7 lg:h-7" strokeWidth={activeTab === 'tests' ? 2.5 : 2} /></div><span className="text-[10px] md:text-sm lg:text-base font-bold">成績</span>
          </button>
        </div>
      </nav>

      <CreateUnitOverlay isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} onCreate={addUnitWithPresets} />
      
      {detailTaskId && (
         <TaskDetailModal 
            task={tasks.find((t: Task) => t.id === detailTaskId)!}
            onClose={() => setDetailTaskId(null)}
            updateLocalTask={updateLocalTask}
            syncTaskToCloud={syncTaskToCloud}
            onSaveRecord={saveHistoryRecord}
            onDelete={() => {
               setConfirmModalData({
                 title: 'タスクの削除', message: '本当にこのタスクを削除しますか？',
                 onConfirm: async () => {
                    setTasks(prev => prev.filter(t => t.id !== detailTaskId));
                    const dbInstance = getSafeDb();
                    if(dbInstance && user && !isSampleMode) await deleteDoc(getTaskDoc(dbInstance, detailTaskId));
                    setDetailTaskId(null);
                 }
               });
            }}
            pauseAllOtherTasks={pauseAllOtherTasks}
         />
      )}

      <ConfirmModal 
        isOpen={!!confirmModalData} 
        onClose={() => setConfirmModalData(null)} 
        onConfirm={confirmModalData?.onConfirm || (() => {})} 
        title={confirmModalData?.title} 
        message={confirmModalData?.message} 
      />
    </div>
  );
}