import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Play, Pause,  Trash2, X, Zap, History, 
  TrendingUp, Calendar as CalendarIcon, PieChart as PieChartIcon, BarChart2,
  RefreshCw, FlaskConical, LogOut,
  ChevronRight, BookOpen, GraduationCap, Laptop, Trophy, 
  Save, ChevronLeft, Search, PlusCircle, Edit3, 
  Eye, EyeOff, CheckSquare, Square, ListFilter, Award, Smartphone, Monitor
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, collection, doc, getDocs, updateDoc, deleteDoc, 
  enableIndexedDbPersistence, addDoc, setDoc
} from 'firebase/firestore';

// ==========================================
// TypeScript Interfaces
// ==========================================

interface StudyHistory {
  id: string;
  date: string;
  duration: number;
  memo: string;
}

interface Task {
  id: string;
  categoryId: string;
  subjectId: string;
  type: 'homework' | 'self';
  title: string;
  history: StudyHistory[];
  currentDuration: number;
  isRunning: boolean;
  sessionStartTime: number | null;
  lastUpdatedAt: number;
  tempDetail?: string;
  createdAt?: string;
}

interface ScoreMap {
  [subjectId: string]: number;
}

interface TestResult {
  id: string;
  category: 'school' | 'juku';
  subType: 'midterm' | 'final' | 'normal';
  name: string;
  date: string;
  scores: ScoreMap;
  average: number;
  rank: string;
  lastUpdatedAt?: number;
}

// ==========================================
// Firebase Initialization (Vite/Vercel Dedicated)
// ==========================================

let env: any = {};
try {
  // @ts-ignore
  env = import.meta.env || {};
} catch (e) {
  console.warn("Preview environment detected: Using dummy Firebase config.");
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "dummy-api-key",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "dummy-project",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: env.VITE_FIREBASE_APP_ID || "1:000000000000:web:dummy",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code !== 'failed-precondition') console.warn("Offline persistence disabled");
  });
} catch (e) {}

const FAMILY_ID = 'oomine-study-2026';
const getTasksCol = () => collection(db, 'families', FAMILY_ID, 'tasks');
const getTestsCol = () => collection(db, 'families', FAMILY_ID, 'tests');

// ==========================================
// Constants & Master Data
// ==========================================

