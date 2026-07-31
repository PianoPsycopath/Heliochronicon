// tests/OrbitalMath.test.js
import { describe, it, expect } from 'vitest';
import { OrbitalMath } from '../js/OrbitalMath.js';

describe('OrbitalMath', () => {
    describe('solveKepler', () => {
        it('should handle circular orbits perfectly (e = 0)', () => {
            expect(OrbitalMath.solveKepler(Math.PI, 0)).toBeCloseTo(Math.PI);
            expect(OrbitalMath.solveKepler(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2);
        });

        it('should converge without crashing on extreme eccentricity edge cases (e -> 0.9999)', () => {
            const E = OrbitalMath.solveKepler(0.1, 0.9999);
            expect(E).not.toBeNaN();
            expect(typeof E).toBe('number');
        });

        it('should properly handle M values near 0 and wrapping around 2PI', () => {
            const E_0 = OrbitalMath.solveKepler(1e-8, 0.5);
            const E_2pi = OrbitalMath.solveKepler(2 * Math.PI - 1e-8, 0.5);
            expect(E_0).toBeGreaterThan(0);
            expect(E_2pi).toBeGreaterThan(0);
        });
    });

    describe('calcPosFromM', () => {
        it('should return a plain {x, y, z} object avoiding THREE.js dependencies', () => {
            const pos = OrbitalMath.calcPosFromM(1, 0, 0, 0, 0, 0);
            
            // Should be a raw POJO, not a class instance
            expect(pos.constructor.name).toBe('Object');
            expect(pos).toHaveProperty('x');
            expect(pos).toHaveProperty('y');
            expect(pos).toHaveProperty('z');
        });

        it('should compute exact periapsis alignment for a known 0-inclination orbit', () => {
            // M = 0 (Periapsis), so object should sit at x = a*(1-e), y = 0, z = 0
            const a = 1;
            const e = 0.5;
            const pos = OrbitalMath.calcPosFromM(a, e, 0, 0, 0, 0);
            
            // Expected xv = 1 * (1 - 0.5) = 0.5. No rotations applied. 
            // ast_x = 0.5, ast_y = 0, ast_z = 0. 
            // Swapped to Right-Handed: x: 0.5, y: 0, z: -0
            expect(pos.x).toBeCloseTo(0.5);
            expect(pos.y).toBeCloseTo(0); 
            expect(pos.z).toBeCloseTo(0); 
        });
    });
});