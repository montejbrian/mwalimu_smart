"""
MwalimuSmart Web
backend/scripts/seed_grade10_geography_lessons.py

Seeds Grade 10 Senior Secondary Geography published lessons:
- "Introduction to Geography" (Practical Geography)
- "Rocks" (Natural Systems and Processes)

Includes:
- Published lessons with EN/SW variants
- Pre-generated canvas video assets & WebVTT captions
- Full transcripts & CBC objectives grounded in Grade-10-Geography-KICD-Curriculum-Designs.pdf
- Formative bilingual assessment questions (MCQs) with non-punitive explanations
"""

import sys
import json
from pathlib import Path
import psycopg2
import psycopg2.extras

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from config.settings import settings

LESSONS_DATA = [
    {
        "substrand_name": "Introduction to Geography",
        "title": "Grade 10 Geography: Introduction to Geography & Spatial Systems",
        "video_url": "/renders/canvas_geography_intro.mp4",
        "captions_url": "/renders/canvas_geography_intro.vtt",
        "duration_s": 10,
        "script_en": {
            "title": "Introduction to Geography",
            "objectives": [
                "Analyse the branches of Geography for in-depth understanding of the subject",
                "Examine the importance of studying Geography for sustainable development",
                "Explore the relationship between Geography and other disciplines for career pathways",
                "Select possible careers from branches of Geography in society"
            ],
            "key_concepts": [
                "Physical Geography",
                "Human Geography",
                "Practical Geography",
                "Geographical Information Systems (GIS)",
                "Spatial Distribution",
                "Sustainable Development"
            ],
            "sections": [
                {
                    "title": "What is Geography?",
                    "content": "Geography is the scientific study of the Earth as the home of humankind. It examines spatial patterns, physical processes shaping the lithosphere, atmosphere, and hydrosphere, and human interactions across environments."
                },
                {
                    "title": "Branches of Geography",
                    "content": "Geography is divided into three key branches: Physical Geography (landforms, climate, drainage, soils), Human and Economic Geography (population, settlements, agriculture, mining, industry), and Practical Geography (fieldwork, map interpretation, statistical methods, and GIS)."
                },
                {
                    "title": "Geography in Kenya's Development",
                    "content": "In Kenya, geographical analysis guides environmental conservation, sustainable water catchment management in the Mau Forest and Mount Kenya, agricultural zoning, and disaster risk reduction for floods and droughts."
                },
                {
                    "title": "Careers and Interdisciplinary Links",
                    "content": "Studying Geography opens career pathways including Urban and Regional Planning, GIS and Remote Sensing analysis, Environmental Consultancy, Climatology, Surveying, and Resource Management."
                }
            ]
        },
        "transcript_en": (
            "Welcome to Grade 10 Senior Secondary Geography. In this lesson, we explore the foundations of geography. "
            "Geography is the scientific study of the Earth as the home of humankind. We investigate the three main branches: "
            "Physical Geography, Human and Economic Geography, and Practical Geography. In Kenya, geographical insights are crucial "
            "for national development, sustainable management of water towers, urban planning, and climate adaptation. "
            "Understanding spatial distribution equips learners for modern careers in GIS, environmental analysis, and regional planning."
        ),
        "script_sw": {
            "title": "Utangulizi wa Jiografia",
            "objectives": [
                "Kuchambua matawi ya Jiografia ili kupata uelewa wa kina wa somo",
                "Kuchunguza umuhimu wa kusoma Jiografia kwa maendeleo endelevu",
                "Kugundua uhusiano kati ya Jiografia na taaluma nyingine ili kutambua njia za kazi",
                "Kuteua kazi zinazotokana na matawi ya Jiografia katika jamii"
            ],
            "key_concepts": [
                "Jiografia ya Kimaumbile",
                "Jiografia ya Kibinadamu na Kiuchumi",
                "Jiografia ya Vitendo",
                "Mifumo ya Habari za Kijiografia (GIS)",
                "Ugawaji wa Nafasi",
                "Maendeleo Endelevu"
            ],
            "sections": [
                {
                    "title": "Jiografia ni Nini?",
                    "content": "Jiografia ni uchunguzi wa kisayansi wa Dunia kama makazi ya binadamu. Inachunguza ruwaza za maeneo, michakato ya kimaumbile inayounda uso wa ardhi, na mahusiano ya binadamu na mazingira."
                },
                {
                    "title": "Matawi ya Jiografia",
                    "content": "Jiografia imegawanyika katika matawi makuu matatu: Jiografia ya Kimaumbile (sura ya nchi, hali ya hewa, mifereji ya maji, udongo), Jiografia ya Kibinadamu na Kiuchumi (idadi ya watu, makazi, kilimo, viwanda), na Jiografia ya Vitendo (utafiti wa nyanjani, usomaji wa ramani, na GIS)."
                },
                {
                    "title": "Jiografia katika Maendeleo ya Kenya",
                    "content": "Nchini Kenya, maarifa ya kijiografia huongoza uhifadhi wa mazingira, usimamizi wa vyanzo vya maji kama Msitu wa Mau, na upangaji wa miji na mikoa."
                }
            ]
        },
        "transcript_sw": (
            "Karibu kwenye Jiografia ya Gredi ya 10. Katika somo hili, tunajifunza misingi ya jiografia kama uchunguzi wa kisayansi wa Dunia. "
            "Tunachunguza matawi matatu makuu: Jiografia ya Kimaumbile, Jiografia ya Kibinadamu na Kiuchumi, na Jiografia ya Vitendo. "
            "Maarifa haya ni muhimu sana nchini Kenya kwa upangaji miji, kilimo, na uhifadhi wa vyanzo vya maji."
        ),
        "rag_sources": [
            "KICD Grade 10 Geography Curriculum Designs, Strand 1.0 Practical Geography, Sub-strand 1.1",
            "Kenya Institute of Curriculum Development (KICD), Senior School Designs (2024)"
        ],
        "questions": [
            {
                "sort_order": 1,
                "question_en": "Which branch of geography primarily studies landforms, climate, soils, and natural vegetation?",
                "question_sw": "Ni tawi gani la jiografia linalochunguza zaidi sura ya nchi, hali ya hewa, udongo, na uoto wa asili?",
                "options": [
                    {"en": "Economic Geography", "sw": "Jiografia ya Kiuchumi"},
                    {"en": "Physical Geography", "sw": "Jiografia ya Kimaumbile"},
                    {"en": "Historical Geography", "sw": "Jiografia ya Kihistoria"},
                    {"en": "Political Geography", "sw": "Jiografia ya Kisiasa"}
                ],
                "correct_index": 1,
                "explanation_en": "Physical Geography examines the natural physical processes and features of the Earth, including lithosphere, atmosphere, hydrosphere, and biosphere.",
                "explanation_sw": "Jiografia ya Kimaumbile huchunguza michakato ya kiasili na maumbo ya Dunia, ikijumuisha ardhi, angahewa, maji, na uoto.",
                "competency_tag": "critical thinking"
            },
            {
                "sort_order": 2,
                "question_en": "How does studying geography directly contribute to sustainable development in Kenya?",
                "question_sw": "Je, kusoma jiografia kunachangiaje moja kwa moja katika maendeleo endelevu nchini Kenya?",
                "options": [
                    {"en": "By memorizing names of world capitals only", "sw": "Kwa kukariri majina ya miji mikuu ya dunia pekee"},
                    {"en": "By informing environmental conservation, water catchment management, and regional spatial planning", "sw": "Kwa kuongoza uhifadhi wa mazingira, usimamizi wa vyanzo vya maji, na mipango ya maeneo"},
                    {"en": "By eliminating the need for environmental impact assessments", "sw": "Kwa kuondoa hitaji la tathmini ya athari za mazingira"},
                    {"en": "By restricting international trade between counties", "sw": "Kwa kuzuia biashara ya kimataifa kati ya kaunti"}
                ],
                "correct_index": 1,
                "explanation_en": "Geography provides spatial data and environmental insights essential for responsible resource utilization, protecting water towers, and planning sustainable infrastructure.",
                "explanation_sw": "Jiografia hutoa taarifa za kimaeneo na maarifa ya mazingira yanayosaidia matumizi bora ya rasilimali na upangaji endelevu wa miundombinu.",
                "competency_tag": "citizenship"
            },
            {
                "sort_order": 3,
                "question_en": "Which modern technology integrates spatial data, cartography, and computer analysis to assist urban planning in Kenya?",
                "question_sw": "Ni teknolojia gani ya kisasa inayojumuisha taarifa za kimaeneo, uchoraji ramani, na uchambuzi wa kompyuta kusaidia upangaji miji nchini Kenya?",
                "options": [
                    {"en": "Geographical Information Systems (GIS)", "sw": "Mifumo ya Habari za Kijiografia (GIS)"},
                    {"en": "Barometric pressure logging only", "sw": "Kurekodi shinikizo la hewa pekee"},
                    {"en": "Manual spirit leveling", "sw": "Kupima usawa kwa mkono"},
                    {"en": "Magnetic compass indexing", "sw": "Fahirisi ya dira ya sumaku"}
                ],
                "correct_index": 0,
                "explanation_en": "GIS captures, stores, analyzes, and visualizes geographic data, allowing urban planners to model infrastructure, land use, and service delivery.",
                "explanation_sw": "GIS hukusanya, kuhifadhi, kuchambua na kuonyesha taarifa za kijiografia, ikiruhusu wapangaji miji kuunda miundombinu bora.",
                "competency_tag": "digital literacy"
            },
            {
                "sort_order": 4,
                "question_en": "What is the key link between geography and agriculture in Kenya's counties?",
                "question_sw": "Ni kiungo gani kikuu kati ya jiografia na kilimo katika kaunti za Kenya?",
                "options": [
                    {"en": "Geography analyses relief, soil types, and rainfall patterns that determine agro-ecological zones", "sw": "Jiografia huchambua sura ya nchi, aina za udongo, na mifumo ya mvua inayoamua kanda za kilimo"},
                    {"en": "Geography only focuses on urban retail markets", "sw": "Jiografia huzingatia tu masoko ya mijini"},
                    {"en": "Agriculture does not depend on climatic or spatial variables", "sw": "Kilimo hakitegemei hali ya hewa wala mazingira"},
                    {"en": "Geography determines fixed crop market prices", "sw": "Jiografia huamua bei maalum za mazao sokoni"}
                ],
                "correct_index": 0,
                "explanation_en": "Geography studies topography, climate, and soil properties, which are the fundamental determinants of crop zoning and pastoral productivity in Kenya.",
                "explanation_sw": "Jiografia huchunguza sura ya nchi, hali ya hewa na udongo, ambavyo ndivyo vigezo vikuu vinavyoamua kanda za uzalishaji mazao na mifugo nchini.",
                "competency_tag": "problem solving"
            }
        ]
    },
    {
        "substrand_name": "Rocks",
        "title": "Grade 10 Geography: Rocks & Lithospheric Processes in Kenya",
        "video_url": "/renders/canvas_geography_rocks.mp4",
        "captions_url": "/renders/canvas_geography_rocks.vtt",
        "duration_s": 10,
        "script_en": {
            "title": "Classification and Significance of Rocks",
            "objectives": [
                "Examine the classification of rocks according to mode of formation and age",
                "Describe the distribution of rocks in Kenya",
                "Analyse the economic and environmental significance of rocks in Kenya",
                "Sample and classify rock types in the local environment"
            ],
            "key_concepts": [
                "Igneous Rocks (Plutonic & Volcanic)",
                "Sedimentary Rocks (Clastic, Chemical, Organic)",
                "Metamorphic Rocks",
                "Rock Cycle",
                "Rift Valley Volcanics",
                "Economic Mineralization"
            ],
            "sections": [
                {
                    "title": "Introduction to Rocks and Minerals",
                    "content": "A rock is a naturally occurring solid aggregate of one or more minerals or mineraloids forming the Earth's crust. Rocks are classified based on their mode of formation into igneous, sedimentary, and metamorphic."
                },
                {
                    "title": "Igneous Rocks in Kenya",
                    "content": "Igneous rocks form from cooling and solidification of molten magma or lava. In Kenya, extrusive volcanic rocks such as basalts, phonolites, and trachytes dominate the Great Rift Valley, Mount Kenya, and the Aberdare Ranges."
                },
                {
                    "title": "Sedimentary and Metamorphic Rocks",
                    "content": "Sedimentary rocks form through weathering, erosion, deposition, and lithification (e.g., sandstones in Eastern Kenya, coral limestone along the Coast). Metamorphic rocks result from extreme heat and pressure altering pre-existing rocks, seen in the Mozambique belt gneisses and schists."
                },
                {
                    "title": "Economic and Practical Importance",
                    "content": "Rocks provide building materials (quarry stones, ballast), host mineral deposits (titanium in Kwale, limestone for Bamburi cement), form parent material for fertile soils, and create scenic geotourism landscapes (Hell's Gate, Mount Longonot)."
                }
            ]
        },
        "transcript_en": (
            "Welcome to Natural Systems and Processes in Grade 10 Geography. Today we explore rocks, the solid building blocks of our Earth's crust. "
            "Rocks are classified into three major groups based on their origin: Igneous, Sedimentary, and Metamorphic. "
            "In Kenya, volcanic activity along the Great Rift Valley has produced vast deposits of phonolites, basalts, and pumice. "
            "Along the coast, coral reefs have formed extensive limestone reserves used for cement manufacturing. "
            "Understanding rock characteristics is vital for civil engineering, groundwater exploration, and mining in Kenya."
        ),
        "script_sw": {
            "title": "Uainishaji na Umuhimu wa Miamba",
            "objectives": [
                "Kuchunguza uainishaji wa miamba kulingana na jinsi inavyoundwa na umri wake",
                "Kueleza ugawaji wa miamba nchini Kenya",
                "Kuchambua umuhimu wa kiuchumi na kimazingira wa miamba nchini Kenya",
                "Kukusanya na kuainisha sampuli za miamba katika mazingira ya eneo lako"
            ],
            "key_concepts": [
                "Miamba ya Moto (Igneous)",
                "Miamba ya Tabaka (Sedimentary)",
                "Miamba Iliyobadilika (Metamorphic)",
                "Mzunguko wa Miamba",
                "Miamba ya Volkano ya Bonde la Ufa"
            ],
            "sections": [
                {
                    "title": "Miamba ni Nini?",
                    "content": "Mwamba ni muungano wa asili wa madini moja au zaidi unaounda ganda la Dunia. Miamba imegawanywa katika makundi makuu matatu: miamba ya moto, miamba ya tabaka, na miamba iliyobadilika."
                },
                {
                    "title": "Ugawaji wa Miamba nchini Kenya",
                    "content": "Katika Bonde la Ufa la Kenya, miamba ya moto kama vile basalt na phonolite hupatikana kwa wingi kutokana na milipuko ya volkano. Katika ukanda wa Pwani, chokaa ya marijani hutumiwa kutengeneza saruji."
                }
            ]
        },
        "transcript_sw": (
            "Karibu kwenye somo la Miamba katika Jiografia ya Gredi ya 10. Miamba huainishwa katika makundi makuu matatu: "
            "Miamba ya moto inayotokana na kupoa kwa lava, miamba ya tabaka, na miamba iliyobadilika kwa joto na shinikizo. "
            "Nchini Kenya, miamba hii hutoa mawe ya ujenzi, udongo wenye rutuba, na madini mbalimbali."
        ),
        "rag_sources": [
            "KICD Grade 10 Geography Curriculum Designs, Strand 2.0 Natural Systems and Processes, Sub-strand 2.1 Rocks",
            "Kenya Institute of Curriculum Development (KICD), Senior School Designs (2024)"
        ],
        "questions": [
            {
                "sort_order": 1,
                "question_en": "How are igneous rocks formed in regions such as the Kenyan Rift Valley?",
                "question_sw": "Je, miamba ya moto huundwaje katika maeneo kama Bonde la Ufa la Kenya?",
                "options": [
                    {"en": "From compaction and cementation of dead organic matter", "sw": "Kutokana na kubanwa kwa mabaki ya viumbe hai"},
                    {"en": "Through the cooling and solidification of molten magma or lava", "sw": "Kupitia kupoa na kuganda kwa magma au lava iliyoyeyuka"},
                    {"en": "Exclusively by chemical precipitation in salt lakes", "sw": "Pekee kupitia mvua ya kemikali katika maziwa ya chumvi"},
                    {"en": "By wind erosion scouring bedrock", "sw": "Kwa mmomonyoko wa upepo unaokwangua mwamba msingi"}
                ],
                "correct_index": 1,
                "explanation_en": "Igneous rocks originate from molten rock material (magma beneath the crust or lava on the surface) cooling and crystallizing into solid rock.",
                "explanation_sw": "Miamba ya moto hutokana na mwamba ulioyeyuka (magma chini ya ardhi au lava juu ya ardhi) kupoa na kuganda kuwa mwamba imara.",
                "competency_tag": "scientific inquiry"
            },
            {
                "sort_order": 2,
                "question_en": "Which of the following is an example of an organically formed sedimentary rock found along Kenya's coastal strip?",
                "question_sw": "Ni ipi kati ya zifuatazo ni mfano wa mwamba wa tabaka ulioundwa na mabaki ya viumbe unaopatikana pwani ya Kenya?",
                "options": [
                    {"en": "Coral limestone", "sw": "Chokaa ya marijani (Coral limestone)"},
                    {"en": "Obsidian volcanic glass", "sw": "Kioo cha volkano (Obsidian)"},
                    {"en": "Granite batholith", "sw": "Itale (Granite)"},
                    {"en": "Pure marble", "sw": "Marmar (Marble)"}
                ],
                "correct_index": 0,
                "explanation_en": "Coral limestone forms from the accumulation of calcium carbonate skeletons of marine organisms (polyps) over millions of years along the warm Kenyan coast.",
                "explanation_sw": "Chokaa ya marijani huundwa na mrundikano wa viunzi vya mifupa ya viumbe vidogo vya baharini (polyps) katika ukanda wa pwani.",
                "competency_tag": "critical thinking"
            },
            {
                "sort_order": 3,
                "question_en": "What primary agents cause the metamorphism of existing rocks into metamorphic rocks?",
                "question_sw": "Ni vigezo vipi vikuu vinavyosababisha kubadilika kwa miamba kuwa miamba iliyobadilika (metamorphic)?",
                "options": [
                    {"en": "Intense heat, high pressure, and chemically active fluids", "sw": "Joto kali, shinikizo kubwa, na majimaji yenye kemikali"},
                    {"en": "Rapid surface freezing only", "sw": "Kuganda kwa haraka juu ya ardhi pekee"},
                    {"en": "Exposure to continuous sunlight", "sw": "Kupigwa na mwangaza wa jua mfululizo"},
                    {"en": "Biological decomposition by bacteria", "sw": "Kuoza kwa viumbe hai kwa bakteria"}
                ],
                "correct_index": 0,
                "explanation_en": "Metamorphism involves recrystallization of minerals in solid state under intense geothermal heat, tectonic pressure, and hydro-thermal fluids.",
                "explanation_sw": "Kubadilika kwa miamba hutokea wakati miamba inapokabiliwa na joto kali la ndani ya ardhi na shinikizo kubwa la migandamizo ya tektoniki.",
                "competency_tag": "critical thinking"
            },
            {
                "sort_order": 4,
                "question_en": "Why are volcanic rocks in Kenya economically significant to the building and construction industry?",
                "question_sw": "Kwa nini miamba ya volkano nchini Kenya ni muhimu kiuchumi kwa sekta ya ujenzi?",
                "options": [
                    {"en": "They provide phonolites, trachytes, and volcanic tuffs widely quarried as building blocks and ballast", "sw": "Hutoa mawe ya phonolite, trachyte na tuffs yanayochimbwa kwa wingi kama mawe ya ujenzi na kokoto"},
                    {"en": "They dissolve instantly in water for painting", "sw": "Huyeyuka mara moja ndani ya maji kwa ajili ya kupaka rangi"},
                    {"en": "They are lightweight and float on water", "sw": "Ni mepesi sana na huelea juu ya maji"},
                    {"en": "They replace the need for steel reinforcement in skyscrapers", "sw": "Huchukua nafasi ya vyuma vya ujenzi katika majengo marefu"}
                ],
                "correct_index": 0,
                "explanation_en": "Volcanic tuffs, phonolites, and basalts quarried in areas like Nairobi, Machakos, and the Rift Valley provide essential dimension stones and concrete aggregate.",
                "explanation_sw": "Miamba ya volkano kama tuffs na phonolites inayochimbwa Nairobi na Bonde la Ufa hutoa mawe imara ya kujengea kuta na kutengeneza saruji.",
                "competency_tag": "environmental awareness"
            }
        ]
    }
]

