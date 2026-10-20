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
import { MessageSquare, Sparkles, Send, Eye, Bot, User, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { followupsApi } from "../../lib/api.js";
import { streamSSE } from "../../lib/sse.js";
import { useStore, useFollowUpStore } from "../../lib/store.js";
import VisualRenderer from "../visuals/VisualRenderer.jsx";

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

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

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
                      visual_loading: true,
                      visual_spec: { tier: vData.tier || 1, template_id: vData.template_id },
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
                <div className="whitespace-pre-wrap">{m.content}</div>
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
                {(m.has_visual || m.visual_spec) && m.visual_spec?.template_id && (
                  <div className="mt-2 pt-1">
                    <VisualRenderer visualSpec={m.visual_spec} />
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
            disabled={isStreaming}
            placeholder={
              lang === "sw"
                ? "Uliza swali lolote kuhusu somo hili..."
                : "Ask a follow-up question about this lesson..."
            }
            className="input pr-4"
          />
        </div>
        <button
          type="submit"
          data-testid="followup-submit-btn"
          disabled={!prompt.trim() || isStreaming}
          className="btn-primary px-4 py-3 disabled:opacity-40"
        >
          <MessageSquare size={15} className="hidden sm:inline" />
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
