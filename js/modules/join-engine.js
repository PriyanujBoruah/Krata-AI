// js/modules/join-engine.js
import { runQuery, getTableSchema } from '../core/database.js';

let activeTableName = null;
let allTablesList = [];

/**
 * UI: Open Modal and Populate Initial Tables
 */
export async function openJoinModal(activeTable, allTables) {
    if (!activeTable) return alert("Please select an active table first.");
    
    activeTableName = activeTable;
    allTablesList = allTables;

    document.getElementById('join-left-table-display').value = activeTable;
    
    const rightSelect = document.getElementById('join-right-table-select');
    const otherTables = allTables.filter(t => t !== activeTable);

    if (otherTables.length === 0) {
        alert("You need at least two tables in your vault to perform a join.");
        return;
    }

    // Populate Right Table dropdown
    rightSelect.innerHTML = `<option value="" disabled selected>Select reference table...</option>` +
        otherTables.map(t => `<option value="${t}">${t}</option>`).join('');

    // Clear key selectors initially
    document.getElementById('join-left-key').innerHTML = "";
    document.getElementById('join-right-key').innerHTML = "";
    document.getElementById('join-output-name').value = `${activeTable}_joined`;

    // Listen for Right Table selection to populate keys
    rightSelect.onchange = async () => {
        const rightTable = rightSelect.value;
        await populateKeys(activeTable, rightTable);
    };

    window.openModal('join-modal');
}

/**
 * Helper: Populates column keys for selected tables
 */
async function populateKeys(leftTable, rightTable) {
    const leftInfo = await runQuery(`PRAGMA table_info('${leftTable}')`);
    const rightInfo = await runQuery(`PRAGMA table_info('${rightTable}')`);

    const leftSelect = document.getElementById('join-left-key');
    const rightSelect = document.getElementById('join-right-key');

    const leftOptions = leftInfo.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const rightOptions = rightInfo.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    leftSelect.innerHTML = leftOptions;
    rightSelect.innerHTML = rightOptions;

    // 🚀 INTELLIGENCE: Auto-match keys with the same name
    const match = rightInfo.find(r => leftInfo.some(l => l.name.toLowerCase() === r.name.toLowerCase()));
    if (match) {
        leftSelect.value = match.name;
        rightSelect.value = match.name;
    }
}

/**
 * EXECUTE SQL JOIN
 */
export async function executeJoin() {
    const btn = document.getElementById('btn-execute-join');
    const leftTable = activeTableName;
    const rightTable = document.getElementById('join-right-table-select').value;
    const leftKey = document.getElementById('join-left-key').value;
    const rightKey = document.getElementById('join-right-key').value;
    let newTable = document.getElementById('join-output-name').value.trim();

    if (!rightTable || !leftKey || !rightKey || !newTable) {
        return alert("Please fill in all mapping parameters.");
    }

    newTable = newTable.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const originalHtml = btn.innerHTML;

    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Linking...`;
    btn.disabled = true;

    try {
        // 🚀 THE B2B SAFETY SHIELD:
        // Get schemas of both tables to identify duplicate column names
        const leftCols = (await runQuery(`PRAGMA table_info('${leftTable}')`)).map(c => c.name);
        const rightCols = (await runQuery(`PRAGMA table_info('${rightTable}')`)).map(c => c.name);

        // Exclude any columns from the right table that already exist in the left table
        // (This prevents the "Duplicate column name" crash during SELECT *)
        const rightExcludes = rightCols.filter(col => leftCols.includes(col) && col !== rightKey);

        const excludeClause = rightExcludes.length > 0 
            ? `EXCLUDE (${rightExcludes.map(c => `"${c}"`).join(', ')})` 
            : '';

        // Standard SQL Left Join utilizing DuckDB's unique EXCLUDE syntax
        const sql = `
            CREATE TABLE "${newTable}" AS 
            SELECT l.*, r.* ${excludeClause}
            FROM "${leftTable}" l 
            LEFT JOIN "${rightTable}" r 
            ON l."${leftKey}" = r."${rightKey}"
        `;

        await runQuery(sql);

        // Trigger successful state
        btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> Joined!`;
        
        // Notify the main application of the new table
        window.dispatchEvent(new CustomEvent('table-added', { detail: newTable }));

        setTimeout(() => {
            window.closeAllModals();
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }, 1200);

    } catch (err) {
        console.error("Join Error:", err);
        alert("Server is busy. Please try again.");
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}
