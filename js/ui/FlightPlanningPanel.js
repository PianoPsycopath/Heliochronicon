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

        this.onCalculateRequested = null;
        this.onCandidateSelected = null;
        this.onConfirmRequested = null;
        this.onCancelRequested = null;

        this._fleet = { id: null, name: null, state: null };
        this._targetName = '';
        this._candidateIds = [];

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
     * @param {string|null} name
     */
    setConfirmedTarget(name) {
        if (!name) {
            this.clearConfirmedTarget();
            return;
        }
        this._confirmedTargetEl.textContent = `CONFIRMED TARGET: ${name.toUpperCase()}`;
        this._confirmedTargetEl.hidden = false;
    }

    clearConfirmedTarget() {
        this._confirmedTargetEl.textContent = '';
        this._confirmedTargetEl.hidden = true;
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

    showConfirmActions() {
        this._confirmActionsEl.hidden = false;
    }

    hideConfirmActions() {
        this._confirmActionsEl.hidden = true;
    }

    /**
     * @param {object[]} candidates
     */
    showCandidates(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            this.clearCandidates();
            return;
        }

        this._candidateIds = candidates.map((c) => c.candidateId);

        this._candidatesEl.innerHTML = candidates
            .map((candidate) => this._renderCandidateRow(candidate))
            .join('');
        this._candidatesEl.hidden = false;
    }

    clearCandidates() {
        this._candidateIds = [];
        this._candidatesEl.innerHTML = '';
        this._candidatesEl.hidden = true;
    }

    destroy() {
        if (this._calcBtn) this._calcBtn.removeEventListener('click', this._onCalcClick);
        if (this._targetInput) {
            this._targetInput.removeEventListener('keydown', this._onTargetKeydown);
        }
        if (this._candidatesEl) {
            this._candidatesEl.removeEventListener('click', this._onCandidateClick);
        }
        if (this._confirmBtn) this._confirmBtn.removeEventListener('click', this._onConfirmClick);
        if (this._cancelBtn) this._cancelBtn.removeEventListener('click', this._onCancelClick);
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

    _renderCandidateRow(candidate) {
        const tof = this._resolveTof(candidate);
        const propellant = Number.isFinite(candidate.propellantRequired)
            ? candidate.propellantRequired
            : null;
        const feasible = candidate.isFeasible !== false;
        const id = String(candidate.candidateId);

        return `
            <li class="fp-candidate-row">
                <button
                    type="button"
                    class="fp-candidate-btn ${feasible ? 'fp-feasible' : 'fp-infeasible'}"
                    data-candidate-id="${this._escapeHtml(id)}"
                    aria-label="Select candidate transfer, TOF ${tof != null ? tof.toFixed(1) : 'unknown'} days"
                >
                    <span class="fp-candidate-tof">${tof != null ? tof.toFixed(1) : '—'} d</span>
                    <span class="fp-candidate-propellant">${
                        propellant != null ? propellant.toFixed(1) : '—'
                    }</span>
                    <span class="fp-candidate-status">${feasible ? 'FEASIBLE' : 'NOT FEASIBLE'}</span>
                </button>
            </li>
        `;
    }

    _renderShell() {
        this.container.innerHTML = `
            <div class="flight-planning-panel">
                <p class="fp-fleet-status" id="fp-fleet-status">NO FLEET LOADED</p>
                <p class="fp-confirmed-target" id="fp-confirmed-target" hidden></p>
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
                <ul id="fp-candidates" class="fp-candidates" aria-live="polite" hidden></ul>
                <div id="fp-results" aria-live="polite" aria-atomic="true" hidden></div>
                <div id="fp-confirm-actions" class="fp-confirm-actions" hidden>
                    <button
                        type="button"
                        id="fp-confirm-btn"
                        class="full-btn"
                        aria-label="Confirm selected flight plan"
                    >
                        CONFIRM
                    </button>
                    <button
                        type="button"
                        id="fp-cancel-btn"
                        class="full-btn fp-cancel-btn"
                        aria-label="Cancel flight planning"
                    >
                        CANCEL
                    </button>
                </div>
            </div>
        `;

        this._statusEl = this.container.querySelector('#fp-fleet-status');
        this._confirmedTargetEl = this.container.querySelector('#fp-confirmed-target');
        this._targetInput = this.container.querySelector('#fp-target-input');
        this._calcBtn = this.container.querySelector('#fp-calculate-btn');
        this._resultsEl = this.container.querySelector('#fp-results');
        this._candidatesEl = this.container.querySelector('#fp-candidates');
        this._confirmActionsEl = this.container.querySelector('#fp-confirm-actions');
        this._confirmBtn = this.container.querySelector('#fp-confirm-btn');
        this._cancelBtn = this.container.querySelector('#fp-cancel-btn');
    }

    _wireEvents() {
        this._onCalcClick = () => this._requestCalculate();
        this._onTargetKeydown = (e) => {
            if (e.key === 'Enter') this._requestCalculate();
        };
        this._onCandidateClick = (e) => this._handleCandidateClick(e);
        this._onConfirmClick = () => {
            if (this.onConfirmRequested) this.onConfirmRequested();
        };
        this._onCancelClick = () => {
            if (this.onCancelRequested) this.onCancelRequested();
        };

        this._calcBtn.addEventListener('click', this._onCalcClick);
        this._targetInput.addEventListener('keydown', this._onTargetKeydown);
        this._candidatesEl.addEventListener('click', this._onCandidateClick);
        this._confirmBtn.addEventListener('click', this._onConfirmClick);
        this._cancelBtn.addEventListener('click', this._onCancelClick);
    }

    _requestCalculate() {
        const targetName = this._targetInput.value.trim();
        this._targetName = targetName;
        if (this.onCalculateRequested) {
            this.onCalculateRequested({ fleetId: this._fleet.id, targetName });
        }
    }

    _handleCandidateClick(e) {
        const btn = e.target.closest('[data-candidate-id]');
        if (!btn || !this._candidatesEl.contains(btn)) return;

        const candidateId = btn.dataset.candidateId;
        if (!this._candidateIds.includes(candidateId)) return;

        if (this.onCandidateSelected) {
            this.onCandidateSelected(candidateId);
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