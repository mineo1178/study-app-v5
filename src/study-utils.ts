export type StudyStatus = "not_started" | "in_progress" | "completed";
export type RewardSubject = "math" | "japanese" | "science" | "social";
export type AvatarItemCategory = "nail" | "accessory" | "clothes" | "background";
export type AvatarRarity = "NORMAL" | "RARE" | "SUPER RARE" | "SPECIAL";

export type SessionReviewFlag =
  | "long_session"
  | "long_background"
  | "clock_changed";

export const MIN_CREDITED_STUDY_SECONDS = 10 * 60;
export const MAX_CREDITED_STUDY_SECONDS = 60 * 60;
export const LONG_SESSION_SECONDS = 120 * 60;
export const LONG_BACKGROUND_SECONDS = 30 * 60;
export const GAME_START_DATE = "2026-09-05";

export type StudyHistoryEntry = {
  duration: number;
  date?: string;
  startAt?: number;
  endAt?: number;
  creditedDuration?: number;
  reviewFlags?: SessionReviewFlag[];
};

export type StudyTaskLike = {
  id: string;
  unit: string;
  subject: string;
  status: StudyStatus;
  currentDuration: number;
  sessionStartTime: number | null;
  isRunning: boolean;
  history: StudyHistoryEntry[];
};

export type AvatarItem = {
  id: string;
  category: AvatarItemCategory;
  name: string;
  rarity: AvatarRarity;
  theme: string;
  unlock:
    | { type: "stars"; value: number }
    | { type: "subject_minutes"; subject: RewardSubject; value: number }
    | { type: "weekly_days"; value: number };
};

export type AvatarEquipment = Partial<Record<AvatarItemCategory, string>>;

