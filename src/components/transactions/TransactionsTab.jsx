import React, { useState } from 'react';
import { useBudget } from '../../contexts/BudgetContext';
import { Card } from '../ui/Card';
import { formatCurrency } from '../../utils/formatCurrency';
import TransactionModal from './TransactionModal';
import ReceiptScannerModal from './ReceiptScannerModal';
import VoiceInputPanel from '../assistant/VoiceInputPanel';
import { speakTransactionDetails, stopSpeech } from '../../services/agents/voiceAgent';
import { processTransaction } from '../../services/agents/managerAgent';
import { reviewSuspiciousTransaction } from '../../services/agents/assistantAgent';
import toast from 'react-hot-toast'
import { Plus, Edit2, Sparkles, Receipt, Volume2, VolumeX, Mic, Loader2, RefreshCw, AlertTriangle, Repeat } from 'lucide-react';
import MaskedHeading from '../ui/MaskedHeading';
import Reveal from '../ui/Reveal';

export default function TransactionsTab() {
  const budgetState = useBudget();
  const { transactions, categories, dispatch } = budgetState;
  const [selectedTx, setSelectedTx] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [speakingTxId, setSpeakingTxId] = useState(null);
  const [reviewingTxId, setReviewingTxId] = useState(null);

  const getCategoryName = (id) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.name : 'Unknown';
  };

  const getCategoryColor = (id) => {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.color : '#27272a';
  };

  const handleAddClick = () => {
    setSelectedTx(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (tx) => {
    setSelectedTx(tx);
    setIsModalOpen(true);
  };

  const handleSpeakTransaction = async (tx) => {
    if (speakingTxId === tx.id) {
      stopSpeech();
      setSpeakingTxId(null);
      return;
    }

    setSpeakingTxId(tx.id);
    const categoryName = getCategoryName(tx.categoryId);

    await speakTransactionDetails(tx, categoryName, {
      onStart: () => setSpeakingTxId(tx.id),
      onEnd: () => setSpeakingTxId(null),
      onError: (err) => {
        toast.error('Failed to play voice transaction.');
        setSpeakingTxId(null);
      },
    });
  };

  const handleVoiceTransaction = async (parsedData) => {
    setShowVoicePanel(false);
    try {
      const result = await processTransaction(parsedData, budgetState, dispatch);
      toast.success(result.message || 'Voice receipt expense added!');
    } catch (err) {
      console.error('Voice transaction processing error:', err);
      toast.error('Failed to add voice expense');
    }
  };

  const handleAIReview = async (tx) => {
    setReviewingTxId(tx.id);
    try {
      const snapshot = { transactions, categories };
      const result = await reviewSuspiciousTransaction(tx, snapshot);
      toast(result.verdict, {
        duration: 6000,
        style: {
          background: result.isSuspicious ? 'rgba(234,88,12,0.15)' : 'rgba(16,185,129,0.1)',
          borderColor: result.isSuspicious ? 'rgba(234,88,12,0.3)' : 'rgba(16,185,129,0.3)',
          border: '1px solid',
          color: '#f3f4f6',
          maxWidth: '380px',
        },
      });
    } catch (err) {
      toast.error('AI review failed');
    } finally {
      setReviewingTxId(null);
    }
  };

  // Sort transactions by date (newest first)
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Today';
    try {
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) ? d.toLocaleDateString() : String(dateStr);
    } catch {
      return String(dateStr);
    }
  };

  // Detect suspicious transactions via heuristics
  const suspiciousIds = new Set();
  const txMap = {};
  transactions.forEach(tx => {
    const key = `${tx.description?.toLowerCase()}_${tx.amount}`;
    if (!txMap[key]) txMap[key] = [];
    txMap[key].push(tx);
  });
  Object.values(txMap).forEach(group => {
    if (group.length > 1) {
      // Check if duplicates are within 24 hours
      group.sort((a, b) => new Date(a.date) - new Date(b.date));
      for (let i = 1; i < group.length; i++) {
        const diff = Math.abs(new Date(group[i].date) - new Date(group[i - 1].date));
        if (diff < 24 * 60 * 60 * 1000) {
          suspiciousIds.add(group[i].id);
        }
      }
    }
  });
  // Also flag amounts > 3x category avg
  categories.forEach(cat => {
    const catTxs = transactions.filter(tx => tx.categoryId === cat.id);
    if (catTxs.length < 2) return;
    const avg = catTxs.reduce((s, t) => s + Number(t.amount), 0) / catTxs.length;
    catTxs.forEach(tx => {
      if (Number(tx.amount) > avg * 3) suspiciousIds.add(tx.id);
    });
  });

  return (
    <Card className="min-h-[500px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MaskedHeading
          text="Expenses"
          tag="h2"
          reveal="rise"
          trigger="view"
          fillColor="var(--color-text)"
          align="left"
          className="text-xl font-semibold"
        />
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowVoicePanel(!showVoicePanel)}
            className="flex items-center space-x-1.5 text-sm bg-accent/15 text-accent border border-accent/30 px-3 py-1.5 rounded-lg hover:bg-accent/25 transition-colors font-medium"
          >
            <Mic size={16} className="text-accent" />
            <span>Speak Receipt</span>
          </button>
          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center space-x-1.5 text-sm bg-[#8c6d37]/20 text-[#a48246] border border-[#8c6d37]/40 px-3 py-1.5 rounded-lg hover:bg-[#8c6d37]/30 transition-colors font-medium"
          >
            <Sparkles size={16} className="text-[#a48246]" />
            <span>Scan Receipt</span>
          </button>
          <button
            onClick={handleAddClick}
            className="flex items-center space-x-1 text-sm bg-accent text-primary px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors font-medium"
          >
            <Plus size={16} />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {showVoicePanel && (
        <VoiceInputPanel
          onTransactionReady={handleVoiceTransaction}
          onClose={() => setShowVoicePanel(false)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-text-muted border-b border-zinc-800">
            <tr>
              <th className="pb-3 font-medium px-4">Date</th>
              <th className="pb-3 font-medium px-4">Description</th>
              <th className="pb-3 font-medium px-4">Category</th>
              <th className="pb-3 font-medium px-4 text-right">Amount</th>
              <th className="pb-3 font-medium px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {sortedTransactions.length === 0 && (
              <tr>
                <td colSpan="5" className="py-8 text-center text-text-muted">
                  No expenses found.
                </td>
              </tr>
            )}
            {sortedTransactions.map((tx, index) => {
              const isSuspicious = suspiciousIds.has(tx.id);
              return (
                <tr
                  key={tx.id}
                  className={`group hover:bg-[#09090b]/50 transition-colors animate-row ${isSuspicious ? 'bg-orange-500/5' : ''}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <td className="py-4 px-4 text-text-muted whitespace-nowrap">
                    {formatDate(tx.date)}
                  </td>
                  <td className="py-4 px-4 text-text font-medium">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span>{tx.description}</span>
                      {tx.source === 'receipt_scan' && (
                        <span
                          title="Scanned from receipt"
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[#8c6d37]/15 text-[#a48246] border border-[#8c6d37]/30"
                        >
                          <Receipt size={10} className="mr-1" /> Receipt
                        </span>
                      )}
                      {tx.source === 'voice' && (
                        <span
                          title="Added via voice receipt"
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent border border-accent/30"
                        >
                          <Mic size={10} className="mr-1" /> Voice
                        </span>
                      )}
                      {(tx.recurring || tx.isSubscription) && (
                        <span
                          title="Recurring subscription"
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[#2e5b45]/15 text-[#3a7056] border border-[#2e5b45]/30"
                        >
                          <Repeat size={10} className="mr-1" /> Sub
                        </span>
                      )}
                      {isSuspicious && (
                        <span
                          title="Flagged as potentially suspicious"
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[#e7b956]/20 text-[#e7b956] border border-[#e7b956]/40 animate-pulse"
                        >
                          <AlertTriangle size={10} className="mr-1" /> Review
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span 
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-border"
                      style={{ color: getCategoryColor(tx.categoryId), borderColor: `${getCategoryColor(tx.categoryId)}40`, backgroundColor: `${getCategoryColor(tx.categoryId)}10` }}
                    >
                      {getCategoryName(tx.categoryId)}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right font-medium text-text">
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      {/* Speaker Button - TTS */}
                      <button
                        onClick={() => handleSpeakTransaction(tx)}
                        title="Speak transaction with ElevenLabs voice"
                        className={`p-1.5 rounded-md transition-all ${
                          speakingTxId === tx.id
                            ? 'bg-accent/20 text-accent border border-accent/40 animate-pulse opacity-100'
                            : 'text-text-muted hover:text-accent opacity-60 group-hover:opacity-100 hover:bg-[#2b2924]'
                        }`}
                      >
                        {speakingTxId === tx.id ? (
                          <VolumeX size={16} />
                        ) : (
                          <Volume2 size={16} />
                        )}
                      </button>

                      {/* AI Suspicious Review Button */}
                      {isSuspicious && (
                        <button
                          onClick={() => handleAIReview(tx)}
                          disabled={reviewingTxId === tx.id}
                          title="Run AI review on this suspicious expense"
                          className="p-1.5 rounded-md transition-all text-orange-400 hover:bg-orange-500/10 opacity-70 group-hover:opacity-100 disabled:opacity-40"
                        >
                          {reviewingTxId === tx.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <RefreshCw size={16} />
                          }
                        </button>
                      )}

                      <button
                        onClick={() => handleEditClick(tx)}
                        className="p-1.5 text-zinc-500 hover:text-accent opacity-60 group-hover:opacity-100 transition-all rounded-md hover:bg-zinc-800"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        transaction={selectedTx}
      />

      <ReceiptScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
      />
    </Card>
  );
}
