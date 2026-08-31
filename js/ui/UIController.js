// js/ui/UIController.js
import { ChronometerDisplay } from '@ui/ChronometerDisplay.js';
import { PerformanceMonitor } from '@ui/PerformanceMonitor.js';
import { TimeThrottle } from '@ui/TimeThrottle.js';
import { BodyListManager } from '@ui/BodyListManager.js';
import { TelemetryManager } from '@ui/TelemetryManager.js';
import { VisibilityTreeManager } from '@ui/VisibilityTreeManager.js';
import { AccessibilityManager } from '@ui/AccessibilityManager.js';

const CURTAIN_MODES = [
    { label: 'Inclination Mode 1 [Equatorial]' },
    { className: 'mode-both', label: 'Inclination Mode 2 [Equatorial + Ecliptic]' },
    { className: 'mode-ecliptic', label: 'Inclination Mode 3 [Ecliptic]' },
].map((mode) => ({ ...mode, tooltip: mode.label }));

export class UIController {
    constructor({
        tooltipManager = null,
        accessibilityManager = null,
        initialDisplayMode = 'shapes',
    } = {}) {
        this.tooltipManager = tooltipManager;
        this.a11y = accessibilityManager ?? new AccessibilityManager({ tooltipManager });

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
            accessibilityManager: this.a11y,
        });
        this.bodyListManager = new BodyListManager({
            listContainer: document.getElementById('body-list'),
            searchEl: document.getElementById('search-input'),
            sortToggleEl: document.getElementById('sort-toggle'),
        });
        this.telemetryManager = new TelemetryManager();
        this.visibilityTreeManager = new VisibilityTreeManager({
            accessibilityManager: this.a11y,
            initialDisplayMode,
        });

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

        this.onFocusBody = null;
        this.onTimeChanged = null;
        this.onClearData = null;
        this.onRefreshList = null;
        this.onDatasetVisibilityChanged = null;
        this.onDatasetColorChanged = null;
        this.onDatasetDisplayModeChanged = null;
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
        this.visibilityTreeManager.onDatasetDisplayModeChanged = async (name, mode) => {
            if (this.onDatasetDisplayModeChanged) {
                await this.onDatasetDisplayModeChanged(name, mode);
            }
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
        this.timeInput = document.getElementById('time-input-bottom');
        this.chronoCanvas = document.getElementById('chrono-canvas');
        this.chronometerDisplay = new ChronometerDisplay(this.chronoCanvas);
        this.performanceMonitor = new PerformanceMonitor();

        this.btnMeasure = document.getElementById('btn-measure');
        this.isMeasureMode = false;
        this.onMeasureModeChanged = null;

        this.btnDaylightToggle = document.getElementById('btn-daylight-toggle');
        this.isDaylightEnabled = true;
        this.onDaylightToggleChanged = null;

        this.btnEclipticToggle = document.getElementById('btn-ecliptic-toggle');
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

        this.a11yScan = this.a11y.register({
            element: this.btnScan,
            kind: 'toggle',
            tooltipLive: true, // keep tooltip visible through the click; text doesn't change
            pressed: this.isScanActive,
            onActivate: () => {
                this.isScanActive = !this.isScanActive;
                this.a11yScan.setPressed(this.isScanActive);
                if (this.onScanRequested) this.onScanRequested(this.isScanActive);
            },
        });

        if (this.btnMeasure) {
            const a11yMeasure = this.a11y.register({
                element: this.btnMeasure,
                kind: 'toggle',
                tooltipLive: true, // state changes should refresh the tooltip immediately
                pressed: this.isMeasureMode,
                onActivate: () => {
                    this.isMeasureMode = !this.isMeasureMode;
                    a11yMeasure.setPressed(this.isMeasureMode);
                    if (this.onMeasureModeChanged) this.onMeasureModeChanged(this.isMeasureMode);
                },
            });
        }

        if (this.btnDaylightToggle) {
            const a11yDaylight = this.a11y.register({
                element: this.btnDaylightToggle,
                kind: 'toggle',
                tooltipLive: true,
                pressed: this.isDaylightEnabled,
                onActivate: () => {
                    this.isDaylightEnabled = !this.isDaylightEnabled;
                    a11yDaylight.setPressed(this.isDaylightEnabled);
                    if (this.onDaylightToggleChanged) {
                        this.onDaylightToggleChanged(this.isDaylightEnabled);
                    }
                },
            });
        }

        if (this.btnEclipticToggle) {
            const a11yEcliptic = this.a11y.register({
                element: this.btnEclipticToggle,
                kind: 'cycle',
                tooltipLive: true,
                states: CURTAIN_MODES,
                onActivate: () => {
                    this.curtainDisplayMode = a11yEcliptic.nextState();
                    if (this.onCurtainDisplayModeChanged) {
                        this.onCurtainDisplayModeChanged(this.curtainDisplayMode);
                    }
                },
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
                this.a11yScan.setPressed(false);
            }
        });

        const btnTabSearch = document.getElementById('btn-tab-search');
        const btnTabVis = document.getElementById('btn-tab-vis');
        const btnTabSettings = document.getElementById('btn-tab-settings'); // NEW
        const tabSearch = document.getElementById('tab-search');
        const tabVisibility = document.getElementById('tab-visibility');
        const tabSettings = document.getElementById('tab-settings'); // NEW

        if (btnTabSearch && btnTabVis && btnTabSettings) {
            const tabs = [
                { btn: btnTabSearch, panel: tabSearch },
                { btn: btnTabVis, panel: tabVisibility },
                { btn: btnTabSettings, panel: tabSettings },
            ];

            const activateTab = (index, moveFocus) => {
                tabs.forEach((entry, entryIndex) => {
                    const isActive = entryIndex === index;
                    entry.btn.classList.toggle('active', isActive);
                    entry.btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                    entry.btn.tabIndex = isActive ? 0 : -1;
                    entry.panel.classList.toggle('active', isActive);
                    entry.panel.hidden = !isActive;
                });
                if (moveFocus) tabs[index].btn.focus();
            };

            tabs.forEach((entry, index) => {
                entry.btn.addEventListener('click', () => activateTab(index, false));
                entry.btn.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        activateTab((index + 1) % tabs.length, true);
                    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        activateTab((index - 1 + tabs.length) % tabs.length, true);
                    } else if (e.key === 'Home') {
                        e.preventDefault();
                        activateTab(0, true);
                    } else if (e.key === 'End') {
                        e.preventDefault();
                        activateTab(tabs.length - 1, true);
                    }
                });
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
    syncMasterToggle() {
        this.visibilityTreeManager.syncMasterToggle();
    }
}
