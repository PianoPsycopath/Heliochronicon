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

        this.onAsteroidLookup = null;
        
        this.initBindings();
    }

    initBindings() {
        // --- 1. DOM Element Grabs ---
        this.timeInput = document.getElementById('time-input-bottom');
        const btnLive = document.getElementById('btn-live');
        const timeSlider = document.getElementById('time-slider');
        const throttleLabel = document.getElementById('throttle-label');
        const chronoWrapper = document.getElementById('chrono-slider-wrapper'); 
        this.chronoCanvas = document.getElementById('chrono-canvas');
        const btnRev = document.getElementById('btn-time-rev');
        const btnFwd = document.getElementById('btn-time-fwd');
        const btnPause = document.getElementById('btn-time-pause');
        const btn1x = document.getElementById('btn-time-1x');

        const resizeCanvas = () => {
            if (this.chronoCanvas) {
                this.chronoCanvas.width = this.chronoCanvas.clientWidth;
                this.chronoCanvas.height = this.chronoCanvas.clientHeight;
            }
        };
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 100);

        this.isLiveTime = true;

        // --- 2. The Throttle Dictionary ---
        // 21 steps (0 to 20). Index 10 is PAUSED. Index 11 is 1x Speed.
        const timeScaleMap = [
            { label: "-100 YEARS / SEC", mult: -3153600000 },
            { label: "-10 YEARS / SEC", mult: -315360000 },
            { label: "-1 YEAR / SEC", mult: -31536000 },
            { label: "-6 MONTHS / SEC", mult: -15552000 },
            { label: "-1 MONTH / SEC", mult: -2592000 },
            { label: "-1 WEEK / SEC", mult: -604800 },
            { label: "-1 DAY / SEC", mult: -86400 },
            { label: "-1 HOUR / SEC", mult: -3600 },
            { label: "-1 MIN / SEC", mult: -60 },
            { label: "-1 SEC / SEC", mult: -1 },
            { label: "PAUSED", mult: 0 },             // Index 10
            { label: "1 SEC / SEC", mult: 1 },        // Index 11
            { label: "1 MIN / SEC", mult: 60 },
            { label: "1 HOUR / SEC", mult: 3600 },
            { label: "1 DAY / SEC", mult: 86400 },
            { label: "1 WEEK / SEC", mult: 604800 },
            { label: "1 MONTH / SEC", mult: 2592000 },
            { label: "6 MONTHS / SEC", mult: 15552000 },
            { label: "1 YEAR / SEC", mult: 31536000 },
            { label: "10 YEARS / SEC", mult: 315360000 },
            { label: "100 YEARS / SEC", mult: 3153600000 }
        ];

        // --- 3. Slider Application Logic ---
        const applyThrottle = (index) => {
            this.isLiveTime = false;
            btnLive.classList.remove('active');
            // Clamp bounds
            index = Math.max(0, Math.min(20, index));
            timeSlider.value = index;

            if (index < 10) {
                timeSlider.classList.add('reversed');
                chronoWrapper.classList.add('reversed');
            } else {
                timeSlider.classList.remove('reversed');
                chronoWrapper.classList.remove('reversed');
            }
            
            const mapping = timeScaleMap[index];
            this.timeMultiplier = mapping.mult;
            throttleLabel.innerText = mapping.label;
            
            if (index === 10) throttleLabel.style.color = "#ff3333"; 
            else if (index < 10) throttleLabel.style.color = "#ff3333"; 
            else throttleLabel.style.color = "#ffcc00"; 
        };

        // --- 4. Wire Controls ---
        timeSlider.addEventListener('input', (e) => applyThrottle(parseInt(e.target.value)));
        btnRev.addEventListener('click', () => applyThrottle(parseInt(timeSlider.value) - 1));
        btnFwd.addEventListener('click', () => applyThrottle(parseInt(timeSlider.value) + 1));
        btnPause.addEventListener('click', () => applyThrottle(10)); // Index 10 is 0x
        btn1x.addEventListener('click', () => applyThrottle(11));    // Index 11 is 1x

        // --- 5. LIVE Button Logic ---
        btnLive.addEventListener('click', () => {
            this.isLiveTime = true;
            btnLive.classList.add('active');
            applyThrottle(11); 
            this.isLiveTime = true; 
            btnLive.classList.add('active'); 
        });

        // --- 6. Manual Time Input ---
        const applyManualTime = () => {
            this.isLiveTime = false;
            btnLive.classList.remove('active');
            
            const parsed = new Date(this.timeInput.value + "Z");
            if (!isNaN(parsed) && this.onTimeChanged) {
                this.onTimeChanged(parsed);
                applyThrottle(10); 
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
        this.searchEl.addEventListener('keypress', (e) => {
            if (e.key !== 'Enter') return;
            const query = this.searchEl.value.trim();
            if (query && this.onAsteroidLookup) this.onAsteroidLookup(query);
        });
        // Disable scan
        
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
        this.drawOscilloscope(date);
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
    drawOscilloscope(currentSimDate) {
        if (!this.chronoCanvas) return;
        const ctx = this.chronoCanvas.getContext('2d');
        const w = this.chronoCanvas.width;
        const h = this.chronoCanvas.height;

        const isReversed = this.timeMultiplier < 0;
        // --- 1. DYNAMIC COLORING ---
        const waveColor = isReversed ? '#ff3333' : '#ffcc00';
        const crossColor = isReversed ? '#ff3333' : '#00ff00';
        const labelColor = isReversed ? 'rgba(255, 51, 51, 0.6)' : 'rgba(255, 204, 0, 0.6)';
  
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for(let i = 0; i < h; i += 4) ctx.fillRect(0, i, w, 1);
        // --- 2. DRAW CRT GRID ---
        ctx.fillStyle = crossColor;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = 1; r <= 2; r++) {
            const yPos = (h / 3) * r;
            for (let c = 0; c <= 20; c++) {
                ctx.fillText('+', (w / 20) * c, yPos - 5);
            }
        }
        // --- 3. DRAW BOTTOM LABELS ---
        if (w > 600) {
            const labels = ["-100Y", "-10Y", "-1Y", "-6M", "-1M", "-1W", "-1D", "-1H", "-1M", "-1S", "PAUSE", "+1S", "+1M", "+1H", "+1D", "+1W", "+1M", "+6M", "+1Y", "+10Y", "+100Y"];
            ctx.fillStyle = labelColor;
            ctx.font = 'bold 9px monospace';
            ctx.textBaseline = 'bottom';
            for (let i = 0; i <= 20; i++) {
                let xPos = (w / 20) * i;
                if (i === 0) ctx.textAlign = 'left';
                else if (i === 20) ctx.textAlign = 'right';
                else ctx.textAlign = 'center';
                ctx.fillText(labels[i], xPos, h - 2);
            }
        }
        if (!currentSimDate) return;
        // --- 4. SYSTEM STATE INITIALIZATION ---
        if (!this.waveBuffer || this.waveBuffer.length !== w) {
            this.waveBuffer = new Array(w).fill(0);
        }
        if (!this.activeBlips) this.activeBlips = [];
        // --- 5. DIRECTION FLIP DETECTION (CRT DEGAUSS EFFECT) ---
        if (this.lastTimeDirection !== undefined && this.lastTimeDirection !== isReversed) {
            this.activeBlips = [];
            for (let i = 0; i < w; i++) {
                this.waveBuffer[i] = (Math.random() - 0.5) * 50; 
            }
            this.glitchFrames = 30; // 30 frames of analog decay
        }
        this.lastTimeDirection = isReversed;
        // --- 6. DUAL-SCALE HIERARCHICAL TIME TRIGGER DETECTION ---
        if (this.lastSimDate && currentSimDate.getTime() !== this.lastSimDate.getTime()) {
            const t1 = this.lastSimDate.getTime();
            const t2 = currentSimDate.getTime();
            
            const y1 = this.lastSimDate.getUTCFullYear();
            const y2 = currentSimDate.getUTCFullYear();
            const m1 = this.lastSimDate.getUTCMonth();
            const m2 = currentSimDate.getUTCMonth();
            const d1 = this.lastSimDate.getUTCDate();
            const d2 = currentSimDate.getUTCDate();

            // Anything > 3600 (1 Hour/Sec) uses Fast Time. Otherwise, Slow Time.
            const absMult = Math.abs(this.timeMultiplier);
            const isFastTime = absMult > 3600; 

            if (isFastTime) {
                // === FAST TIME MODE (>= 1 Day/Sec) ===
                if (y1 !== y2) {
                    const isLeap = (y2 % 4 === 0 && (y2 % 100 !== 0 || y2 % 400 === 0));
                    this.activeBlips.push({ life: 1.0, amp: isLeap ? -20 : 20, shape: 'peak', decay: 0.2 });
                } 
                else if (m1 !== m2) {
                    const daysInMonth = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
                    this.activeBlips.push({ life: 1.0, amp: (daysInMonth === 31) ? 8 : -8, shape: 'hill', decay: 0.1 });
                } 
                else if (d1 !== d2) {
                    this.activeBlips.push({ life: 1.0, amp: (d2 % 2 === 0) ? 4 : -4, shape: 'bump', decay: 0.25 });
                }
            } else {
                // === SLOW TIME MODE (<= 1 Hour/Sec) ===
                const h1 = this.lastSimDate.getUTCHours();
                const h2 = currentSimDate.getUTCHours();
                const halfHour1 = Math.floor(t1 / 1800000); // Unix timestamp divided by 30 mins
                const halfHour2 = Math.floor(t2 / 1800000);
                const sec1 = Math.floor(t1 / 1000);
                const sec2 = Math.floor(t2 / 1000);

                if (d1 !== d2) {
                    // Day
                    this.activeBlips.push({ life: 1.0, amp: 20, shape: 'peak', decay: 0.2 });
                }
                else if (h1 !== h2) {
                    // Hour
                    this.activeBlips.push({ life: 1.0, amp: -12, shape: 'peak', decay: 0.15 }); 
                }
                else if (halfHour1 !== halfHour2) {
                    // 30-Minute
                    this.activeBlips.push({ life: 1.0, amp: 8, shape: 'hill', decay: 0.1 });
                }
                else if (sec1 !== sec2) {
                    // 1 Second
                    this.activeBlips.push({ life: 1.0, amp: (sec2 % 2 === 0) ? 4 : -4, shape: 'bump', decay: 0.25 });
                }
            }
        }
        this.lastSimDate = new Date(currentSimDate.getTime());
        // --- 7. SIGNAL SHAPE GENERATOR ---
        let currentY = 0;
        for (let i = this.activeBlips.length - 1; i >= 0; i--) {
            const b = this.activeBlips[i];
            const t = 1.0 - b.life; 
            
            if (b.shape === 'peak') currentY += b.amp * Math.pow(Math.sin(t * Math.PI), 4);
            else if (b.shape === 'hill') currentY += b.amp * Math.sin(t * Math.PI);
            else if (b.shape === 'bump') currentY += b.amp * Math.sin(t * Math.PI);

            b.life -= b.decay;
            if (b.life <= 0) this.activeBlips.splice(i, 1);
        }
        // --- 8. ANALOG STATIC DECAY ENGINE ---
        if (this.glitchFrames > 0) {
            this.glitchFrames--;
            for (let i = 0; i < w; i++) {
                this.waveBuffer[i] *= 0.85; 
            }
            if (this.glitchFrames === 0) {
                for (let i = 0; i < w; i++) {
                    if (Math.abs(this.waveBuffer[i]) < 1) this.waveBuffer[i] = 0;
                }
            }
        }
        // --- 9. CONSTANT REAL-TIME BUFFER SHIFT ---
        if (isReversed) {
            this.waveBuffer.pop(); 
            this.waveBuffer.unshift(currentY); 
        } else {
            this.waveBuffer.shift(); 
            this.waveBuffer.push(currentY); 
        }
        // --- 10. RENDER THE WAVEFORM (WITH INVERSION) ---
        ctx.beginPath();
        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        const centerY = (h / 2) - 5; 

        for (let x = 0; x < w; x++) {
            const displayY = isReversed ? -this.waveBuffer[x] : this.waveBuffer[x];
            const drawY = centerY - displayY;
            
            if (x === 0) ctx.moveTo(x, drawY);
            else ctx.lineTo(x, drawY);
        }
        ctx.stroke();
        // --- 11. DYNAMIC SCANNER BRACKET ---
        const scanX = isReversed ? 1 : w - 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(scanX, 0, 2, h - 12);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        const dir = isReversed ? 1 : -1;
        ctx.moveTo(scanX + (dir * 10), centerY - 10); ctx.lineTo(scanX, centerY - 10);
        ctx.moveTo(scanX + (dir * 10), centerY + 10); ctx.lineTo(scanX, centerY + 10);
        ctx.stroke();
    }
}