// js/PerformanceMonitor.js

// Accumulate O(1) per-frame performance metrics.
// Push returned non-null samples into the display buffer on the sampleIntervalMs throttle.
// The loadPct metric represents the consumed 16.6ms frame budget.
// The memory metric represents JS heap usage (Chromium only).
export class PerformanceMonitor {
    constructor({ sampleIntervalMs = 250 } = {}) {
        this.sampleIntervalMs = sampleIntervalMs;
        this.frameCount = 0;
        this.accumMs = 0;
        this.loadAccum = 0;
        this.fps = 0;
    }

    // Sample performance metrics over the specified interval.
    tick(deltaSec) {
        this.frameCount++;
        this.accumMs += deltaSec * 1000;

        // Accumulate frame-budget load to calculate the interval average.
        const frameLoadPct = (deltaSec / (1 / 60)) * 100;
        this.loadAccum += Math.min(frameLoadPct, 200); // Clamp runaway frame load spikes.

        if (this.accumMs >= this.sampleIntervalMs) {
            this.fps = Math.round((this.frameCount * 1000) / this.accumMs);
            const loadPct = Math.round(this.loadAccum / this.frameCount);
            const memory = this._readMemory();

            this.frameCount = 0;
            this.accumMs = 0;
            this.loadAccum = 0;

            return { fps: this.fps, loadPct, memory };
        }
        return null;
    }

    _readMemory() {
        const m = performance.memory;
        if (!m) return null;
        return {
            usedMB: Math.round(m.usedJSHeapSize / 1048576),
            pctOfLimit: Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100),
        };
    }
}
