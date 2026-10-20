import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Send,
  Mic,
  MicOff,
  Volume2,
  RefreshCw,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Square,
  HelpCircle,
} from "lucide-react";
import { useStore } from "../lib/store.js";
import { catalogApi, followupsApi } from "../lib/api.js";
import { createSSEParser } from "../lib/sse.js";
import VisualRenderer from "../components/visuals/VisualRenderer.jsx";
import Whiteboard from "../components/visuals/Whiteboard.jsx";
import clsx from "clsx";

const QUICK_PROMPTS = [
  {
    en: "Show step by step on the whiteboard: solve 2x + 7 = 19",
    sw: "Nionyeshe hatua kwa hatua ubaoni: tatua 2x + 7 = 19",
    subject: "mathematics",
  },
  {
    en: "Explain the difference between a mixture and a compound with examples",
    sw: "Eleza tofauti kati ya mchanganyiko na mchanganyiko safi kwa mifano",
    subject: "integrated-science",
  },
  {
    en: "Draw a number line showing integers from -5 to 5",
    sw: "Chora mstari wa nambari ukionyesha nambari kamili kutoka -5 hadi 5",
    subject: "mathematics",
  },
  {
    en: "What are the four components of blood and their functions?",
    sw: "Ni yapi sehemu nne za damu na kazi zao mwilini?",
    subject: "integrated-science",
  },
];

