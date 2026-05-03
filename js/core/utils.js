// js/core/utils.js

/**
 * Enhanced fetch with automatic retry for Rate Limits (429) 
 * and Server Errors (5xx).
 */
export async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
    try {
        const response = await fetch(url, options);

        // If Rate Limited (429) or Server Error (500, 502, 503, 504)
        if (response.status === 429) {
            if (retries > 0) {
                // Dispatch a custom event that main.js can listen to
                window.dispatchEvent(new CustomEvent('agent-status-update', { 
                    detail: "Rate limit reached. Cooling down for a moment..." 
                }));
                
                await new Promise(resolve => setTimeout(resolve, backoff));
                return fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
        }
        return response;
    } catch (error) {
        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
}