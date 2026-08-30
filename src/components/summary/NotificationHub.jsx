import React, { useEffect, useState } from 'react';
import { useBudget } from '../../contexts/BudgetContext';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import {
  AlertTriangle, AlertOctagon, Bell, TrendingDown,
  CreditCard, Wallet, Eye, CheckCircle2, ChevronRight
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import CategoryModal from '../home/CategoryModal';
import MaskedHeading from '../ui/MaskedHeading';

function AlertCard({ alert, onAction }) {
  const configs = {
    danger: {
      bg: 'bg-red-500/10 border-red-500/25',
      text: 'text-red-400',
      icon: AlertOctagon,
      badge: 'bg-red-500/20 text-red-300',
    },
    warning: {
      bg: 'bg-[#e7b956]/15 border-[#e7b956]/30',
      text: 'text-[#e7b956]',
      icon: AlertTriangle,
      badge: 'bg-[#e7b956]/20 text-[#e7b956]',
    },
    info: {
      bg: 'bg-[#8c6d37]/15 border-[#8c6d37]/30',
      text: 'text-[#a48246]',
      icon: Bell,
      badge: 'bg-[#8c6d37]/20 text-[#a48246]',
    },
    subscription: {
      bg: 'bg-[#8c6d37]/15 border-[#8c6d37]/30',
      text: 'text-[#faf4e8]',
      icon: CreditCard,
      badge: 'bg-[#8c6d37]/25 text-[#faf4e8]',
    },
    unallocated: {
      bg: 'bg-[#2e5b45]/15 border-[#2e5b45]/30',
      text: 'text-[#3a7056]',
      icon: Wallet,
      badge: 'bg-[#2e5b45]/25 text-[#3a7056]',
    },
    large: {
      bg: 'bg-[#e7b956]/15 border-[#e7b956]/30',
      text: 'text-[#e7b956]',
      icon: TrendingDown,
      badge: 'bg-[#e7b956]/20 text-[#e7b956]',
    },
  };

  const cfg = configs[alert.type] || configs.info;
  const Icon = cfg.icon;

  return (
    <div className={`flex items-start space-x-3 p-4 rounded-xl border transition-all hover:border-accent/40 ${cfg.bg}`}>
      <div className={`mt-0.5 shrink-0 ${cfg.text}`}>
        <Icon size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className={`font-semibold text-sm ${cfg.text}`}>{alert.category || alert.title}</h4>
          {alert.tag && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
              {alert.tag}
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 opacity-80 text-zinc-300">{alert.message}</p>
        {alert.cta && (
          <button
            type="button"
            onClick={() => onAction(alert)}
            className={`text-[11px] mt-2 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card/80 hover:bg-card border border-border transition-all cursor-pointer shadow-sm ${cfg.text}`}
          >
            <Eye size={12} />
            <span>{alert.cta}</span>
            <ChevronRight size={12} className="opacity-60" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function NotificationHub() {
  const { categories, categorySpending, transactions, totalIncome, leftToBudget } = useBudget();
  const [alerts, setAlerts] = useState([]);
  
  // Interactive modal states
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);

  useEffect(() => {
    const newAlerts = [];

    // ── 1. Over-budget & approaching-limit alerts ────────────────────────────
    categories.forEach(category => {
      const spent = categorySpending[category.id] || 0;
      const limit = category.limit;
      if (limit === 0) return;

      const percent = (spent / limit) * 100;
      if (percent > 100) {
        newAlerts.push({
          id: `over_${category.id}`,
          type: 'danger',
          categoryObj: category,
          category: category.name,
          tag: 'Over Budget',
          message: `Exceeded limit by ${formatCurrency(spent - limit)} — you've spent ${formatCurrency(spent)} of ${formatCurrency(limit)}.`,
          cta: 'Review spending in this category',
        });
      } else if (percent === 100) {
        newAlerts.push({
          id: `limit_${category.id}`,
          type: 'danger',
          categoryObj: category,
          category: category.name,
          tag: 'Limit Reached',
          message: `Entire ${formatCurrency(limit)} expenditure limit has been spent.`,
          cta: 'Edit budget limit for this category',
        });
      } else if (percent >= 85) {
        newAlerts.push({
          id: `warn_${category.id}`,
          type: 'warning',
          categoryObj: category,
          category: category.name,
          tag: `${Math.round(percent)}% Used`,
          message: `Approaching your ${formatCurrency(limit)} limit — only ${formatCurrency(limit - spent)} remaining.`,
          cta: 'Consider pausing non-essential spending here',
        });
      }
    });

    // ── 2. Large single-expense alert (> 25% of category limit) ─────────────
    transactions.forEach(tx => {
      const cat = categories.find(c => c.id === tx.categoryId);
      if (!cat || !cat.limit) return;
      if (Number(tx.amount) > cat.limit * 0.25) {
        newAlerts.push({
          id: `large_${tx.id}`,
          type: 'large',
          categoryObj: cat,
          category: cat.name,
          tag: 'Large Expense',
          message: `"${tx.description}" — ${formatCurrency(tx.amount)} is more than 25% of your ${cat.name} limit (${formatCurrency(cat.limit)}).`,
          cta: 'Review category limits & expenses',
        });
      }
    });

    // ── 3. Subscription detected ─────────────────────────────────────────────
    const subKeywords = /netflix|spotify|equinox|gym|icloud|apple|hulu|disney|prime|amazon prime|utility|internet|wifi|youtube|hbo|paramount|subscription/i;
    const detectedSubs = transactions.filter(tx => tx.recurring || tx.isSubscription || subKeywords.test(tx.description || ''));
    const subTotal = detectedSubs.reduce((s, t) => s + Number(t.amount), 0);
    setActiveSubscriptions(detectedSubs);

    if (detectedSubs.length > 0) {
      newAlerts.push({
        id: 'subs_overview',
        type: 'subscription',
        title: 'Subscriptions Detected',
        tag: `${detectedSubs.length} Services`,
        message: `You have ${detectedSubs.length} active subscription${detectedSubs.length > 1 ? 's' : ''} totalling ${formatCurrency(subTotal)}/cycle.`,
        cta: 'Review your subscription list',
      });
    }

    // ── 4. Unallocated income ────────────────────────────────────────────────
    if (totalIncome > 0 && leftToBudget > totalIncome * 0.05) {
      newAlerts.push({
        id: 'unallocated',
        type: 'unallocated',
        title: 'Unallocated Income',
        tag: 'Budget Gap',
        message: `${formatCurrency(leftToBudget)} of your income has no category assigned — it won't be tracked or protected.`,
        cta: 'Add a Savings or Emergency Fund category',
      });
    }

    // ── 5. Zero-spend category mid-cycle ──────────────────────────────────
    if (transactions.length > 0) {
      categories.forEach(category => {
        const spent = categorySpending[category.id] || 0;
        const hasTransactions = transactions.some(tx => tx.categoryId === category.id);
        if (spent === 0 && !hasTransactions && category.limit > 0) {
          newAlerts.push({
            id: `zero_${category.id}`,
            type: 'info',
            categoryObj: category,
            category: category.name,
            tag: 'No Activity',
            message: `No expenses recorded yet for ${category.name} (limit: ${formatCurrency(category.limit)}).`,
            cta: 'Is this category still needed?',
          });
        }
      });
    }

    // Sort: danger first, then warning, then others
    const priority = { danger: 0, warning: 1, large: 2, subscription: 3, unallocated: 4, info: 5 };
    newAlerts.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));

    setAlerts(newAlerts);
  }, [categories, categorySpending, transactions, totalIncome, leftToBudget]);

  const handleAlertAction = (alert) => {
    if (alert.type === 'subscription') {
      setIsSubModalOpen(true);
    } else if (alert.type === 'unallocated') {
      setSelectedCategory({ name: 'Savings & Emergency Fund', limit: leftToBudget, color: '#e7b956' });
      setIsCategoryModalOpen(true);
    } else if (alert.categoryObj) {
      setSelectedCategory(alert.categoryObj);
      setIsCategoryModalOpen(true);
    }
  };

  const dangerCount = alerts.filter(a => a.type === 'danger').length;
  const warningCount = alerts.filter(a => a.type === 'warning' || a.type === 'large').length;
  const totalSubAmount = activeSubscriptions.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <Card className="mt-8 border-border">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${dangerCount > 0 ? 'bg-red-500/15 text-red-400' : warningCount > 0 ? 'bg-[#e7b956]/15 text-[#e7b956]' : 'bg-[#2e5b45]/15 text-[#3a7056]'}`}>
            <Bell size={18} />
          </div>
          <div>
            <MaskedHeading
              text="Notification Hub"
              tag="h2"
              reveal="rise"
              trigger="view"
              fillColor="var(--color-text)"
              align="left"
              className="text-xl font-semibold"
            />
            <p className="text-xs text-text-muted mt-0.5">Budget alerts, anomalies & insights</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dangerCount > 0 && (
            <span className="bg-red-500/20 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-500/30 flex items-center gap-1">
              <AlertOctagon size={11} /> {dangerCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="bg-[#e7b956]/20 text-[#e7b956] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#e7b956]/30 flex items-center gap-1">
              <AlertTriangle size={11} /> {warningCount} Warning
            </span>
          )}
          {alerts.length === 0 && (
            <span className="bg-[#2e5b45]/20 text-[#3a7056] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#2e5b45]/30 flex items-center gap-1">
              <CheckCircle2 size={12} /> All Clear
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <div className="w-12 h-12 bg-[#2e5b45]/15 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bell size={22} className="text-[#3a7056]" />
            </div>
            <p className="text-sm font-medium text-[#3a7056]">All budgets look healthy!</p>
            <p className="text-xs mt-1">No alerts or anomalies detected for this cycle.</p>
          </div>
        ) : (
          alerts.map(alert => (
            <AlertCard key={alert.id} alert={alert} onAction={handleAlertAction} />
          ))
        )}
      </div>

      {alerts.length > 0 && (
        <p className="text-[11px] text-text-muted mt-4 text-center">
          {alerts.length} alert{alerts.length > 1 ? 's' : ''} · Click any action button to manage categories or subscriptions
        </p>
      )}

      {/* Category Management Modal */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => { setIsCategoryModalOpen(false); setSelectedCategory(null); }}
        category={selectedCategory}
      />

      {/* Subscriptions List Modal */}
      <Modal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        title="Active Subscription Services"
      >
        <div className="space-y-4">
          <div className="bg-[#8c6d37]/15 border border-[#8c6d37]/30 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <CreditCard size={20} className="text-accent" />
              <div>
                <p className="text-xs text-text-muted">Total Recurring Spend</p>
                <p className="text-lg font-bold text-accent">{formatCurrency(totalSubAmount)} / cycle</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/20 text-accent border border-accent/30">
              {activeSubscriptions.length} Services
            </span>
          </div>

          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {activeSubscriptions.map(sub => (
              <div key={sub.id} className="bg-primary border border-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-text flex items-center gap-1.5">
                    {sub.description}
                    <span className="text-[10px] bg-[#2e5b45]/20 text-[#3a7056] px-1.5 py-0.2 rounded border border-[#2e5b45]/30">Active</span>
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{sub.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-text">{formatCurrency(sub.amount)}</p>
                  <p className="text-[10px] text-accent">Recurring</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setIsSubModalOpen(false)}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-primary font-bold text-xs rounded-lg transition-colors"
          >
            Done Reviewing
          </button>
        </div>
      </Modal>
    </Card>
  );
}
