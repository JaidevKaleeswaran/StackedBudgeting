import React, { useState, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { useBudget } from '../../contexts/BudgetContext';
import { processTransaction } from '../../services/agents/managerAgent';
import { speakTransactionDetails } from '../../services/agents/voiceAgent';
import { scanReceipt } from '../../services/agents/receiptScannerAgent';
import toast from 'react-hot-toast';
import { Upload, Sparkles, Loader2, CheckCircle2, FileText, AlertCircle, Bot, Volume2 } from 'lucide-react';

export default function ReceiptScannerModal({ isOpen, onClose }) {
  const budgetState = useBudget();
  const { categories, dispatch } = budgetState;
  
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    amount: '',
    categoryId: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleReset = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setIsScanning(false);
    setScanResult(null);
    setScanError(null);
    setIsSaving(false);
    setFormData({
      amount: '',
      categoryId: categories.length > 0 ? categories[0].id : '',
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or WebP image');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10 MB limit');
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setScanResult(null);
    setScanError(null);
  };

  const handleScan = async () => {
    if (!selectedFile) {
      toast.error('Please select a receipt image first');
      return;
    }

    setIsScanning(true);
    setScanError(null);

    try {
      // Call Gemini Vision directly in the browser — works on Vercel & localhost
      const result = await scanReceipt(selectedFile);

      // result.data is the structured shape the modal expects
      const json = result;

      setScanResult(json);
      toast.success('Receipt scanned successfully!');

      // Detect low-confidence fields
      const scanIssues = [];
      if (!json.data?.merchant || json.data.merchant === 'Unknown') scanIssues.push('merchant');
      if (!json.data?.total || Number(json.data.total) === 0) scanIssues.push('amount');
      if (!json.data?.date) scanIssues.push('date');
      json._scanIssues = scanIssues;

      // Use the Manager Agent's AI categorization to match the category
      let matchedCategoryId = categories.length > 0 ? categories[0].id : '';
      if (json.data?.suggested_category) {
        const found = categories.find(
          (c) => c.name.toLowerCase() === json.data.suggested_category.toLowerCase()
        );
        if (found) matchedCategoryId = found.id;
      }

      setFormData({
        amount: json.data.total ?? '',
        categoryId: matchedCategoryId,
        description: json.data.merchant ? `Receipt: ${json.data.merchant}` : 'Scanned Receipt',
        date: json.data.date || new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.error('Scan error:', err);
      setScanError(err.message);
      toast.error(err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Use the Manager Agent to process and categorize the transaction
      const result = await processTransaction(
        {
          description: formData.description,
          amount: Number(formData.amount),
          date: formData.date,
          merchant: scanResult?.data?.merchant || formData.description,
          lineItems: scanResult?.data?.line_items || null,
        },
        budgetState,
        dispatch
      );

      toast.success(result.message || 'Transaction added from scanned receipt!');
      handleClose();
    } catch (err) {
      console.error('Manager Agent error:', err);
      // Fallback: dispatch directly
      const payload = {
        id: Date.now().toString(),
        amount: Number(formData.amount),
        categoryId: formData.categoryId,
        description: formData.description,
        date: formData.date,
        receipt_image_url: scanResult?.receipt_image_url || null,
        line_items: scanResult?.data?.line_items || null,
        source: 'receipt_scan',
      };
      dispatch({ type: 'ADD_TRANSACTION', payload });
      toast.success('Transaction added from scanned receipt!');
      handleClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Scan Receipt with AI">
      <div className="space-y-5">
        {/* Step 1: Upload File area */}
        {!scanResult ? (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 hover:border-accent/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-[#09090b]/50 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />

              {previewUrl ? (
                <div className="space-y-3">
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    className="max-h-48 mx-auto rounded-lg object-contain border border-zinc-800"
                  />
                  <p className="text-xs text-zinc-400 font-medium">Click to change image</p>
                </div>
              ) : (
                <div className="py-4 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-accent/10 text-accent mx-auto flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload size={24} />
                  </div>
                  <p className="text-sm font-medium text-text">Click to upload receipt image</p>
                  <p className="text-xs text-zinc-500">Supports JPG, PNG, WebP up to 10MB</p>
                </div>
              )}
            </div>

            {scanError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start space-x-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Scan Failed</p>
                  <p>{scanError}</p>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedFile || isScanning}
              onClick={handleScan}
              className="w-full flex items-center justify-center space-x-2 bg-accent text-primary font-medium py-2.5 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Scanning with Gemini AI...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Scan Receipt</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Step 2: Review Parsed Receipt Data & Save */
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center justify-between text-xs text-emerald-400">
              <div className="flex items-center space-x-2.5">
                <CheckCircle2 size={18} className="shrink-0" />
                <div>
                  <p className="font-semibold">Receipt Extracted Successfully</p>
                  <p className="text-emerald-400/80 flex items-center gap-1">
                    <Bot size={10} />
                    Manager Agent will auto-categorize this transaction
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => speakTransactionDetails({ description: formData.description, amount: formData.amount, date: formData.date })}
                className="flex items-center gap-1 text-xs bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30 px-2.5 py-1 rounded-md transition-colors shrink-0"
                title="Speak scanned receipt details with ElevenLabs voice"
              >
                <Volume2 size={14} />
                <span>Speak</span>
              </button>
            </div>

            {scanResult._scanIssues?.length > 0 && (
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                <span>Low confidence on: <strong>{scanResult._scanIssues.join(', ')}</strong> — please verify these fields before saving.</span>
              </div>
            )}


            {/* Line items preview if available */}
            {scanResult.data?.line_items && scanResult.data.line_items.length > 0 && (
              <div className="bg-[#09090b] border border-zinc-800 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-text-muted flex items-center space-x-1">
                  <FileText size={14} />
                  <span>Extracted Line Items ({scanResult.data.line_items.length})</span>
                </p>
                <div className="max-h-28 overflow-y-auto divide-y divide-zinc-800/60 text-xs">
                  {scanResult.data.line_items.map((item, idx) => (
                    <div key={idx} className="py-1 flex justify-between text-zinc-300">
                      <span className="truncate max-w-[200px]">
                        {item.quantity > 1 ? `${item.quantity}x ` : ''}
                        {item.name}
                      </span>
                      <span className="font-mono">${Number(item.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className={`block text-sm mb-1 ${scanResult._scanIssues?.includes('merchant') ? 'text-amber-400' : 'text-text-muted'}`}>
                Description (Merchant){scanResult._scanIssues?.includes('merchant') ? ' (Verify)' : ''}
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className={`w-full bg-[#09090b] border rounded-lg px-3 py-2 text-text focus:outline-none transition-colors ${
                  scanResult._scanIssues?.includes('merchant') ? 'border-amber-500/50 focus:border-amber-400' : 'border-zinc-700 focus:border-accent'
                }`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${scanResult._scanIssues?.includes('amount') ? 'text-amber-400' : 'text-text-muted'}`}>
                  Amount{scanResult._scanIssues?.includes('amount') ? ' (Verify)' : ''}
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className={`w-full bg-[#09090b] border rounded-lg px-3 py-2 text-text focus:outline-none transition-colors ${
                    scanResult._scanIssues?.includes('amount') ? 'border-amber-500/50 focus:border-amber-400' : 'border-zinc-700 focus:border-accent'
                  }`}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Category</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors"
                  required
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-[#09090b] border border-zinc-700 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-accent transition-colors [color-scheme:dark]"
                required
              />
            </div>

            <div className="pt-2 flex space-x-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 bg-zinc-800 text-zinc-300 font-medium py-2 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
              >
                Re-scan
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 bg-accent text-primary font-medium py-2 rounded-lg hover:bg-accent-hover transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Save Expense'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
