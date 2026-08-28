// js/ui/AccessibilityManager.js
// CONTROL KINDS
// -------------
//   'static'    plain button/control, no pressed/checked state (default)
//   'toggle'    on/off button -> aria-pressed + activeClass
//   'checkbox'  role="checkbox" control -> aria-checked + activeClass
//   'cycle'     multi-state button (e.g. curtain-mode toggle) -> see `states`

const DEFAULT_ACTIVE_CLASS = 'active';

function isNativeActivatable(el) {
    return el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'A';
}

export class AccessibilityManager {
    constructor({ tooltipManager = null } = {}) {
        this.tooltipManager = tooltipManager;
        this._registry = new Map(); // element -> descriptor
    }

    // ------------------------------------------------------------------
    // Registration
    // ------------------------------------------------------------------

    /**
     * Register a control's accessibility metadata + behavior in one call.
     *
     * @param {Object} config
     * @param {HTMLElement} config.element
     * @param {'static'|'toggle'|'checkbox'|'cycle'} [config.kind='static']
     * @param {string} [config.role]          ARIA role override (inferred from kind otherwise)
     * @param {string} [config.label]         -> aria-label
     * @param {string|HTMLElement} [config.describedBy] -> aria-describedby
     * @param {string} [config.tooltip]       shown via TooltipManager (or native title fallback)
     * @param {boolean} [config.tooltipLive]  don't hide tooltip on press (toggle/state buttons)
     * @param {string} [config.activeClass]   CSS class toggled with pressed/checked (default 'active')
     * @param {boolean} [config.pressed]      initial state for kind:'toggle'
     * @param {boolean} [config.checked]      initial state for kind:'checkbox'
     * @param {boolean} [config.expanded]     sets aria-expanded if provided
     * @param {boolean} [config.disabled]
     * @param {Array}   [config.states]       for kind:'cycle': [{ className, label, tooltip, pressed }, ...]
     * @param {Function} [config.onActivate]  (element, event) => void — wired to click,
     *                                        and to Enter/Space for non-native elements
     * @returns {Object} handle with setPressed/setChecked/setExpanded/setDisabled/
     *                   setLabel/setTooltip/setState/nextState/destroy
     */
    register(config) {
        const {
            element,
            kind = 'static',
            role,
            label,
            describedBy,
            tooltip,
            tooltipLive = false,
            activeClass = DEFAULT_ACTIVE_CLASS,
            pressed = false,
            checked = false,
            expanded,
            disabled = false,
            states,
            onActivate,
        } = config;

        if (!element) {
            throw new Error('AccessibilityManager.register: element is required');
        }

        const descriptor = {
            element,
            kind,
            activeClass,
            onActivate,
            states,
            stateIndex: 0,
            tooltipLive,
        };
        this._registry.set(element, descriptor);

        const resolvedRole = role ?? (kind === 'checkbox' ? 'checkbox' : undefined);
        if (resolvedRole) element.setAttribute('role', resolvedRole);

        // Non-native interactive elements (divs used as checkboxes/buttons)
        // need an explicit tab stop; native buttons/inputs already have one.
        if (!isNativeActivatable(element) && (element.tabIndex ?? -1) < 0) {
            element.tabIndex = 0;
        }

        if (label) this.setLabel(element, label);
        if (describedBy) this.setDescribedBy(element, describedBy);
        if (tooltip) this.setTooltip(element, tooltip, { live: tooltipLive });
        if (disabled) this.setDisabled(element, true);
        if (expanded !== undefined) this.setExpanded(element, expanded);

        if (kind === 'toggle') this.setPressed(element, pressed);
        if (kind === 'checkbox') this.setChecked(element, checked);
        if (kind === 'cycle' && states?.length) this.setState(element, 0);

        this._wireActivation(descriptor);

        return this._handleFor(descriptor);
    }

    /** Shorthand for the common on/off button case. */
    registerButton(config) {
        return this.register({ kind: 'toggle', ...config });
    }

    /** Tear down listeners and forget the element. Safe to call more than once. */
    unregister(element) {
        const descriptor = this._registry.get(element);
        if (!descriptor) return;
        descriptor._cleanup?.();
        this._registry.delete(element);
    }

    // ------------------------------------------------------------------
    // Keyboard + click activation
    // ------------------------------------------------------------------

