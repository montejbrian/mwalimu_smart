import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Compass, ChevronRight, BookOpen, GraduationCap } from "lucide-react";
import clsx from "clsx";
import { useStore, useCatalogStore } from "../lib/store.js";
import LevelCard, { LEVEL_META } from "../components/catalog/LevelCard.jsx";
import StrandList from "../components/catalog/StrandList.jsx";

/**
 * Resolves a route `:grade` param (e.g. "71", "7", "grade-7") to a grade record or numeric ID.
 */
export function resolveGradeIdFromParam(gradeParam, gradesList = []) {
  if (!gradeParam) return null;
  const raw = String(gradeParam).trim().toLowerCase();
  const num = Number(raw.replace(/^grade[-_\s]*/i, ""));

  if (gradesList.length > 0) {
    const exactId = gradesList.find((g) => Number(g.id) === Number(raw));
    if (exactId) return exactId.id;

    const bySort = gradesList.find(
      (g) => Number(g.sort_order) === num || g.name.toLowerCase() === `grade ${num}`
    );
    if (bySort) return bySort.id;
  }

  // Fallback mapping for seeded grades when gradesList isn't loaded yet
  if (num >= 1 && num <= 9) {
    return num * 10 + 1; // e.g. 7 -> 71
  }
  return Number.isInteger(Number(raw)) ? Number(raw) : null;
}

export function inferLevelIdFromGradeId(gradeId) {
  const id = Number(gradeId);
  if (!Number.isFinite(id)) return 3;
  if (id < 10) return 1;
  if (id >= 10 && id < 70) return 2;
  if (id >= 70 && id < 100) return 3;
  return 4;
}

