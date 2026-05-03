// js/modules/viz-engine.js
import { getTableSchema, getDeepTableProfile } from '../core/database.js';
import { fetchWithRetry } from '../core/utils.js';

const MISTRAL_API_KEY = "glAETAxTj1qgV2HkruSYDIPJJOlJxU0R"; 
const API_URL = "https://api.mistral.ai/v1/chat/completions";
const VIZ_MODEL = "mistral-small-2603";

// DOM Elements
const modal = document.getElementById('viz-modal');
const configView = document.getElementById('viz-config-view');
const resultView = document.getElementById('viz-result-view');
const mermaidContainer = document.getElementById('modal-mermaid-container');
const refineInput = document.getElementById('viz-refine-input');

// State Management
let selectedType = 'pie';
export let lastMermaidCode = null;

// ============================================================================
// UI INITIALIZATION & EVENT LISTENERS
// ============================================================================

export function initVizEngine() {
    const trigger = document.getElementById('viz-dropdown-trigger');
    const optionsMenu = document.getElementById('viz-dropdown-options');
    const optionItems = document.querySelectorAll('.opt-item');

    // 1. CUSTOM DROPDOWN LOGIC
    // --------------------------------------------------------
    
    // Toggle Menu Visibility
    trigger?.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevents immediate close from the document listener
        optionsMenu.classList.toggle('hidden');
    });

    // Handle Option Selection
    optionItems.forEach(item => {
        item.addEventListener('click', () => {
            const value = item.dataset.value;
            const iconName = item.dataset.icon;
            const label = item.querySelector('span').innerText;

            // A. Update internal state for the AI Router
            selectedType = value;

            // B. Update the Trigger UI (Icon + Text)
            const triggerContent = trigger.querySelector('.trigger-content');
            triggerContent.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4"></i> <span>${label}</span>`;
            
            // C. Visual Feedback: Toggle 'active' class in list
            optionItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // D. Close and Refresh
            optionsMenu.classList.add('hidden');
            if (window.lucide) lucide.createIcons();
        });
    });

    // Close dropdown if user clicks anywhere else on the screen
    document.addEventListener('click', () => {
        optionsMenu?.classList.add('hidden');
    });


    // 2. GENERATION & REFINEMENT
    // --------------------------------------------------------

    // Main Generation Button
    document.getElementById('btn-generate-viz')?.addEventListener('click', () => {
        const activeTable = document.getElementById('active-data-label').innerText;
        if (activeTable && activeTable !== "Select Data") {
            renderModalChart(activeTable);
        } else {
            alert("Please select or upload a dataset first.");
        }
    });

    // Iteration / Refinement Button
    document.getElementById('btn-refine-viz')?.addEventListener('click', () => {
        const instruction = refineInput.value.trim();
        const activeTable = document.getElementById('active-data-label').innerText;
        if (instruction && activeTable && activeTable !== "Select Data") {
            renderModalChart(activeTable, instruction);
        }
    });

    // Refinement via 'Enter' key
    refineInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-refine-viz').click();
        }
    });


    // 3. NAVIGATION & EXPORT
    // --------------------------------------------------------

    // Close Modal
    document.getElementById('close-viz')?.addEventListener('click', () => {
        modal.classList.add('overlay-hidden');
    });

    // Back to Configuration View
    document.getElementById('btn-viz-back')?.addEventListener('click', () => {
        configView.classList.remove('hidden');
        resultView.classList.add('hidden');
    });

    // Send the generated Mermaid markdown to the chat interface
    document.getElementById('btn-viz-save')?.addEventListener('click', () => {
        if (lastMermaidCode) {
            const markdown = `I've generated this visual insight for you:\n\n\`\`\`mermaid\n${lastMermaidCode}\n\`\`\``;
            
            // Dispatch custom event to main.js
            window.dispatchEvent(new CustomEvent('send-viz-to-chat', { detail: markdown }));
            modal.classList.add('overlay-hidden');
        }
    });

    // Export current SVG as high-res PNG
    document.getElementById('btn-viz-export')?.addEventListener('click', exportDiagramAsPNG);


    // 4. GLOBAL TRIGGER
    // --------------------------------------------------------

    // Listen for events from menus or sidebar to open the lab
    window.addEventListener('open-viz', () => {
        const activeTable = document.getElementById('active-data-label').innerText;
        openVizModal(activeTable !== "Select Data" ? activeTable : null);
    });

    // --------------------------------------------------------
    // NEW: SAVE TO LIBRARY (PRIVATE)
    // --------------------------------------------------------
    document.getElementById('btn-viz-library')?.addEventListener('click', async (e) => {
        if (!lastMermaidCode) return;

        const btn = e.currentTarget;
        const originalHtml = btn.innerHTML;
        const title = document.getElementById('viz-goal').value || "Private Visual Insight";

        try {
            btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> <span>Saving...</span>`;
            btn.disabled = true;
            if (window.lucide) lucide.createIcons();

            // Dynamically import library logic
            const { saveToLibrary } = await import('./library.js');

            // Save to 'library_items'
            await saveToLibrary('chart', title, { code: lastMermaidCode });

            // Success State (Blue)
            btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-blue-600"></i> <span class="text-blue-700">Saved</span>`;
            btn.style.borderColor = '#0d6efd';
            btn.style.backgroundColor = '#e7f1ff';
            if (window.lucide) lucide.createIcons();

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.style = ''; 
                btn.disabled = false;
                if (window.lucide) lucide.createIcons();
            }, 2000);

        } catch (err) {
            console.error("Library save failed:", err);
            alert("Failed to save to Library.");
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    });

    // --------------------------------------------------------
    // NEW: ADD TO WORKSPACE
    // --------------------------------------------------------
    document.getElementById('btn-viz-workspace')?.addEventListener('click', async (e) => {
        if (!lastMermaidCode) return;

        const btn = e.currentTarget;
        const originalHtml = btn.innerHTML;
        // Use the user's prompt as the title, or fallback to a generic name
        const title = document.getElementById('viz-goal').value || "Visual Insight";

        try {
            // Show Loading State
            btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> <span>Saving...</span>`;
            btn.disabled = true;
            if (window.lucide) lucide.createIcons();

            // Dynamically import workspace logic
            const { shareToWorkspace } = await import('./workspace.js');

            // Save payload to the 'workspace_items' table.
            // Note: We use { code: lastMermaidCode } because that is what openWorkspaceItem expects
            await shareToWorkspace('chart', title, { code: lastMermaidCode });

            // Show Success State (Green Check)
            btn.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4 text-green-600"></i> <span class="text-green-700">Added</span>`;
            btn.style.borderColor = '#137333';
            btn.style.backgroundColor = '#e6f4ea';
            if (window.lucide) lucide.createIcons();

            // Restore to original state after 2 seconds
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.style = ''; // clear inline styles
                btn.disabled = false;
                if (window.lucide) lucide.createIcons();
            }, 2000);

        } catch (err) {
            console.error("Workspace sharing failed:", err);
            alert("Could not share to workspace. Check connection.");
            
            // Restore button on error
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    });
}

