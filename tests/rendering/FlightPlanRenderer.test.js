import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FlightPlanRenderer } from '@rendering/FlightPlanRenderer.js';

describe('FlightPlanRenderer', () => {
    let scene;
    let renderer;

    beforeEach(() => {
        scene = new THREE.Scene();
        renderer = new FlightPlanRenderer({ scene });
    });

    it('initializes cleanly and attaches trajectory group to scene', () => {
        expect(renderer.scene).toBe(scene);
        expect(scene.children.length).toBe(1);
        expect(scene.children[0].name).toBe('FlightPlanGroup');
        expect(renderer.activePlan).toBeNull();
    });

    it('renders trajectory line and burn markers when setPlan is called', () => {
        const mockPlan = {
            trajectorySamples: [
                { position: { x: 0, y: 0, z: 0 } },
                { position: { x: 1, y: 1, z: 1 } },
                { position: { x: 2, y: 2, z: 2 } }
            ],
            burns: [
                { position: { x: 0, y: 0, z: 0 } },
                { position: { x: 2, y: 2, z: 2 } }
            ]
        };

        renderer.setPlan(mockPlan);

        // 1 line geometry + 2 burn marker geometries
        expect(renderer.trajectoryGroup.children.length).toBe(3);
        expect(renderer.activePlan).toBe(mockPlan);
    });

    it('gracefully handles missing trajectorySamples', () => {
        const mockPlanNoSamples = {
            burns: [{ position: { x: 1, y: 1, z: 1 } }]
        };

        renderer.setPlan(mockPlanNoSamples);
        expect(renderer.trajectoryGroup.children.length).toBe(1); // Only the burn
    });

    it('clears previous geometries cleanly via clear()', () => {
        const mockPlan = {
            trajectorySamples: [
                { position: { x: 0, y: 0, z: 0 } },
                { position: { x: 1, y: 1, z: 1 } }
            ],
            burns: []
        };

        renderer.setPlan(mockPlan);
        expect(renderer.trajectoryGroup.children.length).toBe(1);

        renderer.clear();
        expect(renderer.trajectoryGroup.children.length).toBe(0);
        expect(renderer.activePlan).toBeNull();
    });

    it('cleans up resources and detaches on dispose()', () => {
        renderer.dispose();
        expect(scene.children.length).toBe(0);
    });
});