// js/modules/personas.js

export const PERSONA_CONFIGS = {
    data_analyst: {
        name: "Data Analyst",
        instructions: "You are a precise Data Analyst. Focus on statistical accuracy, data integrity, and spotting technical anomalies. Your tone is academic and thorough."
    },
    business_analyst: {
        name: "Business Analyst",
        instructions: "You are a Business Analyst. Translate data into ROI, market trends, and growth opportunities. Use business terminology like 'Bottom line' and 'Market share'."
    },
    ecommerce: {
        name: "E-commerce Agent",
        instructions: "You are an E-commerce Expert. Focus on Sales Velocity, ROAS, Inventory turnover, and Customer Lifetime Value (CLV). Suggest optimizations for Shopify/Amazon stores."
    },
    marketing: {
        name: "Marketing Agency Agent",
        instructions: "You are a Performance Marketing Expert. Analyze Lead Conversion Rates, CAC, and Campaign Attribution. Focus on making leads actionable for sales teams."
    },
    ledger: {
        name: "Ledger Agent",
        instructions: "You are a Forensic Accountant. Focus on transaction balancing, identifying duplicate entries, and verifying ledger integrity. Be highly skeptical of outliers."
    },
    real_estate: {
        name: "Real Estate Agent",
        instructions: "You are a Real Estate Analytics Expert. Focus on price per sqft, location desirability index, and market demand cycles."
    }
};

let activePersona = 'data_analyst';

export function getActivePersona() {
    return PERSONA_CONFIGS[activePersona];
}

/**
 * Initializes the Persona selection UI.
 * Uses a dataset guard to ensure event listeners are only attached once,
 * preventing the "double message" bug when switching identities.
 */
export function initPersonaUI() {
    const cards = document.querySelectorAll('.persona-card');
    
    cards.forEach(card => {
        // 🚀 THE GUARD: If this card already has a listener, skip it.
        if (card.dataset.personaInitialized === "true") return;

        card.addEventListener('click', () => {
            // 1. Visual Toggle: Update active state in the grid
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            // 2. State Update: Set the global active persona key
            // (Assuming 'activePersona' is defined in the outer scope of this module)
            const selectedRole = card.dataset.role;
            
            // Note: If you use the 'activePersona' variable in ai-agent.js, 
            // ensure you are actually updating it here.
            // Example: activePersona = selectedRole; 

            // 3. Notify System: Dispatch event to main.js for the UI message
            const personaName = card.querySelector('strong').innerText;
            window.dispatchEvent(new CustomEvent('persona-changed', { 
                detail: personaName 
            }));

            // 4. UX Polish: Auto-close the Persona Manager modal after selection
            if (window.closeAllModals) {
                window.closeAllModals();
            }
        });

        // 🚀 MARK AS INITIALIZED: Tag the card so we don't add another listener later
        card.dataset.personaInitialized = "true";
    });
}