// js/TooltipManager.js
export class TooltipManager {
    constructor() {
        this._el = document.createElement('div');
        this._el.className = 'hc-tooltip';
        this._el.style.display = 'none';
        document.body.appendChild(this._el);

        this._activeToken = null;
        this._buttonHandlers = new Map();
    }

    // content: plain string (safe) or { html } for controlled markup.
    show(token, content, clientX, clientY, variant = 'default') {
        this._activeToken = token;
        this._el.className = `hc-tooltip hc-tooltip--${variant}`;
        this._setContent(content);
        this.move(clientX, clientY);
        this._el.style.display = 'block';
    }

    // Update content in place; no-op if token is not the current owner.
    updateActiveContent(token, content) {
        if (!this.isOwnedBy(token)) return;
        this._setContent(content);
    }

    _setContent(content) {
        if (content && typeof content === 'object' && 'html' in content) {
            this._el.innerHTML = content.html;
        } else {
            this._el.textContent = content;
        }
    }

    move(clientX, clientY) {
        this._el.style.left = `${clientX}px`;
        this._el.style.top = `${clientY}px`;
    }

    hide(token) {
        if (token !== undefined && token !== this._activeToken) return;
        this._activeToken = null;
        this._el.style.display = 'none';
    }

    isOwnedBy(token) {
        return this._activeToken === token;
    }

    // Replace native title tooltips with the shared hc-tooltip look.
    // Safe to call more than once (already-wired elements are skipped).
    attachButtonTooltips(root = document) {
        const els = root.querySelectorAll('[data-tooltip], [title]');
        els.forEach((el) => {
            if (this._buttonHandlers.has(el)) return;

            // Promote title so the browser tooltip never fires alongside ours.
            if (!el.dataset.tooltip && el.title) {
                el.dataset.tooltip = el.title;
            }
            el.removeAttribute('title');
            if (!el.dataset.tooltip) return;

            const onEnter = (e) =>
                this.show(el, el.dataset.tooltip, e.clientX, e.clientY, 'button');
            const onMove = (e) => {
                if (this.isOwnedBy(el)) this.move(e.clientX, e.clientY);
            };
            const onLeave = () => this.hide(el);
            // Hide on press by default so the tooltip does not sit over click feedback.
            // Opt out with data-tooltip-live for toggle buttons whose text changes on click.
            const onPress = () => {
                if (el.dataset.tooltipLive !== undefined) return;
                this.hide(el);
            };

            el.addEventListener('pointerenter', onEnter);
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerleave', onLeave);
            el.addEventListener('pointerdown', onPress);

            this._buttonHandlers.set(el, { onEnter, onMove, onLeave, onPress });
        });
    }

    // Change tooltip text and refresh the visible copy if currently shown.
    setButtonTooltip(el, text) {
        if (!el) return;
        el.dataset.tooltip = text;
        this.updateActiveContent(el, text);
    }

    detachButtonTooltips() {
        for (const [el, h] of this._buttonHandlers) {
            el.removeEventListener('pointerenter', h.onEnter);
            el.removeEventListener('pointermove', h.onMove);
            el.removeEventListener('pointerleave', h.onLeave);
            el.removeEventListener('pointerdown', h.onPress);
        }
        this._buttonHandlers.clear();
    }

    dispose() {
        this.detachButtonTooltips();
        this.hide();
        if (this._el.parentNode) this._el.parentNode.removeChild(this._el);
    }
}
