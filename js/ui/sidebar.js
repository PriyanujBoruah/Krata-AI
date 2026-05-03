// js/ui/sidebar.js

export function initSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    
    if (!sidebar || !toggleBtn) return;

    // Create an overlay if it doesn't exist
    let overlay = document.getElementById('sidebar-mobile-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-mobile-overlay';
        document.body.appendChild(overlay);
    }

    // Helper function to safely swap Lucide icons
    const setIcon = (iconName) => {
        const icon = toggleBtn.querySelector('i, svg');
        if (icon) {
            icon.setAttribute('data-lucide', iconName);
            if (window.lucide) lucide.createIcons();
        }
    };

    // On initial load (if mobile), set it to the hamburger menu
    if (window.innerWidth <= 768) setIcon('menu');

    toggleBtn.addEventListener('click', () => {
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            // MOBILE LOGIC
            sidebar.classList.toggle('active-mobile');
            overlay.classList.toggle('active');
            
            // Toggle icon between X and Menu
            if (sidebar.classList.contains('active-mobile')) {
                setIcon('x');
            } else {
                setIcon('menu');
            }
        } else {
            // DESKTOP LOGIC
            sidebar.classList.toggle('collapsed');
            
            if (sidebar.classList.contains('collapsed')) {
                setIcon('panel-left-open');
            } else {
                setIcon('panel-left-close');
            }
        }
    });

    // Close sidebar when clicking the dark background overlay
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('active-mobile');
        overlay.classList.remove('active');
        setIcon('menu');
    });

    // Close sidebar automatically when a menu item is clicked
    sidebar.querySelectorAll('.menu-item, .kratabook-item').forEach(item => {
        item.addEventListener('click', () => {
            
            // 🚀 THE FIX: Do not auto-close if the user is just opening the settings dropdown
            if (item.id === 'btn-settings-sidebar') return;

            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active-mobile');
                overlay.classList.remove('active');
                setIcon('menu'); // Ensure setIcon function is available here
            }
        });
    });
}