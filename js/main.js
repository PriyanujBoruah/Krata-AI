// js/main.js
import { initDatabase, registerFile, runQuery, registerFromURL, getTableSchema } from './core/database.js';
import { showTablePreview, hideTablePreview } from './ui/overlays.js';
import { askAgentStream, streamDataStory, streamAdvancedNarrative, generateProactiveInsights  } from './core/ai-agent.js';
import { initMenus } from './ui/input-bar.js';
import { openVizModal, renderModalChart, lastChartConfig } from './modules/viz-engine.js';
import { initSqlEditor, executeSql, closeSqlEditor, getSqlResults } from './modules/sql-editor.js';
import { openPivotModal, executePivot } from './modules/pivot-engine.js';
import { openPrivacyModal, runPrivacyScan } from './modules/privacy.js';
import { openQualityModal, runHealthAudit, runAnomalySpotter } from './modules/quality.js';
import { downloadCSV, downloadExcel } from './modules/export-engine.js';
import { initSidebar } from './ui/sidebar.js';
import { openSpreadsheet, closeSpreadsheet } from './modules/spreadsheet.js';
import { initPersonaUI } from './modules/personas.js';
import { initSettings } from './ui/settings.js';
import { initAuth, logout } from './core/auth.js';
import { createKrataBook, fetchKrataBooks } from './modules/kratabook.js';
import { processInlineCharts, processMermaidCharts } from './ui/chat-viz.js'; 
import { updateDataSelector } from './ui/data-selector.js';
import { showSmartChips } from './ui/chat.js';
import { openHeadsUpModal, refreshHeadsUpList } from './modules/heads-up.js';
import { initAgenticBackground, openAgenticBgModal } from './modules/agentic-bg.js';
import { performOCR, structureText, getEmbeddings } from './core/vision-agent.js';






/**
 * Global App State
 */
const state = {
    activeTable: null,
    allTables: [], // Track all ingested tables
    isDatabaseReady: false
};

/**
 * DOM Elements - Main Layout
 */
const chatContainer = document.getElementById('chat-container');
const introScreen = document.getElementById('intro-screen');
const messagesContainer = document.getElementById('messages');
const userPrompt = document.getElementById('user-prompt');
const filePicker = document.getElementById('file-picker');

/**
 * DOM Elements - Buttons & Modals
 */
const btnSend = document.getElementById('btn-send');
const btnPreview = document.getElementById('btn-preview');
const btnClosePreview = document.getElementById('close-preview');
const previewOverlay = document.getElementById('preview-overlay');

// Visualization Modal Elements
const vizModal = document.getElementById('viz-modal');
const btnCloseViz = document.getElementById('close-viz');
const btnRenderViz = document.getElementById('btn-generate-viz');
const btnVizBack = document.getElementById('btn-viz-back');
const btnVizSave = document.getElementById('btn-viz-save');
const vizConfigView = document.getElementById('viz-config-view');
const vizResultView = document.getElementById('viz-result-view');

/**
 * 1. APP INITIALIZATION
 */
let isBooting = false;

async function init() {
    // 1. Initialize Auth first
    initAuth();

    // 2. Handle User Authentication
    window.addEventListener('user-authenticated', async (e) => {
        // --- THE LOCK ---
        if (state.isDatabaseReady || isBooting) return;
        
        const user = e.detail;
        const email = user.email;
        const displayName = user.user_metadata?.display_name || email.split('@')[0];
        const initial = displayName.charAt(0).toUpperCase();

        // 3. UI PERSONALIZATION (Non-DB dependent)
        const greeting = document.querySelector('#intro-screen h1');
        if (greeting) greeting.innerText = `Hi ${displayName},`;

        const avatarCircle = document.getElementById('user-avatar-circle');
        const largeAvatar = document.getElementById('profile-large-avatar');
        const emailDisplay = document.getElementById('profile-email-display');
        const greetingDisplay = document.getElementById('profile-greeting');

        if (avatarCircle) avatarCircle.innerText = initial;
        if (largeAvatar) largeAvatar.innerText = initial;
        if (emailDisplay) emailDisplay.innerText = email;
        if (greetingDisplay) greetingDisplay.innerText = `Hi, ${displayName}!`;

        // 4. THE ENGINE BOOT (The sensitive part)
        isBooting = true;
        console.log("Verified Session. Booting Engine...");

        try {
            // Await the engine initialization fully
            await initDatabase(); 
            
            // Set the flag ONLY after the promise resolves
            state.isDatabaseReady = true;

            // 5. SEQUENTIAL UI LOADING (DB-dependent functions)
            // These functions use runQuery(), so they MUST come after await initDatabase()
            initMenus();
            initSidebar();
            initSettings();
            initPersonaUI();
            
            // These specific calls perform SQL queries immediately
            await initAgenticBackground(); 
            await refreshKrataBookSidebar(); 

            // Final Polish
            lucide.createIcons();
            setupEventListeners();

            console.log("DVantage SaaS: Online & Database Initialized");
        } catch (err) {
            console.error("Critical Boot Error:", err);
            // If it fails, we reset flags so user can try again or refresh
            state.isDatabaseReady = false;
        } finally {
            isBooting = false;
        }
    });
}

