// js/modules/privacy.js
import { runQuery } from '../core/database.js';

const modal = document.getElementById('privacy-modal');
const piiList = document.getElementById('pii-list');
const riskSummary = document.getElementById('risk-summary');

// Standard PII Patterns for Indian Marketing Leads (Email, Phone, CC)
const PATTERNS = {
    email: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    phone: "(\\+91[\\-\\s]?)?[0-9]{10}",
    credit_card: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b"
};

export function openPrivacyModal() {
    modal.classList.remove('overlay-hidden');
    modal.style.display = 'flex';
    document.getElementById('privacy-initial-view').classList.remove('hidden');
    document.getElementById('privacy-results-view').classList.add('hidden');
    document.getElementById('privacy-footer').classList.add('hidden');
}

export async function runPrivacyScan(tableName) {
    const columns = await runQuery(`PRAGMA table_info('${tableName}')`);
    piiList.innerHTML = `<div class="p-4 text-center">Scanning columns...</div>`;
    
    document.getElementById('privacy-initial-view').classList.add('hidden');
    document.getElementById('privacy-results-view').classList.remove('hidden');

    let results = [];

    for (const col of columns) {
        if (col.type !== 'VARCHAR' && col.type !== 'TEXT') continue;

        // Count occurrences of each pattern in this column
        const scanSql = `
            SELECT 
                COUNT(CASE WHEN regexp_matches("${col.name}", '${PATTERNS.email}') THEN 1 END) as email_hits,
                COUNT(CASE WHEN regexp_matches("${col.name}", '${PATTERNS.phone}') THEN 1 END) as phone_hits,
                COUNT(CASE WHEN regexp_matches("${col.name}", '${PATTERNS.credit_card}') THEN 1 END) as cc_hits
            FROM "${tableName}"
        `;
        
        const [counts] = await runQuery(scanSql);
        const totalHits = Number(counts.email_hits + counts.phone_hits + counts.cc_hits);

        if (totalHits > 0) {
            results.push({
                name: col.name,
                hits: totalHits,
                types: counts.email_hits > 0 ? 'Email' : counts.phone_hits > 0 ? 'Phone' : 'FinData'
            });
        }
    }

    renderScanResults(results, tableName);
}

function renderScanResults(results, tableName) {
    document.getElementById('privacy-footer').classList.remove('hidden');
    
    if (results.length === 0) {
        riskSummary.innerHTML = `<span class="risk-badge risk-safe">No PII Detected</span>`;
        piiList.innerHTML = `<div class="p-8 text-center text-gray-500">Your dataset appears clean. No sensitive patterns found.</div>`;
        return;
    }

    riskSummary.innerHTML = `<span class="risk-badge risk-high">${results.length} Vulnerable Columns</span>`;
    
    piiList.innerHTML = results.map(res => `
        <div class="pii-row">
            <div class="pii-info">
                <span class="pii-col-name">${res.name}</span>
                <span class="pii-detected">${res.types} detected (${res.hits} rows)</span>
            </div>
            <button class="redact-btn" data-col="${res.name}">Redact</button>
        </div>
    `).join('');

    // Attach Redaction Logic
    document.querySelectorAll('.redact-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const col = btn.dataset.col;
            btn.innerText = "Cleaning...";
            await applyRedaction(tableName, col);
            btn.innerText = "Redacted";
            btn.classList.add('disabled');
            btn.disabled = true;
        });
    });
}

async function applyRedaction(tableName, columnName) {
    // Replace anything matching any of our patterns with "[REDACTED]"
    const patternsCombined = `(${PATTERNS.email}|${PATTERNS.phone}|${PATTERNS.credit_card})`;
    const sql = `UPDATE "${tableName}" SET "${columnName}" = '[REDACTED]' WHERE regexp_matches("${columnName}", '${patternsCombined}')`;
    await runQuery(sql);
}