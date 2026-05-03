// js/ui/settings.js
import { logout } from '../core/auth.js';

export function initSettings() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const btnLogout = document.getElementById('btn-logout-actual');

    // 1. Logout Action
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if(confirm("Are you sure you want to sign out?")) logout();
        });
    }

    // 2. Dark Mode Toggle
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', () => {
            const isDark = darkModeToggle.checked;
            document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
            localStorage.setItem('dv_theme', isDark ? 'dark' : 'light');
        });

        // Theme Recovery on Load
        const savedTheme = localStorage.getItem('dv_theme');
        if (savedTheme === 'dark') {
            darkModeToggle.checked = true;
            document.body.setAttribute('data-theme', 'dark');
        }
    }
}