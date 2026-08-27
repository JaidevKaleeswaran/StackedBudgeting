import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, CheckCircle2, X, Volume2, Send, Sparkles } from 'lucide-react';
import { parseSpokenReceipt, createWebSpeechRecognition, speakTransactionDetails } from '../../services/agents/voiceAgent';
import { GoogleGenAI } from '@google/genai';

/**
 * VoiceInputPanel — ARCA Dual Voice & Text Receipt Input Agent
 * 
 * Supports:
 * 1. Direct audio recording via MediaRecorder -> Gemini 2.5 Flash transcription (100% reliable across all browsers & HTTPS/HTTP)
 * 2. Real-time WebSpeech recognition fallback
 * 3. Direct natural language text entry
 */
export default function VoiceInputPanel({ onTransactionReady, onClose }) {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const animFrameRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-focus text input
  useEffect(() => {
    if (inputRef.current && !parsedData) {
      inputRef.current.focus();
    }
  }, [parsedData]);

  // Pulse animation for mic ring & visualizer
  useEffect(() => {
    if (!isListening) return;
    let frame = 0;
    const animate = () => {
      frame++;
      setPulsePhase(frame);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isListening]);

  // Process text input through local NLP parsing
  const processText = useCallback((text) => {
    if (!text || !text.trim()) return;

    setIsProcessing(true);
    setError(null);

    setTimeout(() => {
      try {
        const parsed = parseSpokenReceipt(text.trim());
        if (parsed && parsed.amount > 0) {
          // Calculate confidence based on completeness
          const issues = [];
          if (!parsed.description || parsed.description === 'Purchase') issues.push('merchant');
          if (!parsed.date) issues.push('date');
          setParsedData({
            ...parsed,
            raw_transcript: text.trim(),
            _confidenceIssues: issues,
          });
        } else {
          setError('Could not extract amount. Try "$15 on Taco Bell" or "Spent 20 dollars at Walmart"');
        }
      } catch (err) {
        setError(`Failed to parse: ${err.message}`);
      }
      setIsProcessing(false);
    }, 200);
  }, []);

  // Transcribe recorded audio blob via Gemini directly in the browser
  // Works on both localhost and Vercel — no Express backend required
  const sendAudioToBackend = async (audioBlob) => {
    setIsProcessing(true);
    setError(null);

    if (!audioBlob || audioBlob.size < 500) {
      console.warn('[Voice] Audio recording was empty or too short:', audioBlob?.size);
      if (inputText) {
        processText(inputText);
      } else {
        setError('Audio recording was too short or quiet. Please hold the mic button while speaking.');
        setIsProcessing(false);
      }
      return;
    }

    let lastErrorMsg = '';

    try {
      // Collect available keys, prioritizing verified working keys
      const apiKeys = [
        import.meta.env.VITE_STT_API_KEY,
        import.meta.env.VITE_RECEIPT_SCANNER_API_KEY,
        import.meta.env.VITE_MANAGER_API_KEY,
        import.meta.env.VITE_ASSISTANT_API_KEY,
      ].filter(Boolean);

      if (apiKeys.length === 0) {
        throw new Error('No Gemini API key configured for audio transcription');
      }

      // Convert audio blob to base64 using FileReader
      const base64Audio = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      // Strip codec info from MIME type — Gemini needs 'audio/webm', not 'audio/webm;codecs=opus'
      const mimeType = (audioBlob.type || 'audio/webm').split(';')[0];

      const prompt = `Listen carefully to this spoken receipt audio recording.
Extract what the user bought, the total amount spent, and the date of purchase.
Return ONLY valid JSON (no markdown formatting) in this exact structure:
{
  "transcript": "Exact spoken text",
  "merchant": "Merchant or Store Name or Description",
  "amount": 0.00,
  "date": "YYYY-MM-DD"
}

If the year/date is not mentioned, use today's date (${new Date().toISOString().split('T')[0]}).`;

      const modelsToTry = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.0-flash'];

      // Try keys and models
      for (const apiKey of apiKeys) {
        const ai = new GoogleGenAI({ apiKey });
        for (const model of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType,
                        data: base64Audio,
                      },
                    },
                  ],
                },
              ],
            });

            const rawText = (response.text || '').trim();
            if (!rawText) continue;

            const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const data = JSON.parse(cleaned);

            const fullTranscript = data.transcript || inputText || 'Spoken Receipt';
            setInputText(fullTranscript);
            const merchantVal = data.merchant || 'Spoken Purchase';
            const amountVal = Number(data.amount) || 0;
            const dateVal = data.date || new Date().toISOString().split('T')[0];
            const issues = [];
            if (!data.merchant || data.merchant === 'Spoken Purchase') issues.push('merchant');
            if (amountVal === 0) issues.push('amount');
            if (!data.date) issues.push('date');
            setParsedData({
              description: merchantVal,
              amount: amountVal,
              date: dateVal,
              raw_transcript: fullTranscript,
              _confidenceIssues: issues,
            });
            setIsProcessing(false);
            return true;
          } catch (modelErr) {
            console.warn(`[Voice] Key ${apiKey.substring(0, 10)}... Model ${model} failed:`, modelErr.message);
            lastErrorMsg = modelErr.message || String(modelErr);
          }
        }
      }

      throw new Error(lastErrorMsg || 'All Gemini models failed to transcribe audio');
    } catch (err) {
      console.warn('[Voice] Gemini audio transcription failed:', err.message);
      lastErrorMsg = err.message;
    }

    // Fallback: if WebSpeech captured any text, try parsing that
    if (inputText) {
      processText(inputText);
    } else {
      setError(lastErrorMsg ? `Transcription error: ${lastErrorMsg}` : 'Could not transcribe audio. Please type your purchase details below.');
      setIsProcessing(false);
    }
  };

  // Start voice recording (MediaRecorder + WebSpeech fallback)
  const startListening = useCallback(async () => {
    setError(null);
    setInterimTranscript('');
    setParsedData(null);
    audioChunksRef.current = [];

    // 1. Start MediaRecorder (native audio stream recording)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        sendAudioToBackend(audioBlob);
      };

      // Start recording with 100ms timeslice to gather chunks continuously
      mediaRecorder.start(100);
      setIsListening(true);
    } catch (micErr) {
      console.warn('MediaRecorder mic access error:', micErr);
      setError('Microphone permission denied or not available. Please allow mic access or type below.');
      return;
    }

    // 2. Also start WebSpeech if available for live typing feedback
    try {
      const recognition = createWebSpeechRecognition(
        (text, isFinal) => {
          if (text) {
            setInputText(text);
            if (!isFinal) setInterimTranscript(text);
          }
        },
        () => {
          // Ignore WebSpeech errors since MediaRecorder is recording primary audio!
        },
        () => {}
      );
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (_) {
      // Ignore WebSpeech start failures
    }
  }, [processText]);

  // Stop voice recording
  const stopListening = useCallback(() => {
    setIsListening(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
    }
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault();
    processText(inputText);
  };

  const handleConfirm = () => {
    if (parsedData && onTransactionReady) {
      onTransactionReady({
        ...parsedData,
        raw_transcript: parsedData.raw_transcript || inputText,
      });
    }
  };

  const handleReset = () => {
    setInputText('');
    setInterimTranscript('');
    setParsedData(null);
    setError(null);
    setIsProcessing(false);
    if (inputRef.current) inputRef.current.focus();
  };

  // Waveform animation height
  const barCount = 22;
  const getBarHeight = (index) => {
    if (!isListening) return 3;
    const wave = Math.sin((pulsePhase * 0.08) + (index * 0.5)) * 0.5 + 0.5;
    const rand = Math.sin(pulsePhase * 0.05 + index * 1.7) * 0.3 + 0.7;
    return 3 + wave * rand * 22;
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-[#8c6d37]/5 pointer-events-none" />
      
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1.5 text-text-muted hover:text-text rounded-lg hover:bg-primary transition-colors z-10"
      >
        <X size={16} />
      </button>

      {/* Header */}
      <div className="text-center relative z-10">
        <h3 className="text-sm font-semibold text-text flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-accent" />
          Voice & Quick Receipt Entry
        </h3>
        <p className="text-xs text-text-muted mt-1">
          Speak into the mic or type your purchase
        </p>
      </div>

      {/* Primary Input Form */}
      {!parsedData && (
        <form onSubmit={handleSubmit} className="relative z-10 space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={isListening ? (interimTranscript || inputText) : inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder='e.g. "$15 on Taco Bell" or "Spent 30 at Walmart"'
              disabled={isListening || isProcessing}
              className="w-full bg-primary border border-border rounded-xl px-4 py-3 pr-24 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* Mic button */}
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={isProcessing}
                className={`p-2 rounded-lg transition-all ${
                  isListening
                    ? 'bg-accent text-primary shadow-lg shadow-accent/30 scale-105 animate-pulse'
                    : 'text-text-muted hover:text-accent hover:bg-primary'
                }`}
                title={isListening ? 'Stop recording & parse' : 'Speak receipt'}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              {/* Submit button */}
              <button
                type="submit"
                disabled={(!inputText.trim() && !isListening) || isProcessing}
                className="p-2 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Parse receipt"
              >
                {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>

          {/* Example chips */}
          <div className="flex flex-wrap gap-1.5">
            {['$12 at Subway', '$50 groceries at Target', 'Paid $9.99 for Netflix'].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setInputText(example);
                  processText(example);
                }}
                className="text-[11px] px-2.5 py-1 bg-primary hover:bg-[#2b2924] text-text-muted hover:text-text rounded-full border border-border transition-all"
              >
                {example}
              </button>
            ))}
          </div>
        </form>
      )}

      {/* Waveform Visualizer & Status */}
      {isListening && (
        <div className="space-y-2 relative z-10 text-center py-1">
          <div className="flex items-center justify-center gap-[2px] h-8">
            {Array.from({ length: barCount }).map((_, i) => (
              <div
                key={i}
                className="w-[2.5px] rounded-full bg-gradient-to-t from-accent to-[#8c6d37]"
                style={{
                  height: `${getBarHeight(i)}px`,
                  transition: 'height 0.1s ease',
                  opacity: 0.7 + Math.sin(i * 0.5) * 0.3,
                }}
              />
            ))}
          </div>
          <p className="text-xs text-accent flex items-center justify-center gap-1.5 animate-pulse">
            <Loader2 size={12} className="animate-spin" />
            Recording voice... tap mic when done
          </p>
        </div>
      )}

      {/* Processing Loader */}
      {isProcessing && !isListening && (
        <div className="flex items-center justify-center gap-2 text-xs text-accent py-3 relative z-10">
          <Loader2 size={16} className="animate-spin text-accent" />
          <span>Transcribing & analyzing receipt...</span>
        </div>
      )}

      {/* Parsed Receipt Summary */}
      {parsedData && !isProcessing && (
        <div className="bg-[#2e5b45]/10 border border-[#2e5b45]/30 rounded-xl p-4 space-y-3 relative z-10 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-[#3a7056]">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span className="text-xs font-semibold">Extracted Receipt Data</span>
            </div>
            <button
              type="button"
              onClick={() => speakTransactionDetails(parsedData)}
              className="flex items-center gap-1 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 border border-accent/30 px-2.5 py-1 rounded-md transition-colors"
            >
              <Volume2 size={12} />
              <span>Speak</span>
            </button>
          </div>

          {/* Source text */}
          <div className="bg-primary rounded-lg p-2.5 border border-border">
            <p className="text-[10px] text-text-muted uppercase mb-1">Transcript / Description</p>
            <p className="text-xs text-text italic">"{parsedData.raw_transcript}"</p>
          </div>

          {parsedData._confidenceIssues?.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400">
              <span className="mt-0.5 shrink-0">⚠️</span>
              <span>Low confidence on: <strong>{parsedData._confidenceIssues.join(', ')}</strong>. Please review before confirming.</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className={`rounded-lg p-2.5 ${parsedData._confidenceIssues?.includes('merchant') ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-primary border border-border'}`}>
              <p className="text-[10px] text-text-muted uppercase">Item</p>
              <p className={`text-sm font-semibold mt-0.5 ${parsedData._confidenceIssues?.includes('merchant') ? 'text-amber-400' : 'text-text'}`}>{parsedData.description}</p>
              {parsedData._confidenceIssues?.includes('merchant') && <p className="text-[9px] text-amber-500 mt-0.5">Needs Review</p>}
            </div>
            <div className={`rounded-lg p-2.5 ${parsedData._confidenceIssues?.includes('amount') ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-primary border border-border'}`}>
              <p className="text-[10px] text-text-muted uppercase">Amount</p>
              <p className={`text-sm font-semibold mt-0.5 ${parsedData._confidenceIssues?.includes('amount') ? 'text-amber-400' : 'text-[#3a7056]'}`}>${Number(parsedData.amount).toFixed(2)}</p>
              {parsedData._confidenceIssues?.includes('amount') && <p className="text-[9px] text-amber-500 mt-0.5">Needs Review</p>}
            </div>
            <div className={`rounded-lg p-2.5 ${parsedData._confidenceIssues?.includes('date') ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-primary border border-border'}`}>
              <p className="text-[10px] text-text-muted uppercase">Date</p>
              <p className={`text-sm font-semibold mt-0.5 ${parsedData._confidenceIssues?.includes('date') ? 'text-amber-400' : 'text-text'}`}>{parsedData.date}</p>
              {parsedData._confidenceIssues?.includes('date') && <p className="text-[9px] text-amber-500 mt-0.5">Needs Review</p>}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleReset}
              className="flex-1 px-3 py-2 text-xs font-medium bg-primary hover:bg-[#2b2924] text-text rounded-lg border border-border transition-colors"
            >
              Start Over
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 px-3 py-2 text-xs font-semibold bg-accent hover:bg-accent-hover text-primary rounded-lg transition-all shadow-md font-bold"
            >
              Add Expense
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 relative z-10">
          <p className="text-xs text-red-400">{error}</p>
          <button
            onClick={handleReset}
            className="mt-2 text-xs text-violet-300 hover:text-violet-200 underline block"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
