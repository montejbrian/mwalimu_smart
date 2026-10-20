import { create } from "zustand";
import { catalogApi, lessonsApi, authoringApi } from "./api.js";

const storage =
  typeof localStorage !== "undefined"
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

export const useStore = create((set) => ({
  // ── Auth & Locale ───────────────────────────────────────────────────────────
  token: storage.getItem("mwalimu_token") || null,
  user: JSON.parse(storage.getItem("mwalimu_user") || "null"),
  language: storage.getItem("mwalimu_lang") || "en",

  login(token, user) {
    storage.setItem("mwalimu_token", token);
    storage.setItem("mwalimu_user", JSON.stringify(user));
    set({ token, user });
  },
  logout() {
    storage.removeItem("mwalimu_token");
    storage.removeItem("mwalimu_user");
    set({ token: null, user: null });
  },
  setLanguage(lang) {
    const normalized = lang === "sw" ? "sw" : "en";
    storage.setItem("mwalimu_lang", normalized);
    set({ language: normalized });
  },

  // ── Active lesson (legacy compatibility) ───────────────────────────────────
  activeLessonId: null,
  activeLessonStatus: null,
  activeLessonData: null,

  setActiveLesson(id, status, data = null) {
    set({ activeLessonId: id, activeLessonStatus: status, activeLessonData: data });
  },
  clearActiveLesson() {
    set({ activeLessonId: null, activeLessonStatus: null, activeLessonData: null });
  },

  // ── Voice session ──────────────────────────────────────────────────────────
  voiceActive: false,
  voiceSessionId: null,
  voiceTranscript: "",
  voiceResponses: [],
  diagnosticAnswers: {},

  setVoiceActive(val) {
    set({ voiceActive: val });
  },
  setVoiceTranscript(t) {
    set({ voiceTranscript: t });
  },
  addVoiceResponse(r) {
    set((s) => ({ voiceResponses: [...s.voiceResponses, r] }));
  },
  clearVoiceSession() {
    set({
      voiceActive: false,
      voiceTranscript: "",
      voiceResponses: [],
      diagnosticAnswers: {},
    });
  },
  setDiagnosticAnswer(qid, choice) {
    set((s) => ({ diagnosticAnswers: { ...s.diagnosticAnswers, [qid]: choice } }));
  },

  // ── UI ──────────────────────────────────────────────────────────────────────
  sidebarOpen: true,
  toggleSidebar() {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }));
  },
}));

export const useAuthStore = useStore;

// ── Catalog Store (docs/08-FRONTEND.md) ──────────────────────────────────────
export const useCatalogStore = create((set, get) => ({
  levels: [],
  gradesByLevel: {},
  subjectsByGrade: {},
  strandsByKey: {},
  substrandsByStrand: {},
  selectedLevelId: 3,
  selectedGradeId: 71,
  selectedSubjectCode: "mathematics",
  loading: false,
  error: null,

  setSelection(partial) {
    set((s) => ({ ...s, ...partial }));
  },

  async fetchLevels() {
    if (get().levels.length > 0) return get().levels;
    set({ loading: true, error: null });
    try {
      const res = await catalogApi.levels();
      set({ levels: res.data, loading: false });
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load levels",
        loading: false,
      });
      return [];
    }
  },

  async fetchGrades(levelId) {
    const cached = get().gradesByLevel[levelId];
    if (cached) return cached;
    set({ loading: true, error: null });
    try {
      const res = await catalogApi.grades(levelId);
      set((s) => ({
        gradesByLevel: { ...s.gradesByLevel, [levelId]: res.data },
        loading: false,
      }));
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load grades",
        loading: false,
      });
      return [];
    }
  },

  async fetchSubjects(gradeId, lang = "en") {
    const key = `${gradeId}:${lang}`;
    const cached = get().subjectsByGrade[key];
    if (cached) return cached;
    set({ loading: true, error: null });
    try {
      const res = await catalogApi.subjects(gradeId, lang);
      set((s) => ({
        subjectsByGrade: {
          ...s.subjectsByGrade,
          [gradeId]: res.data,
          [key]: res.data,
        },
        loading: false,
      }));
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load subjects",
        loading: false,
      });
      return [];
    }
  },

  async fetchStrands(gradeId, subjectCode, langOrOpts = "en") {
    const lang = typeof langOrOpts === "string" ? langOrOpts : "en";
    const force = typeof langOrOpts === "object" && Boolean(langOrOpts?.force);
    const key = `${gradeId}:${subjectCode}:${lang}`;
    const baseKey = `${gradeId}:${subjectCode}`;
    if (!force && get().strandsByKey[key]) return get().strandsByKey[key];
    set({ loading: true, error: null });
    try {
      const res = await catalogApi.strands(gradeId, subjectCode);
      set((s) => ({
        strandsByKey: {
          ...s.strandsByKey,
          [baseKey]: res.data,
          [key]: res.data,
        },
        loading: false,
      }));
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load strands",
        loading: false,
      });
      return [];
    }
  },

  async fetchSubstrands(strandId, langOrOpts = "en") {
    const force = typeof langOrOpts === "object" && Boolean(langOrOpts?.force);
    if (!force && get().substrandsByStrand[strandId]) {
      return get().substrandsByStrand[strandId];
    }
    try {
      const res = await catalogApi.substrands(strandId);
      set((s) => ({
        substrandsByStrand: { ...s.substrandsByStrand, [strandId]: res.data },
      }));
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load sub-strands",
      });
      return [];
    }
  },
}));

