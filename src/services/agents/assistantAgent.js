/**
 * AI Assistant Agent — Replaces RAG for financial Q&A
 * 
 * Receives the full financial snapshot from the Manager Agent and uses it
 * as direct context for Gemini, enabling accurate answers without vector search.
 * All data is small enough to fit in the context window.
 */

import { GoogleGenAI } from '@google/genai';

let aiInstance = null;

function getAI() {
  const apiKey = import.meta.env.VITE_ASSISTANT_API_KEY
    || import.meta.env.VITE_GEMINI_API_KEY
    || import.meta.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('No Gemini API key configured. Set VITE_ASSISTANT_API_KEY or VITE_GEMINI_API_KEY in .env');
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

// ── Conversation memory (simple sliding window) ──────────────────────────────

const MAX_HISTORY = 10;
let conversationHistory = [];

export function clearConversationHistory() {
  conversationHistory = [];
}

function addToHistory(role, text) {
  conversationHistory.push({ role, text, timestamp: Date.now() });
  if (conversationHistory.length > MAX_HISTORY * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(snapshot) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return `You are a financial assistant embedded in a personal budgeting app. Your job is to help users understand their finances AND give them real, actionable financial advice — not just report back numbers they can already see on screen.

Today is ${today}.

## How to use the data

You will be given the user's budget data (income, expenses, categories, savings, goals, etc.) inside <user_budget_data> tags. Treat this as context about this specific person, not as the boundary of what you're allowed to talk about. You should:

- Reference their actual numbers when relevant ("You're spending $420/mo on dining out, which is about 15% of your income")
- Apply general financial knowledge, best practices, and reasoning that goes beyond what's in the data — budgeting frameworks, debt payoff strategies, savings rate benchmarks, emergency fund sizing, etc.
- Answer general financial questions even if they aren't directly tied to the user's data (e.g. "what's a Roth IRA," "how does the 50/30/20 rule work")

Do not limit yourself to summarizing or restating the data. The data is an input to your reasoning, not a cage around it.

## How to respond

1. Briefly acknowledge what the data shows, if relevant to the question.
2. Give a clear, direct answer or recommendation — don't hedge into vagueness.
3. Ground advice in real financial principles (e.g. "most guidance recommends 3–6 months of expenses in an emergency fund") rather than generic platitudes.
4. Where there are multiple reasonable approaches, briefly mention the tradeoff instead of picking one silently.
5. Keep responses concise and conversational — this is a chat interface, not a report.

## Boundaries

- You are not a licensed financial advisor. For anything involving specific investment decisions, tax filing, or legal/estate matters, give general educational information and suggest the user consult a licensed professional for their specific situation.
- Don't fabricate numbers, account details, or transactions that aren't in the provided data — if you don't have the information needed, say so and ask, rather than guessing.

## Example

User data shows: income $4,200/mo, savings $50/mo, credit card balance $3,000 at 22% APR.

User: "How am I doing?"

Bad response: "You have $4,200 in income and are saving $50 a month with a $3,000 credit card balance."

Good response: "Your savings rate is a bit thin at around 1% of income — most guidance targets 15-20%. But before ramping up savings, that credit card balance is worth prioritizing: at 22% APR, it's costing you roughly $55/month in interest, more than you're currently saving. It's usually worth paying that down aggressively before building savings beyond a small starter emergency fund (~$500–1,000), since guaranteed 22% "return" from paying off debt beats what savings will earn you."

<user_budget_data>
SUMMARY:
• Total Income: $${snapshot.summary.totalIncome}
• Total Spent (current cycle): $${snapshot.summary.totalSpent}
• Total Budget Allocated: $${snapshot.summary.totalAllocated}
• Left to Budget: $${snapshot.summary.leftToBudget}
• Net Balance: $${snapshot.summary.netBalance}
• Total Transactions: ${snapshot.summary.transactionCount}
• Budget Cycle: ${snapshot.summary.cycleFrequency}
${snapshot.summary.currentCycleWindow ? `• Cycle Window: ${snapshot.summary.currentCycleWindow.start} to ${snapshot.summary.currentCycleWindow.end}` : ''}

INCOME SOURCES:
${snapshot.incomeSources.length > 0
    ? snapshot.incomeSources.map(s => `• ${s.name}: $${s.amount} (${s.frequency})`).join('\n')
    : '• No income sources configured'}

BUDGET CATEGORIES (Current Cycle):
${snapshot.categoryBreakdown.length > 0
    ? snapshot.categoryBreakdown.map(c =>
      `• ${c.name}: Spent $${c.spent.toFixed(2)} of $${c.budgetLimit} limit (${c.status}, $${c.remaining.toFixed(2)} remaining)`
    ).join('\n')
    : '• No categories configured'}

TOP MERCHANTS BY SPENDING:
${snapshot.topMerchants.length > 0
    ? snapshot.topMerchants.map((m, i) => `${i + 1}. ${m.name}: $${m.total}`).join('\n')
    : '• No transaction data'}

RECENT TRANSACTIONS (up to 50):
${snapshot.recentTransactions.length > 0
    ? snapshot.recentTransactions.map(t =>
      `• ${t.date} | ${t.description} | $${t.amount} | ${t.category}`
    ).join('\n')
    : '• No transactions recorded'}

MONTHLY SPENDING BY CATEGORY:
${Object.keys(snapshot.monthlySpending).length > 0
    ? Object.entries(snapshot.monthlySpending).map(([month, cats]) =>
      `${month}: ${Object.entries(cats).map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`).join(', ')}`
    ).join('\n')
    : '• No monthly data available'}
</user_budget_data>`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Answer a user's financial question using the complete data snapshot
 */
export async function answerQuery(question, financialSnapshot) {
  const startTime = Date.now();

  try {
    const ai = getAI();
    const systemPrompt = buildSystemPrompt(financialSnapshot);

    // Build conversation context
    const conversationContext = conversationHistory.length > 0
      ? '\n\nPrevious conversation:\n' + conversationHistory
        .slice(-MAX_HISTORY * 2)
        .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`)
        .join('\n')
      : '';

    const fullPrompt = systemPrompt + conversationContext + `\n\nUser question: ${question}`;

    const modelsToTry = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
    let lastError = null;
    let answerText = null;
    let successfulModel = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        });

        answerText = (response.text || '').trim();
        if (answerText) {
          successfulModel = model;
          break;
        }
      } catch (err) {
        console.warn(`[AI Assistant] Model ${model} failed (${err.status || err.name || 'Error'}):`, err.message);
        lastError = err;
      }
    }

    if (!answerText) {
      throw lastError || new Error('All Gemini model fallbacks failed to respond');
    }

    const latencyMs = Date.now() - startTime;

    // Record in conversation history
    addToHistory('user', question);
    addToHistory('assistant', answerText);

    return {
      success: true,
      answer: answerText,
      metrics: {
        latencyMs,
        model: successfulModel,
        dataPointsUsed: financialSnapshot.summary.transactionCount,
        categoriesAnalyzed: financialSnapshot.categoryBreakdown.length,
      },
    };
  } catch (err) {
    console.error('AI Assistant query failed with stack trace:\n', err.stack || err);

    // Fallback: try to answer simple questions from the snapshot directly
    const fallbackAnswer = tryFallbackAnswer(question, financialSnapshot);
    if (fallbackAnswer) {
      return {
        success: true,
        answer: fallbackAnswer,
        metrics: { latencyMs: Date.now() - startTime, dataPointsUsed: 0, categoriesAnalyzed: 0, fallback: true },
      };
    }

    return {
      success: false,
      answer: 'I apologize, but I encountered an error processing your question. Please try again.',
      error: err.message,
      stack: err.stack,
      metrics: { latencyMs: Date.now() - startTime },
    };
  }
}