export default function BrowsePage() {
  const { grade: gradeParam, subject: subjectParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const language = useStore((s) => s.language);
  const lang = language === "sw" ? "sw" : "en";

  const {
    levels,
    gradesByLevel,
    subjectsByGrade,
    strandsByKey,
    loading,
    fetchLevels,
    fetchGrades,
    fetchSubjects,
    fetchStrands,
  } = useCatalogStore();

  const initialLevelId = useMemo(() => {
    const fromQuery = Number(searchParams.get("level_id"));
    if (Number.isInteger(fromQuery) && fromQuery >= 1 && fromQuery <= 4) {
      return fromQuery;
    }
    if (gradeParam) {
      const resolvedGrade = resolveGradeIdFromParam(gradeParam, []);
      return inferLevelIdFromGradeId(resolvedGrade);
    }
    return 3; // Default to Junior Secondary (Grade 7-9)
  }, [gradeParam, searchParams]);

  const [selectedLevelId, setSelectedLevelId] = useState(initialLevelId);
  const [selectedGradeId, setSelectedGradeId] = useState(() =>
    gradeParam ? resolveGradeIdFromParam(gradeParam, []) : 71
  );
  const [selectedSubjectCode, setSelectedSubjectCode] = useState(
    subjectParam || "mathematics"
  );

  // Sync URL params if user navigates via deep link
  useEffect(() => {
    if (gradeParam) {
      const gId = resolveGradeIdFromParam(
        gradeParam,
        gradesByLevel[selectedLevelId] || []
      );
      if (gId) {
        const lvlId = inferLevelIdFromGradeId(gId);
        setSelectedLevelId(lvlId);
        setSelectedGradeId(gId);
      }
    }
    if (subjectParam) {
      setSelectedSubjectCode(subjectParam);
    }
  }, [gradeParam, subjectParam]);

  // 1. Load levels
  useEffect(() => {
    fetchLevels(lang).catch(() => {});
  }, [lang]);

  // 2. Load grades when level changes
  useEffect(() => {
    if (!selectedLevelId) return;
    fetchGrades(selectedLevelId, lang)
      .then((grades) => {
        if (!grades || grades.length === 0) return;
        const resolved = gradeParam
          ? resolveGradeIdFromParam(gradeParam, grades)
          : selectedGradeId;
        const exists = grades.some((g) => g.id === resolved);
        const nextGradeId = exists ? resolved : grades[0].id;
        if (nextGradeId !== selectedGradeId) {
          setSelectedGradeId(nextGradeId);
        }
      })
      .catch(() => {});
  }, [selectedLevelId, lang]);

  // 3. Load subjects when grade changes
  useEffect(() => {
    if (!selectedGradeId) return;
    fetchSubjects(selectedGradeId, lang)
      .then((subjects) => {
        if (!subjects || subjects.length === 0) return;
        const exists = subjects.some((s) => s.code === selectedSubjectCode);
        const nextSubject = exists ? selectedSubjectCode : subjects[0].code;
        if (nextSubject !== selectedSubjectCode) {
          setSelectedSubjectCode(nextSubject);
        }
      })
      .catch(() => {});
  }, [selectedGradeId, lang]);

  // 4. Load strands when grade + subject are ready
  useEffect(() => {
    if (!selectedGradeId || !selectedSubjectCode) return;
    fetchStrands(selectedGradeId, selectedSubjectCode, lang).catch(() => {});
  }, [selectedGradeId, selectedSubjectCode, lang]);

  const grades = gradesByLevel[selectedLevelId] || [];
  const subjects = subjectsByGrade[selectedGradeId] || [];
  const strandsKey = `${selectedGradeId}:${selectedSubjectCode}:${lang}`;
  const strands =
    strandsByKey[strandsKey] ||
    strandsByKey[`${selectedGradeId}:${selectedSubjectCode}:en`] ||
    [];

  const activeLevel = levels.find((l) => l.id === selectedLevelId);
  const activeGrade = grades.find((g) => g.id === selectedGradeId);
  const activeSubject = subjects.find((s) => s.code === selectedSubjectCode);

  const levelDisplayName = activeLevel
    ? lang === "sw"
      ? LEVEL_META[activeLevel.name]?.name_sw || activeLevel.name
      : activeLevel.name
    : "";

  const subjectDisplayName = activeSubject
    ? lang === "sw"
      ? activeSubject.name_sw || activeSubject.name
      : activeSubject.name_en || activeSubject.name
    : "";

  function handleSelectLevel(level) {
    setSelectedLevelId(level.id);
    navigate(`/browse?level_id=${level.id}`, { replace: true });
  }

  function handleSelectGrade(gradeId) {
    setSelectedGradeId(gradeId);
    if (selectedSubjectCode) {
      navigate(`/browse/${gradeId}/${selectedSubjectCode}`, { replace: true });
    }
  }

  function handleSelectSubject(code) {
    setSelectedSubjectCode(code);
    if (selectedGradeId) {
      navigate(`/browse/${selectedGradeId}/${code}`, { replace: true });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6" data-testid="browse-page">
      {/* Header + Curriculum Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div
            data-testid="curriculum-breadcrumb"
            className="flex flex-wrap items-center gap-1.5 text-xs text-brand-400 font-body font-medium"
          >
            <Compass size={13} />
            <span>{levelDisplayName || "CBC"}</span>
            {activeGrade && (
              <>
                <ChevronRight size={12} className="text-ink-500" />
                <span>{activeGrade.name}</span>
              </>
            )}
            {subjectDisplayName && (
              <>
                <ChevronRight size={12} className="text-ink-500" />
                <span className="text-ink-100">{subjectDisplayName}</span>
              </>
            )}
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">
            {lang === "sw" ? "Maktaba ya Mtaala wa CBC" : "CBC Curriculum Library"}
          </h1>
        </div>
      </div>

      {/* Step 1: Education Levels */}
      <section className="space-y-2.5">
        <label className="text-xs font-medium uppercase tracking-wider text-ink-400 font-body block">
          1. {lang === "sw" ? "Ngazi ya Elimu" : "Education Level"}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {levels.map((level) => (
            <LevelCard
              key={level.id}
              level={level}
              selected={level.id === selectedLevelId}
              onSelect={handleSelectLevel}
            />
          ))}
        </div>
      </section>

      {/* Step 2: Grades */}
      <section className="space-y-2.5">
        <label className="text-xs font-medium uppercase tracking-wider text-ink-400 font-body flex items-center gap-1.5">
          <GraduationCap size={14} className="text-brand-400" />
          <span>2. {lang === "sw" ? "Chagua Gredi" : "Select Grade"}</span>
        </label>
        {grades.length === 0 ? (
          <div className="rounded-xl glass border border-[var(--border)] px-4 py-3 text-xs text-ink-400 font-body">
            {lang === "sw"
              ? "Gredi za ngazi hii zitaongezwa hivi karibuni."
              : "Grades for this level will be unlocked soon."}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2" data-testid="grade-selector">
            {grades.map((g) => {
              const active = g.id === selectedGradeId;
              return (
                <button
                  key={g.id}
                  type="button"
                  data-testid={`grade-pill-${g.id}`}
                  onClick={() => handleSelectGrade(g.id)}
                  className={clsx(
                    "px-4 py-2 rounded-xl text-xs font-medium font-body transition-all border",
                    active
                      ? "bg-brand-500 text-white border-brand-400 shadow-glow-green"
                      : "glass border-[var(--border)] text-ink-300 hover:text-ink-100 hover:border-brand-500/30"
                  )}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Step 3: Subjects */}
      {grades.length > 0 && (
        <section className="space-y-2.5">
          <label className="text-xs font-medium uppercase tracking-wider text-ink-400 font-body flex items-center gap-1.5">
            <BookOpen size={14} className="text-brand-400" />
            <span>3. {lang === "sw" ? "Chagua Somo" : "Select Subject"}</span>
          </label>
          {subjects.length === 0 ? (
            <div className="rounded-xl glass border border-[var(--border)] px-4 py-3 text-xs text-ink-400 font-body">
              {lang === "sw"
                ? "Hakuna masomo yaliyopatikana kwa gredi hii."
                : "No subjects seeded for this grade yet."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5" data-testid="subject-selector">
              {subjects.map((subj) => {
                const active = subj.code === selectedSubjectCode;
                const label =
                  lang === "sw"
                    ? subj.name_sw || subj.name
                    : subj.name_en || subj.name;
                return (
                  <button
                    key={subj.code}
                    type="button"
                    data-testid={`subject-tab-${subj.code}`}
                    onClick={() => handleSelectSubject(subj.code)}
                    className={clsx(
                      "px-4 py-2.5 rounded-xl text-sm font-medium font-body transition-all border",
                      active
                        ? "glass-active border-brand-500/50 text-brand-400 shadow-glow-green"
                        : "glass border-[var(--border)] text-ink-300 hover:text-ink-100 hover:border-brand-500/30"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Step 4: Strands & Sub-strands */}
      {grades.length > 0 && subjects.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-100">
              {subjectDisplayName} ·{" "}
              {lang === "sw" ? "Mada Kuu na Mada Ndogo" : "Strands & Sub-Strands"}
            </h2>
            <span className="text-xs text-ink-400 font-body">
              {strands.length} {lang === "sw" ? "mada kuu" : "strands"}
            </span>
          </div>
          <StrandList strands={strands} loading={loading && strands.length === 0} />
        </section>
      )}
    </div>
  );
}
