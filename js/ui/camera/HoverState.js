//js/ui/camera/HoverState.js
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class HoverState {
    static TACTICAL_HOVER_CATEGORIES = new Set(['RADAR_CONTACT', 'PROMOTED_ASTEROID', 'ASTEROID']);

    constructor({ tooltipManager, onBodyHovered }) {
        this.tooltipManager = tooltipManager;
        this.onBodyHovered = onBodyHovered;
        this._hoveredData = null;
        this._hoverRAFPending = false;
    }

    static starDisplayName(data) {
        if (!data) return 'STAR';
        return (
            data.name ||
            data.designation ||
            data.proper ||
            data.hip ||
            data.hd ||
            data.hr ||
            data.gl ||
            data.id ||
            'STAR'
        ).toString();
    }

    static starClass(data) {
        const raw =
            data.spect ??
            data.spectral_class ??
            data.spectralClass ??
            data.st_spectype ??
            data.class ??
            data.sptype ??
            null;
        return raw === null || raw === undefined || raw === '' ? null : String(raw);
    }

    updateHover(newData, clientX, clientY, context) {
        const newKey = newData
            ? newData.datasetCategory === 'BACKGROUND_STAR'
                ? 'STAR:' + HoverState.starDisplayName(newData)
                : newData.name || ''
            : null;
        const oldKey = this._hoveredData
            ? this._hoveredData.datasetCategory === 'BACKGROUND_STAR'
                ? 'STAR:' + HoverState.starDisplayName(this._hoveredData)
                : this._hoveredData.name || ''
            : null;

        if (newKey !== oldKey) {
            this._hoveredData = newData;
            this.onBodyHovered(newData);
            this._updateHoverTooltip(newData, clientX, clientY, context);
        } else if (this.tooltipManager && this.tooltipManager.isOwnedBy(context)) {
            this.tooltipManager.move(clientX, clientY);
        }
    }

    clearHover(context) {
        if (this._hoveredData) {
            this._hoveredData = null;
            this.onBodyHovered(null);
        }
        if (this.tooltipManager) this.tooltipManager.hide(context);
    }

    _updateHoverTooltip(data, clientX, clientY, context) {
        if (!this.tooltipManager) return;
        if (!data) {
            this.tooltipManager.hide(context);
            return;
        }

        if (data.datasetCategory === 'BACKGROUND_STAR') {
            const name = HoverState.starDisplayName(data);
            const cls = HoverState.starClass(data);
            const suffix = cls ? `  ·  ${cls}` : '';
            const pinMark = data.isPinned ? '  📌' : '';
            this.tooltipManager.show(context, name + suffix + pinMark, clientX, clientY, 'star');
            return;
        }

        if (HoverState.TACTICAL_HOVER_CATEGORIES.has(data.datasetCategory)) {
            this.tooltipManager.show(
                context,
                this._buildTacticalTooltip(data),
                clientX,
                clientY,
                'tactical'
            );
            return;
        }
        this.tooltipManager.hide(context);
    }

    _buildTacticalTooltip(data) {
        const name = (data.name || 'UNKNOWN CONTACT').toString();
        const category = (data.datasetCategory || '').replace(/_/g, ' ');
        const rows = [`<div class="hc-tooltip-title">${escapeHtml(name)}</div>`];
        if (category) rows.push(`<div class="hc-tooltip-sub">${escapeHtml(category)}</div>`);
        if (typeof data.a === 'number' && isFinite(data.a)) {
            rows.push(`<div>a = ${data.a.toFixed(3)} AU</div>`);
        }
        return { html: rows.join('') };
    }
}
