// js/ui/MissionResultPanel.js
export class MissionResultPanel {
    constructor() {
        this.onCalculateRequested = null;

        this.crtOverlay = document.getElementById('crt-overlay');
        this.container = null;
        this.resultDataEl = null;
        this.burnDetailEl = null;
        this.calculateBtn = null;

        this._mount();
    }

    _mount() {
        const host = document.getElementById('panel-right');
        if (!host) return;

        this.container = document.createElement('div');
        this.container.id = 'mission-result-panel';
        this.container.innerHTML = `
            <p style="color: var(--theme-accent); font-weight: bold; margin-top: 15px; border-top: 1px solid var(--theme-accent); padding-top: 10px;">MISSION ANALYSIS</p>
            <div id="mission-result-data" aria-live="polite" aria-atomic="true">
                <p>NO MISSION CALCULATED</p>
            </div>
            <div style="margin-top:10px;">
                <button id="btn-mission-calculate" type="button" class="full-btn" aria-label="Calculate mission">[ CALCULATE ]</button>
            </div>
            <div id="mission-burn-detail" style="margin-top:10px; border-top: 1px solid rgba(0,255,255,0.2); padding-top:8px;" aria-live="polite" aria-atomic="true">
                <p style="color:#888;">CLICK A BURN MARKER FOR DETAIL</p>
            </div>
        `;
        host.appendChild(this.container);

        this.resultDataEl = this.container.querySelector('#mission-result-data');
        this.burnDetailEl = this.container.querySelector('#mission-burn-detail');
        this.calculateBtn = this.container.querySelector('#btn-mission-calculate');

        this.calculateBtn.addEventListener('click', () => {
            if (this.onCalculateRequested) this.onCalculateRequested();
        });
    }

    showMissionResult(solution, { isFeasible } = {}) {
        if (!solution) {
            this.clearMissionResult();
            return;
        }

        const statusLine =
            isFeasible === undefined
                ? ''
                : `<p>STATUS: <span style="color: ${isFeasible ? 'var(--theme-live)' : 'var(--theme-danger)'};">${isFeasible ? 'FEASIBLE' : 'NOT FEASIBLE'}</span></p>`;

        this.resultDataEl.innerHTML = `
            <p>&Delta;v TOTAL: <span style="color:#fff">${solution.totalDeltaV_kmps.toFixed(3)} KM/S</span></p>
            <p>TOF: <span style="color:#fff">${solution.timeOfFlight_days.toFixed(2)} D</span></p>
            ${statusLine}
        `;

        // A new mission solution invalidates any previously selected burn.
        this.clearBurnDetail();

        this._triggerCRTFlash();
    }

    clearMissionResult() {
        this.resultDataEl.innerHTML = `<p>NO MISSION CALCULATED</p>`;
        this.clearBurnDetail();
    }

    // Phase 9: displays the data for a single Burn (see Burn.js), as picked
    // via BurnSelectionController. Display-only — no burn math happens here.
    showBurnDetail(burn) {
        if (!burn) {
            this.clearBurnDetail();
            return;
        }

        this.burnDetailEl.innerHTML = `
            <p style="color: var(--theme-accent); font-weight: bold;">BURN: ${burn.type}</p>
            <p>T: <span style="color:#fff">${burn.time_daysSinceJ2000.toFixed(2)} D</span></p>
            <p>&Delta;v: <span style="color:#fff">${burn.deltaVMagnitude_kmps.toFixed(3)} KM/S</span></p>
            <p>MASS: <span style="color:#fff">${burn.massBefore_kg.toFixed(1)} &rarr; ${burn.massAfter_kg.toFixed(1)} KG</span></p>
        `;

        this._triggerCRTFlash();
    }

    clearBurnDetail() {
        this.burnDetailEl.innerHTML = `<p style="color:#888;">CLICK A BURN MARKER FOR DETAIL</p>`;
    }

    _triggerCRTFlash() {
        if (!this.crtOverlay) return;
        this.crtOverlay.style.backgroundColor = 'rgba(255, 204, 0, 0.1)';
        setTimeout(() => (this.crtOverlay.style.backgroundColor = 'transparent'), 100);
    }
}