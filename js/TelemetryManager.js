// js/TelemetryManager.js
export class TelemetryManager {
    constructor() {
        this.telemetryDataEl = document.getElementById('telemetry-data');
        this.currentTargetEl = document.getElementById('current-target');
        this.crtOverlay = document.getElementById('crt-overlay');

        this.onPinRequested = null;
        this.onPurgeRequested = null;
        this.onFocusBody = null;
        this.onPinStarRequested = null;
    }
    //spectral class needs adding in data
    static _getStarClass(data) {
        const raw =
            data.spect ??
            data.spectral_class ??
            data.spectralClass ??
            data.st_spectype ??
            data.class ??
            data.sptype ??
            null;
        if (raw === null || raw === undefined || raw === '') return '—';
        return String(raw);
    }

    setManualOverride(name) {
        if (!name) return;
        this.currentTargetEl.innerHTML = `${name.toUpperCase()} <span style="color: #ff5555;">[MANUAL OVERRIDE]</span>`;
    }

    triggerCRTFlash() {
        this.crtOverlay.style.backgroundColor = 'rgba(255, 204, 0, 0.1)';
        setTimeout(() => (this.crtOverlay.style.backgroundColor = 'transparent'), 100);
    }

    updateTargetPanel(data) {
        if (!data || !data.name) {
            this.currentTargetEl.innerText = 'NONE';
            this.telemetryDataEl.innerHTML = `<p>AWAITING DATA INPUT...</p>`;
            return;
        }

        this.currentTargetEl.innerText = data.name.toUpperCase();

        let actionButtons = '';
        if (data.datasetCategory === 'PROMOTED_ASTEROID') {
            const pinText = data.isPinned ? 'PINNED TO CPU' : 'PIN TO CPU';
            const pinColor = data.isPinned ? '#00ff00' : '#ffcc00';
            actionButtons = `
            <div style="display:flex; gap:5px; margin-top:15px;">
                <button id="btn-pin" class="full-btn" style="border-color: ${pinColor}; color: ${pinColor};">${pinText}</button>
                <button id="btn-purge" class="full-btn" style="border-color: #ff3333; color: #ff3333;">PURGE CLONE</button>
            </div>
        `;
        }

        const canEclipse = data.parent !== data.name;
        const eclipseSection = canEclipse
            ? `
        <div style="display:flex; gap:5px; margin-top:10px;">
            <button id="btn-eclipse-prev" class="full-btn">◀ PREV ECLIPSE</button>
            <button id="btn-eclipse-next" class="full-btn">NEXT ECLIPSE ▶</button>
        </div>
        <div id="eclipse-result"></div>
    `
            : '';

        this.telemetryDataEl.innerHTML = `
        <p style="color: #ffcc00; font-weight: bold;">TARGET: ${data.name.toUpperCase()}</p>
        <p>PARENT: ${data.parent}</p>
        ${data.a > 0 ? `<p>DIST: ${data.a.toFixed(4)} AU</p><p>PERIOD: ${data.period.toFixed(2)} D</p><p>RADIUS: ${(data.radius_km || 0).toFixed(1)} KM</p>` : `<p>CLASS: ANCHOR STAR</p>`}
        <p style="color:#00aaff; margin-top: 15px;">J2000 ROTATION TRACKING</p>
        <p>POLE RA/DEC: <span id="tel-ra" style="color: #fff">${data.pole_ra.toFixed(2)}</span>° / <span id="tel-dec" style="color: #fff">${data.pole_dec.toFixed(2)}</span>°</p>
        <p>CURRENT ROT (W): <span id="tel-rot" style="color: #fff">0.00</span>°</p>
        <p>ROTATION RATE: ${data.pm_w_rate.toFixed(2)}° / DAY</p>
        ${actionButtons}
        ${eclipseSection}
    `;

        if (data.datasetCategory === 'PROMOTED_ASTEROID') {
            document.getElementById('btn-pin').addEventListener('click', () => {
                if (this.onPinRequested) this.onPinRequested(data);
            });
            document.getElementById('btn-purge').addEventListener('click', () => {
                if (this.onPurgeRequested) this.onPurgeRequested(data);
            });
        }

        if (canEclipse) {
            document.getElementById('btn-eclipse-prev').addEventListener('click', () => {
                if (this.onEclipseNavRequested) this.onEclipseNavRequested(-1);
            });
            document.getElementById('btn-eclipse-next').addEventListener('click', () => {
                if (this.onEclipseNavRequested) this.onEclipseNavRequested(1);
            });
        }

        this.triggerCRTFlash();
    }
    renderEclipseResult(event) {
        const box = document.getElementById('eclipse-result');
        if (!box) return;
        if (!event) {
            box.innerHTML = `<p style="color:#ff3333;">NO EVENT FOUND IN RANGE</p>`;
            return;
        }
        const date = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + event.days * 86400000);
        box.innerHTML = `
            <p style="color:#00ffff;">${event.type} ECLIPSE</p>
            <p>${event.occulter.name} occults ${event.shadowed.name}</p>
            <p>${date.toISOString().replace('T', ' ').substring(0, 19)}</p>
        `;
    }
    showStarSelection(data) {
        if (!data) return;

        const displayName = (
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

        this.currentTargetEl.innerText = displayName.toUpperCase();

        const starClass = this._escapeHtml(TelemetryManager._getStarClass(data));
        const ci = data.ci != null && isFinite(data.ci) ? Number(data.ci).toFixed(3) : '—';

        let distStr = '—';
        if (data.engineX != null) {
            const d = Math.hypot(data.engineX, data.engineY || 0, data.engineZ || 0);
            if (isFinite(d) && d > 0) {
                distStr =
                    d >= 206265 ? `${(d / 206265).toFixed(2)} pc` : `${d.toExponential(3)} AU`;
            }
        } else if (data.x != null) {
            const d = Math.hypot(data.x || 0, data.y || 0, data.z || 0);
            if (isFinite(d) && d > 0) distStr = `${d.toFixed(2)} pc`;
        }

        const extraIds = [];
        if (data.hip) extraIds.push(`HIP ${data.hip}`);
        if (data.hd) extraIds.push(`HD ${data.hd}`);
        if (data.hr) extraIds.push(`HR ${data.hr}`);
        if (data.gl) extraIds.push(`GL ${data.gl}`);

        const pinText = data.isPinned ? 'UNPIN STAR' : 'PIN STAR';
        const pinColor = data.isPinned ? '#00ff00' : '#ffcc00';

        this.telemetryDataEl.innerHTML = `
            <p style="color: #ffcc00; font-weight: bold;">STAR: ${this._escapeHtml(displayName.toUpperCase())}</p>
            <p style="color:#00aaff;">BACKGROUND STAR FIELD</p>
            <p>SPECTRAL CLASS: <span style="color:#fff">${starClass}</span></p>
            <p>B−V COLOR INDEX: <span style="color:#fff">${ci}</span></p>
            <p>DISTANCE: <span style="color:#fff">${distStr}</span></p>
            ${extraIds.length ? `<p style="margin-top:10px; color:#888;">${extraIds.map((s) => this._escapeHtml(s)).join(' · ')}</p>` : ''}
            <div style="display:flex; gap:5px; margin-top:15px;">
                <button id="btn-pin-star" class="full-btn" style="border-color: ${pinColor}; color: ${pinColor};">${pinText}</button>
            </div>
            <p style="margin-top:14px; font-size:0.72rem; color:#666;">
                Selection only — no camera lock or zoom.
            </p>
        `;

        document.getElementById('btn-pin-star').addEventListener('click', () => {
            if (this.onPinStarRequested) this.onPinStarRequested(data);
        });

        this.triggerCRTFlash();
    }

    updateLiveTelemetry(wDeg, raDeg, decDeg) {
        const telRot = document.getElementById('tel-rot');
        const telRa = document.getElementById('tel-ra');
        const telDec = document.getElementById('tel-dec');
        if (telRot) telRot.innerText = wDeg.toFixed(2);
        if (telRa) telRa.innerText = raDeg.toFixed(2);
        if (telDec) telDec.innerText = decDeg.toFixed(2);
    }

    renderScanResults(results, referenceName) {
        let html = `<p style="color: #00ffff; font-weight: bold; border-bottom: 1px solid #00ffff; padding-bottom:5px;">
            RADAR PING: CLOSEST TO ${referenceName}
        </p>`;

        if (results.length === 0) {
            html += `<p>NO CONTACTS DETECTED.</p>`;
            this.telemetryDataEl.innerHTML = html;
            return;
        }

        this.telemetryDataEl.innerHTML = html;

        results.forEach((hit, i) => {
            const distAU = Math.sqrt(hit.distSq);
            const div = document.createElement('div');
            div.style.fontSize = '0.75rem';
            div.style.margin = '6px 0';
            div.style.cursor = 'pointer';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.borderBottom = '1px solid rgba(0, 255, 255, 0.2)';

            div.innerHTML = `
                <span style="color:#00ffff">[${i + 1}] ${hit.data.name}</span>
                <span style="color:#aaa;">${distAU.toFixed(5)} AU</span>
            `;

            div.addEventListener('click', () => {
                if (this.onFocusBody) this.onFocusBody(hit.data);
            });

            div.addEventListener(
                'mouseenter',
                () => (div.style.backgroundColor = 'rgba(0, 255, 255, 0.2)')
            );
            div.addEventListener('mouseleave', () => (div.style.backgroundColor = 'transparent'));

            this.telemetryDataEl.appendChild(div);
        });

        this.triggerCRTFlash();
    }

    showLookupPending(query) {
        const safe = this._escapeHtml(query.toUpperCase());
        this.telemetryDataEl.innerHTML = `
            <p style="color: #00ffff; font-weight: bold; animation: flicker 0.5s infinite;">
                SEARCHING DATABASE FOR "${safe}"...
            </p>`;
    }

    showScanningStatus() {
        this.telemetryDataEl.innerHTML = `<p style="color:#00ffff; font-weight:bold; animation: flicker 0.5s infinite;">INITIATING RADAR PING...</p>`;
    }

    showLookupNotFound(query) {
        const safe = this._escapeHtml(query.toUpperCase());
        this.telemetryDataEl.innerHTML = `
            <p style="color: #ff3333; font-weight: bold;">NO RECORD FOUND FOR "${safe}"</p>
            <p style="font-size: 0.75rem;">Checked loaded datasets and all on-disk chunks.</p>`;
    }

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
