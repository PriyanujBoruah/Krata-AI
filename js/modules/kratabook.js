// js/modules/kratabook.js
import { supabaseClient } from '../core/auth.js';
import { getDeepTableProfile } from '../core/database.js';
import { PERSONA_CONFIGS } from './personas.js';
import { getAgenticContextString } from './agentic-bg.js';

const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;  
const API_URL = "https://api.mistral.ai/v1/chat/completions";

/**
 * GENERATE AND SAVE REPORT
 */
export async function createKrataBook(activeTable, config) {
    if (!config) throw new Error("Report configuration is missing.");

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("User session expired.");

    const orgId = user.user_metadata?.org_id;

    // 1. Get the Primary Table Profile
    const profile = await getDeepTableProfile(activeTable);
    
    // 2. 🚀 NEW: Get the Profiles of all selected Context Tables
    let extraContextPrompt = "";
    if (config.contextTables && config.contextTables.length > 0) {
        extraContextPrompt = "\n\n--- RELATIONAL CONTEXT (EXTRA MAPPING TABLES) ---\n";
        
        for (const t of config.contextTables) {
            const contextProfile = await getDeepTableProfile(t);
            extraContextPrompt += `
            Table Name: "${t}"
            Column Map:
            ${contextProfile.columns.join('\n')}
            \n`;
        }
        extraContextPrompt += "------------------------------------------------\n\n";
    }

    // 3. Resolve Persona and Context
    const persona = PERSONA_CONFIGS[config.personaId] || PERSONA_CONFIGS['data_analyst'];
    const companyContext = getAgenticContextString();

    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "mistral-large-latest", // 🚀 Mistral Large is crucial for handling multiple schemas
            messages: [{
                role: "system",
                content: `You are a Senior ${persona.name}. Write a ${config.type} report.
                
                PRIMARY SUBJECT TABLE: "${activeTable}"
                PRIMARY SCHEMA:
                ${profile.columns.join('\n')}
                ${extraContextPrompt} -- 🚀 Injected Relational Context

                --- BUSINESS CONTEXT ---
                ${config.branding === 'agentic' ? companyContext : 'Standard analytical context.'}
                
                CORE INSTRUCTIONS:
                - Focus strictly on ${config.type} objectives.
                - Use the EXTRA MAPPING TABLES to decode any cryptic column codes (like CSEX or CTRA1) found in the PRIMARY SCHEMA.
                - Use professional Markdown with H1, H2, and bold highlights.
                - Strictly avoid generating "Next Steps" or motivational roadmaps.`
            }],
            temperature: 0.3
        })
    });

    const data = await response.json();
    const reportContent = data.choices[0].message.content;

    // 4. Save to Supabase with Org ID
    const { error } = await supabaseClient.from('kratabooks').insert([{ 
        user_id: user.id, 
        org_id: orgId, 
        title: `${config.type}: ${activeTable}`, 
        content: reportContent,
        metadata: config 
    }]);

    if (error) throw error;
    return true;
}

/**
 * FETCH REPORTS FOR THE ORG
 * Fixed the ReferenceError by fetching user session first.
 */
export async function fetchKrataBooks() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return [];

        // 🚀 THE FIX: Filter by user_id, NOT org_id
        // This ensures the sidebar list is private to the individual.
        const { data, error } = await supabaseClient
            .from('kratabooks')
            .select('*')
            .eq('user_id', user.id) 
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];

    } catch (err) {
        console.error("Error fetching KrataBooks:", err);
        return [];
    }
}
