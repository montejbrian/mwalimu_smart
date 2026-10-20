/**
 * MwalimuSmart Institutional OS
 * api/middleware/validators.js — Request Body Validators
 */

const CBC_STRANDS = new Set([
  "mathematics","english","kiswahili","science_technology",
  "social_studies","creative_arts","physical_health",
  "religious_education","business_studies","agriculture",
]);

const GRADE_LEVELS = new Set([
  "grade_1","grade_2","grade_3","grade_4","grade_5","grade_6",
  "grade_7","grade_8","grade_9","grade_10","grade_11","grade_12",
]);

const LANGUAGES = new Set(["en","sw"]);


export function validateLesson(req, res, next) {
  const { topic, strand, grade_level, school_id, teacher_id } = req.body;
  const errors = [];

  if (!topic?.trim())                       errors.push("topic is required");
  if (topic?.length > 200)                  errors.push("topic must be <= 200 chars");
  if (!CBC_STRANDS.has(strand))             errors.push(`strand must be one of: ${[...CBC_STRANDS].join(", ")}`);
  if (!GRADE_LEVELS.has(grade_level))       errors.push(`grade_level must be one of: ${[...GRADE_LEVELS].join(", ")}`);
  if (!school_id?.trim())                   errors.push("school_id is required");
  if (!teacher_id?.trim())                  errors.push("teacher_id is required");
  if (req.body.language && !LANGUAGES.has(req.body.language)) {
    errors.push("language must be 'en' or 'sw'");
  }

  if (errors.length) return res.status(400).json({ errors });
  next();
}


export function validateVoice(req, res, next) {
  const { school_id, student_id, lesson_id, text } = req.body;
  const errors = [];

  if (!school_id?.trim())   errors.push("school_id is required");
  if (!student_id?.trim())  errors.push("student_id is required");
  if (!lesson_id?.trim())   errors.push("lesson_id is required");
  if (!text?.trim())        errors.push("text is required");
  if (text?.length > 1000)  errors.push("text must be <= 1000 chars");

  if (errors.length) return res.status(400).json({ errors });
  next();
}
