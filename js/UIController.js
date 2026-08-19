// js/UIController.js
import { ChronometerDisplay } from './ChronometerDisplay.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { TimeThrottle } from './TimeThrottle.js';
import { BodyListManager } from './BodyListManager.js';
import { TelemetryManager } from './TelemetryManager.js';
import { VisibilityTreeManager } from './VisibilityTreeManager.js';

const CURTAIN_MODE_TITLES = [
    'Inclination Mode 1 [Equatorial]',
    'Inclination Mode 2 [Equatorial + Ecliptic]',
    'Inclination Mode 3 [Ecliptic]',
];

export class UIController {
    constructor(ctx = {}) {
        // Optional so UIController works standalone; falls back to native title.
        this.tooltipManager = ctx.tooltipManager || null;

        this.datasets = new Set();
        this.timeThrottle = new TimeThrottle({
            timeSlider: document.getElementById('time-slider'),
            throttleLabel: document.getElementById('throttle-label'),
            chronoWrapper: document.getElementById('chrono-slider-wrapper'),
            btnRev: document.getElementById('btn-time-rev'),
            btnFwd: document.getElementById('btn-time-fwd'),
            btnPause: document.getElementById('btn-time-pause'),
            btn1x: document.getElementById('btn-time-1x'),
            btnLive: document.getElementById('btn-live'),
        });
        this.bodyListManager = new BodyListManager({
            listContainer: document.getElementById('body-list'),
            searchEl: document.getElementById('search-input'),
            sortToggleEl: document.getElementById('sort-toggle'),
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
        if (this.btnScan) this.btnScan.dataset.tooltipLive = '';
        this.isScanActive = false;

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

        this.bodyListManager.onFocusBody = (data) => {
            if (this.onFocusBody) this.onFocusBody(data);
        };
        this.bodyListManager.onRefreshList = () => {
            if (this.onRefreshList) this.onRefreshList();
        };
        this.bodyListManager.onAsteroidLookup = (query) => {
            if (this.onAsteroidLookup) this.onAsteroidLookup(query);
        };

        this.telemetryManager.onPinRequested = (data) => {
            if (this.onPinRequested) this.onPinRequested(data);
        };
        this.telemetryManager.onPurgeRequested = (data) => {
            if (this.onPurgeRequested) this.onPurgeRequested(data);
        };
        this.telemetryManager.onFocusBody = (data) => {
            if (this.onFocusBody) this.onFocusBody(data);
        };
        this.telemetryManager.onPinStarRequested = (data) => {
            if (this.onPinStarRequested) this.onPinStarRequested(data);
        };

        this.telemetryManager.onEclipseNavRequested = (dir) => {
            if (this.onEclipseNavRequested) this.onEclipseNavRequested(dir);
        };

        this.visibilityTreeManager.onDatasetVisibilityChanged = async (name, state, urls) => {
            if (this.onDatasetVisibilityChanged)
                await this.onDatasetVisibilityChanged(name, state, urls);
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

    // Refresh through TooltipManager when present; otherwise use native title.
    _setTooltip(el, text) {
        if (!el) return;
        if (this.tooltipManager) {
            this.tooltipManager.setButtonTooltip(el, text);
        } else {
            el.title = text;
        }
    }

    _applyCurtainModeVisuals(mode) {
        if (!this.btnEclipticToggle) return;
        this.btnEclipticToggle.classList.remove('mode-both', 'mode-ecliptic');
        this.btnEclipticToggle.classList.toggle('active', mode !== 0);
        if (mode === 1) this.btnEclipticToggle.classList.add('mode-both');
        if (mode === 2) this.btnEclipticToggle.classList.add('mode-ecliptic');
        this._setTooltip(this.btnEclipticToggle, CURTAIN_MODE_TITLES[mode]);
    }

    initBindings() {
        this.timeInput = document.getElementById('time-input-bottom');
        this.chronoCanvas = document.getElementById('chrono-canvas');
        this.chronometerDisplay = new ChronometerDisplay(this.chronoCanvas);
        this.performanceMonitor = new PerformanceMonitor();

        this.btnMeasure = document.getElementById('btn-measure');
        // Live tooltips survive click so state changes refresh immediately.
        if (this.btnMeasure) this.btnMeasure.dataset.tooltipLive = '';
        this.isMeasureMode = false;
        this.onMeasureModeChanged = null;

        this.btnDaylightToggle = document.getElementById('btn-daylight-toggle');
        if (this.btnDaylightToggle) this.btnDaylightToggle.dataset.tooltipLive = '';
        this.isDaylightEnabled = true;
        this.onDaylightToggleChanged = null;

        this.btnEclipticToggle = document.getElementById('btn-ecliptic-toggle');
        if (this.btnEclipticToggle) this.btnEclipticToggle.dataset.tooltipLive = '';
        this.curtainDisplayMode = 0;
        this.onCurtainDisplayModeChanged = null;

        const applyManualTime = () => {
            const parsed = new Date(this.timeInput.value + 'Z');
            if (!isNaN(parsed) && this.onTimeChanged) {
                this.onTimeChanged(parsed);
                this.timeThrottle.pauseForManualInput();
            }
        };

        this.timeInput.addEventListener('blur', applyManualTime);
        this.timeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyManualTime();
                this.timeInput.blur();
            }
        });

        const updateSliders = () => {
            const dMin = parseFloat(this.distMinEl.value);
            const dMax = parseFloat(this.distMaxEl.value);
            this.distValEl.innerText = `${Math.min(dMin, dMax).toFixed(3)} - ${Math.max(dMin, dMax).toFixed(3)}`;

            const sMin = parseFloat(this.sizeMinEl.value);
            const sMax = parseFloat(this.sizeMaxEl.value);
            this.sizeValEl.innerText = `${Math.min(sMin, sMax)} - ${Math.max(sMin, sMax)}`;
        };
        [this.distMinEl, this.distMaxEl, this.sizeMinEl, this.sizeMaxEl].forEach((el) =>
            el.addEventListener('input', updateSliders)
        );

        this.btnScan.addEventListener('click', () => {
            this.isScanActive = !this.isScanActive;
            this.btnScan.classList.toggle('active', this.isScanActive);
            if (this.onScanRequested) {
                this.onScanRequested(this.isScanActive);
            }
        });

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
                this.btnMeasure.classList.toggle('active', this.isMeasureMode);
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

        if (this.btnEclipticToggle) {
            this._applyCurtainModeVisuals(this.curtainDisplayMode);

            this.btnEclipticToggle.addEventListener('click', () => {
                this.curtainDisplayMode = (this.curtainDisplayMode + 1) % 3;
                this._applyCurtainModeVisuals(this.curtainDisplayMode);
                if (this.onCurtainDisplayModeChanged) {
                    this.onCurtainDisplayModeChanged(this.curtainDisplayMode);
                }
            });
        }

        if (this.btnMeasure && (this.btnDaylightToggle || this.btnEclipticToggle)) {
            const bottomDeck = document.getElementById('bottom-deck');
            const iconToggleButtons = [this.btnDaylightToggle, this.btnEclipticToggle].filter(
                Boolean
            );
            const syncToggleLayout = () => {
                const measureRect = this.btnMeasure.getBoundingClientRect();
                if (measureRect.height > 0) {
                    iconToggleButtons.forEach((btn) => {
                        btn.style.height = `${measureRect.height}px`;
                        btn.style.width = `${measureRect.height}px`;
                    });
                }
                if (bottomDeck) {
                    const deckRect = bottomDeck.getBoundingClientRect();
                    const gap = measureRect.left - deckRect.left;
                    if (gap > 0) {
                        iconToggleButtons.forEach((btn) => {
                            btn.style.marginLeft = `${gap}px`;
                        });
                    }
                }
            };
            syncToggleLayout();
            window.addEventListener('resize', syncToggleLayout);
        }

        document.getElementById('btn-clear-map').addEventListener('click', () => {
            if (this.onClearData) {
                this.onClearData();
                this.datasets.clear();
                this.visibilityTreeManager.clearTrees();
                this.isScanActive = false;
                this.btnScan.classList.remove('active');
            }
        });

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

    // Re-wire tooltips after dynamic content is inserted (idempotent).
    addDatasetToggle(datasetName, category, colorHex, isChecked = false, urls = []) {
        this.visibilityTreeManager.addDatasetToggle(
            datasetName,
            category,
            colorHex,
            isChecked,
            urls
        );
        if (this.tooltipManager) this.tooltipManager.attachButtonTooltips();
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
        if (this.tooltipManager) this.tooltipManager.attachButtonTooltips();
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
            sizeMax: Math.max(sMin, sMax),
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

    // Called only on PerformanceMonitor throttled samples, not every frame.
    updatePerf(perfSample) {
        if (this.chronometerDisplay) {
            this.chronometerDisplay.pushPerfSample(perfSample);
        }
    }
}