def seed_lessons():
    conn = psycopg2.connect(settings.POSTGRES_DSN)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for ldata in LESSONS_DATA:
                sname = ldata["substrand_name"]
                cur.execute(
                    """
                    SELECT ss.id, ss.strand_id, st.name AS strand_name
                    FROM substrands ss
                    JOIN strands st ON st.id = ss.strand_id
                    JOIN grade_subjects gs ON gs.id = st.grade_subject_id
                    JOIN grades g ON g.id = gs.grade_id
                    JOIN subjects s ON s.id = gs.subject_id
                    WHERE ss.name = %s AND g.name = 'Grade 10' AND s.code = 'geography'
                    LIMIT 1;
                    """,
                    (sname,)
                )
                ss_row = cur.fetchone()
                if not ss_row:
                    print(f"Warning: Substrand '{sname}' not found for Grade 10 Geography. Skipping.")
                    continue

                substrand_id = ss_row["id"]

                # Upsert lesson
                cur.execute(
                    """
                    INSERT INTO lessons (substrand_id, title, sort_order, status, version, published_at)
                    VALUES (%s, %s, 1, 'published', 1, now())
                    ON CONFLICT (substrand_id, sort_order, version)
                    DO UPDATE SET title = EXCLUDED.title, status = 'published', published_at = now()
                    RETURNING id;
                    """,
                    (substrand_id, ldata["title"])
                )
                lesson_id = cur.fetchone()["id"]

                # Upsert variants
                variants_map = {}
                for lang_code, script_obj, transcript_txt in [
                    ("en", ldata["script_en"], ldata["transcript_en"]),
                    ("sw", ldata["script_sw"], ldata["transcript_sw"]),
                ]:
                    cur.execute(
                        """
                        INSERT INTO lesson_variants (
                            lesson_id, language, script, transcript, objectives, key_concepts, rag_sources
                        )
                        VALUES (%s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                        ON CONFLICT (lesson_id, language)
                        DO UPDATE SET script = EXCLUDED.script,
                                      transcript = EXCLUDED.transcript,
                                      objectives = EXCLUDED.objectives,
                                      key_concepts = EXCLUDED.key_concepts,
                                      rag_sources = EXCLUDED.rag_sources
                        RETURNING id;
                        """,
                        (
                            lesson_id,
                            lang_code,
                            json.dumps(script_obj),
                            transcript_txt,
                            json.dumps(script_obj["objectives"]),
                            json.dumps(script_obj["key_concepts"]),
                            json.dumps(ldata["rag_sources"]),
                        )
                    )
                    variant_id = cur.fetchone()["id"]
                    variants_map[lang_code] = variant_id

                    # Upsert video asset
                    cur.execute(
                        """
                        INSERT INTO lesson_assets (lesson_variant_id, type, storage_url, status, duration_s)
                        VALUES (%s, 'video_mp4', %s, 'ready', %s)
                        ON CONFLICT (lesson_variant_id, type)
                        DO UPDATE SET storage_url = EXCLUDED.storage_url,
                                      status = 'ready',
                                      duration_s = EXCLUDED.duration_s;
                        """,
                        (variant_id, ldata["video_url"], ldata["duration_s"])
                    )

                    # Upsert captions asset
                    cur.execute(
                        """
                        INSERT INTO lesson_assets (lesson_variant_id, type, storage_url, status)
                        VALUES (%s, 'captions_vtt', %s, 'ready')
                        ON CONFLICT (lesson_variant_id, type)
                        DO UPDATE SET storage_url = EXCLUDED.storage_url, status = 'ready';
                        """,
                        (variant_id, ldata["captions_url"])
                    )

                # Upsert questions
                # Clear previous questions for this lesson to prevent duplicates
                cur.execute("DELETE FROM assessment_questions WHERE lesson_id = %s;", (lesson_id,))
                for q in ldata["questions"]:
                    cur.execute(
                        """
                        INSERT INTO assessment_questions (
                            lesson_id, sort_order, question_en, question_sw,
                            options, correct_index, explanation_en, explanation_sw,
                            competency_tag
                        )
                        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s);
                        """,
                        (
                            lesson_id,
                            q["sort_order"],
                            q["question_en"],
                            q["question_sw"],
                            json.dumps(q["options"]),
                            q["correct_index"],
                            q["explanation_en"],
                            q["explanation_sw"],
                            q["competency_tag"],
                        )
                    )

                print(f"Successfully seeded published lesson: {ldata['title']} (ID: {lesson_id})")

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    seed_lessons()
