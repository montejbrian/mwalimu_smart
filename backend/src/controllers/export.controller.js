import { generateLessonPDF } from '../services/export.service.js';

export async function exportLessonPDFController(req, res) {
    try {
        const { lessonContent, assessmentResults, visualBase64 } = req.body;

        if (!lessonContent || !assessmentResults) {
            return res.status(400).json({ error: 'Missing data for PDF export' });
        }

        let visualBuffer = null;
        if (visualBase64) {
            const base64Data = visualBase64.replace(/^data:image\/\w+;base64,/, '');
            visualBuffer = Buffer.from(base64Data, 'base64');
        }

        const pdfBuffer = await generateLessonPDF(lessonContent, assessmentResults, visualBuffer);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=MwalimuSmart_${lessonContent.title.replace(/\s+/g, '_')}.pdf`,
            'Content-Length': pdfBuffer.length
        });

        return res.send(pdfBuffer);
    } catch (error) {
        console.error('Error in exportLessonPDFController:', error);
        return res.status(500).json({ error: error.message });
    }
}