/**
 * Simple fallback for common questions when AI is unavailable
 */
function tryFallbackAnswer(question, snapshot) {
  const q = question.toLowerCase();

  if (q.includes('total spent') || q.includes('how much') && q.includes('spent')) {
    return `You've spent **$${snapshot.summary.totalSpent.toFixed(2)}** in the current budget cycle.`;
  }

  if (q.includes('income') || q.includes('earn')) {
    return `Your total income is **$${snapshot.summary.totalIncome.toFixed(2)}** per cycle.\n\n${snapshot.incomeSources.map(s => `• ${s.name}: $${s.amount} (${s.frequency})`).join('\n')}`;
  }

  if (q.includes('balance') || q.includes('left')) {
    return `Your net balance is **$${snapshot.summary.netBalance.toFixed(2)}**. You have **$${snapshot.summary.leftToBudget.toFixed(2)}** left to budget.`;
  }

  if (q.includes('budget') || q.includes('category') || q.includes('categories')) {
    return `**Budget Status:**\n${snapshot.categoryBreakdown.map(c =>
      `• ${c.name}: $${c.spent.toFixed(2)} / $${c.budgetLimit} (${c.status})`
    ).join('\n')}`;
  }

  return null;
}

export function getConversationHistory() {
  return [...conversationHistory];
}

/**
 * Analyze a specific transaction for suspicious patterns using Gemini.
 * Called when the user clicks "AI Review" on a flagged transaction.
 */
export async function reviewSuspiciousTransaction(tx, budgetSnapshot) {
  const startTime = Date.now();

  const { transactions = [], categories = [] } = budgetSnapshot;

  // Build context about the category and similar transactions
  const cat = categories.find(c => c.id === tx.categoryId);
  const catName = cat?.name || 'Unknown';
  const catLimit = cat?.limit || 0;

  const similarTxs = transactions
    .filter(t => t.id !== tx.id && t.categoryId === tx.categoryId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10)
    .map(t => `• ${t.date} | ${t.description} | $${t.amount}`);

  const prompt = `You are a financial anomaly detection assistant. Analyze this transaction and determine if it is genuinely suspicious or if it appears to be a normal expense.

Transaction under review:
- Description: "${tx.description}"
- Amount: $${tx.amount}
- Date: ${tx.date}
- Category: ${catName} (limit: $${catLimit})
- Source: ${tx.source || 'manual'}

Recent similar transactions in the same category:
${similarTxs.length > 0 ? similarTxs.join('\n') : '• No prior transactions in this category'}

Possible reasons it was flagged: duplicate within 24h, amount unusually high vs category average, or outlier vs category limit.

Respond in 2 sentences max. Start with either "Looks normal:" or "Suspicious:" and then explain your reasoning clearly and concisely.`;

  try {
    const ai = getAI();
    const modelsToTry = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
    let answerText = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        answerText = (response.text || '').trim();
        if (answerText) break;
      } catch (err) {
        console.warn(`[SuspiciousReview] Model ${model} failed:`, err.message);
        lastError = err;
      }
    }

    if (!answerText) throw lastError || new Error('All Gemini model fallbacks failed to respond');

    const isSuspicious = answerText.toLowerCase().includes('suspicious');
    return {
      verdict: answerText,
      isSuspicious,
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error('[SuspiciousReview] Error:', err);
    return {
      verdict: `Could not complete AI review: ${err.message}`,
      isSuspicious: false,
      latencyMs: Date.now() - startTime,
    };
  }
}
