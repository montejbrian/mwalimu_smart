import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Sparkles, Eye, EyeOff, ArrowRight, BookOpen, AlertCircle } from "lucide-react";
import { useStore } from "../lib/store.js";
import api from "../lib/api.js";
import toast from "react-hot-toast";

export default function LoginPage() {
  const navigate  = useNavigate();
  const login     = useStore((s) => s.login);
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [role,    setRole]    = useState("teacher");
  const [showPw,  setShowPw]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = { email: email.trim(), role };
      if (role === "teacher") payload.password = pass;
      const res = await api.post("/auth/login", payload);
      const { access_token, refresh_token, user } = res.data;
      localStorage.setItem("mwalimu_refresh", refresh_token);
      login(access_token, user);
      toast.success(`Welcome, ${user.name}!`);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error?.message || err.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex">
      <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex lg:w-[55%] flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 z-10">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-jade-500 flex items-center justify-center shadow-glow-green">
            <Sparkles size={22} className="text-white" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink-100">MwalimuSmart</p>
            <p className="text-xs text-ink-500">Institutional OS v1.0</p>
          </div>
        </div>
        <div className="z-10 space-y-6">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }} className="font-display text-5xl font-semibold leading-[1.15]">
            CBC-aligned lessons,{" "}<span className="text-gradient">powered by AI.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }} className="text-ink-400 font-body text-lg leading-relaxed max-w-md">
            Generate KICD-approved lesson content, run diagnostic assessments,
            animate key concepts, and guide students with a CBC-aware bilingual voice assistant.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }} className="flex flex-wrap gap-2">
            {["RAG · KICD content", "Formative mastery", "Manim animations", "Teacher-reviewed", "en-KE · sw-KE"].map(f => (
              <span key={f} className="badge-green text-xs">{f}</span>
            ))}
          </motion.div>
        </div>
        <p className="text-xs text-ink-600 z-10 font-body">© 2025 MwalimuSmart · Built for Kenyan Schools</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-semibold text-ink-100 mb-1">Welcome back</h2>
          <p className="text-sm text-ink-500 font-body mb-6">Sign in to your account</p>

          <div className="flex bg-ink-900/50 p-1 rounded-xl mb-6 border border-ink-800">
            <button
              type="button"
              onClick={() => setRole("teacher")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${role === "teacher" ? "bg-ink-800 text-ink-100 shadow-sm" : "text-ink-400 hover:text-ink-300"}`}
            >
              Teacher
            </button>
            <button
              type="button"
              onClick={() => setRole("student")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${role === "student" ? "bg-brand-500/20 text-brand-400 border border-brand-500/30 shadow-sm" : "text-ink-400 hover:text-ink-300"}`}
            >
              Student
            </button>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-5">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400 font-body">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-400 mb-1.5 block font-body">Email address</label>
              <input type="email" className="input" autoComplete="email"
                placeholder={role === "teacher" ? "teacher@school.sc.ke" : "student@school.sc.ke"}
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {role === "teacher" && (
              <div>
                <label className="text-xs font-medium text-ink-400 mb-1.5 block font-body">Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} className="input pr-10"
                    autoComplete="current-password" placeholder="••••••••"
                    value={pass} onChange={e => setPass(e.target.value)} required />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}
            <motion.button type="submit" disabled={loading}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="w-full btn-primary justify-center py-3 mt-2">
              {loading
                ? <span className="flex items-center gap-2"><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" />Signing in…</span>
                : <> Sign in <ArrowRight size={16} /> </>}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