    _wireActivation(descriptor) {
        const { element } = descriptor;
        if (!descriptor.onActivate) return;

        const activate = (e) => {
            if (element.getAttribute('aria-disabled') === 'true') return;
            descriptor.onActivate(element, e);
        };

        element.addEventListener('click', activate);

        // Native <button>/<input type=button>/<a> get Enter/Space activation
        // for free from the browser. Custom elements (role="checkbox" divs,
        // etc.) need it wired explicitly — this is the logic that used to be
        // copy-pasted per module.
        let onKeydown = null;
        if (!isNativeActivatable(element)) {
            onKeydown = (e) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    activate(e);
                }
            };
            element.addEventListener('keydown', onKeydown);
        }

        descriptor._cleanup = () => {
            element.removeEventListener('click', activate);
            if (onKeydown) element.removeEventListener('keydown', onKeydown);
        };
    }

    // ------------------------------------------------------------------
    // State setters — usable on any element, registered or not, so callers
    // mid-migration can adopt them incrementally without a full register().
    // ------------------------------------------------------------------

    setPressed(element, isPressed) {
        element.setAttribute('aria-pressed', isPressed ? 'true' : 'false');
        element.classList.toggle(this._activeClassFor(element), !!isPressed);
    }

    setChecked(element, isChecked) {
        element.setAttribute('aria-checked', isChecked ? 'true' : 'false');
        element.classList.toggle(this._activeClassFor(element), !!isChecked);
    }

    setExpanded(element, isExpanded) {
        element.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    }

    setDisabled(element, isDisabled) {
        if (isNativeActivatable(element)) element.disabled = !!isDisabled;
        element.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');

        if (isDisabled) {
            if (element.dataset.a11yPrevTabIndex === undefined) {
                element.dataset.a11yPrevTabIndex = String(element.tabIndex);
            }
            element.tabIndex = -1;
        } else if (element.dataset.a11yPrevTabIndex !== undefined) {
            element.tabIndex = parseInt(element.dataset.a11yPrevTabIndex, 10) || 0;
            delete element.dataset.a11yPrevTabIndex;
        }
    }

    setLabel(element, text) {
        element.setAttribute('aria-label', text);
    }

    setDescribedBy(element, idOrElement) {
        const id = typeof idOrElement === 'string' ? idOrElement : idOrElement?.id;
        if (id) element.setAttribute('aria-describedby', id);
    }

    /**
     * Route tooltip text through TooltipManager (shared hc-tooltip look,
     * pointer wiring, hide-on-press behavior) with a native `title` fallback
     * when no TooltipManager is present — mirrors the previous
     * UIController._setTooltip helper, now available to every module.
     */
    setTooltip(element, text, { live = false } = {}) {
        if (live) element.dataset.tooltipLive = '';
        if (this.tooltipManager) {
            this.tooltipManager.setButtonTooltip(element, text);
            // Idempotent: no-ops for elements already wired.
            this.tooltipManager.attachButtonTooltips();
        } else {
            element.title = text;
        }
    }

    /**
     * Multi-state "cycle" buttons (e.g. the ecliptic/curtain-mode toggle):
     * one call updates the visual state class, aria-pressed, aria-label and
     * tooltip together instead of four separate call sites.
     */
    setState(element, index) {
        const descriptor = this._registry.get(element);
        if (!descriptor?.states) return;

        const states = descriptor.states;
        const clamped = Math.max(0, Math.min(states.length - 1, index));
        const state = states[clamped];
        descriptor.stateIndex = clamped;

        states.forEach((s) => s.className && element.classList.remove(s.className));
        if (state.className) element.classList.add(state.className);

        const isPressed = state.pressed !== undefined ? state.pressed : clamped !== 0;
        element.classList.toggle(descriptor.activeClass, isPressed);
        element.setAttribute('aria-pressed', isPressed ? 'true' : 'false');

        if (state.label) this.setLabel(element, state.label);
        if (state.tooltip)
            this.setTooltip(element, state.tooltip, { live: descriptor.tooltipLive });
    }

    /** Advance a kind:'cycle' control to its next state; returns the new index. */
    nextState(element) {
        const descriptor = this._registry.get(element);
        if (!descriptor?.states) return undefined;
        this.setState(element, (descriptor.stateIndex + 1) % descriptor.states.length);
        return descriptor.stateIndex;
    }

    _activeClassFor(element) {
        return this._registry.get(element)?.activeClass ?? DEFAULT_ACTIVE_CLASS;
    }

    // ------------------------------------------------------------------
    // Handle returned from register()
    // ------------------------------------------------------------------

    _handleFor(descriptor) {
        const { element } = descriptor;
        return {
            element,
            setPressed: (v) => this.setPressed(element, v),
            setChecked: (v) => this.setChecked(element, v),
            setExpanded: (v) => this.setExpanded(element, v),
            setDisabled: (v) => this.setDisabled(element, v),
            setLabel: (v) => this.setLabel(element, v),
            setDescribedBy: (v) => this.setDescribedBy(element, v),
            setTooltip: (v, opts) => this.setTooltip(element, v, opts),
            setState: (i) => this.setState(element, i),
            nextState: () => this.nextState(element),
            destroy: () => this.unregister(element),
        };
    }
}
