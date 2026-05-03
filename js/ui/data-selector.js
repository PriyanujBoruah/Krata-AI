// js/ui/data-selector.js

export function updateDataSelector(state) {
    const container = document.getElementById('data-list-container');
    const label = document.getElementById('active-data-label');

    // 1. Update the Button Label
    label.innerText = state.activeTable || "Select Data";

    // 2. Generate the List
    if (state.allTables.length === 0) {
        container.innerHTML = `<div class="p-4 text-xs text-gray-400 italic">No data uploaded yet</div>`;
        return;
    }

    container.innerHTML = state.allTables.map(tableName => `
        <div class="data-item ${tableName === state.activeTable ? 'active' : ''}" data-table="${tableName}">
            <div class="flex flex-col">
                <span class="text-sm">${tableName}</span>
                <span class="text-[10px] opacity-50 uppercase tracking-tighter">DuckDB Table</span>
            </div>
            <i data-lucide="check" class="checkmark w-4 h-4"></i>
        </div>
    `).join('');

    // 3. Attach Switch Logic
    document.querySelectorAll('.data-item').forEach(item => {
        item.addEventListener('click', () => {
            const newTable = item.dataset.table;
            window.dispatchEvent(new CustomEvent('table-switched', { detail: newTable }));
            document.getElementById('data-dropdown').classList.add('hidden');
        });
    });

    lucide.createIcons();
}