// js/UIController.js
import { ChronometerDisplay } from './ChronometerDisplay.js';
import { TimeThrottle } from './TimeThrottle.js';
import { BodyListManager } from './BodyListManager.js';
import { TelemetryManager } from './TelemetryManager.js';
import { VisibilityTreeManager } from './VisibilityTreeManager.js';

export class UIController {
    constructor() {
        this.datasets = new Set();
        this.timeThrottle = new TimeThrottle({
            timeSlider: document.getElementById('time-slider'),
            throttleLabel: document.getElementById('throttle-label'),
            chronoWrapper: document.getElementById('chrono-slider-wrapper'),
            btnRev: document.getElementById('btn-time-rev'),
            btnFwd: document.getElementById('btn-time-fwd'),
            btnPause: document.getElementById('btn-time-pause'),
            btn1x: document.getElementById('btn-time-1x'),
            btnLive: document.getElementById('btn-live')
        });
        this.bodyListManager = new BodyListManager({
            listContainer: document.getElementById('body-list'),
            searchEl: document.getElementById('search-input'),
            sortToggleEl: document.getElementById('sort-toggle')
        });
        this.telemetryManager = new TelemetryManager();
        this.visibilityTreeManager = new VisibilityTreeManager();

        this.btnMobileToggle = document.getElementById('btn-mobile-toggle');
        this.panelLeft = document.getElementById('panel-left');
        this.panelRight = document.getElementById('panel-right');

        this.mobileUiState = 0;
        
        this.distMinEl = document.getElementById('moon-dist-min');
        this.distMaxEl = document.getElementById('moon-dist-max');
        this.sizeMinEl = document.getElementById('moon-size-min');
        this.sizeMaxEl = document.getElementById('moon-size-max');
        this.distValEl = document.getElementById('dist-val');
        this.sizeValEl = document.getElementById('size-val');
        
        this.btnScan = document.getElementById('btn-scan');
        this.isScanActive = false;

        // Callbacks from main.js
        this.onFocusBody = null;
        this.onTimeChanged = null;
        this.onClearData = null;
        this.onRefreshList = null;
        this.onDatasetVisibilityChanged = null;
        this.onDatasetColorChanged = null;
        this.onPinRequested = null;
        this.onPurgeRequested = null;
        this.onScanRequested = null;
        this.onAsteroidLookup = null;
        this.onPinStarRequested = null;

        // Route internal manager events to UIController callbacks
        this.bodyListManager.onFocusBody = (data) => { if (this.onFocusBody) this.onFocusBody(data); };
        this.bodyListManager.onRefreshList = () => { if (this.onRefreshList) this.onRefreshList(); };
        this.bodyListManager.onAsteroidLookup = (query) => { if (this.onAsteroidLookup) this.onAsteroidLookup(query); };
        
        this.telemetryManager.onPinRequested = (data) => { if (this.onPinRequested) this.onPinRequested(data); };
        this.telemetryManager.onPurgeRequested = (data) => { if (this.onPurgeRequested) this.onPurgeRequested(data); };
        this.telemetryManager.onFocusBody = (data) => { if (this.onFocusBody) this.onFocusBody(data); };
        this.telemetryManager.onPinStarRequested = (data) => { if (this.onPinStarRequested) this.onPinStarRequested(data); };

        this.visibilityTreeManager.onDatasetVisibilityChanged = async (name, state, urls) => {
            if (this.onDatasetVisibilityChanged) await this.onDatasetVisibilityChanged(name, state, urls);
        };
        this.visibilityTreeManager.onDatasetColorChanged = (name, color) => {
            if (this.onDatasetColorChanged) this.onDatasetColorChanged(name, color);
        };
        
        
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

        // --- MEASUREMENT TOGGLE ---
        this.btnMeasure = document.getElementById('btn-measure');
        this.isMeasureMode = false;
        this.onMeasureModeChanged = null;

        this.btnDaylightToggle = document.getElementById('btn-daylight-toggle');
        this.isDaylightEnabled = true;
        this.onDaylightToggleChanged = null;

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
                this.mobileUiState = (this.mobileUiState + 1) % 3;
                document.body.classList.toggle('panels-open', this.mobileUiState !== 0);
                if (this.mobileUiState === 0) {
                    this.panelLeft.classList.remove('mobile-active');
                    this.panelRight.classList.remove('mobile-active');
                    this.btnMobileToggle.innerText = 'ACCESS TERMINAL';
                    this.btnMobileToggle.style.color = '#ffcc00';
                } else if (this.mobileUiState === 1) {
                    this.panelLeft.classList.add('mobile-active');
                    this.panelRight.classList.remove('mobile-active');
                    this.btnMobileToggle.innerText = 'VIEW TELEMETRY';
                    this.btnMobileToggle.style.color = '#00ffff'; 
                } else {
                    this.panelLeft.classList.remove('mobile-active');
                    this.panelRight.classList.add('mobile-active');
                    this.btnMobileToggle.innerText = 'CLOSE TERMINAL';
                    this.btnMobileToggle.style.color = '#ff3333'; 
                }
            });
        }

        if (this.btnMeasure) {
            this.btnMeasure.addEventListener('click', () => {
                this.isMeasureMode = !this.isMeasureMode;
                
                // Pure CSS class toggle (HTML/CSS handles the visuals)
                if (this.isMeasureMode) {
                    this.btnMeasure.classList.add('active');
                } else {
                    this.btnMeasure.classList.remove('active');
                }
                
                if (this.onMeasureModeChanged) {
                    this.onMeasureModeChanged(this.isMeasureMode);
                }
            });
        }

        if (this.btnDaylightToggle) {
            this.btnDaylightToggle.addEventListener('click', () => {
                this.isDaylightEnabled = !this.isDaylightEnabled;
                this.btnDaylightToggle.classList.toggle('active', this.isDaylightEnabled);

                if (this.onDaylightToggleChanged) {
                    this.onDaylightToggleChanged(this.isDaylightEnabled);
                }
            });
        }

        if (this.btnMeasure && this.btnDaylightToggle) {
            const bottomDeck = document.getElementById('bottom-deck');
            const syncToggleLayout = () => {
                const measureRect = this.btnMeasure.getBoundingClientRect();
                if (measureRect.height > 0) {
                    this.btnDaylightToggle.style.height = `${measureRect.height}px`;
                    this.btnDaylightToggle.style.width = `${measureRect.height}px`;
                }
                if (bottomDeck) {
                    const deckRect = bottomDeck.getBoundingClientRect();
                    const gap = measureRect.left - deckRect.left;
                    if (gap > 0) this.btnDaylightToggle.style.marginLeft = `${gap}px`;
                }
            };
            syncToggleLayout();
            window.addEventListener('resize', syncToggleLayout);
        }

        // --- PURGE SYSTEM MEMORY ---
        document.getElementById('btn-clear-map').addEventListener('click', () => {
            if (this.onClearData) {
                this.onClearData();
                this.datasets.clear();
                
                this.visibilityTreeManager.clearTrees();
                
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

    // --- Sub-manager Passthroughs ---
    addDatasetToggle(datasetName, category, colorHex, isChecked = false, urls = []) {
        this.visibilityTreeManager.addDatasetToggle(datasetName, category, colorHex, isChecked, urls);
    }
    
    updateTargetPanel(data) {
        this.telemetryManager.updateTargetPanel(data);
    }

    updateLiveTelemetry(wDeg, raDeg, decDeg) {
        this.telemetryManager.updateLiveTelemetry(wDeg, raDeg, decDeg);
    }
    
    renderScanResults(results, referenceName) {
        this.telemetryManager.renderScanResults(results, referenceName);
    }

    setManualOverride(name) {
        this.telemetryManager.setManualOverride(name);
    }

    renderBodyList(bodies, currentTargetData) {
        this.bodyListManager.render(bodies, currentTargetData);
    }

    showLookupPending(query) {
        this.telemetryManager.showLookupPending(query);
    }

    showScanningStatus() {
        this.telemetryManager.showScanningStatus();
    }

    showLookupNotFound(query) {
        this.telemetryManager.showLookupNotFound(query);
    }

    showStarSelection(data) {
        this.telemetryManager.showStarSelection(data);
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
}