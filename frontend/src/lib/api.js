import axios from "axios";

const api = axios.create({ baseURL: "/api", timeout: 120_000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mwalimu_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const lang = localStorage.getItem("mwalimu_lang") || "en";
  if (!config.headers["Accept-Language"]) {
    config.headers["Accept-Language"] = lang;
  }
  return config;
});

let _refreshing = false, _queue = [];

api.interceptors.response.use(
  r => r,
  async err => {
    const orig = err.config;
    if (err.response?.status === 401 && !orig._retry) {
      const refresh = localStorage.getItem("mwalimu_refresh");
      if (!refresh) { _redirect(); return Promise.reject(err); }
      if (_refreshing) return new Promise((res, rej) => _queue.push({ res, rej }))
        .then(() => api(orig)).catch(e => Promise.reject(e));
      orig._retry = true; _refreshing = true;
      try {
        const r = await axios.post("/api/auth/refresh", { refresh_token: refresh });
        localStorage.setItem("mwalimu_token", r.data.access_token);
        _queue.forEach(p => p.res()); _queue = [];
        orig.headers.Authorization = `Bearer ${r.data.access_token}`;
        return api(orig);
      } catch { _queue.forEach(p => p.rej()); _queue = []; _redirect(); return Promise.reject(err); }
      finally { _refreshing = false; }
    }
    return Promise.reject(err);
  }
);

function _redirect() {
  ["mwalimu_token","mwalimu_refresh","mwalimu_user"].forEach(k => localStorage.removeItem(k));
  window.location.href = "/login";
}

export default api;

export const authApi   = {
  login:   b => api.post("/auth/login", b),
  refresh: b => api.post("/auth/refresh", b),
  logout:  b => api.post("/auth/logout", b),
  me:      () => api.get("/auth/me"),
};
export const catalogApi = {
  levels:     () => api.get("/catalog/levels"),
  grades:     (levelId) => api.get("/catalog/grades", { params: { level_id: levelId } }),
  subjects:   (gradeId, lang) =>
    api.get("/catalog/subjects", {
      params: { grade_id: gradeId, ...(lang ? { lang } : {}) },
    }),
  strands:    (gradeId, subject) =>
    api.get("/catalog/strands", { params: { grade_id: gradeId, subject } }),
  substrands: (strandId) =>
    api.get("/catalog/substrands", { params: { strand_id: strandId } }),
};

export const lessonsApi = {
  get:           (id, lang) => api.get(`/lessons/${id}`, { params: lang ? { lang } : undefined }),
  assets:        (id, lang) => api.get(`/lessons/${id}/assets`, { params: lang ? { lang } : undefined }),
  getTranscript: (id, lang = "en") =>
    api.get(`/lessons/${id}/transcript`, {
      params: { lang },
      responseType: "text",
    }),
  transcriptUrl: (id, lang = "en") => `/api/lessons/${id}/transcript?lang=${lang}`,
};

export const authoringApi = {
  enqueue:    (payload) => api.post("/authoring/jobs", payload),
  listJobs:   (state) =>
    api.get("/authoring/jobs", { params: state ? { state } : undefined }),
  getJob:     (id) => api.get(`/authoring/jobs/${id}`),
  approve:    (lessonId) => api.post(`/authoring/lessons/${lessonId}/approve`),
  reject:     (lessonId, feedback) =>
    api.post(`/authoring/lessons/${lessonId}/reject`, { feedback }),
  publish:    (lessonId) => api.post(`/authoring/lessons/${lessonId}/publish`),
  regenerate: (lessonId, feedback) =>
    api.post(`/authoring/lessons/${lessonId}/regenerate`, { feedback }),
};

export const progressApi = {
  viewed: (lessonId, positionS) =>
    api.post(`/progress/${lessonId}/viewed`, { position_s: positionS }),
  submitAssessment: (lessonId, answers, lang) =>
    api.post(`/progress/${lessonId}/assessment`, { answers, lang }),
  mastery: (params) => api.get("/progress/mastery", { params }),
  recent: (params) => api.get("/progress/recent", { params }),
};

export const followupsApi = {
  createOrGetThread: (lessonId) =>
    api.post(`/followups/lessons/${lessonId}/threads`),
  getHistory: (threadId) =>
    api.get(`/followups/threads/${threadId}`),
  getSavedThreads: (params) =>
    api.get("/followups/threads", { params }),
  streamUrl: (threadId) =>
    `/api/followups/threads/${threadId}/messages`,
  getVisualJob: (jobId) =>
    api.get(`/followups/jobs/${jobId}`),
};

export const lessonApi = {
  generate: b      => api.post("/lesson/generate", b),
  get:      id     => api.get(`/lesson/${id}`),
  answer:   (id,b) => api.post(`/lesson/${id}/answer`, b),
  history:  (sid,p)=> api.get(`/schools/${sid}/lessons`, { params: p }),
};
export const voiceApi = {
  message:    b  => api.post("/voice/message", b),
  stt:        b  => api.post("/voice/stt", b),
  endSession: id => api.delete(`/voice/session/${id}`),
};
export const healthApi = { check: () => api.get("/health") };
