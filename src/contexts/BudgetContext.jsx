import React, { createContext, useReducer, useContext, useEffect } from 'react';
import { normalizeToMasterCycle, getCycleWindow, isWithinCycle } from '../utils/cycleUtils';

const STORAGE_KEY = 'arca_budget_state';
const LEGACY_STORAGE_KEY = 'stacked_budget_state';

// Default fallback state
const defaultState = {
  incomeSources: [],
  cycleStartDate: null, // ISO date string — anchor for pay-cycle window
  cycleFrequency: 'monthly', // The master cycle the budget operates on
  categories: [
    { id: '1', name: 'Bills', limit: 1000, color: '#e7b956', endOfCycleAction: 'none' },
    { id: '2', name: 'Groceries', limit: 400, color: '#2e5b45', endOfCycleAction: 'none' },
    { id: '3', name: 'Entertainment', limit: 200, color: '#8c6d37', endOfCycleAction: 'none' },
  ],
  transactions: [],
  voiceLogs: [],
  chatMessages: [],
};

// Helper to eliminate duplicate categories by name & preserve transaction links
function sanitizeState(state) {
  if (!state || !Array.isArray(state.categories)) return state;

  const seenCategories = new Map();
  const idMap = new Map();
  const cleanedCategories = [];

  for (const cat of state.categories) {
    if (!cat || !cat.name) continue;
    const normName = cat.name.trim().toLowerCase();

    if (seenCategories.has(normName)) {
      const canonical = seenCategories.get(normName);
      idMap.set(cat.id, canonical.id);
      canonical.limit = Math.max(Number(canonical.limit) || 0, Number(cat.limit) || 0);
    } else {
      const cleanCat = { ...cat, name: cat.name.trim() };
      seenCategories.set(normName, cleanCat);
      cleanedCategories.push(cleanCat);
    }
  }

  let cleanedTransactions = state.transactions || [];
  if (idMap.size > 0 && Array.isArray(state.transactions)) {
    cleanedTransactions = state.transactions.map((tx) => {
      if (idMap.has(tx.categoryId)) {
        return { ...tx, categoryId: idMap.get(tx.categoryId) };
      }
      return tx;
    });
  }

  let cleanedMessages = state.chatMessages || [];
  if (Array.isArray(state.chatMessages)) {
    const seenMsgIds = new Set();
    let welcomeSeen = false;
    cleanedMessages = [];
    for (const msg of state.chatMessages) {
      if (!msg) continue;
      const isWelcome = msg.id === 'msg_welcome' || (msg.text && msg.text.includes("AI Financial Assistant"));
      if (isWelcome) {
        if (welcomeSeen) continue;
        welcomeSeen = true;
      } else if (msg.id) {
        if (seenMsgIds.has(msg.id)) continue;
        seenMsgIds.add(msg.id);
      }
      cleanedMessages.push(msg);
    }
  }

  return {
    ...state,
    categories: cleanedCategories,
    transactions: cleanedTransactions,
    chatMessages: cleanedMessages,
  };
}

export function getStorageKey(uid) {
  if (!uid || uid === 'usr_arca_guest') return 'arca_budget_state_guest';
  return `arca_budget_state_${uid}`;
}

// Initial state loaded from localStorage if available
const getInitialState = () => {
  try {
    const savedKey = localStorage.getItem('arca_last_active_user');
    const storageKey = getStorageKey(savedKey);
    const saved = localStorage.getItem(storageKey) || localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return sanitizeState({
        ...defaultState,
        ...parsed,
        categories: parsed.categories && parsed.categories.length > 0 ? parsed.categories : defaultState.categories,
      });
    }
  } catch (e) {
    console.warn('Failed to load budget state from localStorage:', e);
  }
  return sanitizeState(defaultState);
};

const BudgetContext = createContext();

