// js/UIController.js
import { ChronometerDisplay } from './ChronometerDisplay.js';
import { TimeThrottle } from './TimeThrottle.js';
import { BodyListManager } from './BodyListManager.js';

export class UIController {
    constructor() {
        this.currentSortMode = 'distance';
        this.datasets = new Set();
        this.timeThrottle = new TimeThrottle();
        this.bodyListManager = new BodyListManager();

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

        this.onAsteroidLookup = null;

        this.bodyListManager.onFocusBody = (data) => { if (this.onFocusBody) this.onFocusBody(data); };
        this.bodyListManager.onRefreshList = () => { if (this.onRefreshList) this.onRefreshList(); };
        this.bodyListManager.onAsteroidLookup = (query) => { if (this.onAsteroidLookup) this.onAsteroidLookup(query); };
        
        this.initBindings();
    }
    get timeMultiplier() {
            return this.timeThrottle.timeMultiplier;
        }
    get isLiveTime() {
        return this.timeThrottle.isLiveTime;
    }
    initBindings() {
        
        // --- Manual Time Input ---
        this.timeInput = document.getElementById('time-input-bottom');
        this.chronoCanvas = document.getElementById('chrono-canvas');
        this.chronometerDisplay = new ChronometerDisplay(this.chronoCanvas);

        const applyManualTime = () => {
            const parsed = new Date(this.timeInput.value + "Z");
            if (!isNaN(parsed) && this.onTimeChanged) {
                this.onTimeChanged(parsed);
                this.timeThrottle.pauseForManualInput();
            }
        };

        this.timeInput.addEventListener('blur', applyManualTime);
        this.timeInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') { applyManualTime(); this.timeInput.blur(); } 
        });

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

        // Scan For Nearby Asteroids
        this.btnScan.addEventListener('click', () => {
            this.isScanActive = !this.isScanActive;
            this.btnScan.classList.toggle('active', this.isScanActive);
            if (this.onScanRequested) {
                this.onScanRequested(this.isScanActive);
            }
        });
        // --- Mobile UI Cycling Logic ---
        if (this.btnMobileToggle) {
            this.btnMobileToggle.addEventListener('click', () => {
                // Cycle the state: 0 -> 1 -> 2 -> 0
                this.mobileUiState = (this.mobileUiState + 1) % 3;
                document.body.classList.toggle('panels-open', this.mobileUiState !== 0);
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
        const rowMaster = document.getElementById('row-master-toggle');
        const magiTrunk = document.getElementById('magi-trunk');
        
        if (rowMaster) {
            rowMaster.addEventListener('click', async () => {
                if (rowMaster.classList.contains('loading')) return;

                const newState = !rowMaster.classList.contains('checked');
                
                rowMaster.classList.toggle('checked', newState);
                rowMaster.classList.add('loading');

                const allAsteroids = document.querySelectorAll('#dataset-list-asteroids .magi-row');
                const loadingPromises = [];

                allAsteroids.forEach(row => {
                    if (row.classList.contains('checked') !== newState) {
                        row.click(); // Programmatically sync children
                        if (row.togglePromise) {
                            loadingPromises.push(row.togglePromise);
                        }
                    }
                });
                await Promise.all(loadingPromises);
                
                rowMaster.classList.remove('loading');
            });
        }

        // --- PURGE SYSTEM MEMORY ---
        document.getElementById('btn-clear-map').addEventListener('click', () => {
            if (this.onClearData) {
                this.onClearData();
                this.datasets.clear();
                
                // Clear both trees
                const planetList = document.getElementById('dataset-list-planets');
                const asteroidList = document.getElementById('dataset-list-asteroids');
                if (planetList) planetList.innerHTML = '';
                if (asteroidList) asteroidList.innerHTML = '';
                
                // Reset Master Toggle & Trunk
                if (rowMaster) rowMaster.classList.remove('checked');
                if (magiTrunk) magiTrunk.classList.remove('checked');
                
                this.isScanActive = false;
                this.btnScan.classList.remove('active');
            }
        });
        // --- Tab Navigation Logic ---
        const btnTabSearch = document.getElementById('btn-tab-search');
        const btnTabVis = document.getElementById('btn-tab-vis');
        const tabSearch = document.getElementById('tab-search');
        const tabVisibility = document.getElementById('tab-visibility');

        if (btnTabSearch && btnTabVis) {
            btnTabSearch.addEventListener('click', () => {
                btnTabSearch.classList.add('active');
                btnTabVis.classList.remove('active');
                tabSearch.classList.add('active');
                tabVisibility.classList.remove('active');
            });

            btnTabVis.addEventListener('click', () => {
                btnTabVis.classList.add('active');
                btnTabSearch.classList.remove('active');
                tabVisibility.classList.add('active');
                tabSearch.classList.remove('active');
            });
        }
    }
    // --- defaultColor parameter ---
    addDatasetToggle(datasetName, category, colorHex, isChecked = false, urls = []) {
        const isPlanet = category === 'PLANET';
        const isMoon = category === 'MOON';
        const isRightSide = isPlanet || isMoon;
        const targetListId = isRightSide ? 'dataset-list-planets' : 'dataset-list-asteroids';
        const list = document.getElementById(targetListId);
        
        if (!list) return;

        // 1. Build the Base Row
        const row = document.createElement('div');
        row.className = `magi-row ${isPlanet ? 'planet-row' : ''} ${isMoon ? 'moon-row' : ''} ${isChecked ? 'checked' : ''}`;
        row.dataset.category = category; 

        // 2. Build the SVG Circuit Wire
        const SVG_NS = 'http://www.w3.org/2000/svg';
        let wire = null;

        if (isMoon) {
            wire = document.createElementNS(SVG_NS, 'svg');
            wire.setAttribute('class', 'magi-svg-wire-moon');
            const poly = document.createElementNS(SVG_NS, 'polyline');
            poly.setAttribute('points', '15,1 0,1 0,-29');
            wire.appendChild(poly);
            
            [[15,1], [0,1], [0,-29]].forEach(coord => {
                const circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('cx', coord[0]); circle.setAttribute('cy', coord[1]); circle.setAttribute('r', '1.5');
                wire.appendChild(circle);
            });
        } else if (!isPlanet) { 
            wire = document.createElementNS(SVG_NS, 'svg');
            wire.setAttribute('class', 'magi-svg-wire');
            const poly = document.createElementNS(SVG_NS, 'polyline');
            poly.setAttribute('points', '0,1 15,1 15,-29');
            wire.appendChild(poly);
            
            [[0,1], [15,1], [15,-29]].forEach(coord => {
                const circle = document.createElementNS(SVG_NS, 'circle');
                circle.setAttribute('cx', coord[0]); circle.setAttribute('cy', coord[1]); circle.setAttribute('r', '1.5');
                wire.appendChild(circle);
            });
        }
        // 3. Build the Slanted Box
        const btn = document.createElement('div');
        btn.className = 'magi-btn';
        
        const status = document.createElement('div');
        status.className = 'magi-status';
        
        // 4. Build the Text Label (With precise truncation)
        const label = document.createElement('span');
        label.className = 'magi-label';
        
        let displayName = datasetName.toUpperCase();
        const maxChars = isRightSide ? 14 : 10;
        if (displayName.length > maxChars) {
            displayName = displayName.substring(0, maxChars) + '.';
        }
        label.textContent = displayName;

        let bar = null;
        let colorPicker = null;

        // 5. Build Asteroid Color Logic and Planet Checkboxes
        if (!isRightSide) {
            bar = document.createElement('div');
            bar.className = 'magi-bar';
            bar.style.backgroundColor = isChecked ? colorHex : '#330000';
            bar.appendChild(label); 
            
            colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = colorHex || '#ffffff';
            colorPicker.className = 'magi-color-picker';
            bar.appendChild(colorPicker);

            colorPicker.addEventListener('input', (e) => {
                if (row.classList.contains('checked')) {
                    bar.style.backgroundColor = e.target.value;
                }
            });
            colorPicker.addEventListener('change', (e) => {
                if (this.onDatasetColorChanged) {
                    this.onDatasetColorChanged(datasetName, e.target.value);
                }
            });
            btn.appendChild(bar);
            btn.appendChild(status);
        } else {
            status.appendChild(label); 
            btn.appendChild(status);
        }
        // 6. TRUNK WIRING LOGIC
        if (isPlanet) {
            row.appendChild(btn);
        } else if (isMoon) {
            row.appendChild(wire); 
            row.appendChild(btn);
        } else {
            row.appendChild(btn);  
            row.appendChild(wire);
        }
        // 7. Click Handling & Parent/Child Logic
        row.addEventListener('click', async (e) => {
            if (colorPicker && e.target === colorPicker) return;
            
            if (row.classList.contains('loading')) return;
            
            const newState = !row.classList.contains('checked');
            row.classList.toggle('checked', newState);
            
            if (bar) {
                bar.style.backgroundColor = newState ? colorPicker.value : '#330000';
            }

            row.classList.add('loading');

            row.togglePromise = (async () => {
                try {
                    // Tell the engine to load the 3D data first
                    if (this.onDatasetVisibilityChanged) {
                        await this.onDatasetVisibilityChanged(datasetName, newState, urls);
                    }
                    if (newState && colorPicker && this.onDatasetColorChanged) {
                        this.onDatasetColorChanged(datasetName, colorPicker.value);
                    }

                    if (category === 'PLANET') {
                        const moonRows = document.querySelectorAll('#dataset-list-planets .moon-row');
                        moonRows.forEach(mRow => {
                            if (mRow.classList.contains('checked') !== newState) {
                                mRow.click(); 
                            }
                        });
                    }
                } finally {
                    row.classList.remove('loading');
                }
            })();

            await row.togglePromise;
        });

        list.appendChild(row);
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
        if (this.chronometerDisplay) {
            this.chronometerDisplay.render(date, this.timeMultiplier);
        }
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
        this.bodyListManager.render(bodies, currentTargetData);
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