export const AVATAR_ITEMS: AvatarItem[] = [
  { id: "pink-nail", category: "nail", name: "ピンクネイル", rarity: "NORMAL", theme: "ハート", unlock: { type: "stars", value: 20 } },
  { id: "heart-nail", category: "nail", name: "ハートネイル", rarity: "RARE", theme: "ハート", unlock: { type: "stars", value: 60 } },
  { id: "starlight-nail", category: "nail", name: "星空ネイル", rarity: "RARE", theme: "算数・宇宙", unlock: { type: "subject_minutes", subject: "math", value: 60 } },
  { id: "sakura-nail", category: "nail", name: "さくらネイル", rarity: "SUPER RARE", theme: "国語・花", unlock: { type: "subject_minutes", subject: "japanese", value: 90 } },
  { id: "mermaid-nail", category: "nail", name: "マーメイドネイル", rarity: "SUPER RARE", theme: "理科・海", unlock: { type: "subject_minutes", subject: "science", value: 120 } },
  { id: "strawberry-nail", category: "nail", name: "いちごネイル", rarity: "SPECIAL", theme: "カフェ", unlock: { type: "stars", value: 220 } },
  { id: "star-earrings", category: "accessory", name: "星のイヤリング", rarity: "NORMAL", theme: "算数・宇宙", unlock: { type: "subject_minutes", subject: "math", value: 30 } },
  { id: "heart-necklace", category: "accessory", name: "ハートネックレス", rarity: "RARE", theme: "ハート", unlock: { type: "stars", value: 90 } },
  { id: "sakura-ribbon", category: "accessory", name: "さくらリボン", rarity: "RARE", theme: "国語・花", unlock: { type: "subject_minutes", subject: "japanese", value: 60 } },
  { id: "pearl-bracelet", category: "accessory", name: "パールブレスレット", rarity: "SUPER RARE", theme: "おしゃれ", unlock: { type: "stars", value: 160 } },
  { id: "moon-hairpin", category: "accessory", name: "月のヘアピン", rarity: "SUPER RARE", theme: "算数・宇宙", unlock: { type: "subject_minutes", subject: "math", value: 120 } },
  { id: "travel-bag", category: "accessory", name: "世界旅行バッグ", rarity: "SPECIAL", theme: "社会・世界", unlock: { type: "subject_minutes", subject: "social", value: 90 } },
  { id: "pink-dress", category: "clothes", name: "ピンクワンピ", rarity: "NORMAL", theme: "ハート", unlock: { type: "stars", value: 50 } },
  { id: "starlight-dress", category: "clothes", name: "星空ドレス", rarity: "RARE", theme: "算数・宇宙", unlock: { type: "subject_minutes", subject: "math", value: 90 } },
  { id: "sakura-outfit", category: "clothes", name: "さくらコーデ", rarity: "RARE", theme: "国語・花", unlock: { type: "subject_minutes", subject: "japanese", value: 120 } },
  { id: "cafe-outfit", category: "clothes", name: "カフェコーデ", rarity: "SUPER RARE", theme: "おしゃれ", unlock: { type: "stars", value: 140 } },
  { id: "school-outfit", category: "clothes", name: "スクールコーデ", rarity: "SUPER RARE", theme: "学習", unlock: { type: "stars", value: 180 } },
  { id: "marine-outfit", category: "clothes", name: "マリンコーデ", rarity: "SPECIAL", theme: "理科・海", unlock: { type: "subject_minutes", subject: "science", value: 90 } },
  { id: "sakura-bg", category: "background", name: "さくら背景", rarity: "NORMAL", theme: "国語・花", unlock: { type: "subject_minutes", subject: "japanese", value: 30 } },
  { id: "starlight-bg", category: "background", name: "星空背景", rarity: "RARE", theme: "算数・宇宙", unlock: { type: "subject_minutes", subject: "math", value: 150 } },
  { id: "cafe-bg", category: "background", name: "カフェ背景", rarity: "RARE", theme: "おしゃれ", unlock: { type: "stars", value: 120 } },
  { id: "sea-bg", category: "background", name: "海の背景", rarity: "SUPER RARE", theme: "理科・海", unlock: { type: "subject_minutes", subject: "science", value: 150 } },
  { id: "flower-bg", category: "background", name: "お花畑背景", rarity: "SUPER RARE", theme: "国語・花", unlock: { type: "subject_minutes", subject: "japanese", value: 180 } },
  { id: "magic-room-bg", category: "background", name: "魔法のお部屋", rarity: "SPECIAL", theme: "週間", unlock: { type: "weekly_days", value: 5 } },
];

export const AVATAR_SETS = [
  {
    id: "sakura-set",
    name: "さくらセット",
    rewardName: "さくらプリンセス",
    itemIds: ["sakura-nail", "sakura-ribbon", "sakura-outfit", "sakura-bg"],
  },
  {
    id: "star-set",
    name: "星空セット",
    rewardName: "星空スタイリスト",
    itemIds: ["starlight-nail", "star-earrings", "starlight-dress", "starlight-bg"],
  },
  {
    id: "marine-set",
    name: "マリンセット",
    rewardName: "海のプリンセス",
    itemIds: ["mermaid-nail", "marine-outfit", "sea-bg"],
  },
];

export const getElapsedSeconds = (
  task: Pick<
    StudyTaskLike,
    "currentDuration" | "sessionStartTime" | "isRunning"
  >,
  now = Date.now(),
) => {
  if (!task.isRunning || task.sessionStartTime === null) return task.currentDuration;
  return task.currentDuration + Math.max(0, Math.floor((now - task.sessionStartTime) / 1000));
};

export const getCreditedStudyMinutes = (
  recordedDuration: number,
  reviewFlags: SessionReviewFlag[] = [],
) => {
  if (recordedDuration < MIN_CREDITED_STUDY_SECONDS || reviewFlags.length > 0)
    return 0;
  return Math.floor(Math.min(recordedDuration, MAX_CREDITED_STUDY_SECONDS) / 60);
};

export const getSessionReviewFlags = (
  recordedDuration: number,
  flags: SessionReviewFlag[] = [],
) =>
  Array.from(
    new Set([
      ...flags,
      ...(recordedDuration >= LONG_SESSION_SECONDS
        ? (["long_session"] as SessionReviewFlag[])
        : []),
    ]),
  );