/**
 * 2. EVENT LISTENERS
 */
function setupEventListeners() {
    
    // --- Data Ingestion ---
    // 1. Update the file upload handler
    // --- Data Ingestion & Proactive Insights ---
    // --- Data Ingestion & Proactive Insights ---
    filePicker.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const extension = file.name.split('.').pop().toLowerCase();
        // Generate a safe table name from the filename
        const tableName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        // Immediate Visual Feedback
        userPrompt.placeholder = `Ingesting ${file.name}...`;
        
        try {
            // Drop existing table if it already exists to avoid Catalog Error on re-upload
            if (state.allTables.includes(tableName)) {
                await runQuery(`DROP TABLE IF EXISTS "${tableName}"`);
                console.log(`Re-ingesting: Dropped existing table ${tableName}`);
            }

            let schema = "";

            // ==========================================
            // 🚀 BRANCH 1: MULTIMODAL PIPELINE (IMAGE/PDF)
            // ==========================================
            if (['png', 'jpg', 'jpeg', 'pdf'].includes(extension)) {
                
                const typeLabel = extension === 'pdf' ? 'PDF (first 5 pages)' : 'Image';
                
                // 1. Tesseract OCR (Local)
                addSystemMessage(`📷 **Step 1/3:** Running local OCR on ${typeLabel} using Tesseract...`);
                const rawText = await performOCR(file);
                
                if (!rawText || rawText.trim() === "") {
                    throw new Error("No text could be found in this document.");
                }

                // 2. Mistral Structuring (Cloud)
                addSystemMessage(`🧠 **Step 2/3:** Structuring raw text via Mistral-Small...`);
                const structuredData = await structureText(rawText);
                
                if (!structuredData || structuredData.length === 0) {
                    throw new Error("Could not extract a tabular structure from this document.");
                }

                // 3. RAG Embeddings (Cloud)
                addSystemMessage(`🌌 **Step 3/3:** Generating vector embeddings for Semantic Search...`);
                const vector = await getEmbeddings(rawText);

                // 4. Create Knowledge Base (RAG Table)
                await runQuery(`
                    CREATE TABLE IF NOT EXISTS knowledge_base (
                        file_name VARCHAR,
                        raw_content TEXT,
                        embedding DOUBLE[]
                    )
                `);
                
                // Insert into Knowledge Base (Escape quotes safely)
                const safeText = rawText.replace(/'/g, "''"); 
                await runQuery(`
                    INSERT INTO knowledge_base VALUES (
                        '${file.name}', 
                        '${safeText}', 
                        [${vector.join(',')}]
                    )
                `);

                // 5. Create the Structured Table for AG Grid / Analysis
                const cols = Object.keys(structuredData[0]);
                const colDef = cols.map(c => `"${c}" VARCHAR`).join(', ');
                await runQuery(`CREATE TABLE "${tableName}" (${colDef})`);
                
                // Batch Insert the extracted rows into the new table
                for (let row of structuredData) {
                    const values = cols.map(c => {
                        const val = row[c] ? String(row[c]).replace(/'/g, "''") : '';
                        return `'${val}'`;
                    }).join(', ');
                    await runQuery(`INSERT INTO "${tableName}" VALUES (${values})`);
                }

                // Generate schema string manually for unstructured files
                schema = cols.map(c => `${c} (VARCHAR)`).join(', ');
            } 
            // ==========================================
            // 🚀 BRANCH 2: STRUCTURED PIPELINE (CSV/Parquet)
            // ==========================================
            else {
                // Ingest standard file into local DuckDB-Wasm
                await registerFile(file);
                schema = await getTableSchema(tableName);
            }

            // ==========================================
            // 🚀 COMMON UI UPDATES & PROACTIVE INSIGHTS
            // ==========================================

            // Update Global State
            state.activeTable = tableName;
            if (!state.allTables.includes(tableName)) {
                state.allTables.push(tableName);
            }
            
            // UI Transitions
            introScreen.style.display = 'none';
            userPrompt.placeholder = `Ask about ${tableName}...`;
            userPrompt.focus();
            
            // Update Custom UI Components
            updateDataSelector(state); 
            await showSmartChips(tableName, runQuery);

            // --- PROACTIVE INSIGHTS GENERATION ---
            const pillsContainer = document.getElementById('proactive-insights-container');
            const pillsList = document.getElementById('proactive-pills');
            
            if (pillsContainer && pillsList) {
                pillsContainer.classList.remove('hidden');
                pillsList.innerHTML = `<div class="p-4 text-xs italic text-gray-400">Generating insights...</div>`;

                // Call Mistral-Small to get 6 tailored pills based on the schema
                const insights = await generateProactiveInsights(tableName, schema);
                
                pillsList.innerHTML = insights.map(text => `
                    <button class="proactive-pill">${text}</button>
                `).join('');

                // Attach click listeners to the generated pills
                document.querySelectorAll('.proactive-pill').forEach(pill => {
                    pill.addEventListener('click', () => {
                        userPrompt.value = pill.innerText.replace(/[\u{1F300}-\u{1F6FF}]/gu, '').trim(); // Strip emoji
                        handleSendMessage(); // Trigger chat logic
                    });
                });
            }

            addSystemMessage(`✅ Successfully indexed **${file.name}**. I've mapped the schema and prepared proactive insights for you at the top.`);

        } catch (err) {
            console.error("Ingestion Error:", err);
            addSystemMessage(`Failed to index file: ${err.message}`, true);
            userPrompt.placeholder = "Ask Krata AI...";
        }
    });

    // --- URL Import Listeners ---

    // 1. Open the Modal from the Dropdown
    const btnImportMenu = document.getElementById('btn-import-url-menu');
    if (btnImportMenu) {
        btnImportMenu.addEventListener('click', () => {
            document.getElementById('menu-database').classList.add('hidden'); // Close dropdown
            window.openModal('url-import-modal');
        });
    }

    // 2. Execute the Import
    const btnRunImport = document.getElementById('btn-run-url-import');
    if (btnRunImport) {
        btnRunImport.addEventListener('click', async () => {
            const url = document.getElementById('import-url-input').value.trim();
            let tableName = document.getElementById('import-name-input').value.trim();

            if (!url || !tableName) return alert("Please provide both a URL and a table name.");

            // Sanitize table name (replace spaces with underscores, lowercase)
            tableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

            // UI Loading State
            const originalHtml = btnRunImport.innerHTML;
            btnRunImport.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Downloading...`;
            btnRunImport.disabled = true;
            lucide.createIcons();

            try {
                // Ingest from URL
                await registerFromURL(url, tableName);

                // Update App State
                state.activeTable = tableName;
                if (!state.allTables.includes(tableName)) state.allTables.push(tableName);

                // Update UI
                introScreen.style.display = 'none';
                userPrompt.placeholder = `Ask about ${tableName}...`;
                userPrompt.focus();
                
                updateDataSelector(state);
                await showSmartChips(tableName, runQuery);

                // Close Modal & Notify
                document.getElementById('url-import-modal').classList.remove('active');
                addSystemMessage(`Successfully imported **${tableName}** from the web. I'm ready to analyze it.`);

            } catch (err) {
                alert(`Import failed: ${err.message}\n\n(Note: The URL must be public and allow CORS).`);
            } finally {
                // Restore Button State
                btnRunImport.innerHTML = originalHtml;
                btnRunImport.disabled = false;
                lucide.createIcons();
                
                // Clear inputs for next time
                document.getElementById('import-url-input').value = "";
                document.getElementById('import-name-input').value = "";
            }
        });
    }

    // --- Input Bar UX (Gemini Style) ---
    userPrompt.addEventListener('input', () => {
        userPrompt.style.height = 'auto';
        userPrompt.style.height = (userPrompt.scrollHeight) + 'px';
        userPrompt.value.trim().length > 0 ? btnSend.classList.remove('hidden') : btnSend.classList.add('hidden');
    });

    userPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    btnSend.addEventListener('click', handleSendMessage);

    // --- Eye Preview Logic ---
    btnPreview.addEventListener('click', () => {
        state.activeTable ? showTablePreview(state.activeTable) : addSystemMessage("Upload a dataset first.", true);
    });
    btnClosePreview.addEventListener('click', hideTablePreview);
    previewOverlay.addEventListener('click', (e) => { if (e.target.id === 'preview-overlay') hideTablePreview(); });

    // --- Visualization Lab Listeners ---
    
    // Triggered via Tools Menu (input-bar.js dispatches this)
    window.addEventListener('open-viz', () => openVizModal(state.activeTable));

    btnCloseViz.addEventListener('click', () => vizModal.classList.add('overlay-hidden'));

    // Step A: Render Chart inside the Modal
    btnRenderViz.addEventListener('click', async () => {
        btnRenderViz.innerText = "Processing...";
        await renderModalChart(state.activeTable);
        btnRenderViz.innerText = "Render Chart";
    });

    // Step B: Back to settings
    btnVizBack.addEventListener('click', () => {
        vizConfigView.classList.remove('hidden');
        vizResultView.classList.add('hidden');
    });

    // Step C: Save and Inject into Chat
    btnVizSave.addEventListener('click', () => {
        if (lastChartConfig) {
            renderChartInChat(lastChartConfig);
            vizModal.classList.add('overlay-hidden');
        }
    });

    // --- SQL Editor Listeners ---

    window.addEventListener('open-sql', () => initSqlEditor(state.activeTable));
    document.getElementById('btn-run-sql').addEventListener('click', executeSql);
    document.getElementById('close-sql').addEventListener('click', closeSqlEditor);

    // Bonus: Send SQL results back to chat as a snippet
    document.getElementById('btn-sql-to-chat').addEventListener('click', () => {
        const data = getSqlResults();
        if (!data) return;
        
        closeSqlEditor();
        addSystemMessage(`Query executed. I found **${data.length}** records. Would you like me to analyze these specific results?`);
    });

    // --- Pivot Table Listeners ---

    window.addEventListener('open-pivot', () => openPivotModal(state.activeTable));

    document.getElementById('btn-run-pivot').addEventListener('click', () => {
        executePivot(state.activeTable);
    });

    document.getElementById('close-pivot').addEventListener('click', () => {
        document.getElementById('pivot-modal').classList.add('overlay-hidden');
    });

    document.getElementById('btn-pivot-back').addEventListener('click', () => {
        document.getElementById('pivot-config-view').classList.remove('hidden');
        document.getElementById('pivot-result-view').classList.add('hidden');
    });

    document.getElementById('btn-pivot-chat').addEventListener('click', () => {
        const row = document.getElementById('pivot-row-select').value;
        const col = document.getElementById('pivot-col-select').value;
        
        addSystemMessage(`I've computed the pivot table for you, grouping by **${row}** across **${col}**. You can see the summarized trends in the Lab.`);
        document.getElementById('pivot-modal').classList.add('overlay-hidden');
    });

    // --- Privacy Hub Listeners ---
    
    window.addEventListener('open-privacy', () => openPrivacyModal());

    document.getElementById('btn-start-scan').addEventListener('click', () => {
        runPrivacyScan(state.activeTable);
    });

    document.getElementById('close-privacy').addEventListener('click', () => {
        document.getElementById('privacy-modal').classList.add('overlay-hidden');
        document.getElementById('privacy-modal').style.display = 'none';
    });

    document.getElementById('btn-privacy-done').addEventListener('click', () => {
        addSystemMessage("Privacy Audit complete. Sensitive data has been identified and neutralized locally.");
        document.getElementById('privacy-modal').classList.add('overlay-hidden');
        document.getElementById('privacy-modal').style.display = 'none';
    });

    // --- Quality Hub Listeners ---

    window.addEventListener('open-quality', () => openQualityModal());

    document.getElementById('btn-run-audit').addEventListener('click', () => runHealthAudit(state.activeTable));
    document.getElementById('btn-run-anomalies').addEventListener('click', () => runAnomalySpotter(state.activeTable));

    document.getElementById('btn-quality-back').addEventListener('click', () => {
        document.getElementById('quality-initial-view').classList.remove('hidden');
        document.getElementById('quality-results-view').classList.add('hidden');
        document.getElementById('quality-footer').classList.add('hidden');
    });

    document.getElementById('close-quality').addEventListener('click', () => {
        document.getElementById('quality-modal').classList.add('overlay-hidden');
        document.getElementById('quality-modal').style.display = 'none';
    });

    document.getElementById('btn-quality-chat').addEventListener('click', () => {
        addSystemMessage("I've analyzed the quality of your dataset. The **Health Audit** is visible in your lab, indicating column-wise completeness and uniqueness.");
        document.getElementById('quality-modal').classList.add('overlay-hidden');
        document.getElementById('quality-modal').style.display = 'none';
    });

    // --- Narrative Listeners ---

    window.addEventListener('trigger-narrator', () => handleNarrator());

    // --- Export Logic (Direct from Database Menu) ---
    const btnCsv = document.getElementById('btn-export-csv-menu');
    if (btnCsv) {
        btnCsv.addEventListener('click', () => {
            if (!state.activeTable) return alert("Upload a dataset first.");
            downloadCSV(state.activeTable);
            addSystemMessage(`Downloaded **${state.activeTable}** as CSV.`);
            document.getElementById('menu-database').classList.add('hidden');
        });
    }

    const btnExcel = document.getElementById('btn-export-excel-menu');
    if (btnExcel) {
        btnExcel.addEventListener('click', () => {
            if (!state.activeTable) return alert("Upload a dataset first.");
            downloadExcel(state.activeTable);
            addSystemMessage(`Downloaded **${state.activeTable}** as Excel.`);
            document.getElementById('menu-database').classList.add('hidden');
        });
    }

    // 2. Spreadsheet Listener
    document.getElementById('sidebar-spreadsheet-btn').addEventListener('click', () => {
        if (state.activeTable) {
            openSpreadsheet(state.activeTable);
        } else {
            addSystemMessage("Please upload a dataset first.", true);
        }
    });

    // 3. Close Spreadsheet and Search (Already using IDs, which is good)
    document.getElementById('close-spreadsheet')?.addEventListener('click', closeSpreadsheet);

    // --- Persona Listeners ---

    document.getElementById('sidebar-personas-btn').addEventListener('click', () => {
        window.openModal('persona-modal');
    });

    // Listen for the change to show a toast
    window.addEventListener('persona-changed', (e) => {
        addSystemMessage(`AI Identity switched to: **${e.detail}**`);
        // NEW: Update Top Nav Center Text
        const personaDisplay = document.getElementById('active-persona-display');
        if (personaDisplay) {
            personaDisplay.innerText = e.detail;
        }
    });

    // Initialize the Persona UI logic
    initPersonaUI();

    // Listen for the table switch
    window.addEventListener('table-switched', (e) => {
        state.activeTable = e.detail;
        
        // UI Feedback
        userPrompt.placeholder = `Ask about ${state.activeTable}...`;
        updateDataSelector(state); // Refresh checkmarks
        
        addSystemMessage(`Switched context to: **${state.activeTable}**`);
    });

    // --- Table Management Logic ---

    // DELETE TABLE
    window.addEventListener('table-deleted', async (e) => {
        const tableName = e.detail;
        try {
            // 1. Physical Delete from DuckDB
            await runQuery(`DROP TABLE "${tableName}"`);
            
            // 2. Update State
            state.allTables = state.allTables.filter(t => t !== tableName);
            
            // 3. Handle Active Table replacement
            if (state.activeTable === tableName) {
                state.activeTable = state.allTables.length > 0 ? state.allTables[0] : null;
            }

            // 4. Refresh UI Components
            // REMOVED THE IMPORT LINE FROM HERE
            refreshHeadsUpList(state.allTables);
            updateDataSelector(state);
            
            if (!state.activeTable) {
                introScreen.style.display = 'block';
                userPrompt.placeholder = "Ask Gemini...";
            } else {
                userPrompt.placeholder = `Ask about ${state.activeTable}...`;
            }

            addSystemMessage(`Table **${tableName}** deleted successfully.`);
        } catch (err) {
            alert("Error deleting table: " + err.message);
        }
    });

    // RENAME TABLE
    window.addEventListener('table-renamed', async (e) => {
        const { oldName, newName } = e.detail;
        const cleanNewName = newName.replace(/[^a-zA-Z0-9]/g, '_');
        
        try {
            // 1. Rename in DuckDB
            await runQuery(`ALTER TABLE "${oldName}" RENAME TO "${cleanNewName}"`);
            
            // 2. Update State
            state.allTables = state.allTables.map(t => t === oldName ? cleanNewName : t);
            if (state.activeTable === oldName) state.activeTable = cleanNewName;

            // 3. Refresh UI
            // REMOVED THE IMPORT LINE FROM HERE
            refreshHeadsUpList(state.allTables);
            updateDataSelector(state);
            userPrompt.placeholder = `Ask about ${state.activeTable}...`;

            addSystemMessage(`Table renamed from **${oldName}** to **${cleanNewName}**.`);
        } catch (err) {
            alert("Error renaming table: " + err.message);
        }
    });


    // --- Top Menu: Persona ---
    document.getElementById('btn-top-persona').addEventListener('click', () => {
        document.getElementById('menu-top-options').classList.add('hidden'); // Close menu
        window.openModal('persona-modal');
    });

    // --- Top Menu: KrataBook ---
    document.getElementById('btn-top-kratabook').addEventListener('click', async () => {
        document.getElementById('menu-top-options').classList.add('hidden'); // Close dropdown
        
        // Simulate a click on the main sidebar button to reuse all the loader logic
        document.getElementById('btn-create-kratabook').click();
    });

    // --- Top Menu: Clear Chat ---
    document.getElementById('btn-top-clear').addEventListener('click', () => {
        document.getElementById('menu-top-options').classList.add('hidden'); // Close menu
        
        if(confirm("Are you sure you want to clear the chat history?")) {
            messagesContainer.innerHTML = "";
            
            // Show a brief reset message
            const toast = document.createElement('div');
            toast.className = 'p-3 text-center text-gray-400 text-xs italic';
            toast.innerText = "Chat history cleared.";
            messagesContainer.appendChild(toast);
            
            // Optional: show intro screen again if no table is active
            if (!state.activeTable) {
                introScreen.style.display = 'block';
            }
        }
    });

    document.getElementById('btn-top-headsup').addEventListener('click', () => {
        openHeadsUpModal(state.allTables);
    });

    window.addEventListener('open-agentic-bg', () => {
        openAgenticBgModal();
        // Auto-close settings dropdown if it's open
        document.getElementById('settings-dropdown').classList.add('hidden');
    });

    // --- Profile Logout Listener ---
    const btnProfileLogout = document.getElementById('btn-profile-logout');
    if (btnProfileLogout) {
        btnProfileLogout.addEventListener('click', () => {
            if(confirm("Are you sure you want to sign out?")) {
                logout();
            }
        });
    }
}


