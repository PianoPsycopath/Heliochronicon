// js/ui/PorkchopPanel.js
//
// PLAN_PORKCHOP.md Phase 8: the primary mission-selection interface. Renders
// the departure x arrival grid produced by TransferSearch.searchTransferField
// as a colored heatmap. This module performs no astrodynamics: it only reads
// the already-computed TransferField and reports which cell the user picked.
import {
    METRIC_KEYS,
    METRIC_LABELS,
    valueAt,
    computeValueRange,
    colorForValue,
    candidateAt,
    minimaMarkers,
} from './porkchopMath.js';

const MARKER_RADIUS_PX = 4;
const SELECTION_COLOR = '#ffffff';
const MARKER_COLOR = '#ffcc00';

export class PorkchopPanel {
    constructor({ host = document.getElementById('panel-right') || document.body } = {}) {
        this.host = host;
        this.field = null;
        this.minima = null;
        this.metricKey = METRIC_KEYS.DELTA_V;
        this.selectedCell = null;
        this.hoveredCell = null;
        this._layout = null;

        this.onCandidateSelected = null;
        this.onClosed = null;

        this._mount();
    }

    _mount() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'porkchop-overlay';
        this.overlay.className = 'porkchop-overlay';
        this.overlay.hidden = true;
        
        // Swapped #porkchop-tooltip for the static #porkchop-hover-info block below the canvas
        this.overlay.innerHTML = `
            <div id="porkchop-panel" class="porkchop-panel" role="dialog" aria-modal="true">
                <div class="porkchop-header">
                    <h2 id="porkchop-heading">PORKCHOP &middot; DEP &times; ARR</h2>
                    <select id="porkchop-metric" class="porkchop-metric" aria-label="Color metric"></select>
                    <button id="porkchop-close" type="button" class="full-btn" aria-label="Close porkchop">[ X ]</button>
                </div>
                <div class="porkchop-canvas-wrap">
                    <canvas id="porkchop-canvas"></canvas>
                    <div id="porkchop-cursor" class="porkchop-cursor" hidden></div>
                </div>
                <div id="porkchop-hover-info" class="porkchop-hover-info" aria-live="polite" aria-atomic="true">
                    HOVER OVER GRID FOR DETAILS
                </div>
                <div id="porkchop-legend" class="porkchop-legend"></div>
            </div>
        `;
        this.host.appendChild(this.overlay);

        this.panel = this.overlay.querySelector('#porkchop-panel');
        this.canvas = this.overlay.querySelector('#porkchop-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.metricSelect = this.overlay.querySelector('#porkchop-metric');
        this.infoEl = this.overlay.querySelector('#porkchop-hover-info');
        this.cursorEl = this.overlay.querySelector('#porkchop-cursor');
        this.legendEl = this.overlay.querySelector('#porkchop-legend');
        this.closeBtn = this.overlay.querySelector('#porkchop-close');
        if (this.cursorEl) this.cursorEl.style.display = 'none';

        Object.values(METRIC_KEYS).forEach((key) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = METRIC_LABELS[key];
            this.metricSelect.appendChild(option);
        });
        this.metricSelect.value = this.metricKey;
        this.metricSelect.addEventListener('change', () => {
            this.metricKey = this.metricSelect.value;
            this._render();
        });
    
        this.closeBtn.addEventListener('click', () => this.close());
    
        this.canvas.addEventListener('pointermove', (e) => this._handlePointerMove(e));
        this.canvas.addEventListener('pointerleave', () => this._clearHover());
        this.canvas.addEventListener('pointerup', (e) => this._handlePointerSelect(e));
    