export default function AskPage() {
  const lang = useStore((s) => s.language) || "en";
  const user = useStore((s) => s.user);
  const isSw = lang === "sw";

  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [threadId, setThreadId] = useState(null);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [activeVisual, setActiveVisual] = useState(null);
  const [whiteboardOps, setWhiteboardOps] = useState([]);

  // Voice push-to-talk states
  const [isListening, setIsListening] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef(null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      setRecognitionSupported(true);
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = isSw ? "sw-KE" : "en-KE";

      rec.onresult = (evt) => {
        const transcript = Array.from(evt.results)
          .map((r) => r[0].transcript)
          .join("");
        setInput(transcript);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, [isSw]);

  // Load Grade 7 subjects & initialize thread
  useEffect(() => {
    let mounted = true;
    async function loadCatalog() {
      try {
        const levels = await catalogApi.getLevels();
        const jss = levels.find((l) => l.name.toLowerCase().includes("junior")) || levels[0];
        if (!jss) return;

        const grades = await catalogApi.getGrades(jss.id);
        const grade7 = grades[0];
        if (!grade7) return;

        const subjs = await catalogApi.getSubjects(grade7.id);
        if (!mounted) return;
        setSubjects(subjs);

        const math = subjs.find((s) => s.code === "mathematics") || subjs[0];
        setSelectedSubject(math);

        // Fetch strands & substrands to get first published lesson
        const strands = await catalogApi.getStrands(grade7.id, math.code);
        if (strands && strands.length > 0) {
          const substrands = await catalogApi.getSubstrands(strands[0].id);
          if (substrands && substrands.length > 0) {
            // Get lesson for this substrand
            const tRes = await followupsApi.getSavedThreads({ lang });
            const existing = tRes.threads?.find((t) => t.subject_name?.toLowerCase() === (math.name_en || math.name).toLowerCase());
            if (existing) {
              setThreadId(existing.thread_id);
              setActiveLessonId(existing.lesson_id);
              const hist = await followupsApi.getThread(existing.thread_id);
              setMessages(hist.messages || []);
              return;
            }
          }
        }
      } catch (err) {
        console.error("Failed to initialize ask catalog", err);
      }
    }
    loadCatalog();
    return () => {
      mounted = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [lang]);

  // When subject changes, switch thread
  async function handleSelectSubject(subj) {
    setSelectedSubject(subj);
    try {
      const tRes = await followupsApi.getSavedThreads({ lang });
      const found = tRes.threads?.find(
        (t) =>
          t.subject_name?.toLowerCase() === (subj.name_en || subj.name || "").toLowerCase()
      );
      if (found) {
        setThreadId(found.thread_id);
        setActiveLessonId(found.lesson_id);
        const hist = await followupsApi.getThread(found.thread_id);
        setMessages(hist.messages || []);
      } else {
        // Create or get thread
        if (subj.id) {
          // Find first published lesson
          const lRes = await catalogApi.getStrands(subj.grade_id || 71, subj.code);
          if (lRes && lRes[0]) {
            const ss = await catalogApi.getSubstrands(lRes[0].id);
            if (ss && ss[0]) {
              // Create thread from lesson
              const created = await followupsApi.getOrCreateThread(ss[0].lesson_id || ss[0].id);
              setThreadId(created.thread_id);
              setActiveLessonId(created.lesson_id);
              setMessages([]);
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText, whiteboardOps]);

  function toggleVoiceInput() {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInput("");
      recognitionRef.current.lang = isSw ? "sw-KE" : "en-KE";
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  }

  async function handleSendMessage(promptText) {
    const textToSend = (promptText || input).trim();
    if (!textToSend || isStreaming) return;

    setInput("");
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    // Add student message immediately
    const studentMsg = {
      id: "temp-" + Date.now(),
      role: "student",
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, studentMsg]);

    setIsStreaming(true);
    setStreamedText("");
    setActiveVisual(null);
    setWhiteboardOps([]);

    // If no thread exists yet, query saved threads or use first available
    let currentThreadId = threadId;
    if (!currentThreadId) {
      try {
        const saved = await followupsApi.getSavedThreads({ lang });
        if (saved.threads && saved.threads.length > 0) {
          currentThreadId = saved.threads[0].thread_id;
          setThreadId(currentThreadId);
        }
      } catch {
        // Fallback
      }
    }

    if (!currentThreadId) {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          role: "assistant",
          content: isSw
            ? "Tafadhali chagua mada au somo kutoka mtaala kwanza ili kuanza mazungumzo."
            : "Please select a subject or topic from the curriculum first to start.",
          created_at: new Date().toISOString(),
        },
      ]);
      return;
    }

    try {
      const token = localStorage.getItem("mwalimu_token");
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;

      const res = await fetch(`/api/followups/threads/${currentThreadId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
          "Accept-Language": lang,
        },
        body: JSON.stringify({
          content: textToSend,
          lang,
          with_visuals: true,
        }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        throw new Error("Failed to connect to tutor");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAssistantText = "";
      let finalVisualSpec = null;
      const collectedOps = [];

      const parser = createSSEParser(({ event, data }) => {
        if (event === "token") {
          fullAssistantText += data.token || "";
          setStreamedText(fullAssistantText);
        } else if (event === "whiteboard_op") {
          collectedOps.push(data);
          setWhiteboardOps([...collectedOps]);
        } else if (event === "visual_ready") {
          finalVisualSpec = data;
          setActiveVisual(data);
        } else if (event === "done") {
          const finalMsg = {
            id: data.message_id || "asst-" + Date.now(),
            role: "assistant",
            content: data.full_content || fullAssistantText,
            has_visual: Boolean(finalVisualSpec || collectedOps.length > 0),
            visual_spec:
              finalVisualSpec ||
              (collectedOps.length > 0
                ? { tier: "whiteboard", template_id: "whiteboard", ops: collectedOps }
                : null),
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, finalMsg]);
          setStreamedText("");
          setIsStreaming(false);
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Streaming error:", err);
      }
      setIsStreaming(false);
    }
  }

  function handleSpeak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isSw ? "sw-KE" : "en-KE";
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div
      data-testid="ask-page"
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col h-[calc(100vh-5rem)]"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-white/10 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
              <Sparkles size={20} />
            </span>
            <h1 className="text-xl font-display font-bold text-ink-100">
              {isSw ? "Mwalimu Wako wa CBC" : "Ask Your CBC AI Tutor"}
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              {isSw ? "Moja kwa Moja" : "Interactive"}
            </span>
          </div>
          <p className="text-xs text-ink-400 mt-1">
            {isSw
              ? "Uliza maswali ya mtaala, pata ufafanuzi wa hatua kwa hatua ubaoni na picha za kuelekeza."
              : "Ask curriculum questions, get step-by-step whiteboard working, and interactive diagrams."}
          </p>
        </div>

        {/* Subject Pills */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {subjects.map((s) => {
            const isSelected = selectedSubject?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSelectSubject(s)}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap",
                  isSelected
                    ? "bg-brand-500 text-ink-900 shadow-sm"
                    : "glass text-ink-300 hover:text-ink-100 hover:bg-white/5"
                )}
              >
                {isSw ? s.name_sw || s.name : s.name_en || s.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Visual / Whiteboard Stage (Top/Side) & Chat Stream */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 py-4 min-h-0 overflow-hidden">
        {/* Stage Area (5 cols on large screens): Active Whiteboard or Visual */}
        <div className="lg:col-span-5 flex flex-col gap-3 min-h-[260px] lg:min-h-0 bg-surface-900/60 rounded-2xl border border-white/10 p-3 overflow-y-auto">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
              <BookOpen size={14} className="text-brand-400" />
              {isSw ? "Ubao & Michoro ya Somo" : "Whiteboard & Visual Stage"}
            </span>
            {(activeVisual || whiteboardOps.length > 0) && (
              <span className="text-[11px] text-brand-400 bg-brand-400/10 px-2 py-0.5 rounded-full border border-brand-400/20">
                {activeVisual?.tier === "whiteboard" || whiteboardOps.length > 0
                  ? isSw
                    ? "Ubao wa Hatua"
                    : "Chalkboard Steps"
                  : isSw
                  ? "Mchoro wa SVG"
                  : "CBC Diagram"}
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            {whiteboardOps.length > 0 || activeVisual?.tier === "whiteboard" ? (
              <div className="w-full">
                <Whiteboard
                  ops={
                    whiteboardOps.length > 0
                      ? whiteboardOps
                      : activeVisual?.ops || []
                  }
                  title={
                    isSw
                      ? "Hatua za Utatuzi Ubaoni"
                      : "Step-by-Step Chalkboard Working"
                  }
                />
              </div>
            ) : activeVisual ? (
              <div className="w-full">
                <VisualRenderer visualSpec={activeVisual} />
              </div>
            ) : (
              <div className="text-center p-6 text-ink-500">
                <HelpCircle size={36} className="mx-auto mb-2 opacity-40 text-brand-400" />
                <p className="text-sm font-medium text-ink-300">
                  {isSw
                    ? "Uliza swali linalohitaji hatua au mchoro"
                    : "Ask a question with steps or diagrams"}
                </p>
                <p className="text-xs text-ink-500 mt-1 max-w-xs mx-auto">
                  {isSw
                    ? "Ubao utachora hatua za hisabati au michoro ya sayansi papo hapo unapouliza."
                    : "The chalkboard will progressively illustrate math steps or science diagrams."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Chat / Dialogue Stream (7 cols on large screens) */}
        <div className="lg:col-span-7 flex flex-col bg-surface-900/40 rounded-2xl border border-white/10 p-4 min-h-0 overflow-hidden">
          {/* Scrollable Message List */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.length === 0 && !isStreaming && (
              <div className="py-6 text-center">
                <div className="inline-flex p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400 mb-3">
                  <Lightbulb size={24} />
                </div>
                <h3 className="text-base font-semibold text-ink-100">
                  {isSw ? "Uliza Chochote Kuhusu Mtaala" : "Ask Anything About the Curriculum"}
                </h3>
                <p className="text-xs text-ink-400 mt-1 max-w-md mx-auto">
                  {isSw
                    ? "Chagua swali hapa chini au andika/ongea swali lako upate majibu ya haraka ya Kiswahili au Kiingereza."
                    : "Select a suggestion below or type/speak your question for instant bilingual help."}
                </p>

                {/* Quick Prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-left">
                  {QUICK_PROMPTS.map((qp, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(isSw ? qp.sw : qp.en)}
                      className="p-3 rounded-xl glass hover:bg-white/10 border border-white/10 text-xs text-ink-200 transition-all flex items-start gap-2 group"
                    >
                      <ChevronRight
                        size={14}
                        className="text-brand-400 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform"
                      />
                      <span>{isSw ? qp.sw : qp.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "flex flex-col max-w-[88%]",
                  m.role === "student" ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div
                  className={clsx(
                    "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                    m.role === "student"
                      ? "bg-brand-500 text-ink-900 font-medium rounded-br-sm"
                      : "bg-surface-800 text-ink-100 border border-white/10 rounded-bl-sm"
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[10px] text-ink-500">
                    {m.role === "student"
                      ? isSw
                        ? "Wewe"
                        : "You"
                      : isSw
                      ? "Mwalimu AI"
                      : "Mwalimu AI"}
                  </span>
                  {m.role === "assistant" && (
                    <button
                      onClick={() => handleSpeak(m.content)}
                      className="text-ink-400 hover:text-brand-400 transition-colors"
                      title={isSw ? "Soma kwa sauti" : "Read aloud"}
                    >
                      <Volume2 size={13} />
                    </button>
                  )}
                  {m.has_visual && m.visual_spec && (
                    <button
                      onClick={() => {
                        setActiveVisual(m.visual_spec);
                        if (m.visual_spec.tier === "whiteboard") {
                          setWhiteboardOps(m.visual_spec.ops || []);
                        }
                      }}
                      className="text-[10px] text-brand-400 hover:underline flex items-center gap-0.5"
                    >
                      {isSw ? "Onyesha ubao" : "View stage"}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Currently streaming response */}
            {isStreaming && (
              <div className="flex flex-col max-w-[88%] mr-auto items-start">
                <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed bg-surface-800 text-ink-100 border border-white/10 rounded-bl-sm">
                  <p className="whitespace-pre-wrap">{streamedText}</p>
                  <span className="inline-block w-2 h-4 bg-brand-400 animate-pulse ml-1 align-middle" />
                </div>
                <span className="text-[10px] text-brand-400 mt-1 px-1 flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" />
                  {isSw ? "Mwalimu anajibu..." : "Mwalimu is thinking..."}
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar with Voice Push-To-Talk */}
          <div className="pt-3 border-t border-white/10 mt-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isListening
                    ? isSw
                      ? "Inasikiliza sauti yako..."
                      : "Listening to your voice..."
                    : isSw
                    ? "Uliza swali lako hapa..."
                    : "Type your question here..."
                }
                data-testid="ask-input"
                className={clsx(
                  "flex-1 px-4 py-2.5 rounded-xl bg-surface-900 border text-sm text-ink-100 placeholder-ink-500 focus:outline-none transition-colors",
                  isListening
                    ? "border-red-500 bg-red-500/5"
                    : "border-white/10 focus:border-brand-500"
                )}
              />

              {/* Push-to-talk mic button */}
              {recognitionSupported && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  data-testid="ask-mic-button"
                  title={
                    isListening
                      ? isSw
                        ? "Acha kusikiliza"
                        : "Stop recording"
                      : isSw
                      ? "Ongea na Mwalimu"
                      : "Push to talk"
                  }
                  className={clsx(
                    "p-2.5 rounded-xl border transition-all flex items-center justify-center",
                    isListening
                      ? "bg-red-500 text-white border-red-400 animate-pulse"
                      : "glass text-ink-300 hover:text-ink-100 border-white/10"
                  )}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}

              {/* Send Button */}
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                data-testid="ask-send-button"
                className={clsx(
                  "p-2.5 rounded-xl font-medium transition-all flex items-center justify-center",
                  input.trim() && !isStreaming
                    ? "bg-brand-500 text-ink-900 hover:bg-brand-400 shadow-sm"
                    : "glass text-ink-600 border border-white/5 cursor-not-allowed"
                )}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