const CATEGORIES = {
  SCHOOL: { id: 'school', label: '中学校', icon: GraduationCap, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', hex: '#3b82f6' },
  JUKU: { id: 'juku', label: '塾', icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', hex: '#10b981' },
  ETC: { id: 'etc', label: 'その他', icon: Laptop, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', hex: '#a855f7' }
};

const SUBJECT_DEFS = {
  school: [
    { id: 's_math', label: '数学', hex: '#3b82f6', isMajor: true }, 
    { id: 's_japanese', label: '国語', hex: '#f43f5e', isMajor: true },
    { id: 's_social', label: '社会', hex: '#10b981', isMajor: true }, 
    { id: 's_science', label: '理科', hex: '#f59e0b', isMajor: true },
    { id: 's_english', label: '英語', hex: '#8b5cf6', isMajor: true }, 
    { id: 's_pe', label: '体育', hex: '#fb923c', isMajor: false },
    { id: 's_tech', label: '技術', hex: '#64748b', isMajor: false }, 
    { id: 's_music', label: '音楽', hex: '#ec4899', isMajor: false },
    { id: 's_home', label: '家庭科', hex: '#06b6d4', isMajor: false }
  ],
  juku: [
    { id: 'j_math', label: '数学', hex: '#2563eb' }, 
    { id: 'j_japanese', label: '国語', hex: '#e11d48' },
    { id: 'j_science', label: '理科', hex: '#d97706' }, 
    { id: 'j_social', label: '社会', hex: '#059669' },
    { id: 'j_english', label: '英語', hex: '#7c3aed' }
  ],
  etc: [
    { id: 'e_news', label: '新聞', hex: '#475569' }, 
    { id: 'e_manga', label: '歴史マンガ', hex: '#ea580c' },
    { id: 'e_duolingo', label: 'Duolingo', hex: '#84cc16' }
  ]
};

// ==========================================
// Helper Functions
// ==========================================

const formatDuration = (seconds: number) => {
  if (!seconds || seconds < 0) return "0分";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};

const generateSampleData = () => {
  const tasks: Task[] = [];
  const tests: TestResult[] = [];
  const now = new Date();
  const startDate = new Date(2026, 0, 1);

  const baseTasks = [
    { catId: 'school', subId: 's_math', type: 'homework' as const, title: '数学ワーク' },
    { catId: 'school', subId: 's_english', type: 'homework' as const, title: '英語ワーク' },
    { catId: 'school', subId: 's_japanese', type: 'self' as const, title: '漢字ドリル' },
    { catId: 'juku', subId: 'j_math', type: 'homework' as const, title: '塾演習' },
    { catId: 'etc', subId: 'e_duolingo', type: 'self' as const, title: 'Duolingo' },
    { catId: 'school', subId: 's_social', type: 'self' as const, title: '歴史まとめ' }
  ];

  baseTasks.forEach((base, idx) => {
    const history: StudyHistory[] = [];
    let loopDate = new Date(startDate);
    while (loopDate <= now) {
      if (Math.random() > 0.3) {
        const dStr = `${loopDate.getFullYear()}-${(loopDate.getMonth() + 1).toString().padStart(2, '0')}-${loopDate.getDate().toString().padStart(2, '0')}`;
        history.push({
          id: `h-${dStr}-${idx}`,
          date: dStr,
          duration: (Math.floor(Math.random() * 60) + 15) * 60,
          memo: "演習と復習"
        });
      }
      loopDate.setDate(loopDate.getDate() + 1);
    }
    const lastUpdate = new Date(now.getTime() - Math.random() * 100000000).getTime();
    tasks.push({
      id: `sample-${idx}`, categoryId: base.catId, subjectId: base.subId, type: base.type, title: base.title,
      history, currentDuration: 0, isRunning: false, sessionStartTime: null, lastUpdatedAt: lastUpdate
    });
  });

  const testNames = ["1月実力", "3学期末", "3月模試", "4月診断", "1学期中間"];
  const dates = ["2026-01-15", "2026-02-22", "2026-03-12", "2026-04-05", "2026-05-10"];
  
  dates.forEach((date, i) => {
    tests.push({
      id: `st-${i}`,
      category: i % 2 === 0 ? 'school' : 'juku',
      subType: 'normal',
      name: testNames[i],
      date: date,
      scores: {
        s_math: 60 + (i * 8),
        s_japanese: 70 + (i * 4),
        s_english: 65 + (i * 7),
        j_math: 55 + (i * 9),
        j_english: 60 + (i * 6)
      },
      average: 65 + (i * 3),
      rank: `${20 - i}位`
    });
  });

  return { tasks, tests };
};

// ==========================================
// Component: Strict Timer (Anti-Cheat)
// ==========================================

interface StrictTimerProps {
  task: Task;
  isAnyOtherRunning: boolean;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onSave: (task: Task, seconds: number) => void;
}

const StrictTimer: React.FC<StrictTimerProps> = ({ task, isAnyOtherRunning, onUpdate, onSave }) => {
  const [seconds, setSeconds] = useState(task.currentDuration || 0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const lastActive = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback((reason = "") => {
    if (!task.isRunning || !task.sessionStartTime) return;
    const now = Date.now();
    const startTime = Number(task.sessionStartTime);
    const elapsed = Math.floor((now - startTime) / 1000);
    const finalSecs = (task.currentDuration || 0) + elapsed;
    
    onUpdate(task.id, { 
      isRunning: false, 
      currentDuration: finalSecs, 
      sessionStartTime: null, 
      lastUpdatedAt: now 
    });
    if (reason) setStatusMessage(reason);
  }, [task.isRunning, task.sessionStartTime, task.currentDuration, task.id, onUpdate]);

  useEffect(() => {
    if (task.isRunning && task.sessionStartTime) {
      const startTime = Number(task.sessionStartTime);
      const initialSec = task.currentDuration || 0;
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setSeconds(initialSec + elapsed);
        
        if (now - lastActive.current > 5 * 60 * 1000) {
          stopTimer("長時間無操作のため自動停止しました。");
        }
      }, 1000);
    } else {
      setSeconds(task.currentDuration || 0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [task.isRunning, task.sessionStartTime, task.currentDuration, stopTimer]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && task.isRunning && task.sessionStartTime) {
        const now = Date.now();
        if (now - lastActive.current > 5 * 60 * 1000) {
          stopTimer("長時間バックグラウンドにいたため停止しました。");
        } else {
          const startTime = Number(task.sessionStartTime);
          setSeconds((task.currentDuration || 0) + Math.floor((now - startTime) / 1000));
        }
      }
      if (document.visibilityState === 'hidden') {
        lastActive.current = Date.now();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [task.isRunning, task.sessionStartTime, task.currentDuration, stopTimer]);

  useEffect(() => {
    const recordActivity = () => { lastActive.current = Date.now(); };
    window.addEventListener('mousemove', recordActivity);
    window.addEventListener('touchstart', recordActivity);
    window.addEventListener('keydown', recordActivity);
    return () => {
      window.removeEventListener('mousemove', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
      window.removeEventListener('keydown', recordActivity);
    };
  }, []);

  const handleStart = () => {
    if (isAnyOtherRunning) {
      alert("他の教科を計測中です。一度終了させてください。");
      return;
    }
    lastActive.current = Date.now();
    setStatusMessage(null);
    onUpdate(task.id, { isRunning: true, sessionStartTime: Date.now(), lastUpdatedAt: Date.now() });
  };

  const handleSaveClick = () => {
    if (seconds < 10) {
      alert("学習時間が短すぎます（10秒以上必要です）。");
      return;
    }
    onSave(task, seconds);
  };

  return (
    <div className="bg-slate-900 rounded-[2rem] p-6 sm:p-10 text-center shadow-2xl relative overflow-hidden border border-white/5">
      {statusMessage && (
        <div className="absolute top-0 left-0 w-full bg-rose-600 text-white text-[10px] font-black py-2 z-10 animate-in slide-in-from-top duration-300">
           {statusMessage}
        </div>
      )}
      <div className={`text-4xl sm:text-7xl font-mono font-black tracking-tighter mb-6 ${task.isRunning ? 'text-blue-400 animate-pulse' : 'text-white'}`}>
        {formatDuration(seconds)}
      </div>
      <div className="flex gap-3">
        {!task.isRunning ? (
          <button onClick={handleStart} className="flex-1 bg-blue-600 text-white font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none">
            <Play size={20} fill="currentColor"/> START
          </button>
        ) : (
          <button onClick={() => stopTimer()} className="flex-1 bg-amber-500 text-white font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl shadow-lg active:scale-95 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none">
            <Pause size={20} fill="currentColor"/> PAUSE
          </button>
        )}
        <button onClick={handleSaveClick} className="flex-1 bg-white/10 text-white font-black py-4 sm:py-5 rounded-xl sm:rounded-2xl hover:bg-white/20 transition flex items-center justify-center gap-2 text-sm sm:text-lg uppercase leading-none">
          <Save size={20} /> FINISH
        </button>
      </div>
    </div>
  );
};

// ==========================================
// Main Application Component
// ==========================================

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isSampleMode, setIsSampleMode] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [activeTab, setActiveTab] = useState('daily');
  const [activeCategory, setActiveCategory] = useState<'school' | 'juku' | 'etc'>('school');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingTest, setIsAddingTest] = useState(false);
  const [editingTest, setEditingTest] = useState<TestResult | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [visibleSubjects, setVisibleSubjects] = useState<string[]>(['s_math', 's_english', 'j_math', 'average']);

  const isAnyTaskRunning = useMemo(() => tasks.some(t => t.isRunning), [tasks]);

  const fetchData = useCallback(async (silent = false) => {
    if (isSampleMode || !auth.currentUser) return;
    if (!silent) setLoading(true);
    try {
      const taskSnap = await getDocs(getTasksCol());
      const testSnap = await getDocs(getTestsCol());
      setTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      setTests(testSnap.docs.map(d => ({ id: d.id, ...d.data() } as TestResult)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isSampleMode]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!isSampleMode) {
        setUser(u);
        if (u) fetchData();
        else setLoading(false);
      }
    });
    return () => unsub();
  }, [isSampleMode, fetchData]);

  useEffect(() => {
    if (user && !isSampleMode) fetchData(true);
  }, [user, isSampleMode, fetchData]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, fd.get('email') as string, fd.get('password') as string);
    } catch (err) {
      alert("ログイン失敗。");
    } finally {
      setLoading(false);
    }
  };

  const toggleSampleMode = () => {
    if (!isSampleMode) {
      const { tasks: sTasks, tests: sTests } = generateSampleData();
      setTasks(sTasks);
      setTests(sTests);
      setIsSampleMode(true);
      setLoading(false);
    } else {
      setIsSampleMode(false);
      setIsMobileView(false);
      setLoading(true);
      fetchData();
    }
  };

  const handleUpdateLocalTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleSaveRecord = async (task: Task, totalSeconds: number) => {
    const memo = prompt("学習内容：") || "";
    const now = Date.now();
    const historyItem: StudyHistory = { id: now.toString(), date: getTodayStr(), duration: totalSeconds, memo };
    const updatedHistory = [...(task.history || []), historyItem];
    const updates: Partial<Task> = { history: updatedHistory, currentDuration: 0, isRunning: false, sessionStartTime: null, lastUpdatedAt: now };

    handleUpdateLocalTask(task.id, updates);
    if (!isSampleMode && user) {
      try {
        await updateDoc(doc(getTasksCol(), task.id), updates);
      } catch (e) {
        alert("保存に失敗しました。");
      }
    }
    setSelectedTaskId(null);
  };

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newTask: Omit<Task, 'id'> = {
      categoryId: activeCategory, 
      subjectId: fd.get('subjectId') as string, 
      type: fd.get('type') as 'homework' | 'self', 
      title: fd.get('detail') as string,
      history: [], currentDuration: 0, isRunning: false, sessionStartTime: null,
      lastUpdatedAt: Date.now()
    };
    if (isSampleMode) {
      setTasks(prev => [{ id: `s-${Date.now()}`, ...newTask } as Task, ...prev]);
    } else {
      try {
        await addDoc(getTasksCol(), newTask);
        fetchData(true);
      } catch (e) {
        alert("追加に失敗しました。");
      }
    }
    setIsAddingTask(false);
  };

  const handleSaveTest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const testCat = fd.get('testCategory') as 'school' | 'juku';
    const subType = fd.get('testSubType') as 'midterm' | 'final' | 'normal';
    const scores: ScoreMap = {};
    const relevantSubjects = [...SUBJECT_DEFS.school, ...SUBJECT_DEFS.juku];
    relevantSubjects.forEach(s => {
      const val = fd.get(`score_${s.id}`);
      if (val !== null && val !== "") scores[s.id] = Number(val);
    });

    const testData: Omit<TestResult, 'id'> = { 
      name: fd.get('name') as string, date: fd.get('date') as string, 
      category: testCat, subType, scores, 
      average: Number(fd.get('average')), rank: fd.get('rank') as string, 
      lastUpdatedAt: Date.now() 
    };

    if (isSampleMode) {
      if (editingTest) setTests(prev => prev.map(t => t.id === editingTest.id ? { ...t, ...testData } : t));
      else setTests(prev => [{ id: `st-${Date.now()}`, ...testData } as TestResult, ...prev]);
    } else {
      try {
        if (editingTest) await setDoc(doc(getTestsCol(), editingTest.id), testData, { merge: true });
        else await addDoc(getTestsCol(), testData);
        fetchData(true);
      } catch (e) {
        alert("保存に失敗しました。");
      }
    }
    setIsAddingTest(false); setEditingTest(null);
  };

  const handleDeleteTest = async (id: string) => {
    if (!confirm("成績を削除しますか？")) return;
    if (isSampleMode) setTests(prev => prev.filter(t => t.id !== id));
    else {
      try {
        await deleteDoc(doc(getTestsCol(), id));
        fetchData(true);
      } catch (e) {
        alert("削除に失敗しました。");
      }
    }
  };

  const toggleSubjectVisibility = (subId: string) => {
    setVisibleSubjects(prev => prev.includes(subId) ? prev.filter(id => id !== subId) : [...prev, subId]);
  };

  const bulkSelectSubjects = (type: string) => {
    const major5 = SUBJECT_DEFS.school.filter(s => s.isMajor).map(s => s.id);
    const sub4 = SUBJECT_DEFS.school.filter(s => !s.isMajor).map(s => s.id);
    const juku5 = SUBJECT_DEFS.juku.map(s => s.id);
    switch(type) {
      case 'all': setVisibleSubjects(['average', ...major5, ...sub4, ...juku5]); break;
      case 'none': setVisibleSubjects([]); break;
      case 'school_major': setVisibleSubjects(prev => Array.from(new Set([...prev, ...major5]))); break;
      case 'school_sub': setVisibleSubjects(prev => Array.from(new Set([...prev, ...sub4]))); break;
      case 'juku': setVisibleSubjects(prev => Array.from(new Set([...prev, ...juku5]))); break;
    }
  };

  const stats = useMemo(() => {
    const sDate = new Date(startDate);
    const eDate = new Date(endDate); eDate.setHours(23,59,59,999);
    const rangeHistory: (StudyHistory & { categoryId: string, subjectId: string })[] = [];
    tasks.forEach(t => { 
      (t.history || []).forEach((h) => { 
        const d = new Date(h.date); 
        if (d >= sDate && d <= eDate) rangeHistory.push({ ...h, categoryId: t.categoryId, subjectId: t.subjectId }); 
      }); 
    });

    const totalSec = rangeHistory.reduce((acc, h) => acc + h.duration, 0);
    const dailyMap = new Map<string, any>();
    rangeHistory.forEach(h => {
      if (!dailyMap.has(h.date)) dailyMap.set(h.date, { name: h.date.split('-').slice(1).join('/'), school: 0, juku: 0, etc: 0 });
      dailyMap.get(h.date)[h.categoryId] += Math.round(h.duration / 60);
    });
    
    const breakdown = Object.values(CATEGORIES).map(cat => {
      const items = rangeHistory.filter(h => h.categoryId === cat.id);
      const catSec = items.reduce((acc, h) => acc + h.duration, 0);
      const subjects = (SUBJECT_DEFS[cat.id as keyof typeof SUBJECT_DEFS] || []).map(s => {
        const sSec = tasks.filter(t => t.subjectId === s.id).reduce((acc, t) => acc + (t.history || []).filter(h => {
          const d = new Date(h.date);
          return d >= sDate && d <= eDate;
        }).reduce((sum, h) => sum + h.duration, 0), 0);
        return { ...s, duration: sSec, percent: catSec > 0 ? Math.round((sSec / catSec) * 100) : 0 };
      }).filter(s => s.duration > 0);
      return { ...cat, duration: catSec, subjects, percent: totalSec > 0 ? Math.round((catSec / totalSec) * 100) : 0 };
    });
    return { totalSec, breakdown, dailyData: Array.from(dailyMap.values()).sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime()) };
  }, [tasks, startDate, endDate]);

  const filteredTests = useMemo(() => {
    const sDate = new Date(startDate);
    const eDate = new Date(endDate); eDate.setHours(23,59,59,999);
    return tests.filter(t => { const d = new Date(t.date); return d >= sDate && d <= eDate; });
  }, [tests, startDate, endDate]);

  const allChartSubjects = useMemo(() => [
    { id: 'average', label: '学年平均', hex: '#94a3b8' },
    ...SUBJECT_DEFS.school.filter(s => s.isMajor).map(s => ({ ...s, label: `${s.label}(中)` })),
    ...SUBJECT_DEFS.school.filter(s => !s.isMajor).map(s => ({ ...s, label: `${s.label}(中)` })),
    ...SUBJECT_DEFS.juku.map(s => ({ ...s, label: `${s.label}(塾)` }))
  ], []);

  // モーダル等のCSS制御用
  const modalOverlayClass = isMobileView 
    ? "absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" 
    : "fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4";

  const taskDetailOverlayClass = isMobileView
    ? "absolute inset-0 z-[100] flex items-end justify-center p-0"
    : "fixed inset-0 z-[100] flex items-end lg:items-center justify-center p-0 sm:p-4";

  if (loading && !isSampleMode) return <div className="h-screen flex items-center justify-center bg-slate-50 font-black text-blue-600 animate-pulse uppercase tracking-[0.2em]">Syncing System...</div>;

  if (!user && !isSampleMode) return (
    <div className="h-screen bg-slate-100 flex items-center justify-center p-4 text-center">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8 space-y-6">
        <div className="mx-auto w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
           <GraduationCap size={40} />
        </div>
        <h1 className="text-2xl font-black tracking-tighter uppercase leading-tight">Level Up JH</h1>
        <form onSubmit={handleLogin} className="space-y-4 text-left">
           <input name="email" type="email" required placeholder="メールアドレス" className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-600 transition outline-none text-sm leading-none" />
           <input name="password" type="password" required placeholder="パスワード" className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-600 transition outline-none text-sm leading-none" />
           <button type="submit" className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition text-md uppercase leading-none">LOGIN</button>
        </form>
        <button onClick={toggleSampleMode} className="text-slate-400 font-bold hover:text-blue-600 transition flex items-center justify-center gap-2 w-full text-xs uppercase leading-none"><FlaskConical size={14} /> サンプルデータでお試し</button>
      </div>
    </div>
  );

  return (
    <div className={isMobileView 
      ? "min-h-screen bg-slate-800 p-4 sm:p-8 flex justify-center items-center font-sans selection:bg-blue-100" 
      : "min-h-screen bg-slate-50 text-slate-900 lg:pl-72 pb-24 lg:pb-0 font-sans selection:bg-blue-100 overflow-x-hidden text-left"
    }>
      <div className={isMobileView 
        ? "w-full max-w-[400px] h-[800px] bg-slate-50 rounded-[3rem] shadow-2xl relative overflow-hidden border-[12px] border-slate-900 text-slate-900 flex flex-col text-left" 
        : "w-full h-full contents"
      }>
        
        {/* --- Sidebar (PC) --- */}
        <aside className={isMobileView 
          ? "hidden" 
          : "hidden lg:flex flex-col fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-100 p-8 z-40 text-left"
        }>
          <div className="flex items-center gap-3 mb-10 text-left">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-xl shadow-blue-200"><Trophy size={24} /></div>
            <h1 className="text-xl font-black tracking-tighter leading-none uppercase">Level Up<br/><span className="text-blue-600 text-md uppercase leading-none">Study JH</span></h1>
          </div>
          <nav className="flex-1 space-y-2">
            {[{ id: 'daily', label: '学習記録', icon: Zap }, { id: 'stats', label: '実績分析', icon: BarChart2 }, { id: 'tests', label: '成績推移', icon: TrendingUp }].map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-3xl font-black transition-all leading-none ${activeTab === item.id ? 'bg-blue-600 text-white shadow-2xl' : 'text-slate-400 hover:bg-slate-50'}`}>
                <item.icon size={20} /> {item.label}
              </button>
            ))}
          </nav>
          <button onClick={toggleSampleMode} className={`mt-8 w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all leading-none ${isSampleMode ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
            <span className="text-[10px] font-black uppercase tracking-wider leading-none">Sample Mode</span>
            <FlaskConical size={16} />
          </button>
          
          {isSampleMode && (
            <button onClick={() => setIsMobileView(true)} className="mt-4 w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900 text-white font-black transition-all leading-none shadow-xl">
              <span className="text-[10px] uppercase tracking-wider">スマホプレビュー</span>
              <Smartphone size={16} />
            </button>
          )}

          {!isSampleMode && <button onClick={() => signOut(auth)} className="mt-4 flex items-center gap-2 text-xs font-black text-slate-300 hover:text-rose-500 transition px-4 leading-none"><LogOut size={14}/> LOGOUT</button>}
        </aside>

        {/* --- Mobile Header --- */}
        <header className={isMobileView 
          ? "bg-white border-b border-slate-100 p-4 sticky top-0 z-40 flex justify-between items-center px-6 leading-none shrink-0" 
          : "lg:hidden bg-white border-b border-slate-100 p-4 sticky top-0 z-40 flex justify-between items-center px-6 leading-none"
        }>
          <div className="flex items-center gap-2 leading-none text-left">
            <Trophy className="text-blue-600" size={20} />
            <h1 className="text-sm font-black tracking-tighter uppercase leading-none">Study JH</h1>
          </div>
          <div className="flex items-center">
            {isSampleMode && isMobileView && (
              <button onClick={() => setIsMobileView(false)} className="p-2 rounded-xl bg-slate-100 text-slate-600 flex items-center gap-1 leading-none mr-2">
                <Monitor size={14} />
                <span className="text-[9px] font-black uppercase">PC</span>
              </button>
            )}
            <button onClick={toggleSampleMode} className={`p-2 rounded-xl border leading-none ${isSampleMode ? 'bg-amber-100 border-amber-200 text-amber-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
              <FlaskConical size={18} />
            </button>
          </div>
        </header>

        {/* --- Main Container --- */}
        <div className={isMobileView ? "flex-1 overflow-y-auto pb-24 no-scrollbar relative" : ""}>
          <main className="p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto space-y-6 sm:space-y-10">
            {(activeTab === 'stats' || activeTab === 'tests') && (
               <div className="bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-[2rem] shadow-sm border border-white flex flex-wrap items-center gap-4 justify-center lg:sticky lg:top-4 z-30 transition-all text-left">
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl shrink-0 overflow-hidden leading-none">
                     <CalendarIcon className="text-slate-400" size={14} />
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-bold outline-none leading-none" />
                     <span className="text-slate-300 mx-1">/</span>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-[10px] font-bold outline-none leading-none" />
                  </div>
                  <div className="flex gap-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                     {[7, 14, 30, 0].map(days => (
                       <button key={days} onClick={() => {
                         const d = new Date(); 
                         if(days === 0) setStartDate("2026-01-01"); 
                         else { d.setDate(d.getDate() - days); setStartDate(d.toISOString().split('T')[0]); }
                         setEndDate(new Date().toISOString().split('T')[0]);
                       }} className="px-3 py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-lg text-[9px] font-black transition-all whitespace-nowrap leading-none">
                         {days === 30 ? '1月' : days === 14 ? '2週' : days === 7 ? '1週' : '全'}
                       </button>
                     ))}
                     {!isSampleMode && <button onClick={() => fetchData()} className="p-2 bg-blue-50 text-blue-600 rounded-lg ml-2 leading-none"><RefreshCw size={14}/></button>}
                  </div>
               </div>
            )}

            {activeTab === 'daily' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl p-4 rounded-[2rem] shadow-sm border border-white lg:sticky lg:top-4 z-30">
              <button onClick={() => setSelectedMonth(m => m === 1 ? 12 : m - 1)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition leading-none text-left"><ChevronLeft size={20}/></button>
              <h2 className="text-lg sm:text-2xl font-black text-slate-800 tracking-tight leading-none text-center flex-1">{selectedMonth}月の学習記録</h2>
              <button onClick={() => setSelectedMonth(m => m === 12 ? 1 : m + 1)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl transition leading-none text-left"><ChevronRight size={20}/></button>
            </div>

            <div className={`grid gap-3 sm:gap-4 text-center ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-4'}`}>
              <div className={`${isMobileView ? '' : 'md:col-span-1'} bg-gradient-to-br from-blue-600 to-indigo-700 p-3 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] text-white shadow-xl relative overflow-hidden text-center flex flex-col justify-center min-h-[70px] sm:min-h-[120px]`}>
                 <p className="text-[9px] sm:text-[10px] font-black opacity-70 mb-1 sm:mb-2 uppercase tracking-widest leading-none">Monthly</p>
                 <p className="text-2xl sm:text-4xl font-black font-mono leading-none tracking-tighter">
                   {formatDuration(tasks.reduce((sum, t) => sum + (t.history || []).filter((h) => parseInt(h.date.split('-')[1]) === selectedMonth).reduce((s, h) => s + h.duration, 0), 0))}
                 </p>
              </div>
              <div className={`${isMobileView ? 'grid grid-cols-3 gap-2' : 'md:col-span-3 grid grid-cols-3 gap-2 sm:gap-4'} text-center`}>
                 {Object.values(CATEGORIES).map(cat => {
                   const catTotal = tasks.filter(t => t.categoryId === cat.id).reduce((sum, t) => sum + (t.history || []).filter((h) => parseInt(h.date.split('-')[1]) === selectedMonth).reduce((s, h) => s + h.duration, 0), 0);
                   return (
                     <div key={cat.id} className="bg-white p-2 sm:p-4 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center min-h-[70px] sm:min-h-[120px] text-center leading-none">
                        <cat.icon size={16} className={`sm:w-6 sm:h-6 ${cat.color}`} />
                        <p className="text-[9px] sm:text-sm font-black text-slate-600 mt-1.5 sm:mt-3 uppercase leading-none">{cat.label}</p>
                        <p className="text-xs sm:text-lg font-black font-mono text-slate-800 mt-1 sm:mt-2 w-full text-center leading-none tracking-tighter whitespace-nowrap">{formatDuration(catTotal)}</p>
                     </div>
                   );
                 })}
              </div>
            </div>

            <div className="space-y-6 text-center">
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-[1.75rem] w-full max-w-md mx-auto shadow-inner overflow-hidden leading-none text-center">
                    {Object.values(CATEGORIES).map(cat => (
                      <button key={cat.id} onClick={() => setActiveCategory(cat.id as any)} className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-[10px] font-black transition-all leading-none ${activeCategory === cat.id ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>
                        <cat.icon size={14} /> {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-center">
                    <button onClick={() => setIsAddingTask(true)} className="bg-white border-2 border-dashed border-blue-200 text-blue-600 font-black px-6 py-4 rounded-[1.75rem] flex items-center gap-2 hover:bg-blue-50 active:scale-95 transition-all shadow-sm text-xs leading-none">
                      <PlusCircle size={20} /> 項目を追加
                    </button>
                  </div>

                  <div className="space-y-8 pb-10 text-left">
                    {tasks.filter(t => t.categoryId === activeCategory).length === 0 ? (
                      <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                        <p className="text-slate-300 font-black text-sm uppercase">記録が見つかりません</p>
                      </div>
                    ) : (
                      SUBJECT_DEFS[activeCategory as keyof typeof SUBJECT_DEFS]?.map(subject => {
                        const subjectTasks = tasks.filter(t => t.categoryId === activeCategory && t.subjectId === subject.id);
                        if (subjectTasks.length === 0) return null;
                        
                        return (
                          <div key={subject.id} className="space-y-4">
                            <div className="flex items-center gap-2 px-2">
                               <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: subject.hex }} />
                               <h3 className="font-black text-slate-700 text-base sm:text-lg leading-none">{subject.label}</h3>
                            </div>
                            <div className={`gap-3 sm:gap-4 ${isMobileView ? 'grid grid-cols-1' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                              {subjectTasks.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt).map(task => {
                                const monthlyTime = (task.history || []).filter((h) => parseInt(h.date.split('-')[1]) === selectedMonth).reduce((acc, h) => acc + h.duration, 0);
                                return (
                                  <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className="bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden text-left group">
                                    <div className="flex justify-between items-start mb-2 sm:mb-3 text-left">
                                      <div className="flex items-center gap-1.5 sm:gap-2 leading-none text-left">
                                        <span className={`text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full leading-none ${CATEGORIES[task.categoryId.toUpperCase() as keyof typeof CATEGORIES].bg} ${CATEGORIES[task.categoryId.toUpperCase() as keyof typeof CATEGORIES].color}`}>{task.type === 'homework' ? '宿題' : '自習'}</span>
                                      </div>
                                      {task.isRunning && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-blue-500 rounded-full animate-ping" />}
                                    </div>
                                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mb-2 sm:mb-3">
                                       {new Date(task.lastUpdatedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 更新
                                    </div>
                                    <h4 className="font-black text-slate-800 text-base sm:text-lg mb-3 sm:mb-4 truncate leading-tight text-left">{task.title || "Untitled"}</h4>
                                    <div className="flex justify-between items-end border-t border-slate-50 pt-3 sm:pt-4 leading-none text-left">
                                       <div className="text-[9px] sm:text-[10px] font-black text-slate-300 flex items-center gap-1 uppercase leading-none text-left"><History size={12} /> {task.history?.length || 0}回</div>
                                       <p className="text-lg sm:text-xl font-black font-mono text-blue-600 tracking-tighter leading-none text-left">{formatDuration(monthlyTime)}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-10 animate-in slide-in-from-bottom-5 duration-500 text-center">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden text-center text-left">
                   <h3 className="text-lg font-black mb-6 flex items-center justify-center gap-2 leading-none text-center"><BarChart2 className="text-blue-600" size={20}/> 学習推移 (分)</h3>
                   <div className="h-64 sm:h-80 w-full text-center">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={stats.dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: '900', fill: '#cbd5e1'}} />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: '900', fill: '#cbd5e1'}} />
                            <Tooltip contentStyle={{borderRadius: '12px', border: 'none', fontSize: '10px'}} />
                            <Legend iconType="circle" wrapperStyle={{paddingTop: '10px', fontSize: '10px', fontWeight: '900'}} />
                            <Bar dataKey="school" name="中学校" stackId="a" fill="#3b82f6" />
                            <Bar dataKey="juku" name="塾" stackId="a" fill="#10b981" />
                            <Bar dataKey="etc" name="その他" stackId="a" fill="#8b5cf6" />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className={`grid gap-6 text-center text-left ${isMobileView ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
                   <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
                  <h3 className="text-lg font-black mb-6 flex items-center justify-center gap-2 leading-none text-center text-center"><PieChartIcon className="text-indigo-600" size={20}/> 学習比率</h3>
                  <div className="h-56 sm:h-64 text-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.breakdown} innerRadius="60%" outerRadius="85%" paddingAngle={5} dataKey="duration">
                          {stats.breakdown.map((e) => <Cell key={e.id} fill={e.hex} stroke="none" />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-2 sm:gap-4 mt-2 sm:mt-4 flex-wrap leading-none">
                    {stats.breakdown.map(d => (
                      <div key={d.id} className="flex flex-col items-center p-2 sm:p-3 bg-slate-50 rounded-lg sm:rounded-xl min-w-[50px] sm:min-w-[60px] leading-none text-center">
                         <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full mb-1 leading-none text-center" style={{ backgroundColor: d.hex }} />
                         <span className="text-[9px] sm:text-[10px] font-black text-slate-800 font-mono leading-none">{d.percent}%</span>
                      </div>
                    ))}
                  </div>
               </div>

               <div className="space-y-4 text-left">
                      {stats.breakdown.map(cat => (
                        <div key={cat.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group text-left">
                           <h4 className={`font-black text-[10px] ${cat.color} uppercase mb-4 tracking-widest flex items-center gap-2 leading-none text-left`}>
                             <Award size={14} /> {cat.label}の内訳
                           </h4>
                           <div className="space-y-4 text-left">
                              {cat.subjects.map((s: any) => (
                                <div key={s.id} className="space-y-1.5 text-left leading-none">
                                   <div className="flex justify-between text-[10px] font-black leading-none text-left text-left">
                                      <span className="text-slate-600 truncate text-left">{s.label}</span>
                                      <span className="text-slate-400 font-mono text-left text-left">{formatDuration(s.duration)}</span>
                                   </div>
                                   <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden text-left leading-none text-left">
                                      <div className={`h-full rounded-full ${cat.id === 'school' ? 'bg-blue-600' : cat.id === 'juku' ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${s.percent}%` }} />
                                   </div>
                                </div>
                              ))}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'tests' && (
              <div className="space-y-10 animate-in zoom-in-95 duration-500 pb-10 text-center text-left">
                <div className={`flex items-center gap-4 px-4 text-center leading-none text-center ${isMobileView ? 'flex-col' : 'flex-col sm:flex-row justify-between'}`}>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2 leading-none text-center text-center">
                    <TrendingUp className="text-rose-500" size={24} /> Score Trends
                  </h3>
                  <button onClick={() => { setEditingTest(null); setIsAddingTest(true); }} className="w-full sm:w-auto bg-rose-500 text-white font-black px-8 py-3 rounded-2xl shadow-xl active:scale-95 transition text-sm uppercase leading-none">成績登録</button>
                </div>

                <div className="bg-white p-4 sm:p-8 rounded-[2rem] border border-slate-100 shadow-sm space-y-6 text-left overflow-x-hidden leading-none text-left">
                   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-4 leading-none text-left">
                      <div className="flex items-center gap-2 text-slate-400 leading-none text-left text-left">
                         <ListFilter size={16} />
                         <span className="text-[10px] font-black uppercase leading-none text-left">教科選択</span>
                      </div>
                      <div className="flex gap-1 leading-none text-left">
                         <button onClick={() => bulkSelectSubjects('all')} className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black leading-none">全</button>
                         <button onClick={() => bulkSelectSubjects('none')} className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black leading-none">無</button>
                      </div>
                   </div>

                   <div className="flex flex-col gap-4 text-left leading-none text-left">
                      <div className="text-left leading-none text-left text-left">
                        <h5 className="text-[9px] font-black text-blue-600 uppercase mb-2 leading-none text-left text-left">中学校</h5>
                        <div className="flex flex-wrap gap-1.5 leading-none text-left text-left">
                           {SUBJECT_DEFS.school.map(s => (
                             <button key={s.id} onClick={() => toggleSubjectVisibility(s.id)} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black flex items-center gap-1.5 transition-all leading-none ${visibleSubjects.includes(s.id) ? 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm' : 'bg-slate-50 text-slate-400 border border-transparent'}`}>
                               {visibleSubjects.includes(s.id) ? <CheckSquare size={10}/> : <Square size={10}/>} {s.label}
                             </button>
                           ))}
                        </div>
                      </div>
                      <div className="text-left leading-none text-left text-left text-left">
                        <h5 className="text-[9px] font-black text-emerald-600 uppercase mb-2 leading-none text-left text-left">塾</h5>
                        <div className="flex flex-wrap gap-1.5 leading-none text-left text-left">
                           {SUBJECT_DEFS.juku.map(s => (
                             <button key={s.id} onClick={() => toggleSubjectVisibility(s.id)} className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black flex items-center gap-1.5 transition-all leading-none ${visibleSubjects.includes(s.id) ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm' : 'bg-slate-50 text-slate-400 border border-transparent'}`}>
                               {visibleSubjects.includes(s.id) ? <CheckSquare size={10}/> : <Square size={10}/>} {s.label}
                           </button>
                           ))}
                        </div>
                      </div>
                      <button onClick={() => toggleSubjectVisibility('average')} className={`self-start px-3 py-2 rounded-xl text-[9px] font-black transition-all flex items-center gap-2 ${visibleSubjects.includes('average') ? 'bg-slate-200 text-slate-800 shadow-inner' : 'bg-slate-50 text-slate-400'} leading-none text-left text-left`}>
                         {visibleSubjects.includes('average') ? <Eye size={12}/> : <EyeOff size={12}/>} 学年平均
                      </button>
                   </div>
                </div>

                <div className="bg-white p-4 sm:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden text-center leading-none text-center">
                   <div className="h-64 sm:h-96 w-full text-center leading-none text-center">
                      <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={filteredTests} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: '900', fill: '#cbd5e1'}} />
                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: '900', fill: '#cbd5e1'}} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontSize: '10px' }} />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: '900', fontSize: '10px' }} />
                            
                            {visibleSubjects.includes('average') && (
                              <Line type="monotone" dataKey="average" name="学年平均" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
                            )}
                            {allChartSubjects.filter(s => s.id !== 'average').map(sub => (
                              visibleSubjects.includes(sub.id) && (
                                <Line key={sub.id} type="monotone" dataKey={`scores.${sub.id}`} name={sub.label} stroke={sub.hex} strokeWidth={3} dot={{r:4, fill: sub.hex, strokeWidth: 1, stroke: '#fff'}} connectNulls animationDuration={800} />
                              )
                            ))}
                         </LineChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden text-left leading-none text-left text-left">
                  <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/30 leading-none text-left text-left">
                    <h4 className="font-black text-sm text-slate-800 leading-none text-left text-left">成績データ一覧</h4>
                    <span className="text-[10px] font-black text-slate-400 uppercase leading-none text-left text-left">{filteredTests.length}回分</span>
                  </div>
                  <div className="overflow-x-auto overflow-y-hidden no-scrollbar text-left leading-none text-left">
                    <table className="w-full text-left border-collapse min-w-[800px] leading-none text-left text-left">
                      <thead>
                        <tr className="bg-slate-50/80 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-left leading-none text-left">
                          <th className="px-6 py-4 sticky left-0 bg-slate-50/95 backdrop-blur-md z-10 text-left leading-none text-left">テスト名 / 日付</th>
                          <th className="px-4 py-4 text-center leading-none text-left">平均</th>
                          <th className="px-4 py-4 text-center text-blue-600 leading-none text-left">数学</th>
                          <th className="px-4 py-4 text-center text-rose-600 leading-none text-left">国語</th>
                          <th className="px-4 py-4 text-center text-indigo-600 leading-none text-left">英語</th>
                          <th className="px-4 py-4 text-center text-emerald-600 leading-none text-left">理科</th>
                          <th className="px-4 py-4 text-center text-amber-600 leading-none text-left">社会</th>
                          <th className="px-6 py-4 text-right leading-none text-left text-left">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-center leading-none text-left text-left">
                        {[...filteredTests].reverse().map(test => {
                          const prefix = test.category === 'school' ? 's_' : 'j_' ;
                          return (
                            <tr key={test.id} className="group hover:bg-blue-50/10 transition-colors leading-none text-left">
                              <td className="px-6 py-5 sticky left-0 bg-white group-hover:bg-blue-50/10 backdrop-blur-md z-10 transition-colors text-left leading-none text-left text-left text-left">
                                <p className="font-black text-slate-800 text-sm leading-tight truncate w-32 sm:w-auto text-left text-left text-left">{test.name}</p>
                                <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase text-left leading-none text-left">{test.date}</p>
                              </td>
                              <td className="px-4 py-5 text-center font-mono font-black text-slate-700 text-xs leading-none text-left">{test.average}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-blue-600 text-sm leading-none text-left">{test.scores[`${prefix}math`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-rose-600 text-sm leading-none text-left">{test.scores[`${prefix}japanese`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-indigo-600 text-sm leading-none text-left">{test.scores[`${prefix}english`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-emerald-600 text-sm leading-none text-left">{test.scores[`${prefix}science`] || "-"}</td>
                              <td className="px-4 py-5 text-center font-mono font-black text-amber-600 text-sm leading-none text-left">{test.scores[`${prefix}social`] || "-"}</td>
                              <td className="px-6 py-5 text-right leading-none text-left text-left">
                                <div className="flex justify-end gap-2 leading-none text-left">
                                  <button onClick={() => { setEditingTest(test); setIsAddingTest(true); }} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all leading-none text-left"><Edit3 size={14}/></button>
                                  <button onClick={() => handleDeleteTest(test.id)} className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-rose-600 hover:text-white transition-all leading-none text-left"><Trash2 size={14}/></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* --- Modals --- */}
        {isAddingTask && (
          <div className={modalOverlayClass}>
             <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 leading-none">
                   <h3 className="text-lg font-black tracking-tight text-center flex-1 leading-none text-center">学習項目の追加</h3>
                   <button onClick={() => setIsAddingTask(false)} className="p-2 bg-white rounded-xl shadow-sm hover:bg-slate-50 transition leading-none text-left text-left"><X size={20}/></button>
                </div>
                <form onSubmit={handleAddTask} className="p-8 space-y-6 text-left leading-none text-left">
                   <div className="text-left leading-none text-left text-left">
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 leading-none text-left text-left text-left">教科</label>
                      <select name="subjectId" required className="w-full bg-slate-50 border-none rounded-xl p-4 font-black text-slate-800 appearance-none shadow-inner text-sm outline-none focus:ring-2 focus:ring-blue-600 leading-none">
                         {SUBJECT_DEFS[activeCategory as keyof typeof SUBJECT_DEFS]?.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                   </div>
                   <div className="text-left leading-none text-left text-left text-left">
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 leading-none text-left text-left text-left">種類</label>
                      <div className="grid grid-cols-2 gap-3 leading-none text-left text-left">
                         {['homework', 'self'].map(t => (
                           <label key={t} className="relative cursor-pointer group text-center leading-none text-left text-left">
                             <input type="radio" name="type" value={t} defaultChecked={t === 'homework'} className="peer sr-only" />
                             <div className="p-3 border-2 border-slate-100 rounded-xl text-center font-black text-xs peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-600 transition leading-none">
                               {t === 'homework' ? '宿題' : '自習'}
                             </div>
                           </label>
                         ))}
                      </div>
                   </div>
                   <div className="text-left leading-none text-left text-left text-left">
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 leading-none text-left text-left text-left text-left">内容</label>
                      <input name="detail" required placeholder="例：数学ワーク P.40" className="w-full bg-slate-50 border-none rounded-xl p-4 font-black placeholder:text-slate-300 shadow-inner text-sm outline-none leading-none text-left" />
                   </div>
                   <button type="submit" className="w-full bg-blue-600 text-white font-black py-4 rounded-xl shadow-2xl active:scale-95 transition text-md uppercase leading-none">Add Task</button>
                </form>
             </div>
          </div>
        )}

        {selectedTaskId && (
          <div className={taskDetailOverlayClass}>
             <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedTaskId(null)} />
             <div className="relative bg-white w-full max-w-2xl rounded-t-[2.5rem] lg:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 h-[90vh] max-h-[90vh]">
                {(() => {
                  const task = tasks.find(t => t.id === selectedTaskId);
                  if (!task) return null;
                  const cat = CATEGORIES[task.categoryId.toUpperCase() as keyof typeof CATEGORIES];
                  return (
                    <>
                      <div className="p-6 sm:p-10 border-b border-slate-50 flex justify-between items-start shrink-0 text-left bg-slate-50/50">
                         <div className="space-y-2 text-left text-left text-left">
                            <div className="flex gap-2 leading-none text-left text-left text-left">
                               <span className={`text-[9px] font-black px-3 py-1 rounded-full ${cat.bg} ${cat.color} uppercase leading-none text-left text-left text-left`}>{cat.label}</span>
                               <span className="text-[9px] font-black bg-white text-slate-400 px-3 py-1 rounded-full uppercase shadow-sm leading-none text-left text-left text-left">{task.type === 'homework' ? '宿題' : '自習'}</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tighter leading-tight text-left text-left text-left">{task.title}</h2>
                         </div>
                         <button onClick={() => setSelectedTaskId(null)} className="p-3 bg-white rounded-2xl shadow-sm hover:bg-slate-50 transition shrink-0 leading-none text-left text-left text-left"><X size={24}/></button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-10 no-scrollbar pb-32 text-left">
                         <StrictTimer 
                           task={task} 
                           isAnyOtherRunning={isAnyTaskRunning && !task.isRunning} 
                           onUpdate={handleUpdateLocalTask} 
                           onSave={handleSaveRecord} 
                         />
                         <div className="space-y-4 text-left leading-none text-left text-left text-left">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2 leading-none text-left text-left text-left text-left text-left"><Search size={14}/> 学習メモ</label>
                            <textarea value={task.tempDetail || ""} onChange={(e) => handleUpdateLocalTask(task.id, { tempDetail: e.target.value })} placeholder="内容をメモ..." className="w-full h-28 bg-slate-50/50 border-none rounded-2xl p-4 font-black text-md resize-none shadow-inner outline-none focus:ring-2 focus:ring-blue-100 text-left leading-snug text-left text-left text-left" />
                         </div>
                         <div className="space-y-6 text-left leading-none text-left text-left text-left">
                            <h3 className="font-black text-lg flex items-center gap-2 px-2 leading-none text-left text-left text-left text-left"><History className="text-blue-500" /> 履歴</h3>
                            <div className="space-y-3 text-left leading-none text-left text-left text-left text-left">
                              {(task.history || []).length === 0 ? <p className="text-center py-10 text-slate-300 font-bold italic text-sm leading-none text-center">記録なし</p> : 
                              [...task.history].reverse().map(h => (
                                <div key={h.id} className="bg-white border border-slate-100 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-sm text-left leading-none gap-3">
                                   <div className="flex-1 pr-4 text-left leading-none text-left text-left text-left w-full">
                                      <span className="text-[10px] font-black bg-slate-50 text-slate-500 px-3 py-1 rounded-full mb-2 inline-block leading-none text-left text-left text-left text-left">{h.date}</span>
                                      <p className="font-bold text-slate-500 text-xs leading-snug break-words text-left text-left text-left text-left">{h.memo || "詳細なし"}</p>
                                   </div>
                                   <div className="text-blue-600 font-mono font-black text-xl tracking-tighter shrink-0 leading-none self-end sm:self-auto">{formatDuration(h.duration)}</div>
                                </div>
                              ))}
                            </div>
                         </div>
                         <button onClick={async () => { if(confirm("削除しますか？")) { try { await deleteDoc(doc(getTasksCol(), task.id)); setTasks(prev => prev.filter(t => t.id !== task.id)); setSelectedTaskId(null); fetchData(true); } catch(e) { alert("失敗"); } } }} className="w-full py-6 text-rose-300 hover:text-rose-500 font-black text-[10px] flex items-center justify-center gap-2 border-2 border-dashed border-rose-50 rounded-2xl transition-all hover:bg-rose-50/50 uppercase tracking-widest mt-10 leading-none text-center">Delete Task Item</button>
                      </div>
                    </>
                  );
                })()}
             </div>
          </div>
        )}

        {isAddingTest && (
          <div className={modalOverlayClass}>
             <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 h-[85vh] flex flex-col text-left">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 shrink-0 text-left leading-none text-left text-left">
                   <h3 className="text-lg font-black tracking-tight text-center flex-1 leading-none text-center">成績登録</h3>
                   <button onClick={() => { setIsAddingTest(false); setEditingTest(null); }} className="p-2 bg-white rounded-xl shadow-sm transition leading-none text-left text-left text-left text-left"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveTest} className="p-6 space-y-6 overflow-y-auto no-scrollbar pb-24 text-left leading-none text-left text-left">
                   <div className="grid grid-cols-2 gap-4 text-left leading-none text-left text-left text-left">
                      <div className="text-left leading-none text-left text-left text-left">
                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 leading-none text-left text-left text-left">カテゴリ</label>
                        <select name="testCategory" defaultValue={editingTest?.category || "school"} className="w-full bg-slate-50 border-none rounded-xl p-3 font-black text-sm shadow-inner appearance-none leading-none"><option value="school">中学校</option><option value="juku">塾</option></select>
                      </div>
                      <div className="text-left leading-none text-left text-left text-left">
                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 leading-none text-left text-left text-left">種別</label>
                        <select name="testSubType" defaultValue={editingTest?.subType || "midterm"} className="w-full bg-slate-50 border-none rounded-xl p-3 font-black text-sm shadow-inner appearance-none leading-none"><option value="midterm">中間</option><option value="final">期末</option><option value="normal">その他</option></select>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-left leading-none text-left text-left text-left">
                      <div className="text-left leading-none text-left text-left text-left text-left"><label className="block text-[9px] font-black text-slate-400 uppercase mb-2 leading-none text-left text-left text-left text-left">名称</label><input name="name" required defaultValue={editingTest?.name} placeholder="考査名" className="w-full bg-slate-50 border-none rounded-xl p-3 font-black text-sm shadow-inner leading-none text-left text-left text-left" /></div>
                      <div className="text-left leading-none text-left text-left text-left text-left text-left"><label className="block text-[9px] font-black text-slate-400 uppercase mb-2 leading-none text-left text-left text-left text-left">日</label><input name="date" type="date" required defaultValue={editingTest?.date} className="w-full bg-slate-50 border-none rounded-xl p-3 font-black text-sm shadow-inner leading-none text-left text-left text-left" /></div>
                   </div>
                   <div className="space-y-4 text-left">
                      <label className="block text-[9px] font-black text-slate-400 uppercase leading-none text-left">点数入力</label>
                      <div className="grid grid-cols-3 gap-3 text-left">
                         {[...SUBJECT_DEFS.school, ...SUBJECT_DEFS.juku].map(sub => (
                           <div key={sub.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-inner text-center leading-none">
                              <p className="text-[8px] font-black text-slate-400 mb-1 truncate leading-none text-center">{sub.label}</p>
                              <input name={`score_${sub.id}`} type="number" defaultValue={editingTest?.scores?.[sub.id]} placeholder="0" className="w-full bg-white border-none rounded-lg p-2 font-black text-sm text-center shadow-sm outline-none focus:ring-1 focus:ring-blue-600 leading-none" />
                           </div>
                         ))}
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 border-t border-slate-50 pt-6 text-left">
                      <div className="text-left"><label className="block text-[9px] font-black text-slate-400 uppercase mb-2 leading-none text-left">平均点</label><input name="average" type="number" step="0.1" defaultValue={editingTest?.average} className="w-full bg-slate-50 border-none rounded-xl p-3 font-black text-sm leading-none" /></div>
                      <div className="text-left"><label className="block text-[9px] font-black text-slate-400 uppercase mb-2 leading-none text-left">順位</label><input name="rank" defaultValue={editingTest?.rank} placeholder="例: 10位" className="w-full bg-slate-50 border-none rounded-xl p-3 font-black text-sm leading-none" /></div>
                   </div>
                   <button type="submit" className="w-full bg-rose-500 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95 transition text-md uppercase leading-none mt-4 text-center">Save</button>
                </form>
             </div>
          </div>
        )}

        {/* --- Mobile Nav Bar --- */}
        <nav className={isMobileView 
          ? "absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t border-slate-100 flex justify-around p-3 pb-8 z-50 rounded-t-[1.75rem] shadow-2xl leading-none text-center" 
          : "lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-3xl border-t border-slate-100 flex justify-around p-3 pb-8 z-50 rounded-t-[1.75rem] shadow-2xl leading-none text-center"
        }>
          {[ { id: 'daily', icon: Zap }, { id: 'stats', icon: BarChart2 }, { id: 'tests', icon: TrendingUp } ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)} className={`p-4 rounded-2xl transition-all duration-300 leading-none text-center ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl -translate-y-2 text-center' : 'text-slate-300 text-center'}`}><item.icon size={22} /></button>
          ))}
        </nav>
      </div>
    </div>
  );
}