        // Use ResizeObserver instead of window resize to lock exact flexbox dimensions
        this._resizeObserver = new ResizeObserver(() => {
            if (!this.overlay.hidden) {
                this._resizeCanvas();
                this._render();
            }
        });
        this._resizeObserver.observe(this.overlay.querySelector('.porkchop-canvas-wrap'));
            }

    setField(field, { minima = null } = {}) {
        this.field = field;
        this.minima = minima;
        this.selectedCell = null;
        this.hoveredCell = null;
        this._resizeCanvas();
        this._render();
    }

    open(field, options) {
        if (field) this.setField(field, options);
        this.overlay.hidden = false;
        this._resizeCanvas();
        this._render();
    }

    close() {
        this.overlay.hidden = true;
        this._clearHover();
        if (this.onClosed) this.onClosed();
    }

    dispose() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        this.overlay.remove();
    }

    _resizeCanvas() {
        if (!this.field || this.overlay.hidden) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.max(rect.width, 1);
        const height = Math.max(rect.height, 1);
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this._layout = { width, height };
    }

    _render() {
        if (!this.field || !this._layout) return;
        const { field, metricKey, _layout } = this;
        const { width, height } = _layout;
        const rows = field.departureTimes_daysSinceJ2000.length;
        const cols = field.arrivalTimes_daysSinceJ2000.length;

        // Force a perfect square grid inside the canvas
        const cellSize = Math.min(width / rows, height / cols);
        const gridW = cellSize * rows;
        const gridH = cellSize * cols;
        const offsetX = (width - gridW) / 2;
        const offsetY = (height - gridH) / 2;
        
        const range = computeValueRange(field, metricKey);

        this.ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const value = valueAt(field, metricKey, i, j);
                this.ctx.fillStyle = colorForValue(value, range, field.feasibility[i][j]);
                this.ctx.fillRect(offsetX + i * cellSize, offsetY + j * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
            }
        }

        minimaMarkers(this.minima).forEach((marker) => this._drawMarker(marker, cellSize, offsetX, offsetY));

        // Use standard display toggling for bulletproof visibility
        if (this.selectedCell) {
            this.cursorEl.style.display = 'block';
            this.cursorEl.style.width = `${cellSize}px`;
            this.cursorEl.style.height = `${cellSize}px`;
            this.cursorEl.style.left = `${offsetX + this.selectedCell.departureIndex * cellSize}px`;
            this.cursorEl.style.top = `${offsetY + this.selectedCell.arrivalIndex * cellSize}px`;
        } else {
            this.cursorEl.style.display = 'none';
        }

        if (this.hoveredCell && !this._sameCell(this.hoveredCell, this.selectedCell)) {
            this._drawCellOutline(this.hoveredCell, cellSize, offsetX, offsetY, 'rgba(255,255,255,0.5)', 1);
        }

        this._renderLegend(range);
    }

    _drawMarker(marker, cellSize, offsetX, offsetY) {
        const cx = offsetX + (marker.departureIndex + 0.5) * cellSize;
        const cy = offsetY + (marker.arrivalIndex + 0.5) * cellSize;
        
        // Render a crosshair instead of an arc/circle
        this.ctx.beginPath();
        this.ctx.moveTo(cx - MARKER_RADIUS_PX, cy);
        this.ctx.lineTo(cx + MARKER_RADIUS_PX, cy);
        this.ctx.moveTo(cx, cy - MARKER_RADIUS_PX);
        this.ctx.lineTo(cx, cy + MARKER_RADIUS_PX);
        this.ctx.strokeStyle = MARKER_COLOR;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
    }

    _drawCellOutline(cell, cellSize, offsetX, offsetY, color, lineWidth) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeRect(offsetX + cell.departureIndex * cellSize, offsetY + cell.arrivalIndex * cellSize, cellSize, cellSize);
    }

    _renderLegend(range) {
        const label = METRIC_LABELS[this.metricKey];
        const swatch = (color) => `<span class="porkchop-legend-swatch" style="background:${color};"></span>`;
        this.legendEl.innerHTML = `
            <span>${label} range:</span>
            <span>${swatch('hsl(180,85%,50%)')}${range.min.toFixed(2)} (best)</span>
            <span>${swatch('hsl(0,85%,50%)')}${range.max.toFixed(2)} (worst)</span>
            <span>${swatch('#1a1a1a')}infeasible</span>
        `;
    }

    _sameCell(a, b) {
        return !!a && !!b && a.departureIndex === b.departureIndex && a.arrivalIndex === b.arrivalIndex;
    }

    _cellFromEvent(event) {
        if (!this.field || !this._layout) return null;
        
        // Use live bounding rect for perfect mouse alignment
        const rect = this.canvas.getBoundingClientRect();
        
        const rows = this.field.departureTimes_daysSinceJ2000.length;
        const cols = this.field.arrivalTimes_daysSinceJ2000.length;
        
        const cellSize = Math.min(rect.width / rows, rect.height / cols);
        const gridW = cellSize * rows;
        const gridH = cellSize * cols;
        const offsetX = (rect.width - gridW) / 2;
        const offsetY = (rect.height - gridH) / 2;

        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const gridX = x - offsetX;
        const gridY = y - offsetY;

        if (gridX < 0 || gridX >= gridW || gridY < 0 || gridY >= gridH) return null;

        const departureIndex = Math.floor(gridX / cellSize);
        const arrivalIndex = Math.floor(gridY / cellSize);
        
        return { departureIndex, arrivalIndex };
    }

    _handlePointerMove(event) {
        const cell = this._cellFromEvent(event);
        if (!cell) {
            if (this.hoveredCell) this._clearHover();
            return;
        }
        this.hoveredCell = cell;
        this._updateHoverInfo(cell);
        this._render();
    }

    _handlePointerSelect(event) {
        const cell = this._cellFromEvent(event);
        if (!cell) return;
        this.selectedCell = cell;
        this._render();
        if (this.onCandidateSelected) {
            this.onCandidateSelected(candidateAt(this.field, cell.departureIndex, cell.arrivalIndex));
        }
    }

    _clearHover() {
        this.hoveredCell = null;
        if (this.infoEl) {
            this.infoEl.innerHTML = 'HOVER OVER GRID FOR DETAILS';
        }
        if (this.field && this._layout) this._render();
    }
    _updateHoverInfo(cell) {
        const candidate = candidateAt(this.field, cell.departureIndex, cell.arrivalIndex);
        
        if (!candidate.feasible) {
            this.infoEl.innerHTML = '<span style="color:var(--theme-danger);">INFEASIBLE TRAJECTORY</span>';
            return;
        }

        this.infoEl.innerHTML = `
            Δv: <strong>${candidate.deltaV_kmps.toFixed(3)} km/s</strong> &nbsp;&middot;&nbsp; 
            TOF: <strong>${candidate.timeOfFlight_days.toFixed(1)} d</strong> &nbsp;&middot;&nbsp; 
            FUEL: <strong>${candidate.fuelRequired_kg.toFixed(1)} kg</strong>
        `;
    }

    _showTooltip(event, cell) {
        const candidate = candidateAt(this.field, cell.departureIndex, cell.arrivalIndex);
        this.tooltipEl.hidden = false;
        this.tooltipEl.style.left = `${event.clientX}px`;
        this.tooltipEl.style.top = `${event.clientY}px`;
        this.tooltipEl.innerHTML = candidate.feasible
            ? `Δv ${candidate.deltaV_kmps.toFixed(3)} km/s · TOF ${candidate.timeOfFlight_days.toFixed(1)} d · fuel ${candidate.fuelRequired_kg.toFixed(1)} kg`
            : 'INFEASIBLE';
    }
}
