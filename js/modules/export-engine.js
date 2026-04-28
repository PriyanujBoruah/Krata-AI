// js/modules/export-engine.js
import { runQuery } from '../core/database.js';

/**
 * Universal Downloader Helper for Blobs
 */
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * EXPORT AS CSV
 * Fetches data from Wasm Vault and generates a browser download.
 */
export async function downloadCSV(tableName) {
    if (!tableName) return;

    try {
        const data = await runQuery(`SELECT * FROM "${tableName}"`);
        if (data.length === 0) {
            alert("No data found to export.");
            return;
        }

        // 1. Build CSV Headers
        const headers = Object.keys(data[0]).join(",");

        // 2. Build CSV Rows (Escaping quotes for safety)
        const rows = data.map(row => 
            Object.values(row).map(val => {
                const str = val === null ? "" : String(val);
                return `"${str.replace(/"/g, '""')}"`;
            }).join(",")
        ).join("\n");

        const csvContent = headers + "\n" + rows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        triggerDownload(blob, `${tableName}_export.csv`);

    } catch (err) {
        console.error("CSV Export Failed:", err);
        alert("Failed to generate CSV: " + err.message);
    }
}

/**
 * EXPORT AS EXCEL (Using SheetJS)
 * Handles BigInt conversions to prevent SheetJS serialization errors.
 */
export async function downloadExcel(tableName) {
    if (!tableName) return;

    try {
        const data = await runQuery(`SELECT * FROM "${tableName}"`);
        if (data.length === 0) {
            alert("No data found to export.");
            return;
        }

        // SheetJS (XLSX) does not support BigInt. 
        // We convert all BigInt values to standard Numbers or Strings.
        const cleanData = data.map(row => {
            const newRow = {};
            for (let key in row) {
                if (typeof row[key] === 'bigint') {
                    newRow[key] = Number(row[key]);
                } else {
                    newRow[key] = row[key];
                }
            }
            return newRow;
        });

        // Use global XLSX library
        const worksheet = XLSX.utils.json_to_sheet(cleanData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "DataExport");

        // Generate file and trigger system save dialog
        XLSX.writeFile(workbook, `${tableName}_export.xlsx`);

    } catch (err) {
        console.error("Excel Export Failed:", err);
        alert("Failed to generate Excel file: " + err.message);
    }
}