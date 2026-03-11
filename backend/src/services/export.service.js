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
            const doc = new PDFDocument({ margin: 50, bufferPages: true });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));

            // Header Background / Accent
            doc.rect(0, 0, doc.page.width, 100).fill('#3b82f6');
            
            // Title
            doc.fillColor('white').fontSize(28).text('MwalimuSmart', 50, 35, { characterSpacing: 2 });
            doc.fontSize(12).text('YOUR PERSONAL AI TUTOR', 50, 65, { characterSpacing: 4, opacity: 0.8 });
            
            doc.fillColor('black');
            doc.moveDown(4);

            // Lesson Title
            doc.fontSize(22).font('Helvetica-Bold').text(lessonContent.title);
            doc.fontSize(10).font('Helvetica').text(`Generated on ${new Date().toLocaleDateString()}`, { color: '#666666' });
            doc.moveDown(2);

            // Divider
            doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#eeeeee').stroke();
            doc.moveDown(1.5);

            // Summary Section
            doc.fontSize(14).font('Helvetica-Bold').text('Lesson Summary', { color: '#3b82f6' });
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').lineGap(3).text(lessonContent.summary || "No summary available.");
            doc.moveDown(2);

            // Lesson Outline
            doc.fontSize(14).font('Helvetica-Bold').text('Key Concepts Covered', { color: '#3b82f6' });
            doc.moveDown(1);
            
            lessonContent.steps.forEach((step, idx) => {
                doc.fontSize(11).font('Helvetica-Bold').text(`${idx + 1}. ${step.title || `Concept ${idx + 1}`}`);
                doc.fontSize(10).font('Helvetica').fillColor('#444444').text(step.text);
                doc.moveDown(0.8);
            });

            doc.fillColor('black');
            doc.moveDown(1.5);

            // Divider
            doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#eeeeee').stroke();
            doc.moveDown(1.5);

            // Assessment Results
            doc.fontSize(14).font('Helvetica-Bold').text('Assessment Report', { color: '#3b82f6' });
            doc.moveDown(1);

            const score = assessmentResults ? assessmentResults.score : 0;
            const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

            doc.fontSize(12).font('Helvetica-Bold').text('Performance Snapshot:');
            doc.fontSize(24).font('Helvetica-Bold').fillColor(scoreColor).text(`${Math.round(score)}% Accuracy`);
            doc.fontSize(10).font('Helvetica').fillColor('#666666').text(assessmentResults?.isPass ? 'Keep up the great work!' : 'Keep practicing to master these concepts!');
            
            doc.fillColor('black');
            doc.moveDown(2);

            if (assessmentResults && assessmentResults.weaknesses && assessmentResults.weaknesses.length > 0) {
                doc.fontSize(12).font('Helvetica-Bold').text('Points for Review:', { underline: true });
                doc.moveDown(0.5);
                assessmentResults.weaknesses.forEach((w, i) => {
                    doc.fontSize(10).font('Helvetica-Bold').text(`${i + 1}. ${w.questionText}`);
                    doc.fontSize(10).font('Helvetica').fillColor('#ef4444').text(`Feedback: ${w.explanation}`);
                    doc.moveDown(0.5);
                });
            }

            // Optional Illustration
            if (visualBuffer) {
                doc.addPage();
                doc.rect(0, 0, doc.page.width, 100).fill('#3b82f6');
                doc.fillColor('white').fontSize(24).text('Visual Learning Aid', 50, 40);
                
                doc.fillColor('black');
                doc.moveDown(6);
                
                try {
                    doc.image(visualBuffer, {
                        fit: [500, 400],
                        align: 'center'
                    });
                } catch (imgError) {
                    console.error("PDF: Error adding image to document:", imgError);
                    doc.text("[Image processing error]");
                }
            }

            // Footer
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).fillColor('#999999').text(
                    `Created with MwalimuSmart - Learning never stops. | Page ${i + 1} of ${pageCount}`,
                    0,
                    doc.page.height - 40,
                    { align: 'center', width: doc.page.width }
                );
            }

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
