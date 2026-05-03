// js/ui/overlays.js
import { runQuery } from '../core/database.js';

const overlay = document.getElementById('preview-overlay');
const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');

export async function showTablePreview(tableName) {
    if (!tableName) return;

    // 1. Fetch data
    const data = await runQuery(`SELECT * FROM ${tableName} LIMIT 50`);
    if (data.length === 0) return;

    // 2. Build Headers
    const columns = Object.keys(data[0]);
    tableHead.innerHTML = `<tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr>`;

    // 3. Build Rows
    tableBody.innerHTML = data.map(row => {
        return `<tr>${columns.map(col => `<td>${row[col] ?? ''}</td>`).join('')}</tr>`;
    }).join('');

    // 4. Show UI
    overlay.classList.remove('overlay-hidden');
}

export function hideTablePreview() {
    overlay.classList.add('overlay-hidden');
}