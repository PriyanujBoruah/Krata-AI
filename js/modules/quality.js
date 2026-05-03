// js/modules/quality.js
import { runQuery } from '../core/database.js';

const modal = document.getElementById('quality-modal');
const resultsView = document.getElementById('quality-results-view');
const initialView = document.getElementById('quality-initial-view');
const details = document.getElementById('quality-details');
const scoreContainer = document.getElementById('quality-score-container');

/**
 * SILENT SCANNER: Returns aggregate quality issues
 * without opening the modal UI.
 */
export async function silentQualityAudit(tableName) {
    const cols = await runQuery(`PRAGMA table_info('${tableName}')`);
    let totalNulls = 0;
    let colsWithIssues = 0;

    for (const col of cols) {
        const res = await runQuery(`SELECT COUNT(*) as total, COUNT("${col.name}") as non_null FROM "${tableName}"`);
        const totalRows = Number(res[0].total);
        const nulls = totalRows - Number(res[0].non_null);
        
        if (nulls > 0) {
            totalNulls += nulls;
            colsWithIssues++;
        }
    }
    return { nulls: totalNulls, columnCount: colsWithIssues };
}

/**
 * UI: Open Modal
 */
export function openQualityModal() {
    modal.classList.remove('overlay-hidden');
    modal.style.display = 'flex';
    initialView.classList.remove('hidden');
    resultsView.classList.add('hidden');
    document.getElementById('quality-footer').classList.add('hidden');
}

/**
 * UI: Manual Health Audit
 */
export async function runHealthAudit(tableName) {
    initialView.classList.add('hidden');
    resultsView.classList.remove('hidden');
    details.innerHTML = `<div class="p-8 text-center">Analyzing table integrity...</div>`;

    try {
        const cols = await runQuery(`PRAGMA table_info('${tableName}')`);
        let auditData = [];

        for (const col of cols) {
            const sql = `SELECT COUNT(*) as total, COUNT("${col.name}") as non_null, COUNT(DISTINCT "${col.name}") as unique_vals FROM "${tableName}"`;
            const [res] = await runQuery(sql);
            
            const total = Number(res.total);
            const nonNull = Number(res.non_null);
            const unique = Number(res.unique_vals);
            const healthScore = total > 0 ? Math.round((nonNull / total) * 100) : 0;

            auditData.push({
                name: col.name,
                score: healthScore,
                nulls: total - nonNull,
                unique: unique
            });
        }
        renderAudit(auditData);
    } catch (err) {
        details.innerHTML = `<div class="p-8 text-center text-red-500">Audit failed.</div>`;
    }
}

function renderAudit(data) {
    const avgScore = Math.round(data.reduce((a, b) => a + b.score, 0) / data.length);
    scoreContainer.innerHTML = `<h2 class="text-2xl font-bold text-blue-600">Data Health Score: ${avgScore}%</h2>`;
    
    details.innerHTML = data.map(item => `
        <div class="audit-item">
            <div>
                <div class="font-semibold text-sm">${item.name}</div>
                <div class="text-xs text-gray-500">${item.nulls} missing • ${item.unique} unique</div>
            </div>
            <div class="health-bar-bg">
                <div class="health-bar-fill ${item.score > 80 ? 'bg-green-500' : 'bg-orange-400'}" style="width: ${item.score}%"></div>
            </div>
        </div>
    `).join('');
    
    document.getElementById('quality-footer').classList.remove('hidden');
}

/**
 * UI: Anomaly Spotter
 */
export async function runAnomalySpotter(tableName) {
    const schema = await runQuery(`PRAGMA table_info('${tableName}')`);
    const numCols = schema.filter(c => ['DOUBLE', 'INTEGER', 'BIGINT', 'FLOAT'].includes(c.type));
    
    if (numCols.length === 0) return alert("No numeric columns found.");
    
    const target = numCols[0].name; 
    const sql = `
        WITH stats AS (SELECT AVG("${target}") as mu, STDDEV("${target}") as sigma FROM "${tableName}")
        SELECT "${target}", ABS(("${target}" - mu) / sigma) as z_score
        FROM "${tableName}", stats WHERE z_score > 3 ORDER BY z_score DESC LIMIT 10
    `;
    
    try {
        const results = await runQuery(sql);
        initialView.classList.add('hidden');
        resultsView.classList.remove('hidden');
        scoreContainer.innerHTML = `<h4 class="font-bold text-orange-600">Statistical Outliers (${target})</h4>`;
        
        details.innerHTML = results.map(r => `
            <div class="audit-item">
                <span class="font-mono">${r[target]}</span>
                <span class="risk-badge risk-high">Z-Score: ${Number(r.z_score).toFixed(2)}</span>
            </div>
        `).join('') || `<div class="p-8 text-center text-gray-500">No major anomalies.</div>`;
        
        document.getElementById('quality-footer').classList.remove('hidden');
    } catch (err) { alert("Detection Error: " + err.message); }
}