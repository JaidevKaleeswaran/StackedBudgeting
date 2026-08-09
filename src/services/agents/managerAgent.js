/**
 * Manager Agent — Central orchestrator for transaction processing
 * 
 * Responsibilities:
 * 1. Receives raw transaction data from Voice Agent or Receipt Scanner Agent
 * 2. Uses Gemini Flash to intelligently categorize transactions
 * 3. Matches to user's existing BudgetContext categories
 * 4. Builds complete financial snapshots for the AI Assistant Agent
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance = null;

function getAI() {
  const apiKey = import.meta.env.VITE_MANAGER_API_KEY
    || import.meta.env.VITE_ASSISTANT_API_KEY
    || import.meta.env.VITE_GEMINI_API_KEY
    || import.meta.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('No Gemini API key configured. Set VITE_MANAGER_API_KEY, VITE_ASSISTANT_API_KEY, or VITE_GEMINI_API_KEY in .env');
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ── Category matching ────────────────────────────────────────────────────────

const CATEGORY_MAPPING = {
  // Fast food & restaurants
  'taco bell': 'Food', 'mcdonalds': 'Food', "mcdonald's": 'Food', 'burger king': 'Food',
  'wendy': 'Food', 'chipotle': 'Food', 'subway': 'Food', 'dominos': 'Food',
  "domino's": 'Food', 'pizza hut': 'Food', 'kfc': 'Food', 'chick-fil-a': 'Food',
  'popeyes': 'Food', 'starbucks': 'Food', 'dunkin': 'Food', 'panera': 'Food',
  'panda express': 'Food', 'five guys': 'Food', 'in-n-out': 'Food',
  'restaurant': 'Food', 'dining': 'Food', 'food': 'Food', 'eat': 'Food',
  'lunch': 'Food', 'dinner': 'Food', 'breakfast': 'Food', 'coffee': 'Food',
  'cafe': 'Food', 'bakery': 'Food', 'doordash': 'Food', 'ubereats': 'Food',
  'uber eats': 'Food', 'grubhub': 'Food', 'postmates': 'Food',

  // Groceries
  'walmart': 'Groceries', 'target': 'Groceries', 'costco': 'Groceries',
  'kroger': 'Groceries', 'safeway': 'Groceries', 'whole foods': 'Groceries',
  'trader joe': 'Groceries', "trader joe's": 'Groceries', 'aldi': 'Groceries',
  'publix': 'Groceries', 'heb': 'Groceries', 'grocery': 'Groceries',
  'groceries': 'Groceries', 'market': 'Groceries', 'supermarket': 'Groceries',

  // Entertainment
  'netflix': 'Entertainment', 'hulu': 'Entertainment', 'disney': 'Entertainment',
  'spotify': 'Entertainment', 'apple music': 'Entertainment', 'movie': 'Entertainment',
  'movies': 'Entertainment', 'cinema': 'Entertainment', 'theater': 'Entertainment',
  'concert': 'Entertainment', 'game': 'Entertainment', 'gaming': 'Entertainment',
  'playstation': 'Entertainment', 'xbox': 'Entertainment', 'nintendo': 'Entertainment',
  'steam': 'Entertainment', 'twitch': 'Entertainment', 'youtube premium': 'Entertainment',

  // Bills & Utilities
  'electric': 'Bills', 'electricity': 'Bills', 'water': 'Bills', 'gas bill': 'Bills',
  'internet': 'Bills', 'wifi': 'Bills', 'phone bill': 'Bills', 'rent': 'Bills',
  'mortgage': 'Bills', 'insurance': 'Bills', 'utility': 'Bills', 'utilities': 'Bills',
  'at&t': 'Bills', 'verizon': 'Bills', 't-mobile': 'Bills', 'comcast': 'Bills',
  'xfinity': 'Bills', 'spectrum': 'Bills',

  // Transport
  'gas': 'Transport', 'fuel': 'Transport', 'uber': 'Transport', 'lyft': 'Transport',
  'parking': 'Transport', 'toll': 'Transport', 'bus': 'Transport', 'train': 'Transport',
  'metro': 'Transport', 'subway ride': 'Transport', 'shell': 'Transport',
  'chevron': 'Transport', 'exxon': 'Transport', 'bp': 'Transport',

  // Shopping
  'amazon': 'Shopping', 'ebay': 'Shopping', 'mall': 'Shopping', 'clothes': 'Shopping',
  'clothing': 'Shopping', 'shoes': 'Shopping', 'nike': 'Shopping', 'adidas': 'Shopping',
  'zara': 'Shopping', 'h&m': 'Shopping', 'ikea': 'Shopping', 'best buy': 'Shopping',
  'apple store': 'Shopping',

  // Health
  'doctor': 'Health', 'hospital': 'Health', 'pharmacy': 'Health', 'cvs': 'Health',
  'walgreens': 'Health', 'gym': 'Health', 'fitness': 'Health', 'dentist': 'Health',
  'medical': 'Health', 'prescription': 'Health', 'equinox': 'Health',
};

/**
 * Quick local category match before falling back to AI
 */
