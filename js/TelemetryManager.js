// js/TelemetryManager.js
export class TelemetryManager {
    constructor() {
        this.telemetryDataEl = document.getElementById('telemetry-data');
        this.currentTargetEl = document.getElementById('current-target');
        this.crtOverlay = document.getElementById('crt-overlay');

        this.onPinRequested = null;
        this.onPurgeRequested = null;
        this.onFocusBody = null;
    }

    setManualOverride(name) {
        if (!name) return; 
        this.currentTargetEl.innerHTML = `${name.toUpperCase()} <span style="color: #ff5555;">[MANUAL OVERRIDE]</span>`;
    }

    triggerCRTFlash() {
        this.crtOverlay.style.backgroundColor = "rgba(255, 204, 0, 0.1)";
        setTimeout(() => this.crtOverlay.style.backgroundColor = "transparent", 100);
    }

    updateTargetPanel(data) {
        if (!data || !data.name) {
            this.currentTargetEl.innerText = "NONE";
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

        this.telemetryDataEl.innerHTML = `
            <p style="color: #ffcc00; font-weight: bold;">TARGET: ${data.name.toUpperCase()}</p>
            <p>PARENT: ${data.parent}</p>
            ${data.a > 0 ? `<p>DIST: ${data.a.toFixed(4)} AU</p><p>PERIOD: ${data.period.toFixed(2)} D</p><p>RADIUS: ${(data.radius_km || 0).toFixed(1)} KM</p>` : `<p>CLASS: ANCHOR STAR</p>`}
            <p style="color:#00aaff; margin-top: 15px;">J2000 ROTATION TRACKING</p>
            <p>POLE RA/DEC: <span id="tel-ra" style="color: #fff">${data.pole_ra.toFixed(2)}</span>° / <span id="tel-dec" style="color: #fff">${data.pole_dec.toFixed(2)}</span>°</p>
            <p>CURRENT ROT (W): <span id="tel-rot" style="color: #fff">0.00</span>°</p>
            <p>ROTATION RATE: ${data.pm_w_rate.toFixed(2)}° / DAY</p>
            ${actionButtons}
        `;
        
        if (data.datasetCategory === 'PROMOTED_ASTEROID') {
            document.getElementById('btn-pin').addEventListener('click', () => {
                if (this.onPinRequested) this.onPinRequested(data);
            });
            document.getElementById('btn-purge').addEventListener('click', () => {
                if (this.onPurgeRequested) this.onPurgeRequested(data);
            });
        }

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
                <span style="color:#00ffff">[${i+1}] ${hit.data.name}</span>
                <span style="color:#aaa;">${distAU.toFixed(5)} AU</span>
            `;
            
            div.addEventListener('click', () => {
                if (this.onFocusBody) this.onFocusBody(hit.data);
            });
            
            div.addEventListener('mouseenter', () => div.style.backgroundColor = 'rgba(0, 255, 255, 0.2)');
            div.addEventListener('mouseleave', () => div.style.backgroundColor = 'transparent');
            
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