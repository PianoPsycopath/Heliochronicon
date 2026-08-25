// js/ui/CelestialLabelManager.js
export class CelestialLabelManager {
    constructor({ accessibilityManager = null } = {}) {
        this.accessibilityManager = accessibilityManager;
    }

    /**
     * Create a `.tactical-label` DOM node and attach it to the document.
     *
     * @param {Object} options
     * @param {string} options.text - Label text (body name / designation).
     * @param {string} [options.colorHex] - Initial text color.
     * @param {string} [options.extraClassName] - Extra class appended after 'tactical-label'.
     * @param {boolean} [options.visible=true] - Initial display state.
     * @returns {HTMLDivElement}
     */
    createLabel({ text, colorHex, extraClassName, visible = true } = {}) {
        const label = document.createElement('div');
        label.className = extraClassName ? `tactical-label ${extraClassName}` : 'tactical-label';
        label.innerText = text ?? '';
        if (colorHex) label.style.color = colorHex;
        if (!visible) label.style.display = 'none';

        if (this.accessibilityManager?.registerDecorativeElement) {
            this.accessibilityManager.registerDecorativeElement(label);
        } else {
            label.setAttribute('aria-hidden', 'true');
        }

        document.body.appendChild(label);
        return label;
    }

    destroyLabel(label) {
        if (!label) return;

        if (this.accessibilityManager?.unregisterDecorativeElement) {
            this.accessibilityManager.unregisterDecorativeElement(label);
        }

        if (label.parentNode) label.parentNode.removeChild(label);
    }

    setVisible(label, visible) {
        if (!label) return;
        label.style.display = visible ? 'block' : 'none';
    }

    setPosition(label, xPx, yPx) {
        if (!label) return;
        label.style.left = `${xPx}px`;
        label.style.top = `${yPx}px`;
    }

    setColor(label, colorHex) {
        if (!label) return;
        label.style.color = colorHex;
    }

    setText(label, text) {
        if (!label) return;
        label.innerText = text;
    }
}
