// js/ui/chat-viz.js

/**
 * Parses HTML content for [CHART_START] tags, strips any injected Markdown-HTML,
 * and replaces them with a Plotly container.
 */
export function processInlineCharts(htmlContent, messageElement) {
    const chartRegex = /\[CHART_START\]([\s\S]*?)\[CHART_END\]/g;
    
    let processedHtml = htmlContent;
    let match;

    while ((match = chartRegex.exec(htmlContent)) !== null) {
        try {
            // 1. CLEAN THE JSON: Strip any HTML tags (like <p>, <strong>, <br>) 
            // that 'marked' might have added inside the chart block.
            const cleanedJsonString = match[1].replace(/<\/?[^>]+(>|$)/g, "").trim();
            
            const config = JSON.parse(cleanedJsonString);
            const chartId = 'inline-chart-' + Math.random().toString(36).substr(2, 9);
            
            // 2. Replace the tag in the HTML with a placeholder DIV
            processedHtml = processedHtml.replace(match[0], `<div id="${chartId}" class="inline-chart"></div>`);

            // 3. Render the chart via Plotly
            requestAnimationFrame(() => {
                const container = document.getElementById(chartId);
                if (!container) return;

                let traces = [];

                // 4. FLEXIBLE DATA HANDLING:
                // Support both simple {labels, values} AND complex {datasets: []} formats
                if (config.datasets && Array.isArray(config.datasets)) {
                    // Complex format (Multiple lines/bars)
                    traces = config.datasets.map(ds => ({
                        x: config.labels,
                        y: ds.values,
                        name: ds.label,
                        type: config.type === 'pie' ? 'pie' : (config.type === 'scatter' ? 'scatter' : config.type),
                        mode: config.type === 'line' ? 'lines+markers' : (config.type === 'scatter' ? 'markers' : undefined),
                        marker: { color: ds.color || '#0b57d0' }
                    }));
                } else {
                    // Simple format
                    traces = [{
                        x: config.type === 'pie' ? null : config.labels,
                        y: config.type === 'pie' ? null : config.values,
                        labels: config.type === 'pie' ? config.labels : null,
                        values: config.type === 'pie' ? config.values : null,
                        type: config.type === 'pie' ? 'pie' : (config.type === 'scatter' ? 'scatter' : config.type),
                        mode: config.type === 'line' ? 'lines+markers' : (config.type === 'scatter' ? 'markers' : undefined),
                        marker: { color: '#0b57d0' }
                    }];
                }

                const layout = {
                    autosize: true, // 🚀 Crucial for mobile
                    width: undefined, // Let it be determined by container
                    height: 350,
                    margin: { t: 50, b: 60, l: 50, r: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    showlegend: true,
                    legend: { orientation: 'h', y: -0.2 },
                    title: { 
                        text: config.title, 
                        font: { size: 14, family: 'Segoe UI', color: '#1f1f1f' } 
                    },
                    xaxis: { title: config.xAxisLabel || '', automargin: true },
                    yaxis: { title: config.yAxisLabel || '', automargin: true }
                };

                Plotly.newPlot(chartId, traces, layout, { responsive: true, displayModeBar: false });
            });

        } catch (e) {
            console.error("Failed to parse inline chart JSON:", e, "Original Match:", match[1]);
            // If it fails, replace the tags with a small error note so the UI doesn't look broken
            processedHtml = processedHtml.replace(match[0], `<div class="text-xs text-gray-400 italic p-2 border rounded">Chart data provided was malformed and could not be rendered.</div>`);
        }
    }

    return processedHtml;
}

/**
 * Finds Markdown code blocks labeled as 'mermaid' and renders them.
 * Must be called AFTER the AI stream is completely finished.
 */
export async function processMermaidCharts(messageElement) {
    if (!window.mermaid) return;

    const mermaidBlocks = messageElement.querySelectorAll('code.language-mermaid');
    
    for (let i = 0; i < mermaidBlocks.length; i++) {
        const codeBlock = mermaidBlocks[i];
        let rawCode = codeBlock.innerText.trim();

        // 🚀 SMART CLEANER: Fix common LLM mistakes for the 12 types
        let cleanedCode = rawCode
            .replace(/;+$/gm, '')           // Remove trailing semicolons
            .replace(/\[\{/g, '[')          // Fix JSON-style bracket hallucinations
            .replace(/\}\]/g, ']')
            .replace(/(\w+)\s*:\s*(\d+);/g, '$1 : $2'); // Fix pie chart semicolons

        const preTag = codeBlock.parentElement; 
        const chartContainer = document.createElement('div');
        chartContainer.className = 'mermaid-chart-wrapper mt-6 mb-6 p-6 bg-white border border-gray-100 rounded-2xl shadow-sm flex justify-center overflow-hidden';
        
        const chartId = `mermaid-render-${Date.now()}-${i}`;
        chartContainer.id = chartId;
        preTag.parentNode.replaceChild(chartContainer, preTag);

        try {
            // Test if the syntax is valid before rendering
            // (Standard Mermaid 'parse' is sync, but 'render' is async)
            const { svg } = await window.mermaid.render(chartId + '-svg', cleanedCode);
            chartContainer.innerHTML = svg;
            
            // Adjust SVG to be responsive
            const svgElement = chartContainer.querySelector('svg');
            if (svgElement) {
                svgElement.style.width = '100%';
                svgElement.style.height = 'auto';
            }
        } catch (error) {
            console.warn("Mermaid fallback triggered:", error);
            chartContainer.innerHTML = `
                <div class="flex flex-col items-center py-4 opacity-60">
                    <div class="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">Visual Summary Generated</div>
                    <pre class="text-[9px] font-mono bg-gray-50 p-2 rounded border border-gray-100 max-w-full overflow-auto">${cleanedCode}</pre>
                </div>`;
            
            // Cleanup Mermaid's global error injection
            const ghost = document.getElementById('d' + chartId + '-svg');
            if (ghost) ghost.remove();
        }
    }
}