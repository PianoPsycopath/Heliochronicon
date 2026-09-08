import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransferTrajectoryRenderer } from '../TransferTrajectoryRenderer.js';

function makeSolution({ sampleCount = 5, burnCount = 2 } = {}) {
    const trajectorySamples = Array.from({ length: sampleCount }, (_, i) => ({
        position: { x: i, y: i * 2, z: 0 },
    }));

    const burns = Array.from({ length: burnCount }, (_, i) => ({
        position: { x: i, y: 0, z: i },
    }));

    return { trajectorySamples, burns };
}

describe('TransferTrajectoryRenderer', () => {
    it('builds one Line with a point per trajectory sample', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution({ sampleCount: 7 }));

        const group = renderer.getObject3D();
        const line = group.children.find((child) => child instanceof THREE.Line);

        expect(line).toBeDefined();
        expect(line.geometry.attributes.position.count).toBe(7);
        expect(line.geometry.attributes.aProgress.count).toBe(7);
        expect(line.geometry.attributes.aProgress.array[0]).toBe(0);
        expect(line.geometry.attributes.aProgress.array[6]).toBe(1);
    });

    it('builds burn markers as a single Points object', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution({ burnCount: 3 }));

        const group = renderer.getObject3D();
        const points = group.children.find((child) => child instanceof THREE.Points);

        expect(points).toBeDefined();
        expect(points.geometry.attributes.position.count).toBe(3);
    });

    it('omits burn markers when there are no burns', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution({ burnCount: 0 }));

        const group = renderer.getObject3D();
        expect(group.children.find((child) => child instanceof THREE.Points)).toBeUndefined();
    });

    it('replaces the previous solution rather than accumulating objects', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution({ sampleCount: 4, burnCount: 1 }));
        renderer.setSolution(makeSolution({ sampleCount: 9, burnCount: 2 }));

        const group = renderer.getObject3D();
        const lines = group.children.filter((child) => child instanceof THREE.Line);
        const points = group.children.filter((child) => child instanceof THREE.Points);

        expect(lines).toHaveLength(1);
        expect(points).toHaveLength(1);
        expect(lines[0].geometry.attributes.position.count).toBe(9);
        expect(points[0].geometry.attributes.position.count).toBe(2);
    });

    it('setSolution(null) clears any existing trajectory', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution());
        renderer.setSolution(null);

        expect(renderer.getObject3D().children).toHaveLength(0);
    });

    it('clear() disposes geometry and material and empties the group', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution());

        const group = renderer.getObject3D();
        const line = group.children.find((child) => child instanceof THREE.Line);
        let geometryDisposed = false;
        let materialDisposed = false;
        line.geometry.addEventListener('dispose', () => {
            geometryDisposed = true;
        });
        line.material.addEventListener('dispose', () => {
            materialDisposed = true;
        });

        renderer.clear();

        expect(group.children).toHaveLength(0);
        expect(geometryDisposed).toBe(true);
        expect(materialDisposed).toBe(true);
    });

    it('dispose() is safe to call and leaves the renderer usable again', () => {
        const renderer = new TransferTrajectoryRenderer();
        renderer.setSolution(makeSolution());
        renderer.dispose();
        expect(renderer.getObject3D().children).toHaveLength(0);

        renderer.setSolution(makeSolution({ sampleCount: 3 }));
        expect(renderer.getObject3D().children.length).toBeGreaterThan(0);
    });
});
