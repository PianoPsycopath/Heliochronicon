// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PorkchopPanel } from '../PorkchopPanel.js';
import { createTransferField } from '../../physics/mission/TransferField.js';

global.ResizeObserver = vi.fn().mockImplementation(function () {
    return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
    };
});

const solverDefinition = {
    id: 'LAMBERT_UNIVERSAL',
    name: 'Lambert Universal Variables Solver',
    family: 'IMPULSIVE',
    supportedTargetTypes: ['BODY_CENTER'],
    capabilities: [],
};

function stubCanvasContext() {
    const ctx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        stroke: vi.fn(),
        setTransform: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    return ctx;
}

function stubLayout(width, height) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width,
        height,
    });
}

function buildField() {
    return createTransferField({
        departureTimes_daysSinceJ2000: [0, 10],
        arrivalTimes_daysSinceJ2000: [100, 110],
        deltaV_kmps: [[5, 4], [3, 2]],
        departureDeltaV_kmps: [[2, 2], [1, 1]],
        arrivalDeltaV_kmps: [[3, 2], [2, 1]],
        fuelRequired_kg: [[50, 40], [30, 20]],
        c3_km2s2: [[4, 4], [1, 1]],
        timeOfFlight_days: [[100, 110], [90, 100]],
        status: [['VALID', 'VALID'], ['VALID', 'VALID']],
        solver: solverDefinition,
        selectedSolutionReference: null,
    });
}

describe('PorkchopPanel', () => {
    let host;

    beforeEach(() => {
        stubCanvasContext();
        stubLayout(400, 300);
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    it('mounts hidden with a metric option per METRIC_KEYS entry', () => {
        const panel = new PorkchopPanel({ host });
        expect(panel.overlay.hidden).toBe(true);
        expect(panel.metricSelect.options.length).toBe(4);
    });

    it('open() reveals the panel and does not invoke a solver', () => {
        const panel = new PorkchopPanel({ host });
        const field = buildField();
        panel.open(field);
        expect(panel.overlay.hidden).toBe(false);
        expect(panel.field).toBe(field);
    });

    it('close() hides the panel and fires onClosed', () => {
        const panel = new PorkchopPanel({ host });
        panel.open(buildField());
        const onClosed = vi.fn();
        panel.onClosed = onClosed;
        panel.close();
        expect(panel.overlay.hidden).toBe(true);
        expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it('reports the selected candidate without mutating the field', () => {
        const panel = new PorkchopPanel({ host });
        const field = buildField();
        panel.open(field);

        const onCandidateSelected = vi.fn();
        panel.onCandidateSelected = onCandidateSelected;
        panel._handlePointerSelect({ clientX: 275, clientY: 225 });

        expect(onCandidateSelected).toHaveBeenCalledTimes(1);
        const candidate = onCandidateSelected.mock.calls[0][0];
        expect(candidate.departureIndex).toBe(1);
        expect(candidate.arrivalIndex).toBe(1);
        expect(candidate.deltaV_kmps).toBe(2);
        expect(field.deltaV_kmps[1][1]).toBe(2);
    });

    it('changing the metric selector re-renders without touching the field data', () => {
        const panel = new PorkchopPanel({ host });
        const field = buildField();
        panel.open(field);

        panel.metricSelect.value = 'fuelRequired';
        panel.metricSelect.dispatchEvent(new window.Event('change'));

        expect(panel.metricKey).toBe('fuelRequired');
        expect(panel.field).toBe(field);
    });
});
