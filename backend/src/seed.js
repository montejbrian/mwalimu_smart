import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ 
    path: path.join(__dirname, '..', '.env'),
    override: true 
});

console.log('DEBUG: DB_USER is', process.env.DB_USER);
console.log('DEBUG: DB_HOST is', process.env.DB_HOST);
console.log('DEBUG: env path is', path.join(__dirname, '..', '.env'));

const mockCurriculum = [
    {
        chunkId: 'curr-math-grade10-quadratic-1',
        educationLevel: 'senior_secondary',
        gradeClass: 'grade_10',
        subjectDomain: 'Mathematics',
        topicNode: 'Quadratic Equations',
        contentText: 'A quadratic equation is any equation that can be rearranged in standard form as ax^2 + bx + c = 0, where x represents an unknown, and a, b, and c represent known numbers, with a not equal to 0. The solutions are given by the quadratic formula: x = (-b ± √(b^2 - 4ac)) / (2a). The term b^2 - 4ac is called the discriminant and determines the nature of the roots: real and distinct if greater than 0, real and equal if equal to 0, and complex if less than 0.'
    },
    {
        chunkId: 'curr-math-grade10-quadratic-2',
        educationLevel: 'senior_secondary',
        gradeClass: 'grade_10',
        subjectDomain: 'Mathematics',
        topicNode: 'Quadratic Equations',
        contentText: 'To solve a quadratic equation by factoring, we express the quadratic expression ax^2 + bx + c as a product of two linear binomials. For example, x^2 - 5x + 6 = 0 can be written as (x - 2)(x - 3) = 0, which yields solutions x = 2 and x = 3. Another method is completing the square, where we rearrange the equation into a perfect square trinomial equal to a constant, which leads directly to the quadratic formula derivation.'
    },
    {
        chunkId: 'curr-science-grade7-plantcell-1',
        educationLevel: 'junior_secondary',
        gradeClass: 'grade_7',
        subjectDomain: 'Science',
        topicNode: 'Structure of a Plant Cell',
        contentText: 'A plant cell is a eukaryotic cell possessing distinct structures including a rigid cell wall made of cellulose that provides shape and structural support, a cell membrane that controls the movement of substances in and out of the cell, a large central vacuole that maintains turgor pressure and stores water/nutrients, and chloroplasts containing chlorophyll where photosynthesis occurs to convert solar energy into chemical energy.'
    },
    {
        chunkId: 'curr-science-grade7-plantcell-2',
        educationLevel: 'junior_secondary',
        gradeClass: 'grade_7',
        subjectDomain: 'Science',
        topicNode: 'Structure of a Plant Cell',
        contentText: 'Within the plant cell, the nucleus acts as the control center containing genetic material (DNA). The cytoplasm is a jelly-like fluid where cellular reactions occur. Mitochondria serve as the powerhouses of the cell, generating ATP energy through cellular respiration. Ribosomes are responsible for protein synthesis, floating freely in the cytoplasm or attached to the endoplasmic reticulum.'
    },
    {
        chunkId: 'curr-math-grade4-fractions-1',
        educationLevel: 'primary',
        gradeClass: 'grade_4',
        subjectDomain: 'Mathematics',
        topicNode: 'Fractions',
        contentText: 'A fraction represents a part of a whole. It consists of a numerator on top, indicating how many parts we have, and a denominator on the bottom, indicating the total number of equal parts the whole is divided into. For example, in 3/4, 3 is the numerator and 4 is the denominator. A proper fraction has a numerator smaller than the denominator. Equivalent fractions are fractions that represent the same value, such as 1/2, 2/4, and 4/8.'
    }
];

async function seed() {
    try {
        console.log('Starting MwalimuSmart database seeding...');
        const { default: pool, initializeDatabase } = await import('./db.js');
        const { indexCurriculumContent } = await import('./services/rag.service.js');

        // Initialize database tables
        await initializeDatabase();

        // 1. Ensure a school (tenant) exists
        const schoolResult = await pool.query(`
            INSERT INTO schools (name, subdomain, email, phone)
            VALUES ('Goke Haraka Academy', 'gokeharaka', 'info@gokeharaka.ac.ke', '+254712345678')
            ON CONFLICT (subdomain) DO UPDATE SET name = 'Goke Haraka Academy'
            RETURNING id, name, subdomain
        `);
        const school = schoolResult.rows[0];
        console.log(`✓ School configured: ${school.name} (${school.subdomain}.mwalimusmart.com)`);

        // 2. Add mock students for activation testing (admission_no 1024, 1025)
        await pool.query(`
            INSERT INTO students (school_id, admission_number, full_name, is_activated)
            VALUES ($1, '1024', 'John Doe', false)
            ON CONFLICT (school_id, admission_number) DO NOTHING
        `, [school.id]);

        await pool.query(`
            INSERT INTO students (school_id, admission_number, full_name, is_activated)
            VALUES ($1, '1025', 'Jane Smith', false)
            ON CONFLICT (school_id, admission_number) DO NOTHING
        `, [school.id]);
        
        console.log('✓ Mock students registered for activation testing (Admission numbers: 1024, 1025)');

        // 3. Seed curriculum vector index
        console.log('Indexing KICD curriculum metadata...');
        for (const meta of mockCurriculum) {
            await indexCurriculumContent(meta.contentText, meta);
            console.log(`  - Indexed: [${meta.subjectDomain}] ${meta.topicNode} (${meta.gradeClass})`);
        }

        console.log('✓ Database seeding complete! MwalimuSmart is ready for verification.');
        process.exit(0);
    } catch (error) {
        console.error('✗ Seeding failed:', error);
        process.exit(1);
    }
}

seed();
