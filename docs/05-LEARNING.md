---

### `docs/05-LEARNING.md`

```markdown
# 05 — Learning Pipeline (student-facing)

## Read APIs (all under `/api`, JWT required, role=student)
GET /api/catalog/levels → [{id, name}]
GET /api/catalog/grades?level_id=3 → [{id, name}]
GET /api/catalog/subjects?grade_id=71 → [{code, name_en, name_sw}]
GET /api/catalog/strands?grade_id=71&subject=mathematics
→ [{id, name, substrand_count,
mastery_summary}]
GET /api/catalog/substrands?strand_id=<uuid> → [{id, name, lesson_count,
mastery_badge}]

text
Copy
Download

All catalog endpoints accept `Accept-Language: en|sw` and return the localized
name field. All are cached in-process with a 5-minute TTL, invalidated on
authoring publish.

## Lesson read
GET /api/lessons/:lesson_id?lang=en


Returns:

```json
{
  "lesson_id": "...",
  "title": "...",
  "breadcrumb": [
    {"level":"Junior Secondary","grade":"Grade 7"},
    {"subject":"Integrated Science"},
    {"strand":"Mixtures"},
    {"substrand":"Separating Mixtures"}
  ],
  "variant": {
    "language":"en",
    "script": { "objectives":[...], "sections":[...], "key_concepts":[...] },
    "transcript_url":"/api/lessons/:id/transcript?lang=en",
    "rag_sources":[...]
  },
  "assets": {
    "video_url": "https://cdn/...mp4" | null,
    "captions_url": "..." | null,
    "duration_s": 240 | null
  },
  "assessment": {
    "questions": [ {"id":"...", "question":"...", "options":["a","b","c","d"]} ]
  },
  "progress": {
    "status":"viewed",
    "last_position_s": 42,
    "last_score": null
  }
}
Do NOT return the correct_index or explanations in this payload. Those
are only returned by the assessment submission endpoint.

Progress endpoints

POST /api/progress/:lesson_id/viewed
  body: { position_s: 12 }          → updates last_position_s, status='viewed'

POST /api/progress/:lesson_id/assessment
  body: { answers: [ {question_id, chosen_index} ], lang: "en" }
  → server grades, returns:
    {
      "score": 0.80,
      "per_question": [
        {"id":"...","correct":true,"chosen":2,"correct_index":2,
         "explanation":"..."}
      ],
      "mastery": {"substrand_id":"...","mastery_score":0.80,"updated":true},
      "recommendation": {
        "type": "review" | "next" | "done",
        "substrand_id": "..." | null
      }
    }

GET  /api/progress/mastery?student_id=me   → mastery map for My Learning page