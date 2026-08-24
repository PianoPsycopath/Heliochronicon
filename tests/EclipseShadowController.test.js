// tests/EclipseShadowController.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const MAX_SHADOWS = 8;

function makeShadowMaterial() {
    return {
        uniforms: {
            uStarPos: { value: new THREE.Vector3() },
            uStarRadius: { value: 0 },
            uPlanetCenter: { value: new THREE.Vector3() },
            uOccPositions: { value: Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector3()) },
            uOccRadii: { value: new Array(MAX_SHADOWS).fill(0) },
            uShadowCount: { value: 0 }
        },
        dispose: vi.fn()
    };
}

vi.mock('@rendering/Shaders.js', () => ({
    Shaders: {
        createEclipseShadowMat: vi.fn(() => makeShadowMaterial())
    }
}));

import { Shaders } from '@rendering/Shaders.js';
import { EclipseShadowController } from '@rendering/EclipseShadowController.js';
import { AU_IN_KM } from '@core/constants.js';

function mkBody(name, parent, { isMoon = false, renderPos = null, physicalRadius = 0.0001, mesh = null } = {}) {
    return {
        data: { name, parent },
        isMoon,
        renderPos,
        physicalRadius,
        mesh: mesh || { renderOrder: 500 }
    };
}

describe('EclipseShadowController', () => {
    let scene, ctx, ctrl;

    beforeEach(() => {
        Shaders.createEclipseShadowMat.mockClear();
        scene = { add: vi.fn(), remove: vi.fn() };
        ctx = { celestialBodies: [], scene, AU_IN_KM };
        ctrl = new EclipseShadowController(ctx);
    });

    describe('_findStarBody', () => {
        it('resolves a moon up through its planet to the self-referencing star', () => {
            const sun = mkBody('SUN', 'SUN');
            const earth = mkBody('EARTH', 'SUN');
            const moon = mkBody('MOON', 'EARTH', { isMoon: true });
            ctx.celestialBodies.push(sun, earth, moon);

            expect(ctrl._findStarBody(moon)).toBe(sun);
        });

        it('returns null on a broken parent chain without infinite-looping', () => {
            const orphan = mkBody('ROGUE', 'NOWHERE');
            ctx.celestialBodies.push(orphan);
            expect(ctrl._findStarBody(orphan)).toBeNull();
        });
    });

    describe('_candidates', () => {
        it('for a planet target, includes its moons but not itself', () => {
            const sun = mkBody('SUN', 'SUN');
            const earth = mkBody('EARTH', 'SUN');
            const moon = mkBody('MOON', 'EARTH', { isMoon: true });
            const mars = mkBody('MARS', 'SUN');
            ctx.celestialBodies.push(sun, earth, moon, mars);

            const candidates = ctrl._candidates(earth);
            const names = candidates.map(c => c.data.name);
            expect(names).toContain('MOON');
            expect(names).not.toContain('EARTH');
            expect(names).not.toContain('MARS');
            expect(names).not.toContain('SUN');
        });

        it('for a moon target, includes its parent planet and sibling moons but not itself', () => {
            const earth = mkBody('EARTH', 'SUN');
            const moonA = mkBody('MOON_A', 'EARTH', { isMoon: true });
            const moonB = mkBody('MOON_B', 'EARTH', { isMoon: true });
            ctx.celestialBodies.push(earth, moonA, moonB);

            const candidates = ctrl._candidates(moonA);
            const names = candidates.map(c => c.data.name);
            expect(names).toContain('EARTH');
            expect(names).toContain('MOON_B');
            expect(names).not.toContain('MOON_A');
        });
    });

    describe('onMeshVisibilityChange', () => {
        it('is a no-op for a self-referencing star', () => {
            const sun = mkBody('SUN', 'SUN');
            ctx.celestialBodies.push(sun);
            expect(() => ctrl.onMeshVisibilityChange(sun, false)).not.toThrow();
            expect(scene.remove).not.toHaveBeenCalled();
        });

        it('hides an existing overlay when visibility turns off', () => {
            const earth = mkBody('EARTH', 'SUN', { renderPos: new THREE.Vector3(1, 0, 0) });
            ctx.celestialBodies.push(earth);
            const entry = ctrl._ensureOverlay(earth);
            entry.mesh.visible = true;

            ctrl.onMeshVisibilityChange(earth, false);

            expect(entry.mesh.visible).toBe(false);
        });

        it('does nothing (and does not throw) when going invisible with no overlay yet created', () => {
            const earth = mkBody('EARTH', 'SUN');
            expect(() => ctrl.onMeshVisibilityChange(earth, false)).not.toThrow();
        });
    });

    describe('updateForBody', () => {
        const starRadiusAU = 696340 / AU_IN_KM;

        it('does nothing (no overlay created) when no star can be found', () => {
            const orphan = mkBody('ROGUE', 'NOWHERE', { renderPos: new THREE.Vector3() });
            ctx.celestialBodies.push(orphan);

            ctrl.updateForBody(orphan);

            expect(scene.add).not.toHaveBeenCalled();
            expect(Shaders.createEclipseShadowMat).not.toHaveBeenCalled();
        });

        it('creates and hides the overlay when there are no eclipsing candidates', () => {
            const sun = mkBody('SUN', 'SUN', { renderPos: new THREE.Vector3(0, 0, 0) });
            const earth = mkBody('EARTH', 'SUN', { renderPos: new THREE.Vector3(1, 0, 0) });
            ctx.celestialBodies.push(sun, earth);

            ctrl.updateForBody(earth);

            const entry = ctrl.overlays.get('EARTH');
            expect(entry).toBeDefined();
            expect(entry.mesh.visible).toBe(false);
        });

        it('skips candidates that have no renderPos yet', () => {
            const sun = mkBody('SUN', 'SUN', { renderPos: new THREE.Vector3(0, 0, 0) });
            const earth = mkBody('EARTH', 'SUN', { renderPos: new THREE.Vector3(1, 0, 0) });
            const moonNoPos = mkBody('MOON', 'EARTH', { isMoon: true, renderPos: null, physicalRadius: 0.00001 });
            ctx.celestialBodies.push(sun, earth, moonNoPos);

            ctrl.updateForBody(earth);

            const entry = ctrl.overlays.get('EARTH');
            expect(entry.mesh.visible).toBe(false); 
        });

        it('shows the overlay and populates uniforms when a moon eclipses its planet', () => {
            const sun = mkBody('SUN', 'SUN', {
                renderPos: new THREE.Vector3(0, 0, 0), physicalRadius: starRadiusAU
            });
            const earth = mkBody('EARTH', 'SUN', {
                renderPos: new THREE.Vector3(1, 0, 0), physicalRadius: 6371 / AU_IN_KM
            });
            const moon = mkBody('MOON', 'EARTH', {
                isMoon: true, renderPos: new THREE.Vector3(0.9974, 0, 0), physicalRadius: 1737 / AU_IN_KM
            });
            ctx.celestialBodies.push(sun, earth, moon);

            ctrl.updateForBody(earth);

            const entry = ctrl.overlays.get('EARTH');
            expect(entry.mesh.visible).toBe(true);
            expect(entry.mesh.position.equals(earth.renderPos)).toBe(true);
            expect(entry.material.uniforms.uStarPos.value.equals(sun.renderPos)).toBe(true);
            expect(entry.material.uniforms.uStarRadius.value).toBeCloseTo(starRadiusAU, 12);
            expect(entry.material.uniforms.uShadowCount.value).toBe(1);
            expect(entry.material.uniforms.uOccPositions.value[0].equals(moon.renderPos)).toBe(true);
            expect(entry.material.uniforms.uOccRadii.value[0]).toBeCloseTo(moon.physicalRadius, 12);
        });

        it('caps populated shadow slots at MAX_SHADOWS (8) even with more valid occluders', () => {
            const sun = mkBody('SUN', 'SUN', { renderPos: new THREE.Vector3(0, 0, 0) });
            const earth = mkBody('EARTH', 'SUN', {
                renderPos: new THREE.Vector3(1, 0, 0), physicalRadius: 6371 / AU_IN_KM
            });
            const moons = Array.from({ length: 12 }, (_, idx) => mkBody(`MOON_${idx}`, 'EARTH', {
                isMoon: true,
                renderPos: new THREE.Vector3(0.9974, 0, 0),
                physicalRadius: (1737 + idx) / AU_IN_KM 
            }));
            ctx.celestialBodies.push(sun, earth, ...moons);

            ctrl.updateForBody(earth);

            const entry = ctrl.overlays.get('EARTH');
            expect(entry.mesh.visible).toBe(true);
            expect(entry.material.uniforms.uShadowCount.value).toBe(8);
        });

        it('reuses the same overlay mesh/material across repeated calls instead of recreating it', () => {
            const sun = mkBody('SUN', 'SUN', { renderPos: new THREE.Vector3(0, 0, 0) });
            const earth = mkBody('EARTH', 'SUN', { renderPos: new THREE.Vector3(1, 0, 0) });
            ctx.celestialBodies.push(sun, earth);

            ctrl.updateForBody(earth);
            ctrl.updateForBody(earth);

            expect(Shaders.createEclipseShadowMat).toHaveBeenCalledTimes(1);
            expect(scene.add).toHaveBeenCalledTimes(1);
        });
    });

    describe('removeBody', () => {
        it('removes the overlay from the scene, disposes its material, and drops it from the map', () => {
            const earth = mkBody('EARTH', 'SUN', { renderPos: new THREE.Vector3(1, 0, 0) });
            ctx.celestialBodies.push(earth);
            const entry = ctrl._ensureOverlay(earth);

            ctrl.removeBody('EARTH');

            expect(scene.remove).toHaveBeenCalledWith(entry.mesh);
            expect(entry.material.dispose).toHaveBeenCalled();
            expect(ctrl.overlays.has('EARTH')).toBe(false);
        });

        it('is a no-op for a body with no overlay', () => {
            expect(() => ctrl.removeBody('NEVER_SEEN')).not.toThrow();
            expect(scene.remove).not.toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('removes and disposes every overlay and clears the map', () => {
            const earth = mkBody('EARTH', 'SUN', { renderPos: new THREE.Vector3(1, 0, 0) });
            const mars = mkBody('MARS', 'SUN', { renderPos: new THREE.Vector3(1.5, 0, 0) });
            ctx.celestialBodies.push(earth, mars);
            const earthEntry = ctrl._ensureOverlay(earth);
            const marsEntry = ctrl._ensureOverlay(mars);

            ctrl.dispose();

            expect(scene.remove).toHaveBeenCalledWith(earthEntry.mesh);
            expect(scene.remove).toHaveBeenCalledWith(marsEntry.mesh);
            expect(earthEntry.material.dispose).toHaveBeenCalled();
            expect(marsEntry.material.dispose).toHaveBeenCalled();
            expect(ctrl.overlays.size).toBe(0);
        });
    });
});