// js/modules/quality.js
import { runQuery } from '../core/database.js';

const modal = document.getElementById('quality-modal');
const resultsView = document.getElementById('quality-results-view');
const initialView = document.getElementById('quality-initial-view');
const details = document.getElementById('quality-details');
const scoreContainer = document.getElementById('quality-score-container');

export function openQualityModal() {
    modal.classList.remove('overlay-hidden');
    modal.style.display = 'flex';
    initialView.classList.remove('hidden');
    resultsView.classList.add('hidden');
    document.getElementById('quality-footer').classList.add('hidden');
}

/**
 * ENGINE 1: Health Audit
 */
export async function runHealthAudit(tableName) {
    initialView.classList.add('hidden');
    resultsView.classList.remove('hidden');
    details.innerHTML = `<div class="p-8 text-center">Analyzing table integrity...</div>`;

    try {
        const cols = await runQuery(`PRAGMA table_info('${tableName}')`);
        let auditData = [];

        for (const col of cols) {
            const sql = `
                SELECT 
                    COUNT(*) as total,
                    COUNT("${col.name}") as non_null,
                    COUNT(DISTINCT "${col.name}") as unique_vals
                FROM "${tableName}"
            `;
            const [res] = await runQuery(sql);
            
            // FIX: Explicitly convert BigInt to Number immediately
            const total = Number(res.total);
            const nonNull = Number(res.non_null);
            const unique = Number(res.unique_vals);
            
            const nullCount = total - nonNull;
            const healthScore = total > 0 ? Math.round((nonNull / total) * 100) : 0;

            auditData.push({
                name: col.name,
                score: healthScore,
                nulls: nullCount,
                unique: unique
            });
        }

        renderAudit(auditData);

    } catch (err) {
        console.error("Health Audit Failed:", err);
        details.innerHTML = `<div class="p-8 text-center text-red-500">Audit failed: ${err.message}</div>`;
    }
}

function renderAudit(data) {
    scoreContainer.innerHTML = `<h2 class="text-2xl font-bold text-blue-600">Data Health Score: ${Math.round(data.reduce((a, b) => a + b.score, 0) / data.length)}%</h2>`;
    
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
 * ENGINE 2: Anomaly Spotter (Outliers)
 */
export async function runAnomalySpotter(tableName) {
    const schema = await runQuery(`PRAGMA table_info('${tableName}')`);
    const numCols = schema.filter(c => ['DOUBLE', 'INTEGER', 'BIGINT', 'FLOAT'].includes(c.type));
    
    if (numCols.length === 0) return alert("No numeric columns found.");
    
    const target = numCols[0].name; 
    const sql = `
        WITH stats AS (
            SELECT AVG("${target}") as mu, STDDEV("${target}") as sigma FROM "${tableName}"
        )
        SELECT "${target}", ABS(("${target}" - mu) / sigma) as z_score
        FROM "${tableName}", stats
        WHERE z_score > 3
        ORDER BY z_score DESC LIMIT 10
    `;
    
    try {
        const results = await runQuery(sql);
        initialView.classList.add('hidden');
        resultsView.classList.remove('hidden');
        
        scoreContainer.innerHTML = `<h4 class="font-bold text-orange-600">Statistical Outliers Detected (${target})</h4>`;
        
        details.innerHTML = results.map(r => {
            // FIX: Handle z_score potential BigInt/Float conversion
            const score = typeof r.z_score === 'bigint' ? Number(r.z_score) : parseFloat(r.z_score);
            return `
                <div class="audit-item">
                    <span class="font-mono">${r[target]}</span>
                    <span class="risk-badge risk-high">Z-Score: ${score.toFixed(2)}</span>
                </div>
            `;
        }).join('') || `<div class="p-8 text-center text-gray-500">No major anomalies found.</div>`;
        
        document.getElementById('quality-footer').classList.remove('hidden');

    } catch (err) {
        alert("Anomaly Detection Error: " + err.message);
    }
}
