// js/modules/privacy.js
import { runQuery } from '../core/database.js';

const modal = document.getElementById('privacy-modal');
const piiList = document.getElementById('pii-list');
const riskSummary = document.getElementById('risk-summary');

// Standard PII Patterns (Email, Phone, Credit Card)
export const PRIVACY_PATTERNS = {
    email: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    phone: "(\\+91[\\-\\s]?)?[0-9]{10}",
    credit_card: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b"
};

/**
 * SILENT SCANNER: Returns results for the background agent
 * without opening the modal UI.
 */
export async function silentPrivacyScan(tableName) {
    const columns = await runQuery(`PRAGMA table_info('${tableName}')`);
    let piiDetected = [];

    for (const col of columns) {
        if (col.type !== 'VARCHAR' && col.type !== 'TEXT') continue;

        const scanSql = `
            SELECT 
                COUNT(CASE WHEN regexp_matches("${col.name}", '${PRIVACY_PATTERNS.email}') THEN 1 END) as e,
                COUNT(CASE WHEN regexp_matches("${col.name}", '${PRIVACY_PATTERNS.phone}') THEN 1 END) as p,
                COUNT(CASE WHEN regexp_matches("${col.name}", '${PRIVACY_PATTERNS.credit_card}') THEN 1 END) as c
            FROM "${tableName}"
        `;
        
        try {
            const [counts] = await runQuery(scanSql);
            const total = Number(counts.e) + Number(counts.p) + Number(counts.c);

            if (total > 0) {
                piiDetected.push({
                    column: col.name,
                    count: total,
                    type: counts.e > 0 ? 'Email' : counts.p > 0 ? 'Phone' : 'Financial'
                });
            }
        } catch (e) { console.error("Privacy col scan failed", e); }
    }
    return piiDetected;
}

/**
 * CORE LOGIC: Redacts a specific column
 */
export async function applyRedaction(tableName, columnName) {
    const patternsCombined = `(${PRIVACY_PATTERNS.email}|${PRIVACY_PATTERNS.phone}|${PRIVACY_PATTERNS.credit_card})`;
    const sql = `UPDATE "${tableName}" SET "${columnName}" = '[REDACTED]' WHERE regexp_matches("${columnName}", '${patternsCombined}')`;
    return await runQuery(sql);
}

/**
 * UI: Open Modal
 */
export function openPrivacyModal() {
    modal.classList.remove('overlay-hidden');
    modal.style.display = 'flex';
    document.getElementById('privacy-initial-view').classList.remove('hidden');
    document.getElementById('privacy-results-view').classList.add('hidden');
    document.getElementById('privacy-footer').classList.add('hidden');
}

/**
 * UI: Manual Full Scan
 */
export async function runPrivacyScan(tableName) {
    const results = await silentPrivacyScan(tableName);
    
    document.getElementById('privacy-initial-view').classList.add('hidden');
    document.getElementById('privacy-results-view').classList.remove('hidden');

    renderScanResults(results, tableName);
}

function renderScanResults(results, tableName) {
    document.getElementById('privacy-footer').classList.remove('hidden');
    
    if (results.length === 0) {
        riskSummary.innerHTML = `<span class="risk-badge risk-safe">No PII Detected</span>`;
        piiList.innerHTML = `<div class="p-8 text-center text-gray-500">Your dataset appears clean.</div>`;
        return;
    }

    riskSummary.innerHTML = `<span class="risk-badge risk-high">${results.length} Vulnerable Columns</span>`;
    
    piiList.innerHTML = results.map(res => `
        <div class="pii-row">
            <div class="pii-info">
                <span class="pii-col-name">${res.column}</span>
                <span class="pii-detected">${res.type} detected (${res.count} rows)</span>
            </div>
            <button class="redact-btn" data-col="${res.column}">Redact</button>
        </div>
    `).join('');

    document.querySelectorAll('.redact-btn').forEach(btn => {
        btn.onclick = async () => {
            const col = btn.dataset.col;
            btn.innerText = "Cleaning...";
            await applyRedaction(tableName, col);
            btn.innerText = "Redacted";
            btn.classList.add('disabled');
        };
    });
}