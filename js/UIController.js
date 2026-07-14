// js/UIController.js
class UIController {
    constructor() {
        this.timeMultiplier = 1;
        this.currentSortMode = 'distance';
        this.datasets = new Set();

        this.btnMobileToggle = document.getElementById('btn-mobile-toggle');
        this.panelLeft = document.getElementById('panel-left');
        this.panelRight = document.getElementById('panel-right');

        // State machine for mobile: 0 = Map, 1 = Left Panel, 2 = Right Panel
        this.mobileUiState = 0;
        
        this.timeInput = document.getElementById('time-input');
        this.distMinEl = document.getElementById('moon-dist-min');
        this.distMaxEl = document.getElementById('moon-dist-max');
        this.sizeMinEl = document.getElementById('moon-size-min');
        this.sizeMaxEl = document.getElementById('moon-size-max');
        this.distValEl = document.getElementById('dist-val');
        this.sizeValEl = document.getElementById('size-val');
        this.searchEl = document.getElementById('search-input');
        this.sortToggleEl = document.getElementById('sort-toggle');
        this.listContainer = document.getElementById('body-list');
        this.datasetListEl = document.getElementById('dataset-list'); 
        this.telemetryDataEl = document.getElementById('telemetry-data');
        this.currentTargetEl = document.getElementById('current-target');
        this.crtOverlay = document.getElementById('crt-overlay');

        this.onFocusBody = null;
        this.onTimeChanged = null;
        this.onClearData = null;
        //this.onDataUploaded = null;
        this.onRefreshList = null;
        this.onDatasetVisibilityChanged = null;
        this.onDatasetColorChanged = null;
        
        this.onPinRequested = null;
        this.onPurgeRequested = null;

        this.btnScan = document.getElementById('btn-scan');
        this.isScanActive = false;
        this.onScanRequested = null;

        this.initBindings();
    }