/**
 * 3. CHAT LOGIC (2-Stage Agentic AI)
 */
async function handleSendMessage() {
    const text = userPrompt.value.trim();
    if (!text || !state.isDatabaseReady || !state.activeTable) return;

    // --- 🚀 NEW: HIDE PROACTIVE INSIGHTS ON FIRST PROMPT ---
    const proactiveContainer = document.getElementById('proactive-insights-container');
    if (proactiveContainer) proactiveContainer.classList.add('hidden');

    // 1. Add User Message
    addUserMessage(text);
    
    // 2. Lock UI & Show Shimmer
    const inputPill = document.getElementById('input-pill');
    userPrompt.value = "";
    userPrompt.style.height = 'auto';
    btnSend.classList.add('hidden');
    
    // Add thinking state
    userPrompt.disabled = true;
    userPrompt.placeholder = "Krata is thinking...";
    inputPill.classList.add('input-pill-thinking');

    // 3. Create Bot Message Shell
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-message';
    msgDiv.innerHTML = `
        <div class="bot-avatar">
            <i data-lucide="sparkles" style="width: 16px; height: 16px;"></i>
        </div>
        <div class="bubble">
            <details class="sql-debug hidden">
                <summary>Show thinking</summary>
                <div class="thinking-content">
                    <div class="status-msg italic text-sm text-gray-500 mb-2">Analyzing requirements...</div>
                    <code class="sql-code"></code>
                </div>
            </details>
            <div class="response-text"></div>
        </div>
    `;
    messagesContainer.appendChild(msgDiv);
    lucide.createIcons();
    scrollToBottom();

    const statusEl = msgDiv.querySelector('.status-msg');
    const textEl = msgDiv.querySelector('.response-text');
    const sqlContainer = msgDiv.querySelector('.sql-debug');
    const sqlCodeEl = msgDiv.querySelector('.sql-code');

    let fullResponse = "";
    try {
        const stream = askAgentStream(text, state.activeTable);
        
        for await (const chunk of stream) {
            if (chunk.type === 'status') {
                statusEl.innerText = chunk.content;
            } else if (chunk.type === 'sql') {
                sqlContainer.classList.remove('hidden');
                sqlCodeEl.innerText = chunk.content;
            } else if (chunk.type === 'text') {
                statusEl.style.display = 'none'; 
                fullResponse += chunk.content;
                // During streaming, render markdown to HTML
                textEl.innerHTML = marked.parse(fullResponse); 
                scrollToBottom();
            } else if (chunk.type === 'error') {
                textEl.innerHTML = `<div class="error-box text-red-500 p-3 bg-red-50 rounded-lg border border-red-100">
                    <strong>Engine Error:</strong> ${chunk.content}
                </div>`;
            }
        }

        // ==========================================
        // 🚀 FINAL HYDRATION (AFTER STREAM ENDS)
        // ==========================================
        
        // 1. Plotly Charts (Handles [CHART_START] JSON blocks)
        textEl.innerHTML = processInlineCharts(textEl.innerHTML, textEl);
        
        // 2. Mermaid Charts (Transforms markdown mermaid blocks to SVGs)
        // Note: This must be awaited as mermaid rendering is async
        await processMermaidCharts(textEl); 
        
        // 3. Final icon rendering and scroll
        lucide.createIcons();
        scrollToBottom();

    } catch (err) {
        console.error("Agent Error:", err);
        textEl.innerHTML = `<span class="text-red-500">I lost connection to the brain. Check your API configuration.</span>`;
    } finally {
        // 4. Unlock UI & Remove Shimmer
        inputPill.classList.remove('input-pill-thinking');
        userPrompt.disabled = false;
        userPrompt.placeholder = `Ask about ${state.activeTable}...`;
        
        // Auto-focus back on the input
        setTimeout(() => userPrompt.focus(), 50);
    }
}

