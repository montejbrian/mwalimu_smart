import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Home,
  Compass,
  Mic,
  GraduationCap,
  PenTool,
  ClipboardCheck,
  Languages,
  LogOut,
  Menu,
  X,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { useStore } from "../../lib/store.js";
import clsx from "clsx";

const STUDENT_NAV = [
  { to: "/", icon: Home, label: { en: "Home", sw: "Nyumbani" }, end: true },
  { to: "/browse", icon: Compass, label: { en: "Curriculum", sw: "Mtaala" } },
  { to: "/ask", icon: Sparkles, label: { en: "Ask Tutor", sw: "Uliza Mwalimu" } },
  { to: "/me", icon: GraduationCap, label: { en: "My Learning", sw: "Mafunzo Yangu" } },
  { to: "/voice", icon: Mic, label: { en: "Voice Tutor", sw: "Mwalimu wa Sauti" } },
];

const TEACHER_NAV = [
  { to: "/authoring", icon: PenTool, label: { en: "Authoring", sw: "Utunzi" }, end: true },
  { to: "/authoring/review", icon: ClipboardCheck, label: { en: "Review Queue", sw: "Ukaguzi" } },
];

function NavItem({ to, icon: Icon, label, collapsed, end = false }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ x: 3 }}
          whileTap={{ scale: 0.97 }}
          className={clsx(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
            isActive
              ? "glass-active text-brand-400 font-medium"
              : "text-ink-400 hover:text-ink-100 hover:bg-white/5"
          )}
        >
          <Icon size={18} className={clsx("flex-shrink-0", isActive && "text-brand-400")} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="text-sm font-body whitespace-nowrap overflow-hidden"
              >
                {label}
              </motion.span>
            )}
          </AnimatePresence>
          {isActive && !collapsed && (
            <motion.div layoutId="nav-indicator" className="ml-auto">
              <ChevronRight size={14} className="text-brand-500" />
            </motion.div>
          )}
        </motion.div>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { sidebarOpen, toggleSidebar, user, logout, language, setLanguage } = useStore();
  const navigate = useNavigate();
  const lang = language === "sw" ? "sw" : "en";
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function toggleLang() {
    setLanguage(lang === "en" ? "sw" : "en");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* ── Sidebar ── */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 68 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex-shrink-0 flex flex-col h-full glass border-r border-[var(--border)] z-20 overflow-hidden relative"
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-[var(--border)]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-jade-500 flex items-center justify-center flex-shrink-0 shadow-glow-green">
            <Sparkles size={18} className="text-white" />
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="overflow-hidden"
              >
                <p className="font-display text-sm font-semibold text-ink-100 leading-tight">
                  MwalimuSmart
                </p>
                <p className="text-[10px] text-ink-500 font-body">
                  {lang === "sw" ? "Maktaba ya CBC" : "CBC Lesson Library"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto">
          {STUDENT_NAV.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label[lang]}
              end={item.end}
              collapsed={!sidebarOpen}
            />
          ))}

          {isTeacher && (
            <>
              {sidebarOpen && (
                <p className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-ink-500 font-body">
                  {lang === "sw" ? "Mwalimu" : "Teacher"}
                </p>
              )}
              {TEACHER_NAV.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label[lang]}
                  end={item.end}
                  collapsed={!sidebarOpen}
                />
              ))}
            </>
          )}
        </nav>

        {/* User + logout */}
        <div className="px-2 py-3 border-t border-[var(--border)] space-y-1">
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 py-2 mb-1"
              >
                <p className="text-xs font-medium text-ink-200 truncate">
                  {user?.name || (isTeacher ? "Teacher" : "Student")}
                </p>
                <p className="text-[11px] text-ink-500 truncate capitalize">
                  {user?.role || "student"}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-ink-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          >
            <LogOut size={16} className="flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-sm font-body whitespace-nowrap overflow-hidden"
                >
                  {lang === "sw" ? "Ondoka" : "Logout"}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Toggle button */}
        <button
          onClick={toggleSidebar}
          className="absolute bottom-20 -right-3.5 w-7 h-7 rounded-full bg-ink-800 border border-[var(--border)] flex items-center justify-center hover:bg-ink-700 transition-all duration-200 shadow-lg z-30"
        >
          <motion.div animate={{ rotate: sidebarOpen ? 0 : 180 }}>
            <X size={12} className="text-ink-400" />
          </motion.div>
        </button>
      </motion.aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-[var(--border)] glass">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-white/5 text-ink-400 hover:text-ink-200 transition-all"
            >
              <Menu size={18} />
            </button>
            <div className="h-4 w-px bg-ink-800" />
            <span className="text-sm text-ink-400 font-body">
              {lang === "sw"
                ? "Jukwaa la Masomo ya CBC · KICD"
                : "CBC-Aligned Lesson Library"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* One-tap EN / SW Language Toggle */}
            <button
              type="button"
              data-testid="lang-toggle"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass border border-[var(--border)] hover:border-brand-500/40 text-xs font-medium text-ink-200 transition-all"
              title="Switch language between English and Kiswahili"
            >
              <Languages size={14} className="text-brand-400" />
              <span className={clsx(lang === "en" ? "text-brand-400 font-semibold" : "text-ink-400")}>
                EN
              </span>
              <span className="text-ink-600">/</span>
              <span className={clsx(lang === "sw" ? "text-brand-400 font-semibold" : "text-ink-400")}>
                SW
              </span>
            </button>

            <span className="badge-green hidden sm:inline-flex">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
              {lang === "sw" ? "Mfumo Uko Tayari" : "Library Ready"}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