    initBindings() {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.timeMultiplier = parseFloat(e.target.dataset.mult);
            });
        });

        const applyManualTime = () => {
            const parsed = new Date(this.timeInput.value + "Z");
            if (!isNaN(parsed) && this.onTimeChanged) {
                this.onTimeChanged(parsed);
            }
        };
        this.timeInput.addEventListener('blur', applyManualTime);
        this.timeInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') { applyManualTime(); this.timeInput.blur(); } 
        });

        const updateSliders = () => {
            const dMin = parseFloat(this.distMinEl.value);
            const dMax = parseFloat(this.distMaxEl.value);
            this.distValEl.innerText = `${Math.min(dMin, dMax).toFixed(3)} - ${Math.max(dMin, dMax).toFixed(3)}`;

            const sMin = parseFloat(this.sizeMinEl.value);
            const sMax = parseFloat(this.sizeMaxEl.value);
            this.sizeValEl.innerText = `${Math.min(sMin, sMax)} - ${Math.max(sMin, sMax)}`;
        };
        [this.distMinEl, this.distMaxEl, this.sizeMinEl, this.sizeMaxEl].forEach(el => el.addEventListener('input', updateSliders));

        this.sortToggleEl.addEventListener('click', (e) => {
            this.currentSortMode = this.currentSortMode === 'distance' ? 'size' : 'distance';
            e.target.innerText = `SORT: ${this.currentSortMode.toUpperCase()}`;
            if (this.onRefreshList) this.onRefreshList();
        });
        this.searchEl.addEventListener('input', () => {
            if (this.onRefreshList) this.onRefreshList();
        });

        

        document.getElementById('btn-clear-map').addEventListener('click', () => {
            if (this.onClearData) {
                this.onClearData();
                this.datasets.clear();
                if (this.datasetListEl) this.datasetListEl.innerHTML = '';
                
                // Reset Scan Toggle
                this.isScanActive = false;
                this.btnScan.style.backgroundColor = 'transparent';
                this.btnScan.style.color = '#00ffff';
                this.btnScan.innerText = 'SCAN LOCAL';
            }
        });
        this.btnScan.addEventListener('click', () => {
            this.isScanActive = !this.isScanActive;
            
            if (this.isScanActive) {
                // Active Tactical State (Inverted Cyan)
                this.btnScan.style.backgroundColor = '#00ffff';
                this.btnScan.style.color = '#000';
                this.btnScan.innerText = 'DISABLE SCAN';
                if (this.onScanRequested) this.onScanRequested(true);
            } else {
                // Default State
                this.btnScan.style.backgroundColor = 'transparent';
                this.btnScan.style.color = '#00ffff';
                this.btnScan.innerText = 'SCAN LOCAL';
                if (this.onScanRequested) this.onScanRequested(false);
            }
        });
        // --- Mobile UI Cycling Logic ---
        if (this.btnMobileToggle) {
            this.btnMobileToggle.addEventListener('click', () => {
                // Cycle the state: 0 -> 1 -> 2 -> 0
                this.mobileUiState = (this.mobileUiState + 1) % 3;
                
                if (this.mobileUiState === 0) {
                    // STATE 0: View Map (Hide Both)
                    this.panelLeft.classList.remove('mobile-active');
                    this.panelRight.classList.remove('mobile-active');
                    this.btnMobileToggle.innerText = 'ACCESS TERMINAL';
                    this.btnMobileToggle.style.color = '#ffcc00';
                    
                } else if (this.mobileUiState === 1) {
                    // STATE 1: View Controls (Left Panel)
                    this.panelLeft.classList.add('mobile-active');
                    this.panelRight.classList.remove('mobile-active');
                    this.btnMobileToggle.innerText = 'VIEW TELEMETRY';
                    this.btnMobileToggle.style.color = '#00ffff'; // Cyan to match radar
                    
                } else {
                    // STATE 2: View Telemetry (Right Panel)
                    this.panelLeft.classList.remove('mobile-active');
                    this.panelRight.classList.add('mobile-active');
                    this.btnMobileToggle.innerText = 'CLOSE TERMINAL';
                    this.btnMobileToggle.style.color = '#ff3333'; // Red for close
                }
            });
        }
    }

    // --- defaultColor parameter ---
    addDatasetToggle(datasetName, category, colorHex, isChecked = false, urls = []) {
        const list = document.getElementById('dataset-list');

        // Container for the row
        const div = document.createElement('div');
        div.className = 'list-item flex-row';
        div.style.justifyContent = 'flex-start';
        div.style.gap = '10px';

        // 1. Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isChecked;
        checkbox.addEventListener('change', (e) => {
            if (this.onDatasetVisibilityChanged) {
                this.onDatasetVisibilityChanged(datasetName, e.target.checked, urls);
            }
        });

        // 2. Color Picker
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = colorHex || '#ffffff';
        colorPicker.style.width = '20px';
        colorPicker.style.height = '20px';
        colorPicker.style.padding = '0';
        colorPicker.style.border = 'none';
        colorPicker.style.cursor = 'pointer';
        colorPicker.style.background = 'transparent';
        colorPicker.addEventListener('input', (e) => {
            if (this.onDatasetColorChanged) {
                this.onDatasetColorChanged(datasetName, e.target.value);
            }
        });

        // 3. Labels
        //TODO: Fix label drag, Sun label offset
        const label = document.createElement('label');
        label.style.cursor = 'pointer';
        label.style.flexGrow = '1';
        label.style.fontSize = '0.75rem';
        label.textContent = `[${category}] ${datasetName.toUpperCase()}`;

        div.appendChild(checkbox);
        div.appendChild(colorPicker);
        div.appendChild(label);
        list.appendChild(div);
}

    getMoonFilters() {
        const dMin = parseFloat(this.distMinEl.value);
        const dMax = parseFloat(this.distMaxEl.value);
        const sMin = parseFloat(this.sizeMinEl.value);
        const sMax = parseFloat(this.sizeMaxEl.value);
        return {
            distMin: Math.min(dMin, dMax),
            distMax: Math.max(dMin, dMax),
            sizeMin: Math.min(sMin, sMax),
            sizeMax: Math.max(sMin, sMax)
        };
    }

    updateTimeInput(date) {
        if (document.activeElement !== this.timeInput) {
            this.timeInput.value = date.toISOString().replace('T', ' ').substring(0, 19);
        }
    }

    setManualOverride(name) {
        this.currentTargetEl.innerHTML = `${name.toUpperCase()} <span style="color: #ff5555;">[MANUAL OVERRIDE]</span>`;
    }

    triggerCRTFlash() {
        this.crtOverlay.style.backgroundColor = "rgba(255, 204, 0, 0.1)";
        setTimeout(() => this.crtOverlay.style.backgroundColor = "transparent", 100);
    }

    updateTargetPanel(data) {
        if (!data) {
            this.currentTargetEl.innerText = "NONE";
            this.telemetryDataEl.innerHTML = `<p>AWAITING DATA INPUT...</p>`;
            return;
        }

        this.currentTargetEl.innerText = data.name.toUpperCase();
        
        // --- INJECT PIN & PURGE BUTTONS FOR CLONES ---
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
        
        // --- PIN/PURGE EVENTS ---
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

    renderBodyList(bodies, currentTargetData) {
        const searchStr = this.searchEl.value.toLowerCase();
        this.listContainer.innerHTML = '';
        
        let targetList = [];
        if (searchStr) {
            targetList = bodies.filter(b => b.data.name.toLowerCase().includes(searchStr));
        } else if (currentTargetData && currentTargetData.parent !== "SUN" && currentTargetData.name !== "SUN") {
            const activeSystemName = currentTargetData.isMoon ? currentTargetData.parent : currentTargetData.name;
            targetList = bodies.filter(b => b.data.parent === activeSystemName);
        } else {
            targetList = bodies.filter(b => !b.isMoon && b.data.name !== "SUN");
        }
        
        targetList.sort((a, b) => {
            if (this.currentSortMode === 'distance') {
                return a.data.a - b.data.a;
            } else {
                const sizeA = a.data.radius_km || (a.data.mass * 1000) || 0;
                const sizeB = b.data.radius_km || (b.data.mass * 1000) || 0;
                return sizeB - sizeA;
            }
        });
        
        const MAX_DOM_ITEMS = 100;
        const displayList = targetList.slice(0, MAX_DOM_ITEMS);
        
        displayList.forEach(b => {
            const div = document.createElement('div');
            div.className = 'list-item';
            const stat = this.currentSortMode === 'distance' ? `${b.data.a.toFixed(4)} AU` : `${(b.data.radius_km||0).toFixed(1)} KM`;
            div.innerHTML = `<span>${b.data.name}</span> <span style="color:#aaa;">[${stat}]</span>`;
            
            div.addEventListener('click', () => {
                if (this.onFocusBody) this.onFocusBody(b.data);
            });
            this.listContainer.appendChild(div);
        });

        if (targetList.length > MAX_DOM_ITEMS) {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.justifyContent = 'center';
            div.style.color = '#ff5555';
            div.style.pointerEvents = 'none';
            div.innerHTML = `<i>[+ ${targetList.length - MAX_DOM_ITEMS} HIDDEN IN LIST]</i>`;
            this.listContainer.appendChild(div);
        }
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

        // Create the container
        this.telemetryDataEl.innerHTML = html;
        
        // Build clickable list items
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
            
            // Re-establish interactivity: Click to track
            div.addEventListener('click', () => {
                if (this.onFocusBody) this.onFocusBody(hit.data);
            });
            
            div.addEventListener('mouseenter', () => div.style.backgroundColor = 'rgba(0, 255, 255, 0.2)');
            div.addEventListener('mouseleave', () => div.style.backgroundColor = 'transparent');
            
            this.telemetryDataEl.appendChild(div);
        });
        
        this.triggerCRTFlash();
    }
}