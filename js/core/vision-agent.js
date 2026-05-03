// js/core/vision-agent.js
import { fetchWithRetry } from './utils.js';

const MISTRAL_API_KEY = "glAETAxTj1qgV2HkruSYDIPJJOlJxU0R"; // Keep consistent with ai-agent
const API_URL = "https://api.mistral.ai/v1";

// Ensure PDF.js worker is configured (relies on the CDN link in index.html)
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * 1. Convert Image or PDF to Raw Text using Tesseract (100% Local Browser CPU)
 */
export async function performOCR(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    if (extension === 'pdf') {
        return await performPdfOCR(file);
    } else {
        // Standard Image OCR
        const worker = await window.Tesseract.createWorker('eng');
        const ret = await worker.recognize(file);
        await worker.terminate();
        return ret.data.text; // Returns the raw, messy text
    }
}

/**
 * Helper: Specialized logic to loop through PDF pages and OCR them
 */
async function performPdfOCR(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    const worker = await window.Tesseract.createWorker('eng');

    // Limit to first 5 pages to prevent browser memory crashes on huge PDFs
    const numPages = Math.min(pdf.numPages, 5); 
    
    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // High scale for clear OCR
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        
        // OCR the canvas pixels directly
        const { data: { text } } = await worker.recognize(canvas);
        fullText += `\n--- Page ${i} ---\n${text}`;
    }

    await worker.terminate();
    return fullText;
}

/**
 * 2. Structure messy text into JSON using mistral-small-2603
 */
export async function structureText(rawText) {
    const response = await fetchWithRetry(`${API_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "mistral-small-2603",
            messages:[{
                role: "system",
                content: `You are an expert Data Architect. Extract tabular data or key-value pairs from this raw OCR text. 
                - Infer the best logical column names.
                - Output ONLY a JSON object containing an array called "data".
                Example: {"data":[{"Item": "Coffee", "Price": 4.50}, ...]}`
            }, {
                role: "user",
                content: rawText
            }],
            response_format: { type: "json_object" },
            temperature: 0.1 // Low temperature for factual extraction
        })
    });
    
    if (!response.ok) throw new Error("Failed to structure OCR text");
    const result = await response.json();
    return JSON.parse(result.choices[0].message.content).data; // Returns the array
}

/**
 * 3. Create Vector Embeddings for RAG using mistral-embed-2312
 */
export async function getEmbeddings(text) {
    const res = await fetchWithRetry(`${API_URL}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({ 
            model: "mistral-embed-2312", 
            input: [text] 
        })
    });
    
    if (!res.ok) throw new Error("Failed to generate embeddings");
    const json = await res.json();
    return json.data[0].embedding; // Returns array of 1024 floats
}