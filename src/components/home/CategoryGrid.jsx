import React, { useState } from 'react';
import { useBudget } from '../../contexts/BudgetContext';
import { Card } from '../ui/Card';
import CategoryModal from './CategoryModal';
import { formatCurrency } from '../../utils/formatCurrency';
import { Plus, Edit2, Trash2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import MaskedHeading from '../ui/MaskedHeading';

export default function CategoryGrid() {
  const { categories, categorySpending, totalIncome, dispatch } = useBudget();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickFillOpen, setIsQuickFillOpen] = useState(false);

  const handleAddClick = () => {
    setSelectedCategory(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (category) => {
    setSelectedCategory(category);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (e, category) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${category.name}"?`)) {
      dispatch({ type: 'DELETE_CATEGORY', payload: category.id });
      toast.success('Category deleted');
    }
  };

  const QUICK_FILL_TEMPLATES = {
    '50_30_20': {
      label: '50/30/20 Rule',
      description: '50% Needs · 30% Wants · 20% Savings',
      splits: [
        { name: 'Rent / Housing',    percent: 0.30, color: '#8c6d37', endOfCycleAction: 'none' },
        { name: 'Groceries',         percent: 0.10, color: '#2e5b45', endOfCycleAction: 'none' },
        { name: 'Bills & Utilities', percent: 0.10, color: '#e7b956', endOfCycleAction: 'none' },
        { name: 'Dining Out',        percent: 0.10, color: '#a48246', endOfCycleAction: 'none' },
        { name: 'Entertainment',     percent: 0.10, color: '#3a7056', endOfCycleAction: 'none' },
        { name: 'Shopping',          percent: 0.10, color: '#d5a643', endOfCycleAction: 'none' },
        { name: 'Savings',           percent: 0.20, color: '#e7b956', endOfCycleAction: 'rollover' },
      ],
    },
    survivor: {
      label: 'Paycheck Survivor',
      description: 'Essentials-first for tight budgets',
      splits: [
        { name: 'Rent / Housing',    percent: 0.35, color: '#8c6d37', endOfCycleAction: 'none' },
        { name: 'Groceries',         percent: 0.15, color: '#2e5b45', endOfCycleAction: 'none' },
        { name: 'Bills & Utilities', percent: 0.20, color: '#e7b956', endOfCycleAction: 'none' },
        { name: 'Transport / Gas',   percent: 0.10, color: '#a48246', endOfCycleAction: 'none' },
        { name: 'Emergency Fund',    percent: 0.10, color: '#e7b956', endOfCycleAction: 'rollover' },
        { name: 'Personal',          percent: 0.10, color: '#3a7056', endOfCycleAction: 'none' },
      ],
    },
    student: {
      label: 'Student / Entry-Level',
      description: 'Built for low-income starting out',
      splits: [
        { name: 'Rent / Housing',    percent: 0.40, color: '#8c6d37', endOfCycleAction: 'none' },
        { name: 'Food & Groceries',  percent: 0.20, color: '#2e5b45', endOfCycleAction: 'none' },
        { name: 'Transport',         percent: 0.10, color: '#a48246', endOfCycleAction: 'none' },
        { name: 'Subscriptions',     percent: 0.05, color: '#3a7056', endOfCycleAction: 'none' },
        { name: 'Entertainment',     percent: 0.10, color: '#e7b956', endOfCycleAction: 'none' },
        { name: 'Savings',           percent: 0.15, color: '#d5a643', endOfCycleAction: 'rollover' },
      ],
    },
    aggressive: {
      label: 'Aggressive Saver',
      description: 'Maximize savings & investments',
      splits: [
        { name: 'Savings',           percent: 0.30, color: '#e7b956', endOfCycleAction: 'rollover' },
        { name: 'Investments',       percent: 0.10, color: '#2e5b45', endOfCycleAction: 'rollover' },
        { name: 'Rent / Housing',    percent: 0.30, color: '#8c6d37', endOfCycleAction: 'none' },
        { name: 'Food & Groceries',  percent: 0.15, color: '#d5a643', endOfCycleAction: 'none' },
        { name: 'Fun & Social',      percent: 0.10, color: '#a48246', endOfCycleAction: 'none' },
        { name: 'Miscellaneous',     percent: 0.05, color: '#38342e', endOfCycleAction: 'none' },
      ],
    },
    family: {
      label: 'Family Budget',
      description: 'For households with dependants',
      splits: [
        { name: 'Rent / Mortgage',   percent: 0.30, color: '#8c6d37', endOfCycleAction: 'none' },
        { name: 'Groceries',         percent: 0.20, color: '#2e5b45', endOfCycleAction: 'none' },
        { name: 'Childcare / School',percent: 0.15, color: '#a48246', endOfCycleAction: 'none' },
        { name: 'Transport',         percent: 0.10, color: '#3a7056', endOfCycleAction: 'none' },
        { name: 'Bills & Utilities', percent: 0.10, color: '#e7b956', endOfCycleAction: 'none' },
        { name: 'Entertainment',     percent: 0.05, color: '#d5a643', endOfCycleAction: 'none' },
        { name: 'Emergency Fund',    percent: 0.10, color: '#2e5b45', endOfCycleAction: 'rollover' },
      ],
    },
  };

  const handleQuickFill = (templateKey) => {
    if (totalIncome === 0) {
      toast.error('Set up your income first to use Quick-Fill.');
      setIsQuickFillOpen(false);
      return;
    }

    const template = QUICK_FILL_TEMPLATES[templateKey];
    if (!template) return;

    // Smart merge: update existing matching category limits or add new ones without duplicates
    const updatedCategories = [...categories];

    template.splits.forEach(split => {
      const splitNameNorm = split.name.trim().toLowerCase();
      const existingIndex = updatedCategories.findIndex(c => {
        const catNorm = c.name.trim().toLowerCase();
        return catNorm === splitNameNorm || catNorm.includes(splitNameNorm) || splitNameNorm.includes(catNorm);
      });

      const newLimit = Math.round(totalIncome * split.percent);

      if (existingIndex >= 0) {
        updatedCategories[existingIndex] = {
          ...updatedCategories[existingIndex],
          limit: newLimit,
          color: split.color || updatedCategories[existingIndex].color,
          endOfCycleAction: split.endOfCycleAction || updatedCategories[existingIndex].endOfCycleAction,
        };
      } else {
        updatedCategories.push({
          id: `qf-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name: split.name,
          limit: newLimit,
          color: split.color,
          endOfCycleAction: split.endOfCycleAction,
        });
      }
    });

    dispatch({ type: 'REPLACE_CATEGORIES', payload: updatedCategories });
    toast.success(`"${template.label}" template applied!`);
    setIsQuickFillOpen(false);
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MaskedHeading
          text="Category Expenditure"
          tag="h2"
          reveal="rise"
          trigger="view"
          fillColor="var(--color-text)"
          align="left"
          className="text-xl font-semibold"
        />
        <div className="flex space-x-2 relative">
          <div className="relative">
            <button
              onClick={() => setIsQuickFillOpen(!isQuickFillOpen)}
              className="flex items-center space-x-1 text-sm bg-zinc-800 text-text px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors font-medium border border-zinc-700"
            >
              <span>Quick-Fill</span>
              <ChevronDown size={14} />
            </button>
            
            {isQuickFillOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-[#18181b] border border-zinc-800 rounded-xl shadow-xl z-20 py-1 overflow-hidden">
                {Object.entries(QUICK_FILL_TEMPLATES).map(([key, tpl]) => (
                  <button
                    key={key}
                    onClick={() => handleQuickFill(key)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors text-text border-b border-zinc-800/60 last:border-b-0"
                  >
                    <div className="font-medium">{tpl.label}</div>
                    <div className="text-xs text-text-muted mt-0.5">{tpl.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={handleAddClick}
            className="flex items-center space-x-1 text-sm bg-accent text-primary px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {isQuickFillOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setIsQuickFillOpen(false)} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => {
          const spent = categorySpending[category.id] || 0;
          const remaining = category.limit - spent;
          const percentUsed = Math.min(100, Math.round((spent / category.limit) * 100)) || 0;

          return (
            <Card key={category.id} className="group relative overflow-hidden flex flex-col">
              <div 
                className="absolute top-0 left-0 w-1 h-full" 
                style={{ backgroundColor: category.color }}
              />
              
              <div className="flex justify-between items-start mb-4 pl-2">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                  <h3 className="font-medium text-text">{category.name}</h3>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleEditClick(category); }}
                    title="Edit Category"
                    className="p-1.5 text-zinc-400 hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 transition-all rounded-md hover:bg-zinc-800 focus:opacity-100"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteClick(e, category)}
                    title="Delete Category"
                    className="p-1.5 text-zinc-400 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-all rounded-md hover:bg-red-500/10 focus:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-1 mb-4 pl-2 flex-grow">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Planned</span>
                  <span className="text-text font-medium">{formatCurrency(category.limit)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Spent</span>
                  <span className="font-medium" style={{ color: category.color }}>{formatCurrency(spent)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-zinc-800/50 mt-1">
                  <span className="text-text-muted">Remaining</span>
                  <span className={`font-medium ${remaining < 0 ? 'text-red-400' : 'text-[#3a7056]'}`}>
                    {remaining < 0 ? 'Over: ' : ''}{formatCurrency(Math.abs(remaining))}
                  </span>
                </div>
              </div>
              
              <div className="pl-2">
                {/* Progress bar */}
                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden flex items-center mb-1">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${percentUsed > 100 ? 'bg-red-500' : 'bg-accent'}`}
                    style={{ width: `${Math.min(100, percentUsed)}%` }}
                  />
                </div>
                <div className="text-[10px] text-right text-text-muted">{percentUsed}%</div>
              </div>
            </Card>
          );
        })}

        {categories.length === 0 && (
          <div className="col-span-full py-8 text-center border border-dashed border-zinc-700 rounded-xl">
            <p className="text-text-muted mb-2">No expenditure categories yet.</p>
            <button
              onClick={handleAddClick}
              className="text-accent hover:underline text-sm"
            >
              Create your first category
            </button>
          </div>
        )}
      </div>

      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        category={selectedCategory}
      />
    </div>
  );
}