function quickCategoryMatch(description) {
  const lower = (description || '').toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_MAPPING)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }
  return null;
}

/**
 * Match a category name to the user's existing BudgetContext categories
 * Returns the categoryId if found, or the first category's id as fallback
 */
function matchToUserCategory(suggestedCategory, userCategories) {
  if (!userCategories || userCategories.length === 0) return null;

  const lower = (suggestedCategory || '').toLowerCase();

  // Exact name match
  const exact = userCategories.find(c => c.name.toLowerCase() === lower);
  if (exact) return exact.id;

  // Partial match
  const partial = userCategories.find(c =>
    c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
  );
  if (partial) return partial.id;

  // Cross-mapping: "Food" might match "Groceries" category
  const crossMap = {
    'food': ['groceries', 'food', 'dining', 'restaurant'],
    'groceries': ['groceries', 'food', 'shopping'],
    'entertainment': ['entertainment', 'fun', 'leisure'],
    'bills': ['bills', 'utilities', 'rent'],
    'transport': ['transport', 'transportation', 'travel', 'gas'],
    'shopping': ['shopping', 'retail', 'clothes'],
    'health': ['health', 'medical', 'fitness', 'gym'],
  };

  for (const [key, synonyms] of Object.entries(crossMap)) {
    if (synonyms.includes(lower)) {
      const match = userCategories.find(c =>
        synonyms.some(s => c.name.toLowerCase().includes(s)) ||
        c.name.toLowerCase().includes(key)
      );
      if (match) return match.id;
    }
  }

  // Fallback to first category
  return userCategories[0].id;
}

// ── AI-powered categorization ─────────────────────────────────────────────────

