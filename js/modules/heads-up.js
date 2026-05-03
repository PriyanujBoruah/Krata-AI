// js/modules/heads-up.js
import { runQuery, exportToParquet } from '../core/database.js';
import { saveToStorage } from '../core/storage.js';

let headsupGridApi = null;
let currentPreviewTable = null;
let isListenersAttached = false;

/**
 * Main entry point to open the modal and populate the dropdown.
 */
export async function openHeadsUpModal(allTables) {
    const gridContainer = document.getElementById('headsup-grid-container');

    currentPreviewTable = null; // Reset selection on open

    // 1. Clear previous grid state
    if (headsupGridApi) {
        headsupGridApi.destroy();
        headsupGridApi = null;
    }
    
    // Reset preview window
    gridContainer.innerHTML = `<div class="empty-state-msg">Select a dataset to preview.</div>`;

    // 2. Render Dropdown Options
    renderTableList(allTables);

    // 3. Attach Listeners (Only once)
    if (!isListenersAttached) {
        attachListeners();
        isListenersAttached = true;
    }

    // 4. Open the Modal
    window.openModal('headsup-modal');
}

/**
 * Populates the universal dropdown menu.
 */
function renderTableList(allTables) {
    const selectEl = document.getElementById('headsup-select');
    
    if (!allTables || allTables.length === 0) {
        selectEl.innerHTML = '<option value="" disabled selected>No data uploaded.</option>';
        return;
    }

    selectEl.innerHTML = `<option value="" disabled selected>Select a dataset...</option>` + 
        allTables.map(t => `<option value="${t}" ${currentPreviewTable === t ? 'selected' : ''}>${t}</option>`).join('');

    // Re-initialize icons inside the modal if necessary
    if (window.lucide) lucide.createIcons();
}

/**
 * Attaches listeners for the Dropdown and Toolbar Actions.
 */
function attachListeners() {
    // Dropdown change triggers preview
    document.getElementById('headsup-select').addEventListener('change', async (e) => {
        const tableName = e.target.value;
        if (!tableName) return;
        
        currentPreviewTable = tableName;
        await loadPreview(tableName);
    });

    // 🚀 NEW: Save Locally Button
    document.getElementById('btn-save-headsup').addEventListener('click', async () => {
        if (!currentPreviewTable) return alert("Please select a dataset from the dropdown first.");
        
        const btn = document.getElementById('btn-save-headsup');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-600"></i>`;
        if (window.lucide) lucide.createIcons();

        try {
            // 1. Export heavily compressed Parquet from DuckDB memory
            const buffer = await exportToParquet(currentPreviewTable);
            
            // 2. Persist to Browser IndexedDB Vault for Auto-Boot
            await saveToStorage(currentPreviewTable, buffer);
            
            // 3. 🚀 THE FIX: Notify the user instead of triggering a download
            alert('Data has been saved to session.');

        } catch (e) {
            console.error(e);
            alert('Failed to save data to session: ' + e.message);
        } finally {
            // Restore original icon
            btn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons();
        }
    });


    // Rename Button
    document.getElementById('btn-rename-headsup').addEventListener('click', () => {
        if (!currentPreviewTable) return alert("Please select a dataset from the dropdown first.");
        triggerRename(currentPreviewTable);
    });

    // Delete Button
    document.getElementById('btn-delete-headsup').addEventListener('click', () => {
        if (!currentPreviewTable) return alert("Please select a dataset from the dropdown first.");
        triggerDelete(currentPreviewTable);
    });
}

// Shared Action Dispatchers
function triggerRename(oldName) {
    const newName = prompt(`Enter new name for "${oldName}":`, oldName);
    if (newName && newName !== oldName) {
        window.dispatchEvent(new CustomEvent('table-renamed', { 
            detail: { oldName, newName } 
        }));
    }
}

function triggerDelete(tableName) {
    if (confirm(`Permanently delete "${tableName}" from the local vault? This cannot be undone.`)) {
        window.dispatchEvent(new CustomEvent('table-deleted', { detail: tableName }));
    }
}

/**
 * Loads a high-performance AG Grid preview of the selected table.
 */
async function loadPreview(tableName) {
    const gridContainer = document.getElementById('headsup-grid-container');
    
    gridContainer.innerHTML = `<div class="empty-state-msg"><i data-lucide="loader-2" class="animate-spin mr-2" style="width:16px;"></i> Loading preview...</div>`;
    if (window.lucide) lucide.createIcons();

    try {
        const data = await runQuery(`SELECT * FROM "${tableName}" LIMIT 100`);
        gridContainer.innerHTML = ''; 

        if (data.length === 0) {
            gridContainer.innerHTML = `<div class="empty-state-msg">Table is empty.</div>`;
            return;
        }

        const columns = Object.keys(data[0]).map(col => ({
            field: col, sortable: true, filter: true, resizable: true
        }));

        headsupGridApi = agGrid.createGrid(gridContainer, {
            theme: 'legacy', // Fixes AG Grid v35 theme error
            columnDefs: columns,
            rowData: data,
            defaultColDef: { flex: 1, minWidth: 120 },
            headerHeight: 36,
            rowHeight: 32
        });

    } catch (err) {
        gridContainer.innerHTML = `<div class="empty-state-msg text-red-500"><i data-lucide="alert-circle" class="mr-2" style="width:16px;"></i> Error loading: ${err.message}</div>`;
        if (window.lucide) lucide.createIcons();
    }
}

export function refreshHeadsUpList(updatedTables) {
    renderTableList(updatedTables);
}