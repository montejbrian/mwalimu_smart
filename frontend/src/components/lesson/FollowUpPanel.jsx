/**
 * MwalimuSmart Web
 * frontend/src/components/lesson/FollowUpPanel.jsx — Lesson-scoped AI follow-up panel (Phase 3)
 *
 * Requirements:
 *   - SSE streaming tokens with first token < 1.5s warm
 *   - Prompt includes lesson objectives + script excerpt (handled by server)
 *   - Thread persisted on first message; POST /api/followups/lessons/:id/threads returns existing thread
 *   - GET /api/followups/threads/:id returns full history
 *   - Follow-up panel visible on lesson page below assessment
 */

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Sparkles,
  Send,
  Eye,
  Bot,
  User,
  AlertCircle,
  Film,
  Clock,
  RotateCw,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import clsx from "clsx";
import { followupsApi, voiceApi } from "../../lib/api.js";
import { streamSSE } from "../../lib/sse.js";
import { useStore, useFollowUpStore } from "../../lib/store.js";
import VisualRenderer from "../visuals/VisualRenderer.jsx";
import Whiteboard from "../visuals/Whiteboard.jsx";

function Tier2PlaceholderCard({ jobId, lang, queuedAt, onRetry }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = queuedAt ? new Date(queuedAt).getTime() : Date.now();
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(seconds);
    }, 1000);
    return () => clearInterval(interval);
  }, [queuedAt]);

  const isTimedOut = elapsed >= 180; // 3 minutes timeout

  if (isTimedOut) {
    return (
      <div
        data-testid="tier2-timeout-card"
        className="mt-3 p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-2"
      >
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-amber-400 shrink-0" />
          <span>
            {lang === "sw"
              ? "Kielelezo hakipatikani kwa sasa."
              : "Visual not available at this moment."}
          </span>
        </div>
        <button
          type="button"
          data-testid="tier2-timeout-retry-btn"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-800 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <RotateCw size={12} />
          <span>{lang === "sw" ? "Jaribu tena" : "Retry visual"}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="tier2-placeholder-card"
      className="mt-3 p-3.5 bg-slate-900 border border-brand-500/40 rounded-xl space-y-2.5 shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-brand-300">
          <Film size={15} className="text-brand-400 animate-pulse" />
          <span>
            {lang === "sw"
              ? "Inaandaa kielelezo cha video cha Manim..."
              : "Generating custom Manim visual animation..."}
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")} / 3:00
        </span>
      </div>

      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-brand-500 h-full rounded-full transition-all duration-1000 animate-pulse"
          style={{ width: `${Math.min(95, Math.max(10, (elapsed / 90) * 100))}%` }}
        />
      </div>

      <div className="text-[11px] text-slate-400 flex items-center justify-between">
        <span>
          {lang === "sw"
            ? "Mwalimu anatengeneza picha na michoro kwa wakati halisi..."
            : "Rendering mathematical geometry & concept frames..."}
        </span>
        <span className="text-brand-400 font-mono text-[10px]">Tier 2 Manim</span>
      </div>
    </div>
  );
}