export const getStudyDuration = (task: StudyTaskLike) =>
  task.currentDuration + task.history.reduce((total, entry) => total + entry.duration, 0);

export const getTaskStats = (tasks: StudyTaskLike[]) => {
  if (tasks.length === 0) return { progress: 0, totalTime: 0 };

  const completed = tasks.filter((task) => task.status === "completed").length;
  return {
    progress: Math.round((completed / tasks.length) * 100),
    totalTime: tasks.reduce((total, task) => total + getStudyDuration(task), 0),
  };
};

export const getSubjectTaskStats = (tasks: StudyTaskLike[], subject: string) =>
  getTaskStats(tasks.filter((task) => task.subject === subject));

export const removeTasksForUnit = <T extends Pick<StudyTaskLike, "unit">>(
  tasks: T[],
  unit: string,
) => tasks.filter((task) => task.unit !== unit);

const GAME_START_TIME = new Date(`${GAME_START_DATE}T00:00:00+09:00`).getTime();

const parseDatedHistory = (date?: string) => {
  if (!date || !/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(date)) return 0;
  const normalized = date.replace(/\//g, "-");
  const parsed = new Date(`${normalized}T00:00:00+09:00`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDateKey = (value: Date | number) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isGameRewardHistory = (entry: StudyHistoryEntry) => {
  if (entry.reviewFlags && entry.reviewFlags.length > 0) return false;
  const time = entry.endAt || entry.startAt || parseDatedHistory(entry.date);
  return !!time && time >= GAME_START_TIME;
};

export const getStarReward = (creditedMinutes: number) =>
  Math.max(0, Math.floor(creditedMinutes));

export const getRewardStudyEntries = <T extends Pick<StudyTaskLike, "subject" | "history">>(
  tasks: T[],
) =>
  tasks.flatMap((task) =>
    task.history
      .filter(isGameRewardHistory)
      .map((entry) => {
        const creditedSeconds =
          typeof entry.creditedDuration === "number"
            ? entry.creditedDuration
            : getCreditedStudyMinutes(entry.duration, entry.reviewFlags || []) * 60;
        return {
          subject: task.subject as RewardSubject,
          date: entry.date,
          startAt: entry.startAt,
          endAt: entry.endAt,
          duration: entry.duration,
          creditedDuration: entry.reviewFlags?.length ? 0 : creditedSeconds,
          reviewFlags: entry.reviewFlags || [],
        };
      }),
  );

export const getRewardTotals = <T extends Pick<StudyTaskLike, "subject" | "history">>(
  tasks: T[],
) => {
  const subjectMinutes: Record<RewardSubject, number> = {
    math: 0,
    japanese: 0,
    science: 0,
    social: 0,
  };
  let stars = 0;

  getRewardStudyEntries(tasks).forEach((entry) => {
    const creditedMinutes = Math.floor(Math.max(0, entry.creditedDuration) / 60);
    stars += getStarReward(creditedMinutes);
    if (entry.subject in subjectMinutes) {
      subjectMinutes[entry.subject] += creditedMinutes;
    }
  });

  return { stars, subjectMinutes };
};

export const getWeeklyProgress = <T extends Pick<StudyTaskLike, "subject" | "history">>(
  tasks: T[],
  now = new Date(),
) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const studyDays = new Set<string>();

  getRewardStudyEntries(tasks).forEach((entry) => {
    if (entry.creditedDuration <= 0) return;
    const time = entry.endAt || entry.startAt || parseDatedHistory(entry.date);
    if (!time || time < start.getTime()) return;
    studyDays.add(toDateKey(time));
  });

  return {
    days: studyDays.size,
    targetDays: 5,
    remainingDays: Math.max(0, 5 - studyDays.size),
  };
};

export const getUnlockedItems = <T extends Pick<StudyTaskLike, "subject" | "history">>(
  tasks: T[],
  items: AvatarItem[] = AVATAR_ITEMS,
) => {
  const totals = getRewardTotals(tasks);
  const weekly = getWeeklyProgress(tasks);
  return items.filter((item) => {
    if (item.unlock.type === "stars") return totals.stars >= item.unlock.value;
    if (item.unlock.type === "weekly_days") return weekly.days >= item.unlock.value;
    return totals.subjectMinutes[item.unlock.subject] >= item.unlock.value;
  });
};

export const getCollectionProgress = (
  unlockedItems: AvatarItem[],
  items: AvatarItem[] = AVATAR_ITEMS,
) => {
  const unlockedIds = new Set(unlockedItems.map((item) => item.id));
  return (["nail", "accessory", "clothes", "background"] as AvatarItemCategory[]).map(
    (category) => {
      const categoryItems = items.filter((item) => item.category === category);
      return {
        category,
        unlocked: categoryItems.filter((item) => unlockedIds.has(item.id)).length,
        total: categoryItems.length,
      };
    },
  );
};

export const getNextRewards = <T extends Pick<StudyTaskLike, "subject" | "history">>(
  tasks: T[],
  limit = 3,
  items: AvatarItem[] = AVATAR_ITEMS,
) => {
  const totals = getRewardTotals(tasks);
  const weekly = getWeeklyProgress(tasks);
  const unlockedIds = new Set(getUnlockedItems(tasks, items).map((item) => item.id));

  return items
    .filter((item) => !unlockedIds.has(item.id))
    .map((item) => {
      const current =
        item.unlock.type === "stars"
          ? totals.stars
          : item.unlock.type === "weekly_days"
            ? weekly.days
            : totals.subjectMinutes[item.unlock.subject];
      return {
        item,
        remaining: Math.max(0, item.unlock.value - current),
        unit:
          item.unlock.type === "stars"
            ? "スター"
            : item.unlock.type === "weekly_days"
              ? "日"
              : "分",
      };
    })
    .sort((a, b) => a.remaining - b.remaining || a.item.unlock.value - b.item.unlock.value)
    .slice(0, limit);
};

export const getDailyMissions = <T extends Pick<StudyTaskLike, "subject" | "history">>(
  tasks: T[],
  now = new Date(),
) => {
  const today = toDateKey(now);
  const subjects = new Set<RewardSubject>();
  let minutes = 0;

  getRewardStudyEntries(tasks).forEach((entry) => {
    if (entry.creditedDuration <= 0) return;
    const time = entry.endAt || entry.startAt || parseDatedHistory(entry.date);
    if (!time || toDateKey(time) !== today) return;
    minutes += Math.floor(entry.creditedDuration / 60);
    subjects.add(entry.subject);
  });

  return [
    { id: "study-10", label: "10分勉強", current: Math.min(minutes, 10), target: 10, completed: minutes >= 10 },
    { id: "two-subjects", label: "2教科学習", current: Math.min(subjects.size, 2), target: 2, completed: subjects.size >= 2 },
    { id: "study-30", label: "合計30分勉強", current: Math.min(minutes, 30), target: 30, completed: minutes >= 30 },
  ];
};

export const getSetCompletion = (
  unlockedItems: AvatarItem[],
  sets = AVATAR_SETS,
) => {
  const unlockedIds = new Set(unlockedItems.map((item) => item.id));
  return sets.map((set) => ({
    ...set,
    completed: set.itemIds.every((id) => unlockedIds.has(id)),
    ownedCount: set.itemIds.filter((id) => unlockedIds.has(id)).length,
    totalCount: set.itemIds.length,
  }));
};

export const canEquipItem = (
  itemId: string,
  unlockedItems: AvatarItem[],
  items: AvatarItem[] = AVATAR_ITEMS,
) => {
  const item = items.find((candidate) => candidate.id === itemId);
  return !!item && unlockedItems.some((unlocked) => unlocked.id === itemId);
};
