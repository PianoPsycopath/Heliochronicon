// js/ui/ThemeManager.js
export class ThemeManager {
    constructor() {
        this.btnThemeAmber = document.getElementById('btn-theme-amber');
        this.btnThemeMagi = document.getElementById('btn-theme-magi');
        this.init();
    }

    init() {
        if (!this.btnThemeAmber || !this.btnThemeMagi) return;

        this.btnThemeAmber.addEventListener('click', () => this.setTheme('amber'));
        this.btnThemeMagi.addEventListener('click', () => this.setTheme('magi'));

        const savedTheme = localStorage.getItem('hc-ui-theme') || 'amber';
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        const isMagi = theme === 'magi';
        document.body.classList.toggle('theme-magi', isMagi);
        
        this.btnThemeMagi.classList.toggle('active', isMagi);
        this.btnThemeAmber.classList.toggle('active', !isMagi);
        
        localStorage.setItem('hc-ui-theme', theme);
    }
}