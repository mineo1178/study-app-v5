import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Clock, Play, Pause, Plus, Trash2, CheckCircle, Circle, 
  ChevronDown, Award, X, Zap, Layers, History, LayoutDashboard, 
  TrendingUp, Calendar as CalendarIcon, PieChart as PieChartIcon, BarChart2,
  AlertTriangle, RefreshCw, CloudOff, Cloud, FileText, FlaskConical, LogIn, LogOut
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDocs, updateDoc, deleteDoc, 
  enableIndexedDbPersistence, writeBatch, query,
  serverTimestamp   // ←これ追加
} from 'firebase/firestore';

// ==========================================
// Firebase Initialization & Canvas Env Rules
// ==========================================
declare const __firebase_config: string;
declare const __app_id: string;

const firebaseConfig =
  typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
const db = getFirestore(app);

// オフラインキャッシュ有効化
try {
  enableIndexedDbPersistence(db).catch(err => {
    console.warn("Offline persistence failed to enable:", err);
  });
} catch (e) {}

// ==========================================
// 1. Type Definitions & Constants
// ==========================================

const FAMILY_ID = 'oomine-study-2026';

// 本番用とCanvas用パスの分離
const getTasksCol = () => {
  if (typeof __app_id !== 'undefined' && __app_id) {
    return collection(db, 'artifacts', __app_id, 'public', 'data', `families_${FAMILY_ID}_tasks`);
  }
  return collection(db, 'families', FAMILY_ID, 'tasks');
};