/**
 * Ensures the Custom Dropdown resets to default when opening the modal.
 */
function openVizModal(tableName) {
    if (!tableName) return alert("Please upload a dataset first.");
    
    // Switch views
    configView.classList.remove('hidden');
    resultView.classList.add('hidden');
    
    // Reset Inputs
    document.getElementById('viz-goal').value = "";
    if (refineInput) refineInput.value = "";
    
    // Reset Custom Dropdown to 'Pie Chart' (Default)
    selectedType = 'pie';
    const triggerContent = document.querySelector('#viz-dropdown-trigger .trigger-content');
    if (triggerContent) {
        triggerContent.innerHTML = `<i data-lucide="pie-chart" class="w-4 h-4"></i> <span>Distribution (Pie Chart)</span>`;
    }
    
    // Clear active state and set default
    document.querySelectorAll('.opt-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.opt-item[data-value="pie"]')?.classList.add('active');

    lastMermaidCode = null; 
    modal.classList.remove('overlay-hidden');
    
    // Hydrate icons
    if (window.lucide) lucide.createIcons();
}

// ============================================================================
// CORE ENGINE: Orchestrator
// ============================================================================

/**
 * CORE ENGINE: Orchestrator for AI Diagram Generation & Refinement.
 * Handles specialized prompt routing and Mermaid.js rendering.
 */
