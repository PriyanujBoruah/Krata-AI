// js/modules/library.js
import { supabaseClient } from '../core/auth.js';

export async function saveToLibrary(type, title, payload) {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { error } = await supabaseClient.from('library_items').insert([{
        user_id: user.id,
        type,
        title,
        payload
    }]);

    if (error) throw error;
}

/**
 * THEME HELPER: Matches the Workspace color scheme
 */
function getLibraryTheme(type) {
    if (type === 'chart') return { 
        bg: 'bg-blue-50', 
        border: 'border-blue-100', 
        text: 'text-blue-700', 
        icon: 'bar-chart-3' 
    };
    if (type === 'kratabook') return { 
        bg: 'bg-purple-50', 
        border: 'border-purple-100', 
        text: 'text-purple-700', 
        icon: 'file-text' 
    };
    if (type === 'chat') return { 
        bg: 'bg-green-50', 
        border: 'border-green-100', 
        text: 'text-green-700', 
        icon: 'message-square' 
    };
    return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', icon: 'file' };
}

/**
 * VIEW LOGIC: Render personal items as styled cards
 */
export async function loadLibraryItems(filterType = 'all') {
    const grid = document.getElementById('library-content-grid');
    grid.innerHTML = '<div class="text-xs text-gray-400 col-span-full">Opening your private vault...</div>';

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    let query = supabaseClient.from('library_items').select('*');
    if (filterType !== 'all') query = query.eq('type', filterType);
    
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error || !data) {
        grid.innerHTML = '<div class="text-xs text-red-500 col-span-full">Failed to load library.</div>';
        return;
    }

    if (data.length === 0) {
        grid.innerHTML = '<div class="text-xs text-gray-400 col-span-full">Your library is empty.</div>';
        return;
    }

    grid.innerHTML = data.map(item => {
        const theme = getLibraryTheme(item.type);

        return `
            <div class="workspace-card ${theme.bg} ${theme.border}" id="lib-card-${item.id}">
                
                <!-- TOP HEADER: Icon + "Personal" Label + Delete -->
                <div class="card-header">
                    <div class="flex items-center gap-2">
                        <div class="p-1.5 rounded-lg bg-white ${theme.text} shadow-sm border border-white/50">
                            <i data-lucide="${theme.icon}" style="width:16px; height:16px;"></i>
                        </div>
                        <span class="text-[12px] font-bold ${theme.text}" style="font-size: small;">Personal</span>
                    </div>

                    <button class="delete-workspace-item text-gray-400 hover:text-red-600 hover:bg-red-50" 
                        onclick="event.stopPropagation(); removeItemFromLibrary('${item.id}')">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>

                <!-- BOTTOM CONTENT: Title + Date -->
                <div onclick="openLibraryItem('${item.id}')" class="mt-4" style="flex:1">
                    <strong class="text-sm text-gray-900 block line-clamp-2 leading-tight" style="font-size: medium;">${item.title}</strong>
                    <p class="text-[10px] text-gray-500 mt-2 flex items-center gap-1.5 opacity-80" style="font-size: small;">
                        <i data-lucide="clock" style="width: 10px; height: 10px;"></i> 
                        ${new Date(item.created_at).toLocaleDateString()}
                    </p>
                </div>
                
            </div>
        `;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

export function initLibraryUI() {
    const filters = document.querySelectorAll('#library-filters .filter-pill');
    filters.forEach(f => {
        f.onclick = () => {
            filters.forEach(btn => btn.classList.remove('active'));
            f.classList.add('active');
            loadLibraryItems(f.dataset.filter);
        };
    });

    document.getElementById('sidebar-library-btn').onclick = () => {
        window.openModal('library-modal');
        loadLibraryItems();
    };
}

window.removeItemFromLibrary = async (id) => {
    if (!confirm("Remove from your private library?")) return;
    await supabaseClient.from('library_items').delete().eq('id', id);
    loadLibraryItems(document.querySelector('#library-filters .filter-pill.active').dataset.filter);
};

/**
 * OPEN PRIVATE ITEM
 * Logic to re-inject personal insights into the UI
 */
window.openLibraryItem = async (itemId) => {
    try {
        const { data, error } = await supabaseClient
            .from('library_items')
            .select('*')
            .eq('id', itemId)
            .single();

        if (error || !data) throw error;

        // Close Library Modal
        document.getElementById('library-modal').classList.remove('active');

        // ROUTE 1: KRATABOOKS
        if (data.type === 'kratabook') {
            const contentArea = document.getElementById('kratabook-content-area');
            contentArea.innerHTML = `<div class="text-xs text-gray-400 mb-4 border-b pb-2">Personal Library Item • Saved ${new Date(data.created_at).toLocaleDateString()}</div>` + marked.parse(data.payload.content);
            document.getElementById('kratabook-title-display').innerText = data.title;
            
            // Clean up header actions for library items
            const headerActions = document.getElementById('kb-header-actions');
            if (headerActions) headerActions.innerHTML = '';

            document.getElementById('kratabook-view').classList.remove('view-hidden');
            if (window.lucide) lucide.createIcons();
        } 
        
        // ROUTE 2: CHATS & CHARTS
        else if (data.type === 'chat' || data.type === 'chart') {
            const rawMarkdown = data.payload.content 
                ? data.payload.content 
                : `\n\`\`\`mermaid\n${data.payload.code}\n\`\`\`\n`; // Ensure newlines exist

            const parsedHtml = marked.parse(rawMarkdown);

            const msgDiv = document.createElement('div');
            msgDiv.className = 'message bot-message';
            msgDiv.innerHTML = `
                <div class="bot-avatar"><img src="assets/logo.png" alt="Krata AI"></div>
                <div class="bubble w-full">
                    <div class="flex items-center gap-2 mb-4 p-2.5 ${data.type === 'chart' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-600 border-gray-100'} border rounded-lg text-xs font-bold w-fit">
                        <i data-lucide="${data.type === 'chart' ? 'bar-chart-3' : 'bookmark'}" class="w-4 h-4"></i>
                        ${data.type === 'chart' ? 'Shared Chart' : 'Library Item'}: ${data.title}
                    </div>
                    <div class="response-text">${parsedHtml}</div>
                </div>
            `;

            document.getElementById('messages').appendChild(msgDiv);

            // 🚀 THE FIX: Use requestAnimationFrame to ensure the DOM is ready
            requestAnimationFrame(() => {
                if (window.processMermaidCharts) {
                    window.processMermaidCharts(msgDiv).then(() => {
                        const scrollArea = document.getElementById('chat-history-container');
                        if (scrollArea) scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
                    });
                }
            });

            if (window.lucide) lucide.createIcons();
        }
    } catch (err) {
        console.error("Failed to open library item:", err);
    }
};
