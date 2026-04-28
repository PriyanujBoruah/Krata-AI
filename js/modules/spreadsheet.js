// js/modules/spreadsheet.js
import { runQuery } from '../core/database.js';

let gridApi = null;
let currentTable = null;
const view = document.getElementById('spreadsheet-view');
const searchInput = document.getElementById('spreadsheet-search');
const btnDelete = document.getElementById('btn-delete-rows');

export async function openSpreadsheet(tableName) {
    if (!tableName) return alert("Please upload a dataset first.");
    currentTable = tableName;

    view.classList.remove('view-hidden');
    searchInput.value = '';
    btnDelete.classList.add('hidden');

    // 1. Fetch Data
    const data = await runQuery(`SELECT *, rowid FROM "${tableName}"`);
    
    // 2. Define Columns (with a Material Checkbox as the first column)
    const dbColumns = Object.keys(data[0] || {}).filter(c => c !== 'rowid');
    const columnDefs = [
        {
            headerName: '',
            checkboxSelection: true,
            headerCheckboxSelection: true, // "Select All"
            width: 50,
            pinned: 'left',
            suppressMenu: true,
            sortable: false,
            filter: false,
            resizable: false,
            cellClass: 'material-checkbox-cell'
        },
        ...dbColumns.map(col => ({
            field: col,
            headerName: col.charAt(0).toUpperCase() + col.slice(1),
            editable: true,
            sortable: true,
            filter: true,
            resizable: true
        }))
    ];

    // 3. Grid Options for "Excel Alternative" feel
    const gridOptions = {
        theme: agGrid.themeMaterial.withParams({
            accentColor: "#6002ee",
            primaryColor: "#6002ee",
            fontSize: 14,
            wrapperBorder: false,
            headerBackgroundColor: "#ffffff",
            rowSelectedColor: "#f3e8ff"
        }),
        columnDefs: columnDefs,
        rowData: data,
        pagination: true,
        paginationPageSize: 100,
        paginationPageSizeSelector: [10, 50, 100, 500],
        rowSelection: 'multiple',
        suppressRowClickSelection: true, // Only checkboxes select rows
        animateRows: true,
        defaultColDef: {
            flex: 1,
            minWidth: 150,
            filter: true,
        },
        // Toolbar Logic: Selection Change
        onSelectionChanged: () => {
            const selectedNodes = gridApi.getSelectedNodes();
            if (selectedNodes.length > 0) {
                btnDelete.classList.remove('hidden');
                btnDelete.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i> <span>Delete (${selectedNodes.length})</span>`;
                lucide.createIcons();
            } else {
                btnDelete.classList.add('hidden');
            }
        },
        // Database Sync: Cell Edit
        onCellValueChanged: async (params) => {
            const col = params.colDef.field;
            const newVal = params.newValue;
            const rid = params.data.rowid;

            const sql = `UPDATE "${tableName}" SET "${col}" = '${newVal}' WHERE rowid = ${rid}`;
            await runQuery(sql);
            console.log("Vault Updated:", col, "->", newVal);
        }
    };

    // 4. Initialize
    const gridDiv = document.getElementById('spreadsheet-grid-container');
    gridDiv.innerHTML = ''; 
    gridApi = agGrid.createGrid(gridDiv, gridOptions);
    lucide.createIcons();
}

export function closeSpreadsheet() {
    view.classList.add('view-hidden');
}

// Search Logic
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        if (gridApi) gridApi.setGridOption('quickFilterText', e.target.value);
    });
}

// Deletion Logic
if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
        const selectedData = gridApi.getSelectedRows();
        if (selectedData.length === 0) return;
        if (!confirm(`Delete ${selectedData.length} rows permanently?`)) return;

        try {
            const rowIds = selectedData.map(r => r.rowid).join(',');
            await runQuery(`DELETE FROM "${currentTable}" WHERE rowid IN (${rowIds})`);
            gridApi.applyTransaction({ remove: selectedData });
            btnDelete.classList.add('hidden');
        } catch (e) {
            alert("Delete failed: " + e.message);
        }
    });
}