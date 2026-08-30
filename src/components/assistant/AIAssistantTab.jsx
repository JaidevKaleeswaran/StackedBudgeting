import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Send, Download, FileText,
  RefreshCw, Mic, MicOff, Camera, X,
  Brain, Zap, ChevronDown, ChevronUp, Bot, User, Volume2, ShieldCheck
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { answerQuery, clearConversationHistory } from '../../services/agents/assistantAgent';
import { buildFinancialSnapshot, processTransaction } from '../../services/agents/managerAgent';
import { createWebSpeechRecognition } from '../../services/agents/voiceAgent';
import { useBudget } from '../../contexts/BudgetContext';
import { useAuth } from '../../contexts/AuthContext';
import VoiceInputPanel from './VoiceInputPanel';
import ReceiptScannerModal from '../transactions/ReceiptScannerModal';
import VoiceAuditLogModal from './VoiceAuditLogModal';
import Reveal from '../ui/Reveal';
import { toast } from 'react-hot-toast';

// ── Markdown rendering helpers ──────────────────────────────────────────────

function formatInlineMarkdown(str) {
  if (!str) return '';
  return String(str)
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-zinc-400 font-normal">$1</em>');
}

function renderMarkdownText(text) {
  if (!text) return null;
  const paragraphs = String(text).split('\n\n');

  return (
    <div className="space-y-3 text-sm text-zinc-200 leading-relaxed font-sans">
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n');
        return (
          <div key={pIdx} className="space-y-1">
            {lines.map((line, lIdx) => {
              if (line.startsWith('• ') || line.startsWith('- ')) {
                const content = line.substring(2);
                return (
                  <div key={lIdx} className="flex items-start space-x-2 pl-2 my-1 text-xs text-zinc-300">
                    <span className="text-accent font-bold mt-0.5">•</span>
                    <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
                  </div>
                );
              }
              if (/^\d+\.\s/.test(line)) {
                const content = line.replace(/^\d+\.\s/, '');
                const num = line.match(/^(\d+)\./)[1];
                return (
                  <div key={lIdx} className="flex items-start space-x-2 pl-2 my-1 text-xs text-zinc-300">
                    <span className="text-accent font-bold mt-0.5 min-w-[16px]">{num}.</span>
                    <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(content) }} />
                  </div>
                );
              }
              if (line.startsWith('**') && line.endsWith(':**')) {
                return (
                  <h4 key={lIdx} className="font-semibold text-accent text-xs uppercase tracking-wider pt-2 border-t border-zinc-800/60 mt-2">
                    {line.replace(/\*\*/g, '')}
                  </h4>
                );
              }
              if (line.startsWith('###') || line.startsWith('##')) {
                return (
                  <h4 key={lIdx} className="font-semibold text-text text-sm pt-1">
                    {line.replace(/^#+\s*/, '')}
                  </h4>
                );
              }
              return (
                <p key={lIdx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line) }} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Agent Pipeline Indicator ────────────────────────────────────────────────

function AgentPipelineBadge({ source, metrics }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sourceLabels = {
    assistant: { label: 'AI Assistant', icon: Brain, color: 'violet' },
    voice: { label: 'Voice → Manager', icon: Volume2, color: 'purple' },
    scanner: { label: 'Scanner → Manager', icon: Camera, color: 'blue' },
    manager: { label: 'Manager Agent', icon: Zap, color: 'emerald' },
  };

  const config = sourceLabels[source] || sourceLabels.assistant;
  const Icon = config.icon;

  return (
    <div className="border border-zinc-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors text-xs"
      >
        <div className="flex items-center space-x-2 text-zinc-400">
          <Icon size={12} className={`text-${config.color}-400`} />
          <span className={`font-medium text-${config.color}-400`}>{config.label}</span>
          {metrics?.latencyMs && (
            <span className="flex items-center space-x-1 text-zinc-500">
              <Zap size={10} />
              <span>{metrics.latencyMs}ms</span>
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp size={12} className="text-zinc-500" /> : <ChevronDown size={12} className="text-zinc-500" />}
      </button>

      {isExpanded && metrics && (
        <div className="px-3 py-2 space-y-1 bg-zinc-950/50 border-t border-zinc-800/50 text-[10px] text-zinc-500">
          {metrics.dataPointsUsed !== undefined && <span className="block">Data points: {metrics.dataPointsUsed}</span>}
          {metrics.categoriesAnalyzed !== undefined && <span className="block">Categories analyzed: {metrics.categoriesAnalyzed}</span>}
          {metrics.latencyMs && <span className="block">Response time: {metrics.latencyMs}ms</span>}
          {metrics.fallback && <span className="block text-amber-400">⚡ Fallback mode (offline)</span>}
        </div>
      )}
    </div>
  );
}

// ── Suggested Quick Actions ─────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  { text: 'How much did I spend this month?' },
  { text: 'What are my top spending categories?' },
  { text: 'Am I over budget anywhere?' },
  { text: 'What is my net balance?' },
];

// ── Main Component ──────────────────────────────────────────────────────────

export default function AIAssistantTab() {
  const budgetState = useBudget();
  const { user } = useAuth();

  const { dispatch } = budgetState;
  const messages = budgetState.chatMessages || [];

  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);
  const [showVoiceAuditLog, setShowVoiceAuditLog] = useState(false);
  const [isVoicePrompting, setIsVoicePrompting] = useState(false);
  const [isTranscribingPrompt, setIsTranscribingPrompt] = useState(false);

  const chatEndRef = useRef(null);
  const promptMediaRecorderRef = useRef(null);
  const promptAudioChunksRef = useRef([]);
  const promptRecognitionRef = useRef(null);
  const welcomeDispatchedRef = useRef(false);
  const hasUserSubmittedRef = useRef(false);

  const handleStartPromptVoice = async () => {
    setIsVoicePrompting(true);
    promptAudioChunksRef.current = [];

    // 1. Web Speech API for real-time live typing feedback
    try {
      const recognition = createWebSpeechRecognition(
        (text, isFinal) => {
          if (text) {
            setInputQuery(text);
          }
        },
        (err) => {
          console.warn('[AI Prompt Voice] WebSpeech event warning:', err);
        },
        () => {}
      );
      if (recognition) {
        promptRecognitionRef.current = recognition;
        recognition.start();
      }
    } catch (_) {}

    // 2. Native MediaRecorder for full audio recording + Gemini transcription
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      promptMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          promptAudioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(promptAudioChunksRef.current, { type: mimeType });
        await handleTranscribeAndPromptAI(audioBlob);
      };

      mediaRecorder.start(100);
    } catch (err) {
      console.warn('[AI Prompt Voice] Mic access error:', err);
      setIsVoicePrompting(false);
      toast.error('Microphone permission denied or not available. Please allow mic access or type below.');
    }
  };

  const handleStopPromptVoice = () => {
    setIsVoicePrompting(false);

    if (promptRecognitionRef.current) {
      try { promptRecognitionRef.current.stop(); } catch (_) {}
    }

    if (promptMediaRecorderRef.current && promptMediaRecorderRef.current.state !== 'inactive') {
      try {
        promptMediaRecorderRef.current.requestData();
        promptMediaRecorderRef.current.stop();
      } catch (_) {}
    }
  };

  const handleTranscribeAndPromptAI = async (audioBlob) => {
    let capturedText = '';

    if (audioBlob && audioBlob.size > 100) {
      setIsTranscribingPrompt(true);
      try {
        const apiKeys = [
          import.meta.env.VITE_STT_API_KEY,
          import.meta.env.VITE_ASSISTANT_API_KEY,
          import.meta.env.VITE_MANAGER_API_KEY,
          import.meta.env.VITE_RECEIPT_SCANNER_API_KEY,
          import.meta.env.VITE_GEMINI_API_KEY,
        ].filter(Boolean);

        if (apiKeys.length > 0) {
          const base64Audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          const mimeType = (audioBlob.type || 'audio/webm').split(';')[0];
          const prompt = "Transcribe this spoken question into plain text. Return ONLY the transcribed text, with no JSON, commentary, quotes, or markdown formatting.";

          for (const apiKey of apiKeys) {
            const ai = new GoogleGenAI({ apiKey });
            for (const model of ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.0-flash']) {
              try {
                const response = await ai.models.generateContent({
                  model,
                  contents: [{
                    role: 'user',
                    parts: [
                      { text: prompt },
                      { inlineData: { mimeType, data: base64Audio } },
                    ],
                  }],
                });
                const resText = (response.text || '').trim();
                if (resText) {
                  capturedText = resText;
                  break;
                }
              } catch (mErr) {
                console.warn(`[Voice Prompt] Gemini model ${model} error:`, mErr.message);
              }
            }
            if (capturedText) break;
          }
        }
      } catch (err) {
        console.warn('[Voice Prompt] Audio transcription error:', err);
        console.warn('[AI Prompt Voice] Audio transcription error:', err);
      } finally {
        setIsTranscribingPrompt(false);
      }
    }

    // Fallback to WebSpeech live text if Gemini audio transcription didn't return text
    if (!capturedText && inputQuery.trim()) {
      capturedText = inputQuery.trim();
    }

    if (capturedText) {
      setInputQuery(capturedText);
      toast.success('Voice prompt transcribed!');
      handleSendQuery(capturedText);
    } else {
      toast.error('Could not transcribe audio. Please try speaking again or type your question.');
    }
  };

  // Build financial snapshot for the AI Assistant
  const financialSnapshot = buildFinancialSnapshot(budgetState);

  // Welcome message if chat history is empty
  useEffect(() => {
    const hasWelcome = messages.some((m) => m.id === 'msg_welcome' || m.text?.includes("AI Financial Assistant"));
    if (messages.length === 0 && !welcomeDispatchedRef.current && !hasWelcome) {
      welcomeDispatchedRef.current = true;
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: 'msg_welcome',
          sender: 'assistant',
          source: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Hello ${user?.displayName || 'there'}! I'm your AI Financial Assistant.\n\nI have direct access to all your ARCA data — **${budgetState.transactions?.length || 0} transactions**, **${budgetState.categories?.length || 0} budget categories**, and **${budgetState.incomeSources?.length || 0} income sources**.\n\n**Three ways to interact:**\n• **Type** a question about your finances\n• **Speak** a receipt using ElevenLabs AI Voice\n• **Scan** a receipt photo with Vision AI\n\nAll data is processed in real-time. Ask me anything!`,
        }
      });
    }
  }, [messages.length, dispatch]);

  // Smooth scroll to bottom ONLY when user actively sends a message or receives an AI answer
  useEffect(() => {
    if (hasUserSubmittedRef.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isProcessing]);

  // ── Handle text question ────────────────────────────────────────────────

  const handleSendQuery = async (queryToRun) => {
    const query = (queryToRun || inputQuery).trim();
    if (!query || isProcessing) return;

    hasUserSubmittedRef.current = true;
    setInputQuery('');
    const userMsgId = `user_${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Append user message
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: userMsg });

    setIsProcessing(true);

    try {
      const result = await answerQuery(query, financialSnapshot);

      const aiMsg = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        source: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: result.answer,
        metrics: result.metrics,
      };

      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: aiMsg });
    } catch (error) {
      console.error('Assistant query error:', error);
      toast.error('Failed to process your question.');
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: `error_${Date.now()}`,
          sender: 'assistant',
          source: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: 'I apologize, but I encountered an error. Please try again.',
        }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Handle voice receipt ────────────────────────────────────────────────

  const handleVoiceTransaction = async (parsedData) => {
    hasUserSubmittedRef.current = true;
    setShowVoicePanel(false);

    const voiceMsg = {
      id: `voice_${Date.now()}`,
      sender: 'user',
      text: `Voice receipt: "${parsedData.description}" — $${parsedData.amount.toFixed(2)} on ${parsedData.date}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoice: true,
    };

    // Show what was captured
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: voiceMsg });

    setIsProcessing(true);

    try {
      const result = await processTransaction(
        parsedData,
        budgetState,
        budgetState.dispatch
      );

      const managerMsg = {
        id: `manager_${Date.now()}`,
        sender: 'assistant',
        source: 'manager',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `**Expense added**\n\n• **Item:** ${result.transaction.description}\n• **Amount:** $${result.transaction.amount.toFixed(2)}\n• **Category:** ${result.category}\n• **Date:** ${result.transaction.date}\n\nThe expense has been added to your dashboard and will be reflected in your budget immediately.`,
        metrics: { latencyMs: 0 },
      };

      dispatch({ type: 'ADD_CHAT_MESSAGE', payload: managerMsg });

      toast.success(result.message);
    } catch (error) {
      console.error('Voice transaction error:', error);
      toast.error('Failed to process voice receipt.');
    } finally {
      setIsProcessing(false);
    }
  };


  // ── Handle CSV export ───────────────────────────────────────────────────

  const handleExportCSV = () => {
    const txs = budgetState.transactions || [];
    if (txs.length === 0) {
      toast.error('No transactions to export.');
      return;
    }

    const headers = ['Date', 'Description', 'Amount', 'Category', 'Source'];
    const rows = txs.map(tx => {
      const cat = budgetState.categories?.find(c => c.id === tx.categoryId);
      return [tx.date, tx.description, tx.amount, cat?.name || 'Unknown', tx.source || 'manual'];
    });

    const csvContent = [headers, ...rows]
      .map(row => row.map(val => `"${val}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ARCA_Expenses_Export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV export downloaded!');
  };

  return (
    <div className="space-y-6 pb-12">

      {/* ── Brand header banner ── */}
      <Reveal delay={0} y={20}>
        <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(231,185,86,0.12) 0%, rgba(46,91,69,0.18) 50%, rgba(140,109,55,0.15) 100%)' }}>
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/20 border border-accent/30 rounded-xl">
                <Brain size={22} className="text-accent" />
              </div>
              <div>
                <p className="text-neon font-bold text-lg tracking-tight leading-none">AI Financial Assistant</p>
                <p className="text-text-muted text-xs mt-1">Multi-agent · Voice · Vision · Real-time</p>
              </div>
            </div>
            <span className="text-[10px] bg-[#2e5b45]/20 text-[#3a7056] font-medium px-2.5 py-1 rounded-full border border-[#2e5b45]/30 flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3a7056] animate-pulse" />
              Live
            </span>
          </div>
        </div>
      </Reveal>

      {/* Action Header & Tools Bar */}
      <Reveal delay={0.1} y={24}>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-accent/10 rounded-lg text-accent">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text flex items-center gap-2">
                AI Financial Assistant
                <span className="text-[10px] bg-accent/20 text-accent font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Brain size={10} /> Multi-Agent
                </span>
              </h2>
              <p className="text-xs text-text-muted">Voice, camera, and chat — powered by coordinated AI agents.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => { setShowVoicePanel(!showVoicePanel); setShowReceiptScanner(false); }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 ${showVoicePanel
                  ? 'bg-accent/20 text-accent border-accent/40 shadow-sm scale-102'
                  : 'bg-primary hover:bg-[#2b2924] text-text border-border'
                }`}
            >
              <Mic size={14} />
              <span>Voice Receipt</span>
            </button>

            <button
              onClick={() => { setShowReceiptScanner(true); setShowVoicePanel(false); }}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-[#2b2924] text-text rounded-lg border border-border transition-all duration-200"
            >
              <Camera size={14} />
              <span>Scan Receipt</span>
            </button>

            <button
              onClick={() => setShowVoiceAuditLog(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-[#8c6d37]/15 hover:bg-[#8c6d37]/25 text-[#a48246] rounded-lg border border-[#8c6d37]/30 transition-all duration-200"
              title="Inspect verbatim user speech transcripts & voice logs"
            >
              <ShieldCheck size={14} />
              <span>Voice Logs ({budgetState.voiceLogs?.length || 0})</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-primary hover:bg-[#2b2924] text-text rounded-lg border border-border transition-all duration-200"
            >
              <Download size={14} />
              <span>CSV Export</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent rounded-lg border border-accent/20 transition-all duration-200"
            >
              <FileText size={14} />
              <span>PDF Report</span>
            </button>
          </div>
        </div>
      </Reveal>

      {/* Voice Input Panel */}
      {showVoicePanel && (
        <div className="transition-all duration-300 ease-out animate-in fade-in zoom-in-95">
          <VoiceInputPanel
            onTransactionReady={handleVoiceTransaction}
            onClose={() => setShowVoicePanel(false)}
          />
        </div>
      )}

      {/* Receipt Scanner Modal */}
      <ReceiptScannerModal
        isOpen={showReceiptScanner}
        onClose={() => setShowReceiptScanner(false)}
      />

      {/* Voice Audit Log Inspector Modal */}
      <VoiceAuditLogModal
        isOpen={showVoiceAuditLog}
        onClose={() => setShowVoiceAuditLog(false)}
      />

      {/* Main Chat Stream Container */}
      <Reveal delay={0.2} y={28}>
        <div className="bg-card border border-border rounded-xl p-4 sm:p-6 min-h-[420px] flex flex-col justify-between shadow-xl">
        <div className="space-y-6 overflow-y-auto max-h-[560px] pr-2">
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3 transition-all duration-300 ease-out animate-in fade-in slide-in-from-bottom-2">
              {msg.sender === 'user' ? (
                /* User Message Bubble */
                <div className="flex justify-end">
                  <div className={`max-w-lg rounded-2xl rounded-tr-xs px-4 py-3 text-sm transition-all duration-200 ${msg.isVoice
                      ? 'bg-[#8c6d37]/15 border border-[#8c6d37]/30 text-text shadow-sm'
                      : 'bg-accent/10 border border-accent/20 text-text shadow-sm'
                    }`}>
                    <p className="font-medium">{msg.text}</p>
                    <span className={`text-[10px] block text-right mt-1 ${msg.isVoice ? 'text-[#a48246]' : 'text-accent/60'
                      }`}>{msg.timestamp}</span>
                  </div>
                </div>
              ) : (
                /* AI Assistant Response Box */
                <div className="bg-primary border border-border rounded-2xl p-4 sm:p-5 space-y-3 shadow-md transition-all duration-300 ease-out">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-border/80 pb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center shadow-inner">
                        <Bot size={14} />
                      </div>
                      <span className="text-xs font-semibold text-text">AI Financial Advisor</span>
                    </div>
                    <span className="text-[10px] text-text-muted">{msg.timestamp}</span>
                  </div>

                  {/* Agent Pipeline Badge */}
                  {msg.source && msg.metrics && (
                    <AgentPipelineBadge source={msg.source} metrics={msg.metrics} />
                  )}

                  {/* Response Text */}
                  <div className="pt-1">
                    {renderMarkdownText(msg.text)}
                  </div>
                </div>
              )}
            </div>
          ))}

          {isProcessing && (
            <div className="flex items-center space-x-2 text-xs text-text-muted bg-primary p-4 rounded-xl border border-border animate-pulse transition-all duration-300">
              <RefreshCw size={14} className="animate-spin text-accent" />
              <span>Processing through agent pipeline...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick Questions */}
        {messages.length <= 1 && (
          <div className="mt-4 pt-3 border-t border-border transition-all duration-500 delay-300 ease-out animate-in fade-in">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-2">Quick Questions</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSendQuery(q.text)}
                  className="px-3 py-1.5 text-xs bg-primary hover:bg-[#2b2924] text-zinc-300 hover:text-text rounded-lg border border-border transition-all duration-200 hover:scale-102"
                >
                  <span>{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice Prompt Recording Status Banner */}
        {isVoicePrompting && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between animate-pulse">
            <div className="flex items-center space-x-2 text-xs text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="font-medium">Recording voice prompt... Speak your question into the mic.</span>
            </div>
            <button
              onClick={handleStopPromptVoice}
              className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2.5 py-1 rounded-lg transition-colors font-medium"
            >
              Done / Send
            </button>
          </div>
        )}

        {isTranscribingPrompt && (
          <div className="mt-3 px-3 py-2 bg-accent/10 border border-accent/30 rounded-xl flex items-center space-x-2 text-xs text-accent">
            <RefreshCw size={14} className="animate-spin text-accent" />
            <span className="font-medium">Converting voice to text & prompting AI assistant...</span>
          </div>
        )}

        {/* Input Bar */}
        <div className="mt-4 pt-3 border-t border-border flex items-center space-x-2 transition-all duration-500 delay-300 ease-out animate-in fade-in">
          {/* Voice prompt mic button */}
          <button
            type="button"
            onClick={isVoicePrompting ? handleStopPromptVoice : handleStartPromptVoice}
            disabled={isProcessing || isTranscribingPrompt}
            className={`p-3 rounded-xl transition-all border ${
              isVoicePrompting
                ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-lg shadow-red-500/20 animate-pulse scale-105'
                : isTranscribingPrompt
                ? 'bg-accent/20 text-accent border-accent/40 opacity-80'
                : 'bg-primary text-text-muted hover:text-accent hover:bg-accent/10 border-border'
            }`}
            title={isVoicePrompting ? 'Stop recording & send prompt' : 'Speak prompt to AI Assistant'}
          >
            {isTranscribingPrompt ? (
              <RefreshCw size={18} className="animate-spin text-accent" />
            ) : isVoicePrompting ? (
              <MicOff size={18} />
            ) : (
              <Mic size={18} />
            )}
          </button>

          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendQuery()}
            placeholder={
              isVoicePrompting
                ? 'Listening to your question... speak now'
                : isTranscribingPrompt
                ? 'Transcribing your voice prompt...'
                : 'Ask about your spending, budget, income, or anything financial...'
            }
            disabled={isTranscribingPrompt}
            className="flex-1 bg-[#09090b] border border-zinc-800 hover:border-zinc-700 focus:border-accent text-text placeholder-zinc-500 text-sm rounded-xl px-4 py-3 focus:outline-none transition-colors"
          />

          <button
            type="button"
            onClick={() => {
              if (isVoicePrompting) handleStopPromptVoice();
              else handleSendQuery();
            }}
            disabled={(!inputQuery.trim() && !isVoicePrompting) || isProcessing || isTranscribingPrompt}
            className="bg-accent hover:bg-accent-hover text-primary p-3 rounded-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md"
            title="Send prompt to AI"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      </Reveal>
    </div>
  );
}
