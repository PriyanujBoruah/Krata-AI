// js/ui/chat.js

/**
 * Looks at the table schema and generates context-aware 
 * question chips for the user.
 */
export async function showSmartChips(tableName, runQuery) {
    const container = document.getElementById('suggested-chips');
    if (!container) return;

    try {
        // 1. Get column info from DuckDB
        const schema = await runQuery(`PRAGMA table_info('${tableName}')`);
        
        // 2. Identify numeric and text columns for better suggestions
        const numCols = schema.filter(c => ['DOUBLE', 'INTEGER', 'BIGINT', 'FLOAT'].includes(c.type));
        const textCols = schema.filter(c => c.type === 'VARCHAR' || c.type === 'TEXT');

        // 3. Build a list of 4 diverse suggestions
        const suggestions = [
            `Summarize this data`,
            `Show top 5 rows`
        ];

        // Add a numeric suggestion if a numeric column exists
        if (numCols.length > 0) {
            suggestions.push(`What is the average ${numCols[0].name}?`);
        }

        // Add a categorical suggestion if a text column exists
        if (textCols.length > 0) {
            suggestions.push(`Breakdown by ${textCols[0].name}`);
        }

        // 4. Clear and Render
        container.innerHTML = "";
        suggestions.forEach(text => {
            const btn = document.createElement('button');
            btn.className = "chip";
            btn.innerText = text;
            
            // Interaction: Clicking a chip fills the input and sends it
            btn.onclick = () => {
                const input = document.getElementById('user-prompt');
                input.value = text;
                // Dispatch a standard enter key event or call handleSendMessage directly
                input.dispatchEvent(new Event('input')); // Trigger resize/send button
                document.getElementById('btn-send').click();
            };
            
            container.appendChild(btn);
        });

    } catch (err) {
        console.warn("Failed to generate smart chips:", err);
    }
}