export class ThemeManager {
    constructor() {
        this.container = document.getElementById('theme-grid');
        this.themes = [];
        this.init();
    }

    async init() {
        if (!this.container) return;

        await this.parseThemesFromCSS();
        this.renderButtons();

        const savedTheme = localStorage.getItem('hc-ui-theme') || 'amber';
        this.setTheme(savedTheme);
    }

    async parseThemesFromCSS() {
        try {
            const response = await fetch('css/themes.css');
            const cssText = await response.text();

            // Match the default :root block and any body.theme-* blocks
            const blockRegex = /(?::root|body\.theme-[a-z0-9-]+)\s*\{[^}]+\}/g;
            const blocks = cssText.match(blockRegex) || [];

            blocks.forEach((block) => {
                let id = 'amber'; // Default fallback for :root
                let name = 'AMBER';

                const classMatch = block.match(/body\.theme-([a-z0-9-]+)/);
                if (classMatch) {
                    id = classMatch[1];
                    name = id.toUpperCase();
                }

                // Extract a clean display name from a CSS comment (e.g., /* MAGI THEME */)
                const commentMatch = block.match(/\/\*\s*(.+?)\s*THEME\s*(?:\(.*\))?\s*\*\//i);
                if (commentMatch) {
                    name = commentMatch[1].trim();
                }

                // Extract the primary text color for the swatch preview
                let swatch = '#ffffff';
                const colorMatch = block.match(/--theme-text-primary:\s*([^;]+);/);
                if (colorMatch) {
                    swatch = colorMatch[1].trim();
                }

                this.themes.push({ id, name, swatch });
            });
        } catch (err) {
            console.error('ThemeManager: Failed to parse themes.css', err);
        }
    }

    renderButtons() {
        this.container.innerHTML = '';
        this.themes.forEach((theme) => {
            const btn = document.createElement('button');
            btn.className = 'theme-btn';
            btn.title = `${theme.name} Theme`;
            btn.dataset.themeId = theme.id;

            // Inject inline swatch and enforce character limits via CSS
            btn.innerHTML = `<span class="swatch" style="background: ${theme.swatch};"></span> ${theme.name}`;
            btn.addEventListener('click', () => this.setTheme(theme.id));

            this.container.appendChild(btn);
        });
    }

    setTheme(themeId) {
        // Strip all existing theme classes, then apply the selected one (unless it's the amber root default)
        this.themes.forEach((t) => {
            if (t.id !== 'amber') {
                document.body.classList.remove(`theme-${t.id}`);
            }
        });

        if (themeId !== 'amber') {
            document.body.classList.add(`theme-${themeId}`);
        }

        // Sync button active states
        const buttons = this.container.querySelectorAll('.theme-btn');
        buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.themeId === themeId);
        });

        localStorage.setItem('hc-ui-theme', themeId);
    }
}
