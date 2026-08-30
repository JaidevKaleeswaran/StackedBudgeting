import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBudget } from '../../contexts/BudgetContext';
import toast from 'react-hot-toast';

export default function IncomeSourceModal({ isOpen, onClose, source = null }) {
  const { dispatch } = useBudget();
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    frequency: 'monthly',
    isBorrowed: false,
  });

  const isEditing = !!source;

  useEffect(() => {
    if (isOpen) {
      if (source) {
        setFormData({
          name: source.name,
          amount: source.amount,
          frequency: source.frequency,
          isBorrowed: source.isBorrowed || false,
        });
      } else {
        setFormData({ name: '', amount: '', frequency: 'monthly', isBorrowed: false });
      }
    }
  }, [isOpen, source]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const payload = {
      name: formData.name,
      amount: Number(formData.amount),
      frequency: formData.frequency,
      isBorrowed: formData.isBorrowed,
    };

    if (isEditing) {
      dispatch({ type: 'UPDATE_INCOME_SOURCE', payload: { ...payload, id: source.id } });
      toast.success('Income source updated');
    } else {
      dispatch({ type: 'ADD_INCOME_SOURCE', payload: { ...payload, id: Date.now().toString() } });
      toast.success('Income source added');
    }
    
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this income source?')) {
      dispatch({ type: 'DELETE_INCOME_SOURCE', payload: source.id });
      toast.success('Income source deleted');
      onClose();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isEditing ? 'Edit Income Source' : 'Add Income Source'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-text-muted mb-1">Source Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
            placeholder="e.g. Primary Job"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Amount</label>
          <input
            type="number"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-text-muted mb-1">Frequency</label>
          <select
            name="frequency"
            value={formData.frequency}
            onChange={handleChange}
            className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
          >
            <option value="weekly">Weekly</option>
            <option value="bi-weekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="one-time">One-time</option>
          </select>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <input
            type="checkbox"
            id="isBorrowedModal"
            name="isBorrowed"
            checked={formData.isBorrowed}
            onChange={handleChange}
            className="w-4 h-4 rounded border-zinc-700 text-accent bg-[#09090b] focus:ring-accent focus:ring-offset-[#18181b]"
          />
          <label htmlFor="isBorrowedModal" className="text-sm text-text-muted select-none cursor-pointer">
            Is this money borrowed? (Needs to be paid back)
          </label>
        </div>

        <div className="pt-4 flex space-x-3">
          <button
            type="submit"
            className="flex-1 bg-accent text-primary font-medium py-2 rounded-lg hover:bg-accent-hover transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Add Source'}
          </button>
          
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 bg-red-500/10 text-red-500 border border-red-500/20 font-medium py-2 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
