const PANELS = [
    { id: 'panel-left', storageKey: 'ocularisCollapsed', defaultCollapsed: true },
    { id: 'panel-right', storageKey: 'sensoriumCollapsed', defaultCollapsed: true },
    { id: 'bottom-deck', storageKey: 'chronometerCollapsed', defaultCollapsed: true },
];

export class PanelExtensionController {
    constructor({ storage = null } = {}) {
        this.storage = storage;
        this.init();
    }

    init() {
        PANELS.forEach(({ id, storageKey, defaultCollapsed }) => {
            const panel = document.getElementById(id);
            if (!panel) return;

            let collapsed = defaultCollapsed;
            if (this.storage) {
                try {
                    collapsed = Boolean(this.storage.get(storageKey, defaultCollapsed));
                } catch {
                    collapsed = defaultCollapsed;
                }
            }

            this._applyState(panel, collapsed);

            panel.addEventListener('click', (e) => {
                const isCollapsed = panel.classList.contains('magi-collapsed');
                const isDirectClick = e.target === panel || e.target.id === 'chronometer-shape' || e.target.id === 'bottom-deck';
                
                if (isCollapsed || isDirectClick) {
                    const newState = !isCollapsed;
                    
                    // Mobile-exclusive logic: auto-close other panels when opening one
                    if (window.innerWidth <= 768 && !newState) {
                        PANELS.forEach(p => {
                            if (p.id !== panel.id) {
                                const otherPanel = document.getElementById(p.id);
                                if (otherPanel && !otherPanel.classList.contains('magi-collapsed')) {
                                    this._applyState(otherPanel, true);
                                    if (this.storage) this.storage.set(p.storageKey, true);
                                }
                            }
                        });
                    }

                    this._applyState(panel, newState);
                    if (this.storage) this.storage.set(storageKey, newState);
                }
            });
        });
    }

    _applyState(panel, collapsed) {
        panel.classList.toggle('magi-collapsed', collapsed);
        panel.setAttribute('aria-expanded', String(!collapsed));
        document.body.classList.toggle(`${panel.id}-open`, !collapsed);
    }
}