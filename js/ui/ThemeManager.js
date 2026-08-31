export class ThemeManager {
    constructor() {
        this.container = document.getElementById('theme-grid');
        this.themes = [];
        this.init();
    }

    async init() {
        if (!this.container) return;

        await this.loadThemesFromJSON();
        this.renderButtons();

        const savedTheme = localStorage.getItem('hc-ui-theme') || 'amber';
        this.setTheme(savedTheme);
    }

    async loadThemesFromJSON() {
        try {
            const response = await fetch('resources/themes.json');
            this.themes = await response.json();
        } catch (err) {
            console.error('ThemeManager: Failed to load themes.json', err);
        }
    }

    renderButtons() {
        this.container.innerHTML = '';
        this.themes.forEach((theme) => {
            const btn = document.createElement('button');
            btn.className = 'theme-btn';
            btn.title = `${theme.name} Theme`;
            btn.dataset.themeId = theme.id;

            btn.innerHTML = `<span class="swatch" style="background: ${theme.swatch};"></span> ${theme.name}`;
            btn.addEventListener('click', () => this.setTheme(theme.id));

            this.container.appendChild(btn);
        });
    }

    setTheme(themeId) {
        const theme = this.themes.find(t => t.id === themeId) || this.themes[0];

        // Apply all variables directly to the document root
        const root = document.documentElement;
        for (const [key, value] of Object.entries(theme.variables)) {
            root.style.setProperty(key, value);
        }

        // Sync button active states
        const buttons = this.container.querySelectorAll('.theme-btn');
        buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.themeId === themeId);
        });

        localStorage.setItem('hc-ui-theme', themeId);
    }
}