function budgetReducer(state, action) {
  switch (action.type) {
    case 'ADD_INCOME_SOURCE':
      return { ...state, incomeSources: [...state.incomeSources, action.payload] };
    case 'UPDATE_INCOME_SOURCE':
      return {
        ...state,
        incomeSources: state.incomeSources.map((source) =>
          source.id === action.payload.id ? { ...source, ...action.payload } : source
        ),
      };
    case 'DELETE_INCOME_SOURCE':
      return {
        ...state,
        incomeSources: state.incomeSources.filter((source) => source.id !== action.payload),
      };
    case 'SET_SALARY': {
      const salarySource = {
        id: action.payload.id || 'salary_source',
        name: action.payload.name || 'Primary Salary',
        amount: Number(action.payload.amount),
        frequency: action.payload.frequency || 'monthly',
        isBorrowed: false,
        isSalary: true,
      };

      const existingIndex = state.incomeSources.findIndex(
        (s) => s.isSalary || s.id === 'salary_source' || s.name?.toLowerCase() === 'primary salary' || s.name?.toLowerCase() === 'salary'
      );

      let updatedSources;
      if (existingIndex >= 0) {
        updatedSources = [...state.incomeSources];
        updatedSources[existingIndex] = { ...updatedSources[existingIndex], ...salarySource };
      } else {
        updatedSources = [salarySource, ...state.incomeSources];
      }

      return {
        ...state,
        incomeSources: updatedSources,
      };
    }
    case 'SET_CYCLE_CONFIG':
      return {
        ...state,
        cycleStartDate: action.payload.cycleStartDate !== undefined ? action.payload.cycleStartDate : state.cycleStartDate,
        cycleFrequency: action.payload.cycleFrequency !== undefined ? action.payload.cycleFrequency : state.cycleFrequency,
      };
    case 'ADD_CATEGORY':
      return sanitizeState({ ...state, categories: [...state.categories, action.payload] });
    case 'UPDATE_CATEGORY':
      return sanitizeState({
        ...state,
        categories: state.categories.map((cat) =>
          cat.id === action.payload.id ? { ...cat, ...action.payload } : cat
        ),
      });
    case 'DELETE_CATEGORY':
      return {
        ...state,
        categories: state.categories.filter((cat) => cat.id !== action.payload),
      };
    case 'REPLACE_CATEGORIES':
      return sanitizeState({
        ...state,
        categories: action.payload,
      });
    case 'ADD_TRANSACTION': {
      const newTx = {
        receipt_image_url: null,
        line_items: null,
        source: 'manual',
        ...action.payload,
      };
      return { ...state, transactions: [newTx, ...state.transactions] };
    }
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map((tx) =>
          tx.id === action.payload.id ? { ...tx, ...action.payload } : tx
        ),
      };
    case 'DELETE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.filter((tx) => tx.id !== action.payload),
      };
    case 'ADD_VOICE_LOG':
      return {
        ...state,
        voiceLogs: [action.payload, ...(state.voiceLogs || [])],
      };
    case 'CLEAR_VOICE_LOGS':
      return {
        ...state,
        voiceLogs: [],
      };
    case 'ADD_CHAT_MESSAGE': {
      const existingMessages = state.chatMessages || [];
      if (action.payload?.id && existingMessages.some((msg) => msg.id === action.payload.id)) {
        return state;
      }
      return {
        ...state,
        chatMessages: [...existingMessages, action.payload],
      };
    }
    case 'CLEAR_CHAT_MESSAGES':
      return {
        ...state,
        chatMessages: [],
      };
    case 'SET_FULL_STATE': {
      const incoming = action.payload || {};

      // Merge transactions by id (preserve local transactions & remote transactions)
      const txMap = new Map();
      (state?.transactions || []).forEach((tx) => {
        if (tx?.id) txMap.set(tx.id, tx);
      });
      (incoming.transactions || []).forEach((tx) => {
        if (tx?.id) txMap.set(tx.id, tx);
      });

      // Merge categories by normalized name
      const catMap = new Map();
      (defaultState.categories || []).forEach((cat) => {
        if (cat?.name) catMap.set(cat.name.trim().toLowerCase(), cat);
      });
      (state?.categories || []).forEach((cat) => {
        if (cat?.name) catMap.set(cat.name.trim().toLowerCase(), cat);
      });
      (incoming.categories || []).forEach((cat) => {
        if (cat?.name) catMap.set(cat.name.trim().toLowerCase(), cat);
      });

      // Merge income sources by id or name
      const sourceMap = new Map();
      (state?.incomeSources || []).forEach((src) => {
        const key = src?.id || src?.name;
        if (key) sourceMap.set(key, src);
      });
      (incoming.incomeSources || []).forEach((src) => {
        const key = src?.id || src?.name;
        if (key) sourceMap.set(key, src);
      });

      // Merge voice logs
      const logMap = new Map();
      (state?.voiceLogs || []).forEach((log) => {
        const key = log?.id || log?.timestamp;
        if (key) logMap.set(key, log);
      });
      (incoming.voiceLogs || []).forEach((log) => {
        const key = log?.id || log?.timestamp;
        if (key) logMap.set(key, log);
      });

      // Merge chat messages by id
      const msgMap = new Map();
      (state?.chatMessages || []).forEach((msg) => {
        if (msg?.id) msgMap.set(msg.id, msg);
      });
      (incoming.chatMessages || []).forEach((msg) => {
        if (msg?.id) msgMap.set(msg.id, msg);
      });

      return sanitizeState({
        ...defaultState,
        ...state,
        ...incoming,
        categories: Array.from(catMap.values()),
        transactions: Array.from(txMap.values()),
        incomeSources: Array.from(sourceMap.values()),
        voiceLogs: Array.from(logMap.values()),
        chatMessages: Array.from(msgMap.values()),
      });
    }
    case 'RESET_STATE':
      return sanitizeState(defaultState);

    default:
      return state;
  }
}