const getTestsCol = () => {
  if (typeof __app_id !== 'undefined' && __app_id) {
    return collection(db, 'artifacts', __app_id, 'public', 'data', `families_${FAMILY_ID}_tests`);
  }
  return collection(db, 'families', FAMILY_ID, 'tests');
};


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
  lastUpdatedAt: number; 
  currentMemo: string;
  history: { id: string; date: string; duration: number; memo: string }[];
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
              history.push({
                id: Math.random().toString(36).substr(2, 9),
                date: `${date.getMonth() + 1}/${date.getDate()}`,
                duration,
                memo: Math.random() > 0.7 ? '難しかった' : ''
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
  task, updateLocalTask, syncTaskToCloud, onSaveRecord
}: { 
  task: Task; 
  updateLocalTask: (id: string, updates: Partial<Task>) => void;
  syncTaskToCloud: (id: string, cloudUpdates: any) => void;
  onSaveRecord: (task: Task) => void;
}) => {
  const [localSeconds, setLocalSeconds] = useState(task.currentDuration);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActive = useRef(Date.now());
  const isRunning = task.isRunning;

  useEffect(() => {
    if (!isRunning) setLocalSeconds(task.currentDuration);
  }, [task.currentDuration, isRunning]);

  // 放置防止 (操作検知)
  useEffect(() => {
    const handleActivity = () => { lastActive.current = Date.now(); };
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
  }, []);

  // Timer Loop & Idle Check
  useEffect(() => {
    if (isRunning) {
      const startTime = task.sessionStartTime || Date.now();
      const initialSec = task.currentDuration;
      
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setLocalSeconds(initialSec + elapsed);
        
        // 異常検知のためにローカルの lastUpdatedAt を随時更新（クラウドには送らない）
        if (elapsed % 10 === 0) {
           updateLocalTask(task.id, { lastUpdatedAt: now });
        }

        // 5分無操作で自動一時停止
        if (now - lastActive.current > 5 * 60 * 1000) {
          handlePause(true, initialSec + elapsed);
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning, task.sessionStartTime, task.currentDuration]);

  // バックグラウンド時は停止
  useEffect(() => {
    const handleVis = () => {
      if (document.hidden && task.isRunning) {
        handlePause(false, localSeconds);
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [task.isRunning, localSeconds]);

  // --- Actions ---
  const handlePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    lastActive.current = Date.now();
    const startTime = Date.now();
    
    // ローカル更新
    updateLocalTask(task.id, { 
      isRunning: true, 
      sessionStartTime: startTime,
      lastUpdatedAt: startTime,
      status: task.status === 'not_started' ? 'in_progress' : task.status
    });

    // Firestore保存（開始時）
    syncTaskToCloud(task.id, {
      isRunning: true,
      sessionStartTime: startTime,
      lastUpdatedAt: startTime,
      status: task.status === 'not_started' ? 'in_progress' : task.status
    });
  };

  const handlePause = (isAutoPause: boolean, currentSecs: number) => {
    const now = Date.now();
    updateLocalTask(task.id, { 
      isRunning: false, 
      currentDuration: currentSecs,
      sessionStartTime: null,
      lastUpdatedAt: now
    });
    
    // Firestore保存（一時停止時）
    syncTaskToCloud(task.id, {
      isRunning: false,
      currentDuration: currentSecs,
      sessionStartTime: null,
      lastUpdatedAt: now
    });

    if (isAutoPause) alert("5分以上操作がなかったため、タイマーを自動的に一時停止しました。");
  };

  const handleStopAndSave = () => {
    const finalDuration = isRunning ? localSeconds : task.currentDuration;
    const now = Date.now();
    
    // 停止操作としてのローカル＆クラウド更新（保存自体はonSaveRecordで行う）
    updateLocalTask(task.id, { isRunning: false, currentDuration: finalDuration, sessionStartTime: null, lastUpdatedAt: now });
    syncTaskToCloud(task.id, { isRunning: false, currentDuration: finalDuration, sessionStartTime: null, lastUpdatedAt: now });
    
    setTimeout(() => {
      onSaveRecord({ ...task, currentDuration: finalDuration, isRunning: false });
    }, 100);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
       <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-3 border border-slate-200 shadow-inner w-full">
          <div className="flex-1 text-center">
             <span className={`font-mono text-3xl font-black tracking-widest ${isRunning ? 'text-blue-600' : 'text-slate-700'}`}>
                {formatTime(localSeconds)}
             </span>
             {isRunning && <div className="text-[9px] text-blue-500 font-bold mt-1 animate-pulse">計測中 (サボり検知ON)</div>}
          </div>
          <div className="flex items-center gap-2 pr-2">
             {!isRunning ? (
               <button onClick={handlePlay} className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 hover:bg-blue-700 transition-all">
                  <Play size={20} fill="currentColor" className="ml-1" />
               </button>
             ) : (
               <button onClick={() => handlePause(false, localSeconds)} className="w-12 h-12 flex items-center justify-center rounded-full bg-amber-500 text-white shadow-lg active:scale-95 hover:bg-amber-600 transition-all">
                  <Pause size={20} fill="currentColor" />
               </button>
             )}
          </div>
       </div>
       <button 
         onClick={handleStopAndSave} 
         disabled={localSeconds === 0} 
         className="w-full bg-slate-800 text-white font-bold py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
       >
         <History size={18} /> 計測を終了して記録を保存
       </button>
    </div>
  );
});
StrictTimer.displayName = 'StrictTimer';


// ==========================================
// Generic Modals
// ==========================================
const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl scale-100 animate-in zoom-in-95">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle size={32} />
          </div>
          <h3 className="text-xl font-black text-slate-800 mb-2">{title}</h3>
          <p className="text-slate-500 text-sm whitespace-pre-wrap">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">キャンセル</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-colors">削除する</button>
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
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 flex items-center"><Layers className="mr-2 text-blue-600" /> 新しい回を追加</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="mb-6 bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center">
          <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Unit Number</label>
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl font-black text-slate-300">第</span>
            <input type="number" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="?" className="w-24 bg-white border-2 border-blue-100 rounded-xl px-2 py-3 text-3xl font-black text-center text-blue-600 focus:outline-none focus:border-blue-500" autoFocus />
            <span className="text-2xl font-black text-slate-300">回</span>
          </div>
        </div>
        <button onClick={() => { if (parseInt(unitNumber) > 0) { onCreate(parseInt(unitNumber)); setUnitNumber(''); onClose(); } }} disabled={!unitNumber} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
          <Zap size={20} fill="currentColor"/> カリキュラムを作成
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
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-black text-slate-800">タスクを追加</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">カテゴリ</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-slate-50 border rounded-xl px-3 py-2 font-bold">
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
            <label className="block text-xs font-bold text-slate-400 mb-1">タイトル</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 追加問題..." className="w-full bg-slate-50 border rounded-xl px-3 py-2 font-bold" autoFocus />
          </div>
          <button onClick={() => { if (title) { onAdd(title, category); setTitle(''); setCategory('予習シリーズ'); onClose(); } }} disabled={!title} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg mt-2">追加</button>
        </div>
      </div>
    </div>
  );
};

const AddTestResultOverlay = ({ isOpen, onClose, onAdd }: any) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [name, setName] = useState('');
  const [type, setType] = useState('curriculum');
  const [devs, setDevs] = useState({ math: '', japanese: '', science: '', social: '' });
  const [totalDev, setTotalDev] = useState('');
  const [totalRank, setTotalRank] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    const newTest: TestResult = {
      id: Date.now().toString(), date: date.replace(/-/g, '/'), name, type,
      subjects: {
        math: { score: 0, avg: 0, dev: Number(devs.math) }, japanese: { score: 0, avg: 0, dev: Number(devs.japanese) },
        science: { score: 0, avg: 0, dev: Number(devs.science) }, social: { score: 0, avg: 0, dev: Number(devs.social) },
      },
      total4: { score: 0, avg: 0, dev: Number(totalDev), rank: totalRank }
    };
    onAdd(newTest);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-black text-slate-800">テスト結果を追加</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">実施日</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">種類</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold">
                {Object.entries(TEST_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">テスト名</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例: 第14回 カリテ" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold" />
          </div>
          
          <div className="border-t border-slate-100 pt-3">
            <h4 className="font-bold text-slate-600 mb-2 text-xs">各教科の偏差値</h4>
            <div className="grid grid-cols-4 gap-2">
              {(['math', 'japanese', 'science', 'social'] as Subject[]).map(subj => (
                <div key={subj}>
                  <label className={`block text-[10px] text-center font-bold ${SUBJECT_CONFIG[subj].color} mb-1`}>{SUBJECT_CONFIG[subj].short}</label>
                  <input type="number" value={devs[subj]} onChange={e => setDevs({...devs, [subj]: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1 py-1.5 text-xs text-center font-bold" />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3">
             <h4 className="font-bold text-slate-600 mb-2 text-xs">4科合計</h4>
             <div className="grid grid-cols-2 gap-3">
               <div><label className="block text-[10px] font-bold text-slate-400 mb-1">偏差値</label><input type="number" value={totalDev} onChange={e => setTotalDev(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold" /></div>
               <div><label className="block text-[10px] font-bold text-slate-400 mb-1">順位</label><input type="text" value={totalRank} onChange={e => setTotalRank(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold" /></div>
             </div>
          </div>
          <button onClick={handleSubmit} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg mt-2 active:scale-95">追加する</button>
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
      className={`group bg-white rounded-xl p-3 shadow-sm border border-slate-200 transition-all active:scale-[0.98] cursor-pointer flex flex-col gap-2 ${task.status === 'completed' ? 'opacity-60 bg-slate-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button onClick={(e) => { e.stopPropagation(); cycleStatus(task); }} className="p-1 -ml-1 mt-0.5 rounded-full active:scale-90 flex-shrink-0">
          {task.status === 'completed' ? <CheckCircle size={18} className="text-green-500" fill="#f0fdf4" /> : task.status === 'in_progress' ? <Zap size={18} className="text-blue-500" fill="currentColor" /> : <Circle size={18} className="text-slate-200" />}
        </button>
        <div className="flex-1 min-w-0 pt-0.5">
          <h4 className={`font-bold text-sm text-slate-800 leading-tight ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>{task.title}</h4>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
             <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1">
               <History size={8} /> {task.history.length}回
             </span>
             {task.currentDuration > 0 && <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${task.isRunning ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-amber-50 text-amber-600'}`}><Clock size={8} /> {formatTime(task.currentDuration)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

const TaskDetailModal = ({ task, onClose, updateLocalTask, syncTaskToCloud, onSaveRecord, onDelete }: any) => {
  if (!task) return null;
  const conf = SUBJECT_CONFIG[task.subject as Subject];
  
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative bg-slate-50 w-full max-w-md h-[90vh] sm:h-[85vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-10">
        <div className="bg-white px-5 py-4 rounded-t-3xl border-b border-slate-200 flex justify-between items-start shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${conf.lightBg} ${conf.color} border ${conf.border}`}>{conf.label}</span>
              <span className="text-[10px] font-bold text-slate-400">{task.unit} - {task.category}</span>
            </div>
            <h3 className="text-lg font-black text-slate-800 leading-tight pr-4">{task.title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-full text-slate-400 active:scale-95"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 scroll-smooth pb-10">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">状態</label>
            <div className="flex gap-2">
              {[
                { id: 'not_started', label: '未着手', icon: Circle, active: 'bg-slate-200 text-slate-700 border-slate-300' },
                { id: 'in_progress', label: '勉強中', icon: Zap, active: 'bg-blue-500 text-white border-blue-600' },
                { id: 'completed', label: '完了', icon: CheckCircle, active: 'bg-green-500 text-white border-green-600' },
              ].map(s => (
                <button key={s.id} 
                  onClick={() => {
                    // 要件: ステータス変更ボタンはローカルStateのみ更新
                    updateLocalTask(task.id, { status: s.id, lastUpdatedAt: Date.now() });
                  }}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 border transition-all ${
                    task.status === s.id ? s.active : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <s.icon size={16} />{s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Clock size={12} /> 計測タイマー (不正防止対応)</label>
            <StrictTimer task={task} updateLocalTask={updateLocalTask} syncTaskToCloud={syncTaskToCloud} onSaveRecord={onSaveRecord} />
            <div className="text-[9px] text-slate-400 text-center mt-2 leading-relaxed">※手動編集はできません。開始後5分間操作がない場合、自動で一時停止します。</div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">メモ</label>
            <textarea
              value={task.currentMemo} onChange={(e) => updateLocalTask(task.id, { currentMemo: e.target.value })}
              // 要件: onBlur等の都度保存はしない。ローカルStateのみ更新
              placeholder="ここにつまづいた、次はこうする..."
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 resize-none h-20 shadow-sm"
            />
          </div>
          
          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">過去の履歴 ({task.history.length})</label>
            {task.history.length === 0 ? (
              <div className="text-center py-6 text-slate-300 text-xs font-bold bg-white rounded-xl border border-dashed border-slate-200">記録なし</div>
            ) : (
              <div className="space-y-2">
                {[...task.history].reverse().map((h: any, i: number) => (
                  <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex gap-3">
                    <div className="flex flex-col items-center justify-center px-1 border-r border-slate-100 min-w-[2.5rem]">
                      <span className="text-[8px] font-bold text-slate-400">回目</span>
                      <span className="text-base font-black text-slate-700">{task.history.length - i}</span>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{h.date}</span>
                        <span className="text-xs font-bold text-blue-600 font-mono flex items-center gap-1"><Clock size={10} />{formatTime(h.duration)}</span>
                      </div>
                      {h.memo && <p className="text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded mt-1 truncate">{h.memo}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white sm:rounded-b-3xl shrink-0 flex gap-3 pb-safe-bottom">
           <button onClick={onDelete} className="text-red-500 bg-red-50 hover:bg-red-100 p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors">
             <Trash2 size={14} /> 削除
           </button>
           <button onClick={onClose} className="bg-slate-800 text-white font-bold py-3 rounded-xl flex-1 shadow-lg active:scale-95 transition-transform">閉じる</button>
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
       <div className="flex flex-col gap-2 mb-3">
          <div className="flex flex-col px-3 py-3 bg-white rounded-xl shadow-sm border border-slate-200">
             <div className="flex justify-between items-center mb-2">
                 <div className="flex items-center gap-2">
                   <div className={`w-2 h-6 rounded-full ${conf.bg}`} />
                   <h3 className={`font-black text-lg ${conf.color}`}>{conf.label}</h3>
                 </div>
                 <div className="text-[10px] font-bold text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded">
                   計: {Math.floor(totalDuration / 60)}h {totalDuration % 60}m
                 </div>
             </div>
             <div className="flex items-center gap-2">
                 <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                     <div className={`h-full ${conf.bg}`} style={{ width: `${progress}%` }} />
                 </div>
                 <span className="text-[10px] font-bold text-slate-400 font-mono w-6 text-right">{progress}%</span>
             </div>
          </div>
          
          <div className="flex items-center justify-between px-1">
            <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                {(['all', 'not_started', 'in_progress', 'completed'] as const).map(f => (
                  <button 
                    key={f} onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${filter === f ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    {f === 'all' ? '全て' : f === 'not_started' ? '未着手' : f === 'in_progress' ? '勉強中' : '完了'}
                  </button>
                ))}
            </div>
            <button onClick={() => setAddModalOpen(true)} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 text-blue-600 rounded-lg text-[10px] font-bold active:bg-blue-50 transition-colors">
              <Plus size={12} /> 追加
            </button>
          </div>
       </div>

       <div className="space-y-4 pl-1 border-l-2 border-slate-100 ml-2">
         {Object.keys(tasksByCategory).length === 0 ? (
           <div className="text-center py-6 text-slate-400 text-[10px] font-bold">タスクがありません</div>
         ) : (
           Object.keys(tasksByCategory).map(cat => (
              <div key={cat} className="pl-3">
                 <h4 className="text-[10px] font-bold text-slate-400 mb-2">{cat}</h4>
                 <div className="flex flex-col gap-2">
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

const DailyView = ({ 
  tasks, updateLocalTask, syncTaskToCloud, cycleStatus, deleteUnitTasks,
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
      <div className="sticky top-0 z-20 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex gap-2">
          <button onClick={() => setSelectedUnit(null)} className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${!selectedUnit ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}>
            <LayoutDashboard size={14} className="mr-1.5"/> 全体
          </button>
          <div className="flex-1 relative">
            <select
              value={selectedUnit || ''}
              onChange={(e) => e.target.value === 'NEW' ? setAddModalOpen(true) : setSelectedUnit(e.target.value)}
              className={`w-full h-full appearance-none rounded-xl font-bold text-xs pl-3 pr-8 focus:outline-none transition-all cursor-pointer ${selectedUnit ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              <option value="" disabled>回を選択...</option>
              <optgroup label="学習中の回">
                  {unitsWithTasks.map((w: string) => <option key={w} value={w} className="text-slate-800 bg-white">{w}</option>)}
              </optgroup>
              <optgroup label="アクション"><option value="NEW" className="text-blue-600 bg-white">+ 新しい回を追加</option></optgroup>
            </select>
            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${selectedUnit ? 'text-white' : 'text-slate-400'}`} size={14} />
          </div>
        </div>
      </div>

      <div className="pt-4 px-4 space-y-6 pb-32">
        {selectedUnit ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {(() => {
                const unitTasks = tasks.filter((t: Task) => t.unit === selectedUnit);
                const { progress, totalTime } = getStats(unitTasks);
                return (
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative overflow-hidden">
                    <div className="flex justify-between items-end mb-3">
                        <div>
                            <h2 className="text-xl font-black text-slate-800">{selectedUnit}</h2>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-black text-slate-800 tracking-tight">{progress}<span className="text-sm font-bold text-slate-400 ml-0.5">%</span></div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center mb-1.5">
                       <span className="text-[10px] font-bold text-slate-400">全体進捗</span>
                       <span className="text-[10px] font-bold font-mono text-blue-600">計 {Math.floor(totalTime / 3600)}h {Math.floor((totalTime % 3600) / 60)}m</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })()}

              {(Object.keys(SUBJECT_CONFIG) as Subject[]).map(subj => (
                <SubjectSection 
                  key={subj} unit={selectedUnit} subject={subj} tasks={tasks}
                  updateLocalTask={updateLocalTask} syncTaskToCloud={syncTaskToCloud} cycleStatus={cycleStatus} setDetailTaskId={setDetailTaskId}
                  onAddCustomTask={onAddCustomTask}
                />
              ))}
          </div>
        ) : (
          <div className="space-y-5 animate-in fade-in">
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200">
                 <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-1.5"><Award className="text-blue-500" size={16} /> 全期間サマリー</h2>
                 <div className="flex justify-between items-end mb-4 pb-4 border-b border-slate-100">
                     <div>
                         <div className="text-[10px] text-slate-400 font-bold mb-0.5">全体完了率</div>
                         <div className="text-3xl font-black text-slate-800">{allStats.total.progress}<span className="text-sm text-slate-400 ml-0.5">%</span></div>
                     </div>
                     <div className="text-right">
                         <div className="text-[10px] text-slate-400 font-bold mb-0.5">総勉強時間</div>
                         <div className="text-xl font-black text-blue-600 font-mono">
                            {Math.floor(allStats.total.totalTime / 3600)}<span className="text-xs text-slate-400 mx-0.5">h</span>
                            {Math.floor((allStats.total.totalTime % 3600) / 60)}<span className="text-xs text-slate-400 ml-0.5">m</span>
                         </div>
                     </div>
                 </div>
                 <div className="space-y-2.5">
                    {allStats.subjects.map(s => {
                       const conf = SUBJECT_CONFIG[s.id as Subject];
                       return (
                          <div key={s.id} className="flex items-center gap-2">
                             <span className={`text-[10px] font-bold w-6 ${conf.color}`}>{conf.short}</span>
                             <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${conf.bg}`} style={{ width: `${s.progress}%` }} />
                             </div>
                             <span className="text-[10px] font-bold text-slate-400 w-12 text-right font-mono">
                                {Math.floor(s.totalTime / 3600)}h{Math.floor((s.totalTime % 3600) / 60)}
                             </span>
                          </div>
                       )
                    })}
                 </div>
              </div>

              <h3 className="font-bold text-slate-500 text-xs pl-1">学習回ごとの詳細</h3>

              {unitsWithTasks.map((unit: string) => {
                const unitTasks = tasks.filter((t: Task) => t.unit === unit);
                const { progress, totalTime } = getStats(unitTasks);
                const subjStats = (Object.keys(SUBJECT_CONFIG) as Subject[]).map(subj => ({ id: subj, ...getStats(unitTasks.filter((t: Task) => t.subject === subj)) }));

                return (
                  <div key={unit} onClick={() => setSelectedUnit(unit)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 active:scale-[0.98] transition-all cursor-pointer relative">
                     <button 
                         onClick={(e) => { 
                           e.stopPropagation(); 
                           setDeleteConfirmation({
                             title: `「${unit}」の削除`, message: `本当に「${unit}」を削除しますか？\nタスクと履歴がすべて消去されます。`,
                             onConfirm: () => deleteUnitTasks(unit)
                           });
                         }} 
                         className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                     >
                         <Trash2 size={14} />
                     </button>
                     <div className="flex justify-between items-center mb-3 pr-8">
                        <div className="font-black text-lg text-slate-800">{unit}</div>
                        <div className="text-[10px] font-bold text-slate-400 font-mono">{Math.floor(totalTime / 3600)}h {Math.floor((totalTime % 3600) / 60)}m</div>
                     </div>
                     <div className="mb-3">
                        <div className="flex justify-between text-[10px] font-bold mb-1">
                          <span className="text-slate-400">全体進捗</span>
                          <span className="text-blue-600">{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                     </div>
                     <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-50">
                        {subjStats.map(s => {
                           const conf = SUBJECT_CONFIG[s.id as Subject];
                           return (
                               <div key={s.id} className="flex flex-col gap-1">
                                   <div className="flex justify-between items-center text-[9px] font-bold">
                                       <span className={conf.color}>{conf.short}</span>
                                       <span className="text-slate-400">{s.progress}%</span>
                                   </div>
                                   <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
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
        )}
      </div>
    </div>
  );
};

const TestsView = ({ tests, onAddTest }: any) => {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['4ko']);
  const [isAddModalOpen, setAddModalOpen] = useState(false);
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
       <div className="bg-white sticky top-0 z-20 px-4 py-3 border-b border-slate-200 shadow-sm space-y-2.5">
          <div className="flex justify-between items-center gap-2">
             <div className="flex gap-1.5">
               <button onClick={() => setFilterType('all')} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${filterType === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>全て</button>
               {Object.entries(TEST_TYPE_CONFIG).map(([k, v]) => <button key={k} onClick={() => setFilterType(k)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${filterType === k ? v.activeClass : 'bg-white border-slate-200 text-slate-500'}`}>{v.label}</button>)}
             </div>
             <button onClick={() => setAddModalOpen(true)} className="bg-blue-50 text-blue-600 p-1.5 rounded-lg active:scale-95"><Plus size={18} /></button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
             <button onClick={() => toggleSubject('4ko')} className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${selectedSubjects.includes('4ko') ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>4科</button>
             {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => <button key={s} onClick={() => toggleSubject(s)} className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${selectedSubjects.includes(s) ? `${SUBJECT_CONFIG[s].bg} text-white` : 'bg-slate-100 text-slate-500'}`}>{SUBJECT_CONFIG[s].short}</button>)}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 pb-20">
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 h-56 shrink-0">
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

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="font-bold text-slate-700 text-xs px-3 pt-3 pb-2 flex items-center gap-1.5"><TrendingUp className="text-blue-500" size={14}/> 偏差値履歴</h3>
            <table className="w-full text-center text-[10px]">
               <thead className="text-slate-400 bg-slate-50 border-y border-slate-100"><tr><th className="py-2 pl-3 text-left font-bold">テスト名</th><th className="py-2 font-bold">4科</th>{(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => <th key={s} className={`py-2 font-bold ${SUBJECT_CONFIG[s].color}`}>{SUBJECT_CONFIG[s].short}</th>)}</tr></thead>
               <tbody>
                  {tableData.map(t => (
                     <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-2 pl-3 text-left"><div className="text-[8px] text-slate-400 font-bold">{t.date}</div><div className="font-bold text-slate-700 truncate max-w-[80px]">{t.name}</div></td>
                        <td className="py-2 font-black text-slate-700 bg-slate-50/50">{t.total4.dev}</td>
                        {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => <td key={s} className={`py-2 font-bold ${t.subjects[s].dev >= 60 ? 'text-rose-500' : 'text-slate-500'}`}>{t.subjects[s].dev}</td>)}
                     </tr>
                  ))}
               </tbody>
            </table>
          </div>
       </div>
       <AddTestResultOverlay isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} onAdd={onAddTest} />
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
       <div className="bg-white sticky top-0 z-20 px-4 py-3 border-b border-slate-200 shadow-sm space-y-2.5">
          <div className="flex gap-2">
             <div className="flex-1 flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <div className="flex gap-1.5 items-center">
                   <CalendarIcon size={14} className="text-slate-400 ml-1" />
                   <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-20" />
                   <span className="text-slate-300">-</span>
                   <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-20" />
                </div>
             </div>
             
             <div className="flex gap-2">
                {[
                  { l: '1週間', d: 7 }, 
                  { l: '2週間', d: 14 }, 
                  { l: '1ヶ月', d: 30 }
                ].map(r => (
                  <button 
                    key={r.l} 
                    onClick={() => setPresetRange(r.d)} 
                    className="flex-1 py-1.5 bg-white border border-slate-100 text-xs font-bold rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shadow-sm"
                  >
                    {r.l}
                  </button>
                ))}
             </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
             {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => (
               <button key={s} onClick={() => toggleSubject(s)} className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${selectedSubjects.includes(s) ? `${SUBJECT_CONFIG[s].bg} text-white` : 'bg-slate-100 text-slate-400'}`}>{SUBJECT_CONFIG[s].short}</button>
             ))}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 pb-20">
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 h-52 shrink-0">
             <h3 className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><BarChart2 size={12}/> 学習時間 (分)</h3>
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

          <div className="grid grid-cols-2 gap-3">
             <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 min-h-[12rem] flex flex-col">
                <h3 className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><PieChartIcon size={12}/> 比率</h3>
                {pieData.length > 0 ? (
                  <>
                    <div className="flex-1 w-full relative mb-1 min-h-[80px]">
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={20} outerRadius={35} paddingAngle={2} dataKey="value">{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={{borderRadius:'8px', fontSize:'9px', padding:'2px 4px'}} itemStyle={{padding:0}} /></PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1">
                        {pieData.map(d => (
                            <div key={d.name} className="flex justify-between items-center text-[9px]">
                                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color }} /><span className="font-bold text-slate-600">{d.name}</span></div>
                                <span className="font-mono font-bold text-slate-700">{Math.floor(d.value/60)}h{d.value%60}m <span className="text-slate-400 font-normal">({d.percent}%)</span></span>
                            </div>
                        ))}
                    </div>
                  </>
                ) : <div className="text-[10px] text-slate-300 mt-4 text-center">データなし</div>}
             </div>

             <div className="space-y-3">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-3 text-white shadow-md">
                   <div className="text-[9px] text-slate-300 font-bold mb-0.5">期間内ベスト(1日)</div>
                   <div className="text-xl font-black">{Math.floor(maxStats.total.val / 60)}<span className="text-[10px] font-normal opacity-70">h</span>{maxStats.total.val % 60}<span className="text-[10px] font-normal opacity-70">m</span></div>
                   <div className="text-[9px] text-slate-400 text-right mt-0.5">{maxStats.total.date}</div>
                </div>
                <div className="bg-white rounded-2xl p-2.5 border border-slate-200 shadow-sm">
                   <div className="text-[9px] text-slate-400 font-bold mb-1.5">科目別ベスト</div>
                   <div className="space-y-1">
                      {(['math', 'japanese', 'science', 'social'] as Subject[]).map(s => (
                         selectedSubjects.includes(s) && maxStats.subjects[s].val > 0 && (
                            <div key={s} className="flex justify-between items-center text-[9px]">
                               <span className={`font-bold ${SUBJECT_CONFIG[s].color}`}>{SUBJECT_CONFIG[s].short}</span>
                               <span className="font-mono font-bold">{maxStats.subjects[s].val}m <span className="text-[8px] text-slate-300 font-normal">({maxStats.subjects[s].date})</span></span>
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
const LoginForm = ({ onLogin, onSampleMode }: { onLogin: (e:string, p:string) => void, onSampleMode: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!email || !password) { setError('メールアドレスとパスワードを入力してください'); return; }
    onLogin(email, password);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Award size={32} />
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Level Up Study</h1>
          <p className="text-sm text-slate-500 mt-2 font-bold">学習管理へログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">メールアドレス</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 focus:outline-none focus:border-blue-500" placeholder="family@example.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">パスワード</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-700 focus:outline-none focus:border-blue-500" placeholder="••••••••" />
          </div>
          {error && <div className="text-xs text-red-500 font-bold px-1">{error}</div>}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-all flex justify-center items-center gap-2 mt-2">
            <LogIn size={18} /> ログイン
          </button>
        </form>
        
        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-slate-100"></div>
          <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold">または</span>
          <div className="flex-grow border-t border-slate-100"></div>
        </div>

        <button onClick={onSampleMode} className="w-full bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-bold py-3.5 rounded-xl active:scale-95 transition-all flex justify-center items-center gap-2">
          <FlaskConical size={18} /> サンプルデータで試す
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
  const [deleteConfirmation, setDeleteConfirmation] = useState<{title: string, message: string, onConfirm: () => void} | null>(null);

  // Authentication & Initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const handleEmailLogin = async (email: string, pass: string) => {
    setIsAuthChecking(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      alert("ログイン失敗: " + e.message);
      setIsAuthChecking(false);
    }
  };

  const handleLogout = async () => {
    if (window.confirm("ログアウトしますか？")) {
      await signOut(auth);
      setTasks([]);
      setTests([]);
      setIsSampleMode(false);
    }
  };

  const fetchData = useCallback(async (isSilent = false) => {
    if (!user || isSampleMode) return;
    if (!isSilent) setSyncState('syncing');
    
    try {
      const taskQ = query(getTasksCol());
      const testQ = query(getTestsCol());
      
      const [taskSnap, testSnap] = await Promise.all([getDocs(taskQ), getDocs(testQ)]);
      
      const fetchedTasks = taskSnap.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as Task;
      });
      const fetchedTests = testSnap.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data } as TestResult;
      });

      if (fetchedTasks.length === 0 && fetchedTests.length === 0) {
        // Init logic for new family
      } else {
        setTasks(fetchedTasks);
        setTests(fetchedTests);
      }
      
      setCache('tasks', fetchedTasks);
      setCache('tests', fetchedTests);
      
      setSyncState('synced');
      setLastSync(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error(err);
      setSyncState('offline');
      const ct = getCache('tasks');
      if (ct) setTasks(ct);
    }
  }, [user, isSampleMode]);

  useEffect(() => {
    if (user && !isSampleMode) {
      const ct = getCache('tasks');
      if (ct) setTasks(ct);
      fetchData();
    }
  }, [user, fetchData, isSampleMode]);

  useEffect(() => {
    if (!isSampleMode && tasks.length > 0) {
      setCache('tasks', tasks);
      setCache('tests', tests);
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
  
  const updateLocalTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const syncTaskToCloud = async (id: string, cloudUpdates: any) => {
    if (!user || isSampleMode) return;
    try {
      const taskRef = doc(getTasksCol(), id);
      await updateDoc(taskRef, cloudUpdates);
      setSyncState('synced');
      setLastSync(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setSyncState('offline');
    }
  };

  // ==========================================

  const cycleStatus = (task: Task) => {
    // ローカルのみ更新
    const next = task.status === 'not_started' ? 'in_progress' : task.status === 'in_progress' ? 'completed' : 'not_started';
    updateLocalTask(task.id, { status: next, lastUpdatedAt: Date.now() });
  };

  const saveHistoryRecord = async (task: Task) => {
    if (task.currentDuration === 0) return;
    const newHistory = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
      duration: task.currentDuration,
      memo: task.currentMemo // 記録保存時にメモを履歴として保存
    };
    
    const updates = { 
      history: [...task.history, newHistory], 
      currentDuration: 0, 
      currentMemo: '', // リセット
      isRunning: false,
      sessionStartTime: null,
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
    
    if (!user || isSampleMode) return;
    const batch = writeBatch(db);
    newTasks.forEach(t => batch.set(doc(getTasksCol(), t.id), { ...t, lastUpdatedAt: serverTimestamp() }));
    await batch.commit();
  };

  const deleteUnitTasks = async (unit: string) => {
    const toDelete = tasks.filter(t => t.unit === unit);
    setTasks(prev => prev.filter(t => t.unit !== unit));
    if (selectedUnit === unit) setSelectedUnit(null);
    
    if (!user || isSampleMode) return;
    const batch = writeBatch(db);
    toDelete.forEach(t => batch.delete(doc(getTasksCol(), t.id)));
    await batch.commit();
  };

  const onAddCustomTask = async (unit: string, subject: Subject, title: string, category: string) => {
    const newTask: Task = {
      id: Date.now().toString(), unit, subject, category, title, materialName: `${category} - ${title}`,
      status: 'not_started', currentDuration: 0, sessionStartTime: null, isRunning: false, lastUpdatedAt: Date.now(),
      currentMemo: '', history: [], createdAt: new Date().toISOString()
    };
    setTasks(prev => [...prev, newTask]);

    if (!user || isSampleMode) return;
    await setDoc(doc(getTasksCol(), newTask.id), { ...newTask, lastUpdatedAt: serverTimestamp() });
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
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {isSampleMode && (
        <div className="bg-amber-100 text-amber-800 text-[10px] font-bold text-center py-1 flex items-center justify-center gap-1.5 z-40 relative">
          <AlertTriangle size={12} />
          サンプルモード表示中（データは保存されません）
        </div>
      )}
      <header className="bg-white/80 backdrop-blur-xl pt-4 sticky top-0 z-30 border-b border-slate-100">
        <div className="h-14 flex items-center justify-between px-5">
          <div>
            <h1 className="font-black text-lg text-slate-800 tracking-tight flex items-center gap-2">
              Level Up Study<span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded text-[10px]">5年生</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
             {!isSampleMode ? (
               <div className="flex items-center gap-2">
                 <div className="flex flex-col items-end mr-1">
                    <div className="text-[9px] text-slate-400 font-bold mb-0.5 flex items-center gap-1">
                      {syncState === 'syncing' ? <RefreshCw size={10} className="animate-spin text-blue-500" /> :
                       syncState === 'offline' ? <CloudOff size={10} className="text-red-400"/> : <Cloud size={10} className="text-green-500"/>}
                      {lastSync} 同期
                    </div>
                    <button onClick={() => fetchData(false)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded font-bold transition-colors flex items-center gap-1 active:scale-95">
                      手動更新
                    </button>
                 </div>
                 <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 p-1" title="ログアウト">
                    <LogOut size={16} />
                 </button>
               </div>
             ) : (
                <button 
                  onClick={() => { setIsSampleMode(false); fetchData(true); }}
                  className="text-[10px] bg-slate-800 text-white px-3 py-1.5 rounded font-bold transition-colors active:scale-95"
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
                className={`text-[10px] px-2 py-2 rounded-lg font-bold transition-colors flex items-center gap-1 active:scale-95 ${isSampleMode ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                title="サンプル表示"
              >
                <FlaskConical size={14} />
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain no-scrollbar flex flex-col pb-24">
        {activeTab === 'daily' ? (
          <DailyView 
            tasks={tasks} updateLocalTask={updateLocalTask} syncTaskToCloud={syncTaskToCloud} cycleStatus={cycleStatus} 
            saveHistoryRecord={saveHistoryRecord} deleteUnitTasks={deleteUnitTasks} 
            deleteTask={async (id: string) => { 
               setTasks(prev => prev.filter(t => t.id !== id));
               if(user && !isSampleMode) await deleteDoc(doc(getTasksCol(), id));
            }}
            setAddModalOpen={setAddModalOpen} 
            selectedUnit={selectedUnit} setSelectedUnit={setSelectedUnit} 
            unitsWithTasks={unitsWithTasks} onAddCustomTask={onAddCustomTask}
            setDetailTaskId={setDetailTaskId} setDeleteConfirmation={setDeleteConfirmation}
          />
        ) : activeTab === 'tests' ? (
          <TestsView tests={tests} onAddTest={async (t: TestResult) => {
             setTests(prev => [t, ...prev]);
             if(user && !isSampleMode) await setDoc(doc(getTestsCol(), t.id), t);
          }} />
        ) : (
          <AchievementsView tasks={tasks} />
        )}
      </main>

      <nav className="bg-white/90 backdrop-blur-lg border-t border-slate-100 fixed bottom-0 left-0 right-0 z-40 pb-6 max-w-md mx-auto rounded-t-3xl shadow-[0_-10px_30px_rgba(0,0,0,0.04)]">
        <div className="h-16 flex justify-around items-center px-2">
          <button onClick={() => setActiveTab('daily')} className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 transition-all duration-300 ${activeTab === 'daily' ? 'text-blue-600 -translate-y-1' : 'text-slate-400 hover:text-slate-500'}`}>
            <div className={`p-1.5 rounded-xl ${activeTab === 'daily' ? 'bg-blue-50' : ''}`}><FileText size={22} strokeWidth={activeTab === 'daily' ? 2.5 : 2} fill={activeTab === 'daily' ? "currentColor" : "none"} /></div><span className="text-[10px] font-bold">学習</span>
          </button>
          <button onClick={() => setActiveTab('achievements')} className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 transition-all duration-300 ${activeTab === 'achievements' ? 'text-blue-600 -translate-y-1' : 'text-slate-400 hover:text-slate-500'}`}>
             <div className={`p-1.5 rounded-xl ${activeTab === 'achievements' ? 'bg-blue-50' : ''}`}><BarChart2 size={22} strokeWidth={activeTab === 'achievements' ? 2.5 : 2} /></div><span className="text-[10px] font-bold">実績</span>
          </button>
          <button onClick={() => setActiveTab('tests')} className={`flex-1 flex flex-col items-center justify-center h-full space-y-1 transition-all duration-300 ${activeTab === 'tests' ? 'text-blue-600 -translate-y-1' : 'text-slate-400 hover:text-slate-500'}`}>
             <div className={`p-1.5 rounded-xl ${activeTab === 'tests' ? 'bg-blue-50' : ''}`}><Award size={22} strokeWidth={activeTab === 'tests' ? 2.5 : 2} /></div><span className="text-[10px] font-bold">成績</span>
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
               setDeleteConfirmation({
                 title: 'タスクの削除', message: '本当にこのタスクを削除しますか？',
                 onConfirm: () => {
                    setTasks(prev => prev.filter(t => t.id !== detailTaskId));
                    if(user && !isSampleMode) deleteDoc(doc(getTasksCol(), detailTaskId));
                    setDetailTaskId(null);
                 }
               });
            }}
         />
      )}

      <DeleteConfirmModal 
        isOpen={!!deleteConfirmation} 
        onClose={() => setDeleteConfirmation(null)} 
        onConfirm={deleteConfirmation?.onConfirm || (() => {})} 
        title={deleteConfirmation?.title} 
        message={deleteConfirmation?.message} 
      />
    </div>
  );
}