/**
 * 4. UI RENDER HELPERS
 */
function renderChartInChat(config) {
    const chartId = 'chart-' + Date.now();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-message';
    msgDiv.innerHTML = `
        <div class="bot-avatar">⚡</div>
        <div class="bubble">
            <p>Analysis Result: <strong>${config.title}</strong></p>
            <div id="${chartId}" class="chart-container"></div>
        </div>
    `;
    messagesContainer.appendChild(msgDiv);
    
    // Deep clone config to avoid reference issues
    const trace = {
        x: config.labels,
        y: config.values,
        type: config.type === 'pie' ? 'pie' : (config.type === 'scatter' ? 'scatter' : config.type),
        mode: config.type === 'scatter' ? 'markers' : undefined,
        labels: config.type === 'pie' ? config.labels : undefined,
        values: config.type === 'pie' ? config.values : undefined,
        marker: { color: '#0b57d0' }
    };

    const layout = {
        height: 280,
        margin: { t: 20, b: 40, l: 50, r: 20 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Segoe UI', size: 10 }
    };

    Plotly.newPlot(chartId, [trace], layout, { responsive: true, displayModeBar: false });
    scrollToBottom();
}

function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.innerHTML = `<div class="bubble">${text}</div>`;
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function addSystemMessage(text, isError = false) {
    const div = document.createElement('div');
    div.className = `message bot-message ${isError ? 'error' : ''}`;
    const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    div.innerHTML = `
        <div class="bot-avatar">⚡</div>
        <div class="bubble">${formattedText}</div>
    `;
    messagesContainer.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    const scrollArea = document.getElementById('chat-history-container');
    if (scrollArea) {
        scrollArea.scrollTo({
            top: scrollArea.scrollHeight,
            behavior: 'smooth'
        });
    }
}

/**
 * Triggers the Narrative Executive Story
 */
async function handleNarrator() {
    if (!state.activeTable) return alert("Please upload a dataset first.");

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-message narrator-container'; // Special class
    msgDiv.innerHTML = `
        <div class="bot-avatar">🏛️</div>
        <div class="bubble premium-report">
            <div class="report-header">
                <i data-lucide="award" class="text-blue-600"></i>
                <span>EXECUTIVE STRATEGY BRIEF</span>
            </div>
            <div class="status-msg italic text-xs text-gray-400 mt-2">Initializing 2-Stage Analysis...</div>
            <div class="response-text prose prose-sm max-w-none text-gray-800"></div>
        </div>
    `;
    messagesContainer.appendChild(msgDiv);
    lucide.createIcons();
    scrollToBottom();

    const statusEl = msgDiv.querySelector('.status-msg');
    const textEl = msgDiv.querySelector('.response-text');

    let fullStory = "";
    try {
        // Switch to the NEW advanced stream
        for await (const chunk of streamAdvancedNarrative(state.activeTable)) {
            if (chunk.type === 'status') {
                statusEl.innerText = chunk.content;
            } else if (chunk.type === 'text') {
                statusEl.style.display = 'none';
                fullStory += chunk.content;
                
                // Enhanced formatting for professional look
                textEl.innerHTML = fullStory
                    .replace(/\n\n/g, '<div class="mb-4"></div>')
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-blue-900">$1</strong>')
                    .replace(/### (.*?)(<br>|<div>)/g, '<h3 class="text-lg font-bold text-blue-800 mt-4 mb-2 border-b">$1</h3>');
                
                scrollToBottom();
            }
        }
    } catch (err) {
        textEl.innerHTML = `<span class="text-red-500">The narrative engine encountered an error.</span>`;
    }
}

// A robust helper to open any modal
window.openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        // Add listener to close when clicking the dark background
        modal.onclick = (e) => {
            if (e.target === modal) closeAllModals();
        };
    }
};

