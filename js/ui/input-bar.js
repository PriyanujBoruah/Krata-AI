// js/ui/input-bar.js

export function initMenus() {
    const menus = {
        'btn-database': 'menu-database',
        'btn-tools': 'menu-tools',
        'btn-settings-sidebar': 'settings-dropdown',
        'btn-data-selector': 'data-dropdown',
        'btn-top-options': 'menu-top-options',
        'user-avatar-circle': 'menu-user-profile'
    };

    // Global Click-away
    document.addEventListener('click', (e) => {
        Object.keys(menus).forEach(btnId => {
            const menuId = menus[btnId];
            const menu = document.getElementById(menuId);
            const btn = document.getElementById(btnId);
            
            if (menu && !menu.contains(e.target) && e.target !== btn) {
                menu.classList.add('hidden');
            }
        });
    });

    // Toggle Menus
    Object.keys(menus).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = document.getElementById(menus[btnId]);
                
                // Close others
                Object.values(menus).forEach(mId => { 
                    if (mId !== menus[btnId]) document.getElementById(mId).classList.add('hidden'); 
                });
                
                menu.classList.toggle('hidden');
            });
        }
    });

    // Dispatch Events for Tool selections
    const toolMap = {
        'menu-viz': 'open-viz',
        'menu-sql': 'open-sql',
        'menu-pivot': 'open-pivot',
        'menu-narrator': 'trigger-narrator',
        'menu-quality': 'open-quality',
        'menu-privacy': 'open-privacy'
        // REMOVED: btn-linkage-standard
    };

    Object.keys(toolMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent(toolMap[id]));
                // Close menu after selection
                document.getElementById('menu-tools').classList.add('hidden');
            });
        }
    });
}