import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBudget } from '../../contexts/BudgetContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { DollarSign, Briefcase, Calendar, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SalaryModal({ isOpen, onClose }) {
  const { primarySalary, cycleFrequency, dispatch } = useBudget();

  const [formData, setFormData] = useState({
    name: 'Primary Salary',
    amount: '',
    frequency: 'monthly',
  });

  useEffect(() => {
    if (isOpen) {
      if (primarySalary) {
        setFormData({
          name: primarySalary.name || 'Primary Salary',
          amount: primarySalary.amount || '',
          frequency: primarySalary.frequency || 'monthly',
        });
      } else {
        setFormData({
          name: 'Primary Salary',
          amount: '',
          frequency: cycleFrequency || 'monthly',
        });
      }
    }
  }, [isOpen, primarySalary, cycleFrequency]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('Please enter a valid salary amount');
      return;
    }

    const payload = {
      id: primarySalary ? primarySalary.id : 'salary_source',
      name: formData.name || 'Primary Salary',
      amount: Number(formData.amount),
      frequency: formData.frequency,
      isSalary: true,
    };

    dispatch({ type: 'SET_SALARY', payload });
    toast.success(`Salary set to ${formatCurrency(payload.amount)} / ${payload.frequency}`);
    onClose();
  };

  // Estimate per-cycle amount for user preview
  const getCycleEstimate = () => {
    const amt = Number(formData.amount) || 0;
    if (!amt) return 0;
    if (formData.frequency === cycleFrequency) return amt;

    // Quick conversion rules
    let annual = 0;
    if (formData.frequency === 'annual') annual = amt;
    else if (formData.frequency === 'monthly') annual = amt * 12;
    else if (formData.frequency === 'bi-weekly') annual = amt * 26;
    else if (formData.frequency === 'weekly') annual = amt * 52;

    if (cycleFrequency === 'monthly') return annual / 12;
    if (cycleFrequency === 'bi-weekly') return annual / 26;
    if (cycleFrequency === 'weekly') return annual / 52;
    return amt;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Your Salary">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 text-xs text-accent flex items-start space-x-2.5">
          <DollarSign size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Set your primary earning salary</p>
            <p className="text-text-muted text-[11px] mt-0.5">
              This will automatically calculate your cycle budget income and update your financial overview.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-muted mb-1 flex items-center gap-1.5">
            <Briefcase size={14} className="text-text-muted" />
            Salary Label / Source Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Tech Corp Salary, Primary Job"
            className="w-full bg-primary border border-border rounded-lg px-3 py-2.5 text-text focus:outline-none focus:border-accent transition-colors text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1 flex items-center gap-1.5 whitespace-nowrap">
              <DollarSign size={14} className="text-text-muted" />
              Salary Amount
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="w-full bg-primary border border-border rounded-lg px-3 py-2.5 text-text focus:outline-none focus:border-accent transition-colors text-sm font-semibold"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-text-muted mb-1 flex items-center gap-1.5">
              <Calendar size={14} className="text-text-muted" />
              Pay Frequency
            </label>
            <select
              name="frequency"
              value={formData.frequency}
              onChange={handleChange}
              className="w-full bg-primary border border-border rounded-lg px-3 py-2.5 text-text focus:outline-none focus:border-accent transition-colors text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="bi-weekly">Bi-weekly</option>
              <option value="weekly">Weekly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
        </div>

        {/* Live Estimate Card */}
        {Number(formData.amount) > 0 && (
          <div className="bg-primary border border-border rounded-lg p-3 text-xs flex justify-between items-center flex-wrap gap-2">
            <span className="text-text-muted">
              Est. income for your <strong className="text-text capitalize">{cycleFrequency}</strong> cycle:
            </span>
            <span className="font-bold text-[#3a7056] text-sm">
              {formatCurrency(getCycleEstimate())}
            </span>
          </div>
        )}

        <div className="pt-3 flex space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 bg-primary text-text-muted hover:text-text font-medium py-2 rounded-lg hover:bg-[#2b2924] border border-border transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 bg-accent text-primary font-bold py-2 rounded-lg hover:bg-accent-hover transition-colors text-sm flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={16} />
            <span>Save Salary</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