async function renderModalChart(tableName, instruction = null) {
    const goal = document.getElementById('viz-goal').value || "Summarize the key metrics.";
    const schema = await getTableSchema(tableName);
    const profile = await getDeepTableProfile(tableName);
    
    // Provide AI with the first 10 columns of statistics for high-accuracy reasoning
    const dataContext = profile.columns.slice(0, 10).join('\n'); 

    // UI Reference & Loading States
    const btnGenerate = document.getElementById('btn-generate-viz');
    const btnRefine = document.getElementById('btn-refine-viz');
    
    // Create a unique ID for this specific render attempt (used for cleanup on failure)
    const renderId = 'viz-render-' + Date.now();

    if (instruction) {
        btnRefine.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>`;
    } else {
        btnGenerate.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2 inline"></i> Generating...`;
    }
    if (window.lucide) lucide.createIcons();

    try {
        let code = "";
        const ctx = { tableName, schema, dataContext, goal, instruction, lastMermaidCode };

        // 1. ROUTE: Send to specialized AI Micro-Agent
        if (instruction && lastMermaidCode) {
            // Edit existing diagram logic
            code = await AI_ROUTERS['refine'](ctx);
        } else {
            // Create new diagram logic based on dropdown selection
            const aiCall = AI_ROUTERS[selectedType] || AI_ROUTERS['fallback'];
            code = await aiCall(ctx);
        }

        // 2. SANITIZE: Remove any markdown code block wrappers injected by the LLM
        code = code.replace(/```mermaid/g, '').replace(/```/g, '').trim();
        lastMermaidCode = code; 

        // 3. RENDER: Use global Mermaid instance to generate SVG
        // window.mermaid.render is async in v10+
        const { svg } = await window.mermaid.render(renderId, code);
        
        // Inject SVG into the UI
        mermaidContainer.innerHTML = svg;

        // 4. UI TRANSITION: Show the result and hide the config form
        configView.classList.add('hidden');
        resultView.classList.remove('hidden');
        
        // Clear the refinement input for the next round
        if (refineInput) refineInput.value = ""; 

    } catch (err) {
        // 🚀 THE FIX: Use 'err' (matching the catch variable)
        console.error("Visualization Rendering Failed:", err);
    
        // 🚀 THE FIX: Correctly identify and remove the Mermaid "Ghost" Error element
        // Mermaid v10+ injects a div with ID "d" + your renderId when it fails
        const ghostError = document.getElementById('d' + renderId);
        if (ghostError) ghostError.remove();

        // 🚀 THE FIX: Provide localized fallback UI inside the Mermaid container
        mermaidContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-center bg-red-50 rounded-xl border border-red-100">
                <i data-lucide="alert-circle" class="text-red-500 w-8 h-8 mb-3"></i>
                <div class="text-red-800 font-bold">Logic Too Complex</div>
                <div class="text-red-600 text-xs mt-1">The AI generated code that Mermaid couldn't render. Try a simpler goal or instruction.</div>
                <code class="text-[10px] mt-4 p-2 bg-white rounded border text-gray-400 block w-full overflow-auto max-h-24">
                    ${lastMermaidCode || "No code generated."}
                </code>
            </div>
        `;
        if (window.lucide) lucide.createIcons();

        // If it was an initial generation, don't swap views so the user can edit the goal
        if (instruction) {
            configView.classList.add('hidden');
            resultView.classList.remove('hidden');
        }
    } finally {
        // Restore Button UI
        btnGenerate.innerText = "Generate Visual Intelligence";
        btnRefine.innerHTML = `<i data-lucide="refresh-cw"></i>`;
        if (window.lucide) lucide.createIcons();
    }
}

// ============================================================================
// AI MICROSERVICES (15 Dedicated Prompts + 1 Refiner)
// ============================================================================

async function fetchMermaid(systemPrompt, temp = 0.2) {
    const response = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: VIZ_MODEL,
            messages:[{ role: "system", content: systemPrompt }],
            temperature: temp
        })
    });
    const data = await response.json();
    return data.choices[0].message.content;
}

const AI_ROUTERS = {
    // --- 1. GROWTH & MARKETING ---
    'funnel': async (ctx) => fetchMermaid(`You are a Growth Marketer. Build a Funnel Diagram using Mermaid 'graph TD'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: A["10k Visitors"] --> B["5k Leads"] --> C["1k Customers"]. Output ONLY raw mermaid code.`, 0.2),

    'journey': async (ctx) => fetchMermaid(`You are a UX Analyst. Build a Customer Journey map using Mermaid 'journey'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: journey\\n title Flow\\n section Site\\n Click: 5: User\\n Buy: 3: User. Output ONLY raw mermaid code.`, 0.4),

    'xychart': async (ctx) => fetchMermaid(`You are a Data Analyst. Build a Bar/Line chart using Mermaid 'xychart-beta'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: xychart-beta\\n title "Sales"\\n x-axis["Jan", "Feb"]\\n bar [10, 20]\\n line[10, 20]. Output ONLY raw mermaid code.`, 0.1),

    'pie': async (ctx) => fetchMermaid(`You are a Data Analyst. Build a Pie chart using Mermaid 'pie'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: pie title "Category"\\n "A" : 40\\n "B" : 60. Output ONLY raw mermaid code.`, 0.1),

    'sankey': async (ctx) => fetchMermaid(`You are a Data Analyst. Build a Sankey diagram using Mermaid 'sankey-beta'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: sankey-beta\\n "Source","Target",100\\n "Target","Outcome",50. OUTPUT ONLY RAW MERMAID CODE.`, 0.2),

    // --- 2. E-COMMERCE OPERATIONS ---
    'state': async (ctx) => fetchMermaid(`You are an Ops Manager. Build a State diagram using Mermaid 'stateDiagram-v2'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: stateDiagram-v2\\n [*] --> Pending\\n Pending --> Shipped. Output ONLY raw mermaid code.`, 0.2),

    'er': async (ctx) => fetchMermaid(`You are a Database Architect. Build an Entity-Relationship diagram using Mermaid 'erDiagram'. Goal: ${ctx.goal}. Schema: ${ctx.schema}
    SYNTAX: erDiagram\\n ${ctx.tableName} {\\n string col1\\n int col2\\n }. Output ONLY raw mermaid code.`, 0.0),

    'timeline': async (ctx) => fetchMermaid(`You are a Project Manager. Build a Timeline using Mermaid 'timeline'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: timeline\\n title "Events"\\n 2023 : Event A : Event B. Output ONLY raw mermaid code.`, 0.3),

    'gantt': async (ctx) => fetchMermaid(`You are an Ops Manager. Build a Gantt chart using Mermaid 'gantt'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: gantt\\n title Project\\n dateFormat YYYY-MM-DD\\n section Ops\\n Task : 2023-01-01, 10d. Output ONLY raw mermaid code.`, 0.2),

    'gitgraph': async (ctx) => fetchMermaid(`You are a Data Engineer. Build a GitGraph to show data versioning using Mermaid 'gitGraph'. Goal: ${ctx.goal}.
    SYNTAX: gitGraph\\n commit id:"Raw"\\n branch clean\\n commit id:"Trimmed". Output ONLY raw mermaid code.`, 0.2),

    // --- 3. STRATEGIC INTELLIGENCE ---
    'mindmap': async (ctx) => fetchMermaid(`You are a Strategy Consultant. Build a Mindmap using Mermaid 'mindmap'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: mindmap\\n root((Goal))\\n  Node1\\n   SubNode1\\n  Node2. Output ONLY raw mermaid code.`, 0.6),

    'swot': async (ctx) => fetchMermaid(`You are a Strategy Consultant. Build a SWOT matrix using Mermaid 'quadrantChart'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: quadrantChart\\n title SWOT\\n x-axis "Internal" --> "External"\\n y-axis "Harmful" --> "Helpful"\\n quadrant-1 "Weakness"\\n quadrant-2 "Threat"\\n quadrant-3 "Strength"\\n quadrant-4 "Opportunity"\\n "Insight 1": [0.2, 0.2]. Output ONLY raw mermaid code.`, 0.5),

    'quadrant': async (ctx) => fetchMermaid(`You are a Consultant. Build a Matrix using Mermaid 'quadrantChart'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: quadrantChart\\n title Matrix\\n x-axis "Low" --> "High"\\n y-axis "Low" --> "High"\\n "Item":[0.8, 0.8]. Output ONLY raw mermaid code.`, 0.4),

    'flowchart': async (ctx) => fetchMermaid(`You are a Systems Analyst. Build a Logic Flowchart using Mermaid 'graph TD'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: graph TD\\n A{Condition?} -->|Yes| B[Action]\\n A -->|No| C[Stop]. Output ONLY raw mermaid code.`, 0.3),

    'sequence': async (ctx) => fetchMermaid(`You are an Architect. Build a Sequence diagram using Mermaid 'sequenceDiagram'. Goal: ${ctx.goal}. Data: ${ctx.dataContext}
    SYNTAX: sequenceDiagram\\n Actor->>System: Request\\n System-->>Actor: Response. Output ONLY raw mermaid code.`, 0.2),

    // --- CORE FALLBACKS ---
    'fallback': async (ctx) => fetchMermaid(`Build a Mermaid diagram for Goal: ${ctx.goal}. Data: ${ctx.dataContext}. Output raw code.`, 0.3),
    
    'refine': async (ctx) => fetchMermaid(`You are refining an existing Mermaid diagram.
    CURRENT CODE: \n${ctx.lastMermaidCode}\n
    USER INSTRUCTION: "${ctx.instruction}"
    GOAL: Update the code to fulfill the instruction perfectly. Output ONLY the raw Mermaid code. No backticks.`, 0.2)
};

// ============================================================================
// EXPORT CAPABILITY (SVG to High-Res PNG)
// ============================================================================

async function exportDiagramAsPNG() {
    const svg = mermaidContainer.querySelector('svg');
    if (!svg) return alert("No diagram found to export.");

    const width = svg.viewBox.baseVal.width || svg.clientWidth || 800;
    const height = svg.viewBox.baseVal.height || svg.clientHeight || 600;
    
    const scale = 2; // High-DPI Output
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
        ctx.fillStyle = "white"; // Solid background for presentations
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, width * scale, height * scale);
        
        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `Krata_Insight_${Date.now()}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    };
    img.src = url;
}