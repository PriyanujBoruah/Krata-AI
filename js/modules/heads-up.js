// js/modules/heads-up.js
import { runQuery } from '../core/database.js';

let headsupGridApi = null;

/**
 * Main entry point to open the modal and populate the table list.
 */
export async function openHeadsUpModal(allTables) {
    const gridContainer = document.getElementById('headsup-grid-container');

    // 1. Clear previous grid state
    if (headsupGridApi) {
        headsupGridApi.destroy();
        headsupGridApi = null;
    }
    
    // Reset preview window to initial state
    gridContainer.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#9ca3af; font-size:13px;">Select a dataset from the left to preview.</div>`;

    // 2. Render the interactive list
    renderTableList(allTables);

    // 3. Open the Modal
    window.openModal('headsup-modal');
}

/**
 * Generates the HTML for the left-side table list with Rename and Delete actions.
 */
function renderTableList(allTables) {
    const listContainer = document.getElementById('headsup-table-list');
    
    if (!allTables || allTables.length === 0) {
        listContainer.innerHTML = '<div class="text-xs text-gray-500 italic text-center mt-4">No data uploaded.</div>';
        return;
    }

    listContainer.innerHTML = allTables.map(t => `
        <div class="headsup-table-item" data-table="${t}">
            <div class="table-item-info">
                <i data-lucide="table"></i>
                <span class="table-name-label" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${t}</span>
            </div>
            <div class="table-item-actions">
                <button class="action-btn-sm btn-rename-table" title="Rename" data-table="${t}">
                    <i data-lucide="pencil" style="width:14px;height:14px;"></i>
                </button>
                <button class="action-btn-sm btn-delete-table" title="Delete" data-table="${t}">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Transform <i> tags into Lucide SVGs
    lucide.createIcons();

    // Re-attach listeners to the new DOM elements
    attachListListeners();
}

/**
 * Handles clicks for Previewing, Renaming, and Deleting tables.
 */
function attachListListeners() {
    // 1. Preview Logic
    document.querySelectorAll('.headsup-table-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            // Guard: If user clicked the Rename or Delete button, don't trigger preview
            if (e.target.closest('.table-item-actions')) return;

            // UI Feedback
            document.querySelectorAll('.headsup-table-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Load AG Grid preview
            await loadPreview(item.dataset.table);
        });
    });

    // 2. Rename Logic
    document.querySelectorAll('.btn-rename-table').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop from triggering the preview click
            const oldName = btn.dataset.table;
            const newName = prompt(`Enter new name for "${oldName}":`, oldName);
            
            if (newName && newName !== oldName) {
                // Dispatch event to main.js to handle DB update and state sync
                window.dispatchEvent(new CustomEvent('table-renamed', { 
                    detail: { oldName, newName } 
                }));
            }
        });
    });

    // 3. Delete Logic
    document.querySelectorAll('.btn-delete-table').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop from triggering the preview click
            const tableName = btn.dataset.table;
            
            if (confirm(`Permanently delete "${tableName}" from the local vault? This cannot be undone.`)) {
                // Dispatch event to main.js
                window.dispatchEvent(new CustomEvent('table-deleted', { 
                    detail: tableName 
                }));
            }
        });
    });
}

/**
 * Loads a high-performance AG Grid preview of the selected table.
 */
async function loadPreview(tableName) {
    const gridContainer = document.getElementById('headsup-grid-container');
    
    // Show loading state
    gridContainer.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#9ca3af; font-size:13px;">
        <i data-lucide="loader-2" class="animate-spin mr-2" style="width:16px;"></i> Loading preview...
    </div>`;
    lucide.createIcons();

    try {
        // Query top 100 rows for immediate feedback
        const data = await runQuery(`SELECT * FROM "${tableName}" LIMIT 100`);
        gridContainer.innerHTML = ''; // Clear spinner

        if (data.length === 0) {
            gridContainer.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#9ca3af; font-size:13px;">Table is empty.</div>`;
            return;
        }

        // Dynamically map columns for AG Grid
        const columns = Object.keys(data[0]).map(col => ({
            field: col,
            sortable: true,
            filter: true,
            resizable: true
        }));

        // Initialize Grid
        headsupGridApi = agGrid.createGrid(gridContainer, {
            columnDefs: columns,
            rowData: data,
            defaultColDef: { flex: 1, minWidth: 120 },
            headerHeight: 36,
            rowHeight: 32
        });

    } catch (err) {
        gridContainer.innerHTML = `<div style="display:flex; height:100%; align-items:center; justify-content:center; color:#ef4444; font-size:13px;">
            <i data-lucide="alert-circle" class="mr-2" style="width:16px;"></i> Error loading: ${err.message}
        </div>`;
        lucide.createIcons();
    }
}

/**
 * Public helper to refresh the table list UI from external modules (like main.js).
 */
export function refreshHeadsUpList(updatedTables) {
    renderTableList(updatedTables);
}