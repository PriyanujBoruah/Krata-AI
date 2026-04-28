// js/modules/kratabook.js
import { supabaseClient } from '../core/auth.js';
import { getDeepTableProfile } from '../core/database.js';

const MISTRAL_API_KEY = "glAETAxTj1qgV2HkruSYDIPJJOlJxU0R"; // Ensure this matches your ai-agent.js
const API_URL = "https://api.mistral.ai/v1/chat/completions";

export async function createKrataBook(activeTable) {
    if (!activeTable) return alert("Select a table first");

    // 1. Get the Deep Profile (The 2-Stage "DVantage" Logic)
    const profile = await getDeepTableProfile(activeTable);
    
    // 2. Request a strictly analytical report from Mistral
    const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
            model: "mistral-medium-latest",
            messages: [{
                role: "system",
                content: `You are the KrataBook Auditor. Write an IN-DEPTH DATA REPORT.
                Table: ${activeTable} | Rows: ${profile.totalRows}
                Stats: ${profile.columns.join('\n')}
                
                RULES:
                - Output ONLY an analytical deep-dive. 
                - NO future suggestions. NO tactical steps. NO "Next steps".
                - Focus on distributions, anomalies, and statistical validity.
                - Use professional Markdown with H1, H2, and Tables.`
            }],
            temperature: 0.2
        })
    });

    const data = await response.json();
    const reportContent = data.choices[0].message.content;

    // 3. Get the current logged-in user
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) throw new Error("User not authenticated");

    // 4. Save to Supabase
    const { error } = await supabaseClient.from('kratabooks').insert([
        { 
            user_id: user.id, // This MUST match the logged-in user ID
            title: `${activeTable}`, 
            content: reportContent 
        }
    ]);

    if (error) throw error;
    return true;
}

export async function fetchKrataBooks() {
    const { data, error } = await supabaseClient
        .from('kratabooks')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) return [];
    return data;
}