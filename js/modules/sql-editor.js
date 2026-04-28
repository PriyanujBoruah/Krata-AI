// js/modules/sql-editor.js
import { runQuery } from '../core/database.js';

let editor;
let lastResults = null;
const modal = document.getElementById('sql-modal');

export function initSqlEditor(activeTable) {
    if (!editor) {
        editor = CodeMirror.fromTextArea(document.getElementById('sql-code-area'), {
            mode: "text/x-sql",
            theme: "dracula",
            lineNumbers: true,
            indentWithTabs: true,
            smartIndent: true,
            matchBrackets: true,
            autofocus: true
        });
    }

    if (activeTable) {
        editor.setValue(`SELECT * FROM "${activeTable}" LIMIT 100`);
    }
    
    modal.classList.remove('hidden');
    setTimeout(() => editor.refresh(), 300); // CodeMirror needs refresh after reveal
    lucide.createIcons();
}

export async function executeSql() {
    const code = editor.getValue();
    const btn = document.getElementById('btn-run-sql');
    
    btn.innerHTML = `<span>Processing...</span>`;

    try {
        const data = await runQuery(code);
        lastResults = data;
        renderSqlResults(data);
        document.getElementById('btn-sql-to-chat').classList.remove('hidden');
    } catch (err) {
        alert("SQL Error: " + err.message);
    } finally {
        btn.innerHTML = `<i data-lucide="play"></i> <span>Execute</span>`;
        lucide.createIcons();
    }
}

function renderSqlResults(data) {
    const head = document.getElementById('sql-grid-head');
    const body = document.getElementById('sql-grid-body');
    const count = document.getElementById('result-count');

    count.innerText = `${data.length} rows`;
    if (data.length === 0) return;

    const cols = Object.keys(data[0]);
    head.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;
    body.innerHTML = data.map(row => `
        <tr>${cols.map(c => `<td>${row[c] !== null ? row[c] : ''}</td>`).join('')}</tr>
    `).join('');
}

export function getSqlResults() { return lastResults; }
export function closeSqlEditor() { modal.classList.add('hidden'); }