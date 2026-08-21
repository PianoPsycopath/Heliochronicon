// tests/CelestialBody.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CelestialBody } from '@core/CelestialBody.js';

describe('CelestialBody', () => {
    it('fills in sane defaults when constructed with no params', () => {
        const b = new CelestialBody();

        expect(b.data).toEqual({});
        expect(b.isMoon).toBe(false);
        expect(b.mesh).toBeNull();
        expect(b.sprite).toBeNull();
        expect(b.orbitLine).toBeNull();
        expect(b.orbitCurtain).toBeNull();
        expect(b.label).toBeNull();
        expect(b.datasetVisible).toBe(true);
        expect(b.isCulled).toBe(false);
        expect(b.hideLabel).toBe(false);
        expect(b.globalPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
        expect(b.renderPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
        expect(b.parentPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
        expect(b.W_current).toBe(0);
        expect(b.poleQuaternion.equals(new THREE.Quaternion())).toBe(true);
        expect(b.scaledA).toBe(0);
        expect(b.physicalRadius).toBe(0);
        expect(b.baseRenderOrder).toBe(0);
        expect(b.distToCamSq).toBe(0);
    });

    it('links renderPos directly to the sprite position vector when a sprite is provided and renderPos is not', () => {
        const sprite = new THREE.Sprite();
        sprite.position.set(1, 2, 3);

        const b = new CelestialBody({ sprite });

        expect(b.renderPos).toBe(sprite.position); // same object reference, not a copy
        sprite.position.set(9, 9, 9);
        expect(b.renderPos.equals(new THREE.Vector3(9, 9, 9))).toBe(true);
    });

    it('uses an explicitly provided renderPos instead of linking to the sprite', () => {
        const sprite = new THREE.Sprite();
        sprite.position.set(1, 2, 3);
        const explicitRenderPos = new THREE.Vector3(7, 8, 9);

        const b = new CelestialBody({ sprite, renderPos: explicitRenderPos });

        expect(b.renderPos).toBe(explicitRenderPos);
        expect(b.renderPos).not.toBe(sprite.position);
    });

    it('preserves explicit false/0 values instead of falling back to defaults where the field uses an undefined check', () => {
        const b = new CelestialBody({ baseRenderOrder: 0, distToCamSq: 0, datasetVisible: false });
        expect(b.baseRenderOrder).toBe(0);
        expect(b.distToCamSq).toBe(0);
        expect(b.datasetVisible).toBe(false);
    });

    it('preserves explicit true values for the OR-defaulted boolean flags', () => {
        const b = new CelestialBody({ isMoon: true, isCulled: true, hideLabel: true });
        expect(b.isMoon).toBe(true);
        expect(b.isCulled).toBe(true);
        expect(b.hideLabel).toBe(true);
    });

    it('stores provided 3D objects, data, and physical properties as given', () => {
        const mesh = new THREE.Mesh();
        const orbitLine = new THREE.Line();
        const orbitCurtain = new THREE.LineSegments();
        const label = { tagName: 'DIV' };
        const data = { name: 'EARTH' };

        const b = new CelestialBody({
            data, mesh, orbitLine, orbitCurtain, label,
            scaledA: 1.5, physicalRadius: 0.0001, W_current: 2.3
        });

        expect(b.data).toBe(data);
        expect(b.mesh).toBe(mesh);
        expect(b.orbitLine).toBe(orbitLine);
        expect(b.orbitCurtain).toBe(orbitCurtain);
        expect(b.label).toBe(label);
        expect(b.scaledA).toBe(1.5);
        expect(b.physicalRadius).toBe(0.0001);
        expect(b.W_current).toBe(2.3);
    });
});