async function aiCategorize(description, amount, userCategoryNames) {
  try {
    const ai = getAI();
    const prompt = `You are a financial transaction categorizer. Given this transaction, return ONLY the category name that best fits.

Available categories: ${userCategoryNames.join(', ')}

Transaction: "${description}" for $${amount}

Rules:
- Return ONLY the category name, nothing else
- Choose the most specific matching category from the available list
- If no good match, return the closest one`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    return (response.text || '').trim();
  } catch (err) {
    console.warn('AI categorization failed, using fallback:', err.message);
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Process a transaction from Voice Agent or Receipt Scanner Agent
 * Categorizes it and dispatches to BudgetContext
 */
export async function processTransaction({ description, amount, date, merchant, lineItems, raw_transcript, rawTranscript }, budgetState, dispatch) {
  const categories = budgetState?.categories || [];
  const categoryNames = categories.map(c => c.name);
  const merchantOrDesc = merchant || description || 'Unknown Purchase';
  const txAmount = Number(amount) || 0;
  const txDate = date || new Date().toISOString().split('T')[0];
  const userRawTranscript = raw_transcript || rawTranscript || (description && description.includes('Voice receipt:') ? description : null);

  // Step 1: Try quick local match first
  let suggestedCategory = quickCategoryMatch(merchantOrDesc);

  // Step 2: If no local match, use AI categorization
  if (!suggestedCategory && categoryNames.length > 0) {
    suggestedCategory = await aiCategorize(merchantOrDesc, txAmount, categoryNames);
  }

  // Step 3: Match to user's actual category IDs
  const categoryId = matchToUserCategory(suggestedCategory || 'General', categories);

  // Step 4: Build and dispatch the transaction
  const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const transaction = {
    id: txId,
    amount: txAmount,
    categoryId,
    description: merchantOrDesc,
    date: txDate,
    source: merchant ? 'ai_agent' : 'voice_agent',
    raw_transcript: userRawTranscript,
    line_items: lineItems || null,
  };

  dispatch({ type: 'ADD_TRANSACTION', payload: transaction });

  // Step 5: Dispatch Voice Log entry (Option 2 Audit Store)
  if (userRawTranscript || !merchant) {
    const voiceLog = {
      id: `vlog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      displayTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      rawTranscript: userRawTranscript || merchantOrDesc,
      extracted: {
        merchant: merchantOrDesc,
        amount: txAmount,
        date: txDate,
        category: categories.find(c => c.id === categoryId)?.name || 'General',
      },
      transactionId: txId,
      source: 'elevenlabs_conversational_voice',
    };

    dispatch({ type: 'ADD_VOICE_LOG', payload: voiceLog });
  }

  // Return the processed transaction info
  const matchedCategory = categories.find(c => c.id === categoryId);
  return {
    success: true,
    transaction,
    category: matchedCategory?.name || 'Unknown',
    message: `Added $${txAmount.toFixed(2)} for "${merchantOrDesc}" under ${matchedCategory?.name || 'General'}`,
  };
}

/**
 * Build a complete financial snapshot for the AI Assistant Agent
 * This replaces RAG — all data fits in the LLM context window
 */
export function buildFinancialSnapshot(budgetState) {
  const {
    categories = [],
    transactions = [],
    incomeSources = [],
    totalIncome = 0,
    totalSpent = 0,
    totalAllocated = 0,
    leftToBudget = 0,
    categorySpending = {},
    currentCycleWindow,
    cycleFrequency = 'monthly',
  } = budgetState;

  // Spending by category
  const categoryBreakdown = categories.map(cat => ({
    name: cat.name,
    budgetLimit: cat.limit,
    spent: categorySpending[cat.id] || 0,
    remaining: cat.limit - (categorySpending[cat.id] || 0),
    status: (categorySpending[cat.id] || 0) > cat.limit ? 'OVER BUDGET' : 'Under Budget',
    color: cat.color,
  }));

  // Recent transactions (last 50 for context)
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50)
    .map(tx => {
      const cat = categories.find(c => c.id === tx.categoryId);
      return {
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        category: cat?.name || 'Unknown',
      };
    });

  // Top merchants by spending
  const merchantTotals = {};
  transactions.forEach(tx => {
    const key = tx.description || 'Unknown';
    merchantTotals[key] = (merchantTotals[key] || 0) + Number(tx.amount);
  });
  const topMerchants = Object.entries(merchantTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, total]) => ({ name, total: Number(total.toFixed(2)) }));

  // Monthly spending by category (for trend analysis)
  const monthlySpending = {};
  transactions.forEach(tx => {
    const month = tx.date ? tx.date.substring(0, 7) : 'unknown';
    if (!monthlySpending[month]) monthlySpending[month] = {};
    const cat = categories.find(c => c.id === tx.categoryId);
    const catName = cat?.name || 'Unknown';
    monthlySpending[month][catName] = (monthlySpending[month][catName] || 0) + Number(tx.amount);
  });

  return {
    summary: {
      totalIncome: Number(totalIncome.toFixed(2)),
      totalSpent: Number(totalSpent.toFixed(2)),
      totalAllocated: Number(totalAllocated.toFixed(2)),
      leftToBudget: Number(leftToBudget.toFixed(2)),
      netBalance: Number((totalIncome - totalSpent).toFixed(2)),
      transactionCount: transactions.length,
      cycleFrequency,
      currentCycleWindow: currentCycleWindow ? {
        start: currentCycleWindow.start,
        end: currentCycleWindow.end,
      } : null,
    },
    incomeSources: incomeSources.map(s => ({
      name: s.name,
      amount: s.amount,
      frequency: s.frequency,
    })),
    categoryBreakdown,
    recentTransactions,
    topMerchants,
    monthlySpending,
  };
}
