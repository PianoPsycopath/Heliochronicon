// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { SeasonMarkerController } from '@rendering/SeasonMarkerController.js';

// Prevents execution of heavy orbital calculations during UI rendering tests.
vi.mock('@physics/SeasonMarkerEngine.js', () => ({
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
            ],
            bodyRegistry: {
                getByName: vi.fn((name) => ({ data: { name, parent: 'Sol' } }))
            },
            tooltipManager: { 
                show: vi.fn(), 
                hide: vi.fn() 
            }
        };
        
        document.body.innerHTML = '';
        controller = new SeasonMarkerController(mockCtx);
    });

    afterEach(() => {
        controller.dispose();
        vi.clearAllMocks();
    });

    it('should initialize and properly assign the tooltipManager from context', () => {
        expect(controller.tooltipManager).toBeDefined();
        expect(controller.tooltipManager).toBe(mockCtx.tooltipManager);
    });

    it('should clear target state if setTarget is called with null', () => {
        controller.setTarget({ name: 'Mars' });
        expect(controller.seasonBody).not.toBeNull();

        controller.setTarget(null);
        
        expect(controller.seasonBody).toBeNull();
        expect(controller.parentBody).toBeNull();
    });

    it('should call tooltipManager.show with updated html when hover index changes', () => {
        // Injects synthetic marker data to simulate an active visualization state.
        controller.markers = [
            { label: 'Summer Solstice', date: new Date('2026-06-21T12:00:00Z'), countdownText: 'in 5 d' }
        ];
        controller.seasonBody = { data: { name: 'Mars' } };
        
        // Simulates a user interaction to trigger tooltip visibility and content updates.
        controller._hoveredIndex = 0;
        controller._updateTooltip();

        expect(mockCtx.tooltipManager.show).toHaveBeenCalled();
        const showArgs = mockCtx.tooltipManager.show.mock.calls[0];
        const htmlPayload = showArgs[1].html;
        
        expect(htmlPayload).toContain('Summer Solstice');
        expect(htmlPayload).toContain('Mars');
    });
});