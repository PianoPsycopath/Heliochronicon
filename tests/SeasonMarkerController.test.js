// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SeasonMarkerController } from '../js/SeasonMarkerController.js';

// Prevents execution of heavy orbital calculations during UI rendering tests.
vi.mock('../js/SeasonMarkerEngine.js', () => ({
    SeasonMarkerEngine: {
        resolveSeasonBody: vi.fn((target) => target),
        computeMarkers: vi.fn(() => []),
        formatCountdown: vi.fn(() => 'in 10 m')
    }
}));

describe('SeasonMarkerController', () => {
    let mockCtx;
    let controller;

    beforeEach(() => {
        // Provides a lightweight, isolated mock of the THREE.js environment required for controller instantiation.
        mockCtx = {
            scene: { add: vi.fn(), remove: vi.fn() },
            camera: { zoom: 1 },
            celestialBodies: [
                { data: { name: 'Mars', parent: 'Sol' }, isMoon: false }
            ]
        };
        
        // Ensures a clean DOM state to prevent tooltip contamination between isolated test runs.
        document.body.innerHTML = '';
        controller = new SeasonMarkerController(mockCtx);
    });

    afterEach(() => {
        controller.dispose();
        vi.clearAllMocks();
    });

    it('should build a tooltip element and attach it to the DOM on instantiation', () => {
        const tooltip = document.querySelector('.season-marker-tooltip');
        expect(tooltip).not.toBeNull();
        expect(tooltip.style.display).toBe('none');
    });

    it('should clear target state if setTarget is called with null', () => {
        controller.setTarget({ name: 'Mars' });
        expect(controller.seasonBody).not.toBeNull();

        controller.setTarget(null);
        
        expect(controller.seasonBody).toBeNull();
        expect(controller.parentBody).toBeNull();
    });

    it('should update tooltip display when hover index changes', () => {
        // Injects synthetic marker data to simulate an active visualization state.
        controller.markers = [
            { label: 'Summer Solstice', date: new Date(), countdownText: 'in 5 d' }
        ];
        controller.seasonBody = { data: { name: 'Mars' } };
        
        // Simulates a user interaction to trigger tooltip visibility and content updates.
        controller._hoveredIndex = 0;
        controller._updateTooltip();

        const tooltip = document.querySelector('.season-marker-tooltip');
        expect(tooltip.style.display).toBe('block');
        expect(tooltip.innerHTML).toContain('Summer Solstice');
        expect(tooltip.innerHTML).toContain('Mars');
    });
});