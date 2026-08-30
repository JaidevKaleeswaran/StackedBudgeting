import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useBudget } from '../../contexts/BudgetContext';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CategoryModal({ isOpen, onClose, category = null }) {
  const { categories, dispatch } = useBudget();
  const [formData, setFormData] = useState({
    name: '',
    limit: '',
    color: '#e7b956',
    endOfCycleAction: 'none',
  });

  const isEditing = !!category;

  useEffect(() => {
    if (isOpen) {
      if (category) {
        setFormData({
          name: category.name,
          limit: category.limit,
          color: category.color || '#e7b956',
          endOfCycleAction: category.endOfCycleAction || 'none',
        });
      } else {
        setFormData({ name: '', limit: '', color: '#e7b956', endOfCycleAction: 'none' });
      }
    }
  }, [isOpen, category]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    if (!cleanName) {
      toast.error('Category name is required');
      return;
    }
    
    const payload = {
      name: cleanName,
      limit: Number(formData.limit),
      color: formData.color,
      endOfCycleAction: formData.endOfCycleAction,
    };

    const normName = cleanName.toLowerCase();

    if (isEditing) {
      const duplicateExists = categories.some(
        c => c.id !== category.id && c.name.trim().toLowerCase() === normName
      );
      if (duplicateExists) {
        toast.error(`A category named "${cleanName}" already exists.`);
        return;
      }
      dispatch({ type: 'UPDATE_CATEGORY', payload: { ...payload, id: category.id } });
      toast.success('Category updated');
    } else {
      const duplicateExists = categories.some(
        c => c.name.trim().toLowerCase() === normName
      );
      if (duplicateExists) {
        toast.error(`A category named "${cleanName}" already exists.`);
        return;
      }
      dispatch({ type: 'ADD_CATEGORY', payload: { ...payload, id: Date.now().toString() } });
      toast.success('Category added');
    }
    
    onClose();
  };


  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      dispatch({ type: 'DELETE_CATEGORY', payload: category.id });
      toast.success('Category deleted');
      onClose();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isEditing ? 'Edit Category' : 'Add Category'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-text-muted mb-1">Category Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
            placeholder="e.g. Groceries"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-muted mb-1">Budget Limit</label>
          <input
            type="number"
            name="limit"
            value={formData.limit}
            onChange={handleChange}
            className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-text-muted mb-1">Color</label>
          <div className="flex items-center space-x-3">
            <input
              type="color"
              name="color"
              value={formData.color}
              onChange={handleChange}
              className="h-10 w-10 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-sm text-text-muted">{formData.color}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-muted mb-1">End of Cycle Action</label>
          <select
            name="endOfCycleAction"
            value={formData.endOfCycleAction}
            onChange={handleChange}
            className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
          >
            <option value="none">None (Reset)</option>
            <option value="rollover">Rollover Unspent</option>
            <option value="sweep">Sweep to Savings</option>
          </select>
        </div>

        <div className="pt-4 flex space-x-3">
          <button
            type="submit"
            className="flex-1 bg-accent text-primary font-medium py-2 rounded-lg hover:bg-accent-hover transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Add Category'}
          </button>
          
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 bg-red-500/10 text-red-500 border border-red-500/20 font-medium py-2 rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center space-x-1.5"
            >
              <Trash2 size={16} />
              <span>Delete Category</span>
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