export function BudgetProvider({ children }) {
  const [state, dispatch] = useReducer(budgetReducer, null, getInitialState);

  // Sync state to localStorage on changes
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('arca_last_active_user');
      const storageKey = getStorageKey(savedKey);
      localStorage.setItem(storageKey, JSON.stringify(state));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save budget state to localStorage:', e);
    }
  }, [state]);

  // Calculate normalized total income
  const totalIncome = state.incomeSources.reduce((sum, source) => {
    return sum + normalizeToMasterCycle(source.amount, source.frequency, state.cycleFrequency);
  }, 0);

  // Determine current cycle window
  const cycleWindow = getCycleWindow(state.cycleStartDate, state.cycleFrequency);

  // Filter transactions to the current cycle
  const currentCycleTransactions = state.transactions.filter(tx => isWithinCycle(tx.date, cycleWindow));

  // Calculate totals for the current cycle
  const totalSpent = currentCycleTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const totalAllocated = state.categories.reduce((sum, cat) => sum + Number(cat.limit), 0);
  const leftToBudget = totalIncome - totalAllocated;

  // Calculate spent per category (summing all transactions assigned to that category)
  const categorySpending = state.categories.reduce((acc, cat) => {
    acc[cat.id] = state.transactions
      .filter((tx) => tx.categoryId === cat.id)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    return acc;
  }, {});

  // Find primary salary income source if present
  const primarySalary = state.incomeSources.find(
    (s) => s.isSalary || s.id === 'salary_source' || s.name?.toLowerCase() === 'primary salary' || s.name?.toLowerCase() === 'salary'
  ) || null;

  const value = {
    ...state,
    dispatch,
    primarySalary,
    totalIncome,
    totalSpent,
    totalAllocated,
    leftToBudget,
    categorySpending,
    currentCycleWindow: cycleWindow,
  };


  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget() {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return context;
}
