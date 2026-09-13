// js/ui/FlightPlanningPanel.js


export class FlightPlanningPanel {
    /**
     * @param {object} opts
     * @param {HTMLElement} opts.container 
     */
    constructor({ container } = {}) {
        if (!container) {
            throw new Error('FlightPlanningPanel requires a "container" element');
        }
        this.container = container;

        // Callback only — set by the composition layer in a later phase.
        this.onCalculateRequested = null;

        this._fleet = { id: null, name: null, state: null };
        this._targetName = '';

        this._renderShell();
        this._wireEvents();
    }


    /**
     * Update the fleet identity/status line.
     * @param {{id?: string, name?: string, state?: string}} fleet
     */
    setFleet({ id, name, state } = {}) {
        this._fleet = { id: id ?? null, name: name ?? null, state: state ?? null };
        this._updateFleetStatus();
    }

    /**
     * Set (or clear) the target body control's current value.
     * @param {string} name
     */
    setTarget(name) {
        this._targetName = name || '';
        if (this._targetInput) this._targetInput.value = this._targetName;
    }

    /**
     * Render a FlightPlan. Accepts the base
     * shape plus the optional `tof` / `fuelWarning` fields some calculators
     * attach on top of it.
     * @param {object} plan
     */
    showFlightPlan(plan) {
        if (!plan) {
            this.clearFlightPlan();
            return;
        }

        const tof = this._resolveTof(plan);
        const deltaV = Number.isFinite(plan.totalDeltaV) ? plan.totalDeltaV : null;
        const propellant = Number.isFinite(plan.propellantRequired)
            ? plan.propellantRequired
            : null;
        const feasible = plan.isFeasible !== false;

        const warnings = Array.isArray(plan.warnings) ? plan.warnings.slice() : [];
        if (
            typeof plan.fuelWarning === 'string' &&
            plan.fuelWarning &&
            !warnings.includes(plan.fuelWarning)
        ) {
            warnings.push(plan.fuelWarning);
        }

        this._resultsEl.innerHTML = `
            <p class="fp-status ${feasible ? 'fp-feasible' : 'fp-infeasible'}">
                ${feasible ? 'FEASIBLE' : 'NOT FEASIBLE'}
            </p>
            <p>&Delta;V: <span>${deltaV != null ? deltaV.toFixed(3) : '—'}</span> km/s</p>
            <p>TOF: <span>${tof != null ? tof.toFixed(1) : '—'}</span> days</p>
            <p>PROPELLANT: <span>${propellant != null ? propellant.toFixed(1) : '—'}</span></p>
            ${
                warnings.length
                    ? `<ul class="fp-warnings">${warnings
                          .map((w) => `<li>${this._escapeHtml(String(w))}</li>`)
                          .join('')}</ul>`
                    : ''
            }
        `;
        this._resultsEl.hidden = false;
    }

    clearFlightPlan() {
        this._resultsEl.innerHTML = '';
        this._resultsEl.hidden = true;
    }
    
    destroy() {
        if (this._calcBtn) this._calcBtn.removeEventListener('click', this._onCalcClick);
        if (this._targetInput) {
            this._targetInput.removeEventListener('keydown', this._onTargetKeydown);
        }
    }

    _resolveTof(plan) {
        if (Number.isFinite(plan.tof)) return plan.tof;
        if (
            Number.isFinite(plan.arrivalEpochDaysJ2000) &&
            Number.isFinite(plan.departureEpochDaysJ2000)
        ) {
            return plan.arrivalEpochDaysJ2000 - plan.departureEpochDaysJ2000;
        }
        return null;
    }

    _renderShell() {
        this.container.innerHTML = `
            <div class="flight-planning-panel">
                <p class="fp-fleet-status" id="fp-fleet-status">NO FLEET LOADED</p>
                <div class="control-group">
                    <label id="fp-target-label" for="fp-target-input">TARGET BODY</label>
                    <input
                        type="text"
                        id="fp-target-input"
                        placeholder="e.g. MARS"
                        aria-describedby="fp-target-label"
                    />
                </div>
                <button
                    type="button"
                    id="fp-calculate-btn"
                    class="full-btn"
                    aria-label="Calculate flight plan to target"
                >
                    CALCULATE
                </button>
                <div id="fp-results" aria-live="polite" aria-atomic="true" hidden></div>
            </div>
        `;

        this._statusEl = this.container.querySelector('#fp-fleet-status');
        this._targetInput = this.container.querySelector('#fp-target-input');
        this._calcBtn = this.container.querySelector('#fp-calculate-btn');
        this._resultsEl = this.container.querySelector('#fp-results');
    }

    _wireEvents() {
        this._onCalcClick = () => this._requestCalculate();
        this._onTargetKeydown = (e) => {
            if (e.key === 'Enter') this._requestCalculate();
        };
        this._calcBtn.addEventListener('click', this._onCalcClick);
        this._targetInput.addEventListener('keydown', this._onTargetKeydown);
    }

    _requestCalculate() {
        const targetName = this._targetInput.value.trim();
        this._targetName = targetName;
        if (this.onCalculateRequested) {
            this.onCalculateRequested({ fleetId: this._fleet.id, targetName });
        }
    }

    _updateFleetStatus() {
        const { name, state } = this._fleet;
        if (!name) {
            this._statusEl.textContent = 'NO FLEET LOADED';
            return;
        }
        const stateLabel = state ? state.toUpperCase() : 'UNKNOWN';
        this._statusEl.textContent = `${name.toUpperCase()} — ${stateLabel}`;
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}