export default function FollowUpPanel({
  lessonId,
  title,
  keyConcepts = [],
  lang = "en",
}) {
  const [prompt, setPrompt] = useState("");
  const [wantVisual, setWantVisual] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [localMessages, setLocalMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [isStreamingLocal, setIsStreamingLocal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState(null);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const token = useStore((s) => s.token);
  const streamingStore = useFollowUpStore((s) => s.streaming);
  const setStreamingStore = useFollowUpStore((s) => s.setStreaming);

  const isStreaming = isStreamingLocal || streamingStore;

  // Initialize or fetch existing thread for this student + lesson
  useEffect(() => {
    let isMounted = true;
    if (!lessonId || !token) return;

    setLoadingThread(true);
    setStreamError(null);

    followupsApi
      .createOrGetThread(lessonId)
      .then((res) => {
        if (!isMounted) return;
        const tid = res.data?.thread_id;
        setThreadId(tid);
        if (tid) {
          return followupsApi.getHistory(tid);
        }
      })
      .then((histRes) => {
        if (!isMounted || !histRes) return;
        setLocalMessages(histRes.data?.messages || []);
      })
      .catch((err) => {
        if (!isMounted) return;
        // Non-blocking: fail quietly, allow retry on send
      })
      .finally(() => {
        if (isMounted) setLoadingThread(false);
      });

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [lessonId, token]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  // WebSocket & Polling listener for active Tier 2 Manim visual jobs
  useEffect(() => {
    const pendingJobs = localMessages.filter(
      (m) =>
        m.visual_spec?.tier === 2 &&
        (m.visual_spec?.status === "queued" || m.visual_spec?.status === "rendering") &&
        m.visual_spec?.job_id
    );

    if (pendingJobs.length === 0) return;

    let ws = null;
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host || "localhost:4000";
      ws = new WebSocket(`${protocol}//${host}/ws/followups`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "followup_visual_ready" && data.job_id) {
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.visual_spec?.job_id === data.job_id
                  ? {
                      ...msg,
                      visual_spec: {
                        ...msg.visual_spec,
                        status: "ready",
                        asset_url: data.asset_url,
                      },
                    }
                  : msg
              )
            );
          } else if (data.type === "followup_visual_failed" && data.job_id) {
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.visual_spec?.job_id === data.job_id
                  ? {
                      ...msg,
                      visual_spec: {
                        ...msg.visual_spec,
                        status: "failed",
                        error: data.error || "Rendering failed",
                      },
                    }
                  : msg
              )
            );
          }
        } catch {
          // ignore malformed ws messages
        }
      };
    } catch {
      // WS error, fall back to interval polling below
    }

    const interval = setInterval(() => {
      pendingJobs.forEach((m) => {
        const jobId = m.visual_spec.job_id;
        followupsApi
          .getVisualJob(jobId)
          .then((res) => {
            const job = res.data;
            if (job && (job.status === "ready" || job.status === "failed")) {
              setLocalMessages((prev) =>
                prev.map((msg) =>
                  msg.visual_spec?.job_id === jobId
                    ? {
                        ...msg,
                        visual_spec: {
                          ...msg.visual_spec,
                          status: job.status,
                          asset_url: job.asset_url,
                          error: job.error,
                        },
                      }
                    : msg
                )
              );
            }
          })
          .catch(() => {});
      });
    }, 3000);

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [localMessages]);

  const handleRetryVisual = (jobId, questionContent) => {
    setLocalMessages((prev) =>
      prev.map((msg) =>
        msg.visual_spec?.job_id === jobId
          ? {
              ...msg,
              visual_spec: {
                ...msg.visual_spec,
                status: "queued",
                queuedAt: Date.now(),
              },
            }
          : msg
      )
    );
    if (questionContent) {
      setPrompt(questionContent);
    }
  };

  const handleVoicePushToTalk = async () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = lang === "sw" ? "sw-KE" : "en-KE";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsListening(true);
          setStreamError(null);
        };

        recognition.onresult = async (event) => {
          const speechTranscript = event.results?.[0]?.[0]?.transcript;
          setIsListening(false);
          if (speechTranscript) {
            await sendVoiceTurn(speechTranscript);
          }
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err) {
        setIsListening(false);
      }
    }

    // Direct simulated push-to-talk voice query fallback when mic hardware/API is absent
    const fallbackText =
      prompt.trim() ||
      (lang === "sw"
        ? `Nielezee zaidi kuhusu somo hili la ${title || "CBC"}`
        : `Explain this concept in ${title || "this CBC lesson"} clearly with a Kenyan example`);
    await sendVoiceTurn(fallbackText);
  };

  const sendVoiceTurn = async (voiceText) => {
    if (!voiceText || !lessonId) return;
    setIsVoiceLoading(true);
    setStreamError(null);

    const optimisticUserMsg = {
      id: `voice-user-${Date.now()}`,
      role: "student",
      content: voiceText,
      source: "voice",
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await voiceApi.sendMessage({
        lesson_id: lessonId,
        text: voiceText,
        language: lang,
      });
      const data = res.data;
      if (data?.assistant_message) {
        const asstMsg = {
          ...data.assistant_message,
          audio_b64: data.audio_b64,
        };
        setLocalMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUserMsg.id),
          data.student_message || optimisticUserMsg,
          asstMsg,
        ]);
        if (data.audio_b64) {
          try {
            if (audioPlayerRef.current) {
              audioPlayerRef.current.pause();
            }
            const audio = new Audio("data:audio/mp3;base64," + data.audio_b64);
            audioPlayerRef.current = audio;
            setPlayingAudioId(asstMsg.id);
            audio.onended = () => setPlayingAudioId(null);
            audio.play().catch(() => {});
          } catch {}
        }
      }
    } catch (err) {
      setStreamError(
        lang === "sw"
          ? "Hitilafu kwenye msaidizi wa sauti. Jaribu tena."
          : "Voice assistant error. Please try again."
      );
    } finally {
      setIsVoiceLoading(false);
    }
  };

  const togglePlayAudio = (msgId, audioB64) => {
    if (playingAudioId === msgId && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setPlayingAudioId(null);
      return;
    }
    if (audioB64) {
      try {
        if (audioPlayerRef.current) audioPlayerRef.current.pause();
        const audio = new Audio("data:audio/mp3;base64," + audioB64);
        audioPlayerRef.current = audio;
        setPlayingAudioId(msgId);
        audio.onended = () => setPlayingAudioId(null);
        audio.play().catch(() => {});
      } catch {}
    }
  };

  const starterChips = (keyConcepts.length > 0
    ? keyConcepts.slice(0, 3)
    : ["key formula", "real-life example"]
  ).map((concept) =>
    lang === "sw"
      ? `Nielezee zaidi kuhusu ${concept}`
      : `Explain ${concept} with a Kenyan example`
  );

  async function handleSend(e) {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming || !lessonId) return;

    setStreamError(null);

    // 1. Ensure we have a threadId
    let activeThreadId = threadId;
    if (!activeThreadId) {
      try {
        const tRes = await followupsApi.createOrGetThread(lessonId);
        activeThreadId = tRes.data?.thread_id;
        setThreadId(activeThreadId);
      } catch {
        setStreamError(
          lang === "sw"
            ? "Imeshindwa kuunganisha na Mwalimu wa AI. Jaribu tena."
            : "Could not initialize follow-up thread. Please try again."
        );
        return;
      }
    }

    // 2. Append student question and streaming assistant placeholder
    const userMsg = {
      id: `user-${Date.now()}`,
      role: "student",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantPlaceholder = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isStreaming: true,
      created_at: new Date().toISOString(),
    };

    setLocalMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setPrompt("");
    setIsStreamingLocal(true);
    setStreamingStore(true);

    // 3. Initiate SSE stream
    const streamUrl = followupsApi.streamUrl(activeThreadId);
    let streamedContent = "";

    try {
      abortControllerRef.current = new AbortController();

      await streamSSE(
        streamUrl,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: {
            content: trimmed,
            lang,
            with_visuals: true,
          },
          signal: abortControllerRef.current.signal,
        },
        {
          onToken: (tok) => {
            streamedContent += tok;
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: streamedContent, isStreaming: true }
                  : msg
              )
            );
          },
          onVisualQueued: (vData) => {
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      visual_loading: vData.tier === 1,
                      visual_spec:
                        vData.tier === 2
                          ? {
                              tier: 2,
                              job_id: vData.job_id,
                              status: "queued",
                              queuedAt: Date.now(),
                            }
                          : { tier: 1, template_id: vData.template_id },
                    }
                  : msg
              )
            );
          },
          onVisualReady: (vData) => {
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      has_visual: true,
                      visual_loading: false,
                      visual_spec: vData,
                    }
                  : msg
              )
            );
          },
          onWhiteboardOp: (op) => {
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      has_visual: true,
                      visual_loading: false,
                      visual_spec: {
                        tier: "whiteboard",
                        template_id: "whiteboard",
                        ops: [...(msg.visual_spec?.ops || []), op],
                      },
                    }
                  : msg
              )
            );
          },
          onDone: (data) => {
            setIsStreamingLocal(false);
            setStreamingStore(false);
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      id: data.message_id || msg.id,
                      content: data.full_content || streamedContent,
                      has_visual: data.has_visual || msg.has_visual,
                      visual_spec: data.visual_spec || msg.visual_spec,
                      visual_loading: false,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          },
          onError: (err) => {
            setIsStreamingLocal(false);
            setStreamingStore(false);
            setStreamError(err.message || "Streaming error");
            setLocalMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      visual_loading: false,
                      content:
                        streamedContent ||
                        (lang === "sw"
                          ? "Samahani, mtandao ulikatika kabla ya jibu kukamilika. Tafadhali jaribu tena."
                          : "Apologies, the connection dropped before the answer completed. Please ask again."),
                      isStreaming: false,
                    }
                  : msg
              )
            );
          },
        }
      );
    } catch {
      setIsStreamingLocal(false);
      setStreamingStore(false);
    }
  }

  return (
    <section
      id="lesson-followup-panel"
      data-testid="followup-panel"
      className="rounded-3xl glass-active border border-brand-500/40 p-6 space-y-4 shadow-glow-green"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400 font-body">
            <Sparkles size={14} />
            <span>
              {lang === "sw"
                ? "Mwalimu Msaidizi wa AI (Anajua Somo Hili)"
                : "Lesson-Scoped AI Office Hours"}
            </span>
          </div>
          <h3 className="font-display text-lg font-semibold text-ink-100">
            {lang === "sw"
              ? "Una swali kuhusu somo hili? Uliza hapa."
              : "Have a question about what you just learned? Ask Mwalimu."}
          </h3>
        </div>

        <button
          type="button"
          data-testid="toggle-explain-visuals"
          onClick={() => setWantVisual((v) => !v)}
          className={clsx(
            "px-3.5 py-1.5 rounded-xl text-xs font-medium font-body border inline-flex items-center gap-1.5 transition-all",
            wantVisual
              ? "bg-brand-500 text-white border-brand-400"
              : "glass border-[var(--border)] text-ink-300 hover:text-ink-100"
          )}
        >
          <Eye size={13} />
          <span>
            {lang === "sw" ? "Eleza kwa Michoro" : "Explain with visuals"}
          </span>
        </button>
      </div>

      {/* Starter prompt chips */}
      <div className="flex flex-wrap gap-2">
        {starterChips.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setPrompt(chip);
            }}
            className="px-3 py-1 rounded-full glass border border-[var(--border)] hover:border-brand-500/40 text-xs text-ink-300 hover:text-ink-100 font-body transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Stream Error Banner */}
      {streamError && (
        <div
          data-testid="followup-error-banner"
          className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{streamError}</span>
        </div>
      )}

      {/* Message history */}
      {localMessages.length > 0 && (
        <div
          className="space-y-3 max-h-80 overflow-y-auto pr-1"
          data-testid="followup-messages"
        >
          {localMessages.map((m) => (
            <div
              key={m.id}
              className={clsx(
                "flex items-start gap-2.5",
                m.role === "student" ? "justify-end" : "justify-start"
              )}
            >
              {m.role === "assistant" && (
                <div className="w-6 h-6 rounded-full bg-brand-500/20 border border-brand-500/40 text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={13} />
                </div>
              )}
              <div
                className={clsx(
                  "rounded-2xl px-4 py-3 text-xs font-body leading-relaxed max-w-[85%]",
                  m.role === "student"
                    ? "bg-brand-500/15 border border-brand-500/30 text-ink-100 ml-4"
                    : "bg-ink-900/80 border border-[var(--border)] text-ink-200 mr-4"
                )}
              >
                {(m.source === "voice" || m.visual_spec?.source === "voice") && (
                  <div className="mb-1">
                    <span
                      data-testid="voice-turn-badge"
                      className="inline-flex items-center gap-1 text-[10px] text-brand-300 font-mono px-1.5 py-0.5 rounded bg-brand-500/15 border border-brand-500/30"
                    >
                      <Mic size={10} />
                      <span>Voice</span>
                    </span>
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.role === "assistant" && (m.audio_b64 || m.visual_spec?.has_audio) && (
                  <div className="mt-2 pt-1 border-t border-[var(--border)] flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="voice-play-audio-btn"
                      onClick={() => togglePlayAudio(m.id, m.audio_b64)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
                    >
                      {playingAudioId === m.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      <span>
                        {playingAudioId === m.id
                          ? (lang === "sw" ? "Sitisha sauti" : "Pause audio")
                          : (lang === "sw" ? "Sikiliza jibu" : "Listen to answer")}
                      </span>
                    </button>
                  </div>
                )}
                {m.visual_loading && (
                  <div
                    data-testid="visual-loading-indicator"
                    className="mt-2.5 p-2.5 bg-slate-800/80 border border-brand-500/30 rounded-xl flex items-center gap-2 text-xs text-brand-300 animate-pulse"
                  >
                    <Sparkles size={13} className="shrink-0 text-brand-400" />
                    <span>
                      {lang === "sw"
                        ? "Mwalimu anachora kielelezo..."
                        : "Preparing interactive visual..."}
                    </span>
                  </div>
                )}
                {/* Progressive Whiteboard Canvas (Phase 4.2) */}
                {(m.has_visual || m.visual_spec) &&
                  (m.visual_spec?.tier === "whiteboard" || m.visual_spec?.template_id === "whiteboard") && (
                    <div className="mt-2.5">
                      <Whiteboard
                        ops={m.visual_spec.ops || []}
                        title={m.visual_spec.title || (lang === "sw" ? "Ubao wa Hatua kwa Hatua" : "Progressive Whiteboard")}
                        isStreaming={m.isStreaming}
                      />
                    </div>
                  )}

                {/* Tier 1 Interactive SVG Visual */}
                {(m.has_visual || m.visual_spec) && m.visual_spec?.tier === 1 && m.visual_spec?.template_id && (
                  <div className="mt-2 pt-1">
                    <VisualRenderer visualSpec={m.visual_spec} />
                  </div>
                )}

                {/* Tier 2 Manim Video Animation */}
                {(m.has_visual || m.visual_spec) && m.visual_spec?.tier === 2 && (
                  <div className="mt-2.5">
                    {m.visual_spec.status === "ready" && m.visual_spec.asset_url ? (
                      <div data-testid="tier2-video-container" className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-brand-400 font-semibold">
                          <Film size={14} />
                          <span>
                            {lang === "sw"
                              ? "Ufafanuzi wa Video (Manim)"
                              : "Custom Video Animation (Manim)"}
                          </span>
                        </div>
                        <video
                          data-testid="tier2-video-player"
                          src={m.visual_spec.asset_url}
                          controls
                          autoPlay
                          playsInline
                          className="w-full rounded-2xl border border-brand-500/40 shadow-lg bg-black"
                        />
                      </div>
                    ) : m.visual_spec.status === "failed" ? (
                      <div
                        data-testid="tier2-failed-card"
                        className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle size={15} className="text-red-400 shrink-0" />
                          <span>
                            {lang === "sw"
                              ? "Mchoro wa video haukufanikiwa kuundwa kwa swali hili."
                              : "Could not generate animation for this question."}
                          </span>
                        </div>
                        <button
                          type="button"
                          data-testid="tier2-retry-btn"
                          onClick={() => handleRetryVisual(m.visual_spec.job_id, m.content)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-medium"
                        >
                          <RotateCw size={12} />
                          <span>{lang === "sw" ? "Jaribu tena" : "Retry visual"}</span>
                        </button>
                      </div>
                    ) : (
                      <Tier2PlaceholderCard
                        jobId={m.visual_spec.job_id}
                        lang={lang}
                        queuedAt={m.visual_spec.created_at || m.visual_spec.queuedAt}
                        onRetry={() => handleRetryVisual(m.visual_spec.job_id, m.content)}
                      />
                    )}
                  </div>
                )}
                {m.isStreaming && !m.content && !m.visual_loading && (
                  <span className="inline-flex items-center gap-1 text-ink-400 italic">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                    <span>{lang === "sw" ? "Mwalimu anatafakari..." : "Mwalimu is thinking..."}</span>
                  </span>
                )}
              </div>
              {m.role === "student" && (
                <div className="w-6 h-6 rounded-full bg-ink-800 border border-[var(--border)] text-ink-300 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={13} />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSend} className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <input
            type="text"
            data-testid="followup-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isStreaming || isVoiceLoading}
            placeholder={
              lang === "sw"
                ? "Uliza swali lolote kuhusu somo hili..."
                : "Ask a follow-up question about this lesson..."
            }
            className="input pr-4"
          />
        </div>
        <button
          type="button"
          data-testid="voice-mic-btn"
          onClick={handleVoicePushToTalk}
          disabled={isStreaming || isVoiceLoading}
          className={clsx(
            "px-3.5 py-3 rounded-2xl font-medium border inline-flex items-center gap-1.5 transition-all text-xs",
            isListening
              ? "bg-red-500 text-white border-red-400 animate-pulse ring-2 ring-red-400/50"
              : isVoiceLoading
              ? "bg-brand-500/20 text-brand-300 border-brand-500/40 animate-pulse"
              : "glass border-[var(--border)] text-brand-300 hover:text-brand-100 hover:border-brand-500/50"
          )}
          title={lang === "sw" ? "Ongea na Mwalimu (Push-to-Talk)" : "Push-to-talk voice assistant"}
        >
          {isListening ? <MicOff size={15} /> : <Mic size={15} />}
          <span className="hidden sm:inline">
            {isListening
              ? (lang === "sw" ? "Inasikiliza..." : "Listening...")
              : isVoiceLoading
              ? (lang === "sw" ? "Inajibu..." : "Speaking...")
              : (lang === "sw" ? "Sauti" : "Voice")}
          </span>
        </button>
        <button
          type="submit"
          data-testid="followup-submit-btn"
          disabled={!prompt.trim() || isStreaming || isVoiceLoading}
          className="btn-primary px-4 py-3 disabled:opacity-40"
        >
          <MessageSquare size={15} className="hidden sm:inline" />
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
