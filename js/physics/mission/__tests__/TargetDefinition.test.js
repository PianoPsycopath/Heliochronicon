import { describe, it, expect } from 'vitest';
import { createTargetDefinition } from '../TargetDefinition.js';

describe('createTargetDefinition', () => {
    it('constructs a BODY_CENTER target', () => {
        const target = createTargetDefinition({ type: 'BODY_CENTER', bodyName: 'MARS' });
        expect(target).toEqual({ type: 'BODY_CENTER', bodyName: 'MARS' });
        expect(Object.isFrozen(target)).toBe(true);
    });

    it('constructs a BODY_ORBIT target', () => {
        const target = createTargetDefinition({ type: 'BODY_ORBIT', bodyName: 'MARS', altitude_km: 400 });
        expect(target).toEqual({ type: 'BODY_ORBIT', bodyName: 'MARS', altitude_km: 400 });
    });

    it('constructs a STATE_VECTOR target', () => {
        const target = createTargetDefinition({
            type: 'STATE_VECTOR',
            position: { x: 1, y: 0, z: 0 },
            velocity: { x: 0, y: 1, z: 0 },
        });
        expect(target.type).toBe('STATE_VECTOR');
        expect(target.position).toEqual({ x: 1, y: 0, z: 0 });
    });

    it('constructs an ORBITAL_ELEMENTS target', () => {
        const target = createTargetDefinition({
            type: 'ORBITAL_ELEMENTS',
            a: 1.5,
            e: 0.1,
            i: 0.03,
            w: 0.5,
            Node: 0.2,
            M0: 1.1,
        });
        expect(target.a).toBe(1.5);
    });

    it('constructs a SURFACE_COORDINATE target', () => {
        const target = createTargetDefinition({
            type: 'SURFACE_COORDINATE',
            bodyName: 'MOON',
            latitude_deg: 10,
            longitude_deg: -20,
        });
        expect(target).toEqual({
            type: 'SURFACE_COORDINATE',
            bodyName: 'MOON',
            latitude_deg: 10,
            longitude_deg: -20,
        });
    });

    it('constructs a SURFACE_COORDINATE_ALTITUDE target', () => {
        const target = createTargetDefinition({
            type: 'SURFACE_COORDINATE_ALTITUDE',
            bodyName: 'MOON',
            latitude_deg: 10,
            longitude_deg: -20,
            altitude_km: 100,
        });
        expect(target.altitude_km).toBe(100);
    });

    it('rejects an unknown target type', () => {
        expect(() => createTargetDefinition({ type: 'WORMHOLE' })).toThrow(
            'TargetDefinition.type must be one of'
        );
    });

    it('rejects a BODY_CENTER target missing bodyName', () => {
        expect(() => createTargetDefinition({ type: 'BODY_CENTER' })).toThrow(
            'TargetDefinition.bodyName must be a non-empty string'
        );
    });
});
