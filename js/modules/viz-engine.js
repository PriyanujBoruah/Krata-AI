// js/modules/viz-engine.js
import { runQuery } from '../core/database.js';

// DOM Elements
const modal = document.getElementById('viz-modal');
const configView = document.getElementById('viz-config-view');
const resultView = document.getElementById('viz-result-view');
const chartContainer = document.getElementById('modal-chart-container');

// State Management
let selectedType = 'bar'; // Default
export let lastChartConfig = null; // Exported so main.js can "Send to Chat"

/**
 * 1. Initialize and Open the Modal
 * Populates X and Y axis dropdowns based on the actual table schema.
 */
export async function openVizModal(tableName) {
    if (!tableName) return alert("Please upload a dataset first.");
    
    // Reset View State: Show config, hide result
    configView.classList.remove('hidden');
    resultView.classList.add('hidden');

    try {
        // Fetch column metadata from DuckDB
        const schema = await runQuery(`PRAGMA table_info('${tableName}')`);
        
        // Generate <option> tags for all columns
        const options = schema.map(col => `<option value="${col.name}">${col.name}</option>`).join('');
        
        document.getElementById('viz-x-axis').innerHTML = options;
        document.getElementById('viz-y-axis').innerHTML = options;

        // Show the modal
        modal.classList.remove('overlay-hidden');
        
        // Refresh icons inside the modal
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error("Failed to load schema for Viz:", err);
        alert("Error reading table schema.");
    }
}

/**
 * 2. Handle Chart Type Selection
 * Updates the 'selectedType' state and UI active class.
 */
document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // UI Feedback
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update state
        selectedType = btn.dataset.type;
    });
});

/**
 * 3. Render Chart inside the Modal
 * Constructs the SQL, queries the Wasm engine, and uses Plotly to render.
 */
export async function renderModalChart(tableName) {
    const xAxis = document.getElementById('viz-x-axis').value;
    const yAxis = document.getElementById('viz-y-axis').value;
    const agg = document.getElementById('viz-y-agg').value;

    // A. Build the SQL Query based on aggregation
    let sql = "";
    if (agg === "COUNT") {
        // Count doesn't need a specific Y column, just groups by X
        sql = `SELECT "${xAxis}", COUNT(*) as value 
               FROM "${tableName}" 
               GROUP BY "${xAxis}" 
               ORDER BY value DESC 
               LIMIT 15`;
    } else {
        // Sum or Avg uses the specific Y column
        sql = `SELECT "${xAxis}", ${agg}("${yAxis}") as value 
               FROM "${tableName}" 
               GROUP BY "${xAxis}" 
               ORDER BY value DESC 
               LIMIT 15`;
    }

    try {
        // B. Run Query against Wasm Engine
        const data = await runQuery(sql);

        if (data.length === 0) {
            alert("The query returned no results. Try different columns.");
            return;
        }

        // C. Store config for "Send to Chat" functionality
        lastChartConfig = {
            type: selectedType,
            labels: data.map(d => String(d[xAxis])), // Ensure labels are strings
            values: data.map(d => {
                // Fix: DuckDB might return BigInts or Strings, Plotly needs Numbers
                const val = d.value;
                return typeof val === 'bigint' ? Number(val) : parseFloat(val);
            }),
            title: `${agg} of ${yAxis} by ${xAxis}`
        };

        // D. Swap Modal Views
        configView.classList.add('hidden');
        resultView.classList.remove('hidden');

        // E. Plotly Rendering Logic
        const trace = {
            x: lastChartConfig.labels,
            y: lastChartConfig.values,
            type: selectedType === 'pie' ? 'pie' : (selectedType === 'scatter' ? 'scatter' : selectedType),
            mode: selectedType === 'scatter' ? 'markers' : undefined,
            labels: selectedType === 'pie' ? lastChartConfig.labels : undefined,
            values: selectedType === 'pie' ? lastChartConfig.values : undefined,
            marker: { 
                color: '#0b57d0',
                line: { color: '#ffffff', width: 1 }
            }
        };

        // Pie charts handle data differently in Plotly
        if (selectedType === 'pie') {
            delete trace.x;
            delete trace.y;
        }

        const layout = {
            margin: { t: 50, b: 60, l: 60, r: 30 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            title: { 
                text: lastChartConfig.title, 
                font: { size: 14, family: 'Segoe UI', color: '#1f1f1f' } 
            },
            xaxis: { tickfont: { size: 10 }, automargin: true },
            yaxis: { tickfont: { size: 10 }, automargin: true }
        };

        const config = { 
            responsive: true, 
            displayModeBar: false 
        };

        // Render to the modal container
        Plotly.newPlot(chartContainer, [trace], layout, config);

    } catch (err) {
        console.error("Viz Rendering Error:", err);
        alert(`SQL Error: ${err.message}`);
    }
}