import PDFDocument from 'pdfkit';

/**
 * Generates a PDF summary of the lesson and assessment results.
 * @param {Object} lessonContent - Original lesson data.
 * @param {Object} assessmentResults - Analysis from analyzeAssessment.
 * @param {Buffer} [visualBuffer] - Optional image buffer for an illustration.
 * @returns {Promise<Buffer>} - Buffer containing the PDF data.
 */
export async function generateLessonPDF(lessonContent, assessmentResults, visualBuffer) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Title
            doc.fontSize(25).text('MwalimuSmart Study Summary', { align: 'center' });
            doc.moveDown();
            doc.fontSize(18).text(lessonContent.title, { underline: true });
            doc.moveDown();

            // Lesson Steps
            doc.fontSize(14).text('Lesson Outline:', { bold: true });
            lessonContent.steps.forEach(step => {
                doc.fontSize(12).text(`Step ${step.id}: ${step.title}`, { bold: true });
                doc.fontSize(11).text(step.text);
                doc.moveDown(0.5);
            });

            doc.moveDown();

            // Assessment Results
            doc.fontSize(14).text('Assessment Results:', { bold: true });
            doc.fontSize(12).text(`Overall Score: ${assessmentResults.score.toFixed(1)}%`);
            doc.fontSize(12).text(`Status: ${assessmentResults.isPass ? 'PASS' : 'RETEACH RECOMMENDED'}`);
            doc.moveDown();

            if (assessmentResults.weaknesses.length > 0) {
                doc.fontSize(13).text('Areas for Improvement:', { bold: true, color: 'red' });
                assessmentResults.weaknesses.forEach(w => {
                    doc.fontSize(11).text(`- Question: ${w.questionText}`);
                    doc.fontSize(10).text(`  Your Answer: ${w.submittedAnswer} (Incorrect)`);
                    doc.fontSize(10).text(`  Correct Answer: ${w.correctAnswer}`);
                    doc.fontSize(10).text(`  Explanation: ${w.explanation}`);
                    doc.moveDown(0.3);
                });
            } else {
                doc.fontSize(13).text('Excellent work! You mastered all concepts in this lesson.', { color: 'green' });
            }

            doc.moveDown();

            // Discussion Summary
            doc.fontSize(14).text('Summary:', { bold: true });
            doc.fontSize(11).text(lessonContent.summary);

            // Optional Illustration
            if (visualBuffer) {
                doc.addPage();
                doc.fontSize(14).text('Visual Illustration:', { bold: true });
                doc.image(visualBuffer, {
                    fit: [500, 400],
                    align: 'center',
                    valign: 'center'
                });
            }

            // Footer
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(10).text(
                    `Page ${i + 1} of ${pageCount}`,
                    50,
                    doc.page.height - 50,
                    { align: 'center' }
                );
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
