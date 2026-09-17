// js/ui/FleetStatusPanel.js

function formatNumber(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export class FleetStatusPanel {
    /**
     * @param {object} opts
     * @param {HTMLElement} opts.container
     */
    constructor({ container } = {}) {
        if (!container) {
            throw new Error('FleetStatusPanel requires a "container" element');
        }
        this.container = container;

        this.onFocusRequested = null;
        this.onFleetSelected = null;

        this._fleets = [];
        this._selectedId = null;
        this._query = '';

        this._renderShell();
        this._wireEvents();
    }

    /**
     * @param {Array<{id:string, name:string, state?:string}>} fleets
     */
    setFleets(fleets) {
        this._fleets = Array.isArray(fleets) ? fleets.slice() : [];
        if (!this._fleets.some((fleet) => fleet.id === this._selectedId)) {
            this._selectedId = this._fleets[0]?.id ?? null;
        }
        this._renderList();
    }

    /**
     * @param {object|null} status
     * @param {string} [status.id]
     * @param {string} [status.name]
     * @param {string} [status.state]
     * @param {string|null} [status.targetName]
     * @param {number} [status.fuelRemaining]
     * @param {number|null} [status.altitudeKm] - when parked in a geocentric orbit
     * @param {number|null} [status.distanceFromSunAu] - when in a heliocentric state
     * @param {number|null} [status.arrivalEpochDaysJ2000]
     * @param {number|null} [status.daysToArrival]
     */
    setStatus(status) {
        if (!status) {
            this._detailEl.innerHTML = '<p class="fleet-empty">NO FLEET LOADED</p>';
            this._focusBtn.disabled = true;
            return;
        }

        this._focusBtn.disabled = false;

        const rows = [
            ['STATE', (status.state ?? 'unknown').toUpperCase()],
            ['TARGET', status.targetName ? status.targetName.toUpperCase() : 'NONE'],
            ['FUEL', formatNumber(status.fuelRemaining, 1)],
        ];

        if (Number.isFinite(status.altitudeKm)) {
            rows.push(['ALTITUDE', `${formatNumber(status.altitudeKm, 0)} KM`]);
        }
        if (Number.isFinite(status.distanceFromSunAu)) {
            rows.push(['HELIO R', `${formatNumber(status.distanceFromSunAu, 4)} AU`]);
        }
        if (Number.isFinite(status.daysToArrival)) {
            rows.push(['ETA', `${formatNumber(status.daysToArrival, 1)} D`]);
        }

        this._detailEl.innerHTML = rows
            .map(
                ([label, value]) =>
                    `<p class="fleet-stat"><span>${label}</span> <span>${this._escapeHtml(
                        String(value)
                    )}</span></p>`
            )
            .join('');
    }

    destroy() {
        this._searchEl?.removeEventListener('input', this._onSearchInput);
        this._listEl?.removeEventListener('click', this._onListClick);
        this._focusBtn?.removeEventListener('click', this._onFocusClick);
    }

    _renderShell() {
        this.container.innerHTML = `
            <div class="fleet-status-panel">
                <div class="control-group" style="margin-top: 10px">
                    <label id="fleet-search-label" for="fleet-search-input">FLEET REGISTRY</label>
                    <input
                        type="text"
                        id="fleet-search-input"
                        placeholder="SEARCH FLEETS..."
                        aria-describedby="fleet-search-label"
                    />
                    <div id="fleet-list" class="scrollable-list" aria-label="Fleet results"></div>
                </div>
                <div class="control-group">
                    <div id="fleet-detail" aria-live="polite"></div>
                    <button
                        type="button"
                        id="fleet-focus-btn"
                        class="full-btn"
                        aria-label="Zoom the view to the fleet's current position"
                        disabled
                    >
                        LOCATE FLEET
                    </button>
                </div>
            </div>
        `;

        this._searchEl = this.container.querySelector('#fleet-search-input');
        this._listEl = this.container.querySelector('#fleet-list');
        this._detailEl = this.container.querySelector('#fleet-detail');
        this._focusBtn = this.container.querySelector('#fleet-focus-btn');

        this.setStatus(null);
    }

    _wireEvents() {
        this._onSearchInput = () => {
            this._query = this._searchEl.value.trim().toLowerCase();
            this._renderList();
        };
        this._onListClick = (e) => {
            const btn = e.target.closest('[data-fleet-id]');
            if (!btn || !this._listEl.contains(btn)) return;
            this._selectedId = btn.dataset.fleetId;
            this._renderList();
            if (this.onFleetSelected) this.onFleetSelected(this._selectedId);
        };
        this._onFocusClick = () => {
            if (this.onFocusRequested) this.onFocusRequested(this._selectedId);
        };

        this._searchEl.addEventListener('input', this._onSearchInput);
        this._listEl.addEventListener('click', this._onListClick);
        this._focusBtn.addEventListener('click', this._onFocusClick);
    }

    _renderList() {
        const visible = this._query
            ? this._fleets.filter((fleet) => (fleet.name ?? '').toLowerCase().includes(this._query))
            : this._fleets;

        if (visible.length === 0) {
            this._listEl.innerHTML = '<p class="fleet-empty">NO FLEETS</p>';
            return;
        }

        this._listEl.innerHTML = visible
            .map((fleet) => {
                const selected = fleet.id === this._selectedId;
                const state = (fleet.state ?? 'unknown').toUpperCase();
                return `
                    <button
                        type="button"
                        class="list-item${selected ? ' active' : ''}"
                        data-fleet-id="${this._escapeHtml(String(fleet.id))}"
                        aria-label="${this._escapeHtml(`${fleet.name ?? fleet.id}, ${state}`)}"
                    >
                        <span>${this._escapeHtml(String(fleet.name ?? fleet.id).toUpperCase())}</span>
                        <span style="color:#aaa;">[${this._escapeHtml(state)}]</span>
                    </button>
                `;
            })
            .join('');
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}