// A robust helper to close all modals
window.closeAllModals = () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
};



// KRATABOOKS

async function refreshKrataBookSidebar() {
    const list = document.getElementById('kratabook-list');
    const books = await fetchKrataBooks();
    
    // 🚀 Added title="${book.title}" for native hover tooltips
    list.innerHTML = books.map(book => `
        <div class="kratabook-item" onclick="viewKrataBook('${book.id}')">
            <i data-lucide="file-text" style="width:14px"></i>
            <span class="truncate" title="${book.title}">${book.title}</span>
        </div>
    `).join('');
    lucide.createIcons();
}

// KRATABOOK LOADING MODAL

document.getElementById('btn-create-kratabook').addEventListener('click', async () => {
    if (!state.activeTable) return alert("Select a table first");

    // 1. Show the Premium Lock Modal
    const loaderModal = document.getElementById('kb-loader-modal');
    const statusText = document.getElementById('kb-loader-status');
    const btn = document.getElementById('btn-create-kratabook');
    
    loaderModal.classList.add('active');
    statusText.innerText = "Performing Stage 1: Technical Audit...";

    // Also update the sidebar button text as a backup visual
    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span class="nav-text">Writing...</span>`;
    lucide.createIcons();
    
    try {
        // 2. Simulated status update mid-way
        setTimeout(() => { 
            if(loaderModal.classList.contains('active')) 
                statusText.innerText = "Performing Stage 2: Strategic Synthesis..."; 
        }, 3000);

        // 3. Trigger the Generator (This calls Mistral and Saves to Supabase ONCE)
        await createKrataBook(state.activeTable);
        
        // 4. Update the UI and Sidebar
        statusText.innerText = "Saving to Local Vault...";
        await refreshKrataBookSidebar();
        
        addSystemMessage("✨ **KrataBook Created.** Your in-depth report has been saved to the vault.");

    } catch (e) {
        console.error("KrataBook Error:", e);
        alert("Failed to generate KrataBook: " + e.message);
    } finally {
        // 5. Cleanup: Close modal and restore button
        loaderModal.classList.remove('active');
        btn.innerHTML = originalBtnHtml;
        lucide.createIcons();
    }
});



// Sidebar Button Logic

// View Logic
window.viewKrataBook = async (id) => {
    const books = await fetchKrataBooks();
    const book = books.find(b => b.id === id);
    
    if (!book) return;

    // 1. Update Title
    document.getElementById('kratabook-title-display').innerText = book.title;
    
    // 2. Render Markdown Content
    const contentArea = document.getElementById('kratabook-content-area');
    contentArea.innerHTML = marked.parse(book.content);
    
    // 3. Optional: Process any Mermaid charts if they exist in the report
    if (window.processMermaidCharts) {
        await processMermaidCharts(contentArea);
    }

    // 4. Show the View
    document.getElementById('kratabook-view').classList.remove('view-hidden');
    
    // Scroll to top of report
    contentArea.scrollTop = 0;
    
    lucide.createIcons();
};

document.getElementById('close-kratabook').addEventListener('click', () => {
    document.getElementById('kratabook-view').classList.add('view-hidden');
});



// Start Application
init();