// ── Lesson Store (docs/08-FRONTEND.md) ───────────────────────────────────────
export const useLessonStore = create((set) => ({
  currentLesson: null,
  loading: false,
  error: null,

  async fetchLesson(lessonId, lang) {
    set({ loading: true, error: null });
    try {
      const res = await lessonsApi.get(lessonId, lang);
      set({ currentLesson: res.data, loading: false });
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load lesson",
        loading: false,
      });
      return null;
    }
  },

  async pollAssets(lessonId, lang) {
    try {
      const res = await lessonsApi.assets(lessonId, lang);
      set((s) =>
        s.currentLesson && s.currentLesson.lesson_id === lessonId
          ? { currentLesson: { ...s.currentLesson, assets: res.data } }
          : s
      );
      return res.data;
    } catch {
      return null;
    }
  },

  clearLesson() {
    set({ currentLesson: null, error: null });
  },
}));

// ── FollowUp Store (docs/08-FRONTEND.md) ─────────────────────────────────────
export const useFollowUpStore = create((set) => ({
  threadsByLesson: {},
  messagesByThread: {},
  streaming: false,
  setStreaming(streaming) {
    set({ streaming });
  },
  setMessages(threadId, messages) {
    set((s) => ({
      messagesByThread: { ...s.messagesByThread, [threadId]: messages },
    }));
  },
}));

// ── Authoring Store (docs/08-FRONTEND.md) ────────────────────────────────────
export const useAuthoringStore = create((set) => ({
  jobs: [],
  reviewQueue: [],
  loading: false,
  error: null,

  setJobs(jobs) {
    set({ jobs });
  },
  setReviewQueue(reviewQueue) {
    set({ reviewQueue });
  },

  async fetchJobs(state) {
    set({ loading: true, error: null });
    try {
      const res = await authoringApi.listJobs(state);
      const list = res.data?.jobs || [];
      set({
        jobs: list,
        reviewQueue: list.filter(
          (j) =>
            j.state === "awaiting_review" ||
            j.state === "approved" ||
            j.lesson_status === "draft" ||
            j.lesson_status === "in_review"
        ),
        loading: false,
      });
      return list;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to load jobs",
        loading: false,
      });
      return [];
    }
  },

  async enqueueJob(payload) {
    set({ loading: true, error: null });
    try {
      const res = await authoringApi.enqueue(payload);
      const created = res.data?.jobs || [];
      set((s) => ({
        jobs: [...created, ...s.jobs],
        loading: false,
      }));
      return res.data;
    } catch (err) {
      set({
        error: err.response?.data?.error?.message || "Failed to enqueue authoring job",
        loading: false,
      });
      throw err;
    }
  },
}));
