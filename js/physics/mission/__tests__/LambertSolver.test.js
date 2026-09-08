import { describe, it, expect } from 'vitest';
import { solveLambertMath, LambertSolver } from '../LambertSolver.js';

describe('LambertSolver', () => {
    const mu = 1;

    it('should solve a 90-degree transfer for a circular orbit', () => {
        const pos1 = { x: 1, y: 0, z: 0 };
        const pos2 = { x: 0, y: 1, z: 0 };
        const dt = Math.PI / 2; // Time of flight for 90-degree transfer in unit circular orbit

        const { v1, v2 } = solveLambertMath(pos1, pos2, dt, mu, 'SHORT');

        expect(v1.x).toBeCloseTo(0, 5);
        expect(v1.y).toBeCloseTo(1, 5);
        expect(v1.z).toBeCloseTo(0, 5);

        expect(v2.x).toBeCloseTo(-1, 5);
        expect(v2.y).toBeCloseTo(0, 5);
        expect(v2.z).toBeCloseTo(0, 5);
    });

    it('should handle a Hohmann transfer offset derivation (approx 180 degrees)', () => {
        const pos1 = { x: 1, y: 0, z: 0 };
        // Exactly 180 degrees is singular. Offset slightly for testing.
        const angle = 179.99 * Math.PI / 180;
        const pos2 = { x: 2 * Math.cos(angle), y: 2 * Math.sin(angle), z: 0 };
        
        // Hohmann transfer a = (1+2)/2 = 1.5
        const dt = Math.PI * Math.pow(1.5, 1.5);

        const { v1 } = solveLambertMath(pos1, pos2, dt, mu, 'SHORT');

        // Target Hohmann v1 = sqrt(mu/R1) * sqrt(2*R2 / (R1+R2)) = sqrt(4/3) ≈ 1.1547
        expect(v1.x).toBeCloseTo(0, 2);
        expect(v1.y).toBeCloseTo(1.1547, 2);
    });

    it('should throw an error on exact rectilinear or un-planed 180 degree paths', () => {
        const pos1 = { x: 1, y: 0, z: 0 };
        const pos2 = { x: -2, y: 0, z: 0 };
        const dt = Math.PI;

        expect(() => solveLambertMath(pos1, pos2, dt, mu, 'SHORT')).toThrow(/singular/);
    });

    it('should respect TrajectorySolver factory abstraction and return valid metadata', () => {
        const req = {
            departureState: { position: {x: 1, y: 0, z: 0}, velocity: {x: 0, y: 1, z: 0}, epoch_daysSinceJ2000: 0, mu: 1 },
            arrivalState: { position: {x: 0, y: 1, z: 0}, velocity: {x: -1, y: 0, z: 0}, epoch_daysSinceJ2000: Math.PI/2, mu: 1 },
            route: 'SHORT',
            sampleCount: 10
        };
        const result = LambertSolver.solve(req);
        
        expect(result.trajectorySamples).toHaveLength(11);
        expect(result.timeOfFlight_days).toBeCloseTo(Math.PI/2);
        expect(result.transferDepartureVelocity.y).toBeCloseTo(1);
        expect(result.solverMetadata.converged).toBe(true);
    });
    it('solves Hohmann-derived transfer accurately with slight plane offset', () => {
        // mu = 1, r1 = 1, r2 = 2. a_trans = 1.5. 
        // TOF = pi * sqrt(1.5^3 / 1) = 5.77245
        // exact 180 is singular; 179.9 degrees avoids the divide-by-zero.
        const mu = 1;
        const dt = 5.77245385;
        const pos1 = { x: 1, y: 0, z: 0 };
        const pos2 = { x: -1.99999, y: 0.00628, z: 0 }; // ~179.8 degrees

        const { v1, v2 } = solveLambertMath(pos1, pos2, dt, mu, 'PROGRADE');

        // Theoretical v1 = 1.1547, v2 = 0.5773
        const magV1 = Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2);
        const magV2 = Math.sqrt(v2.x**2 + v2.y**2 + v2.z**2);

        expect(magV1).toBeCloseTo(1.1547, 3);
        expect(magV2).toBeCloseTo(0.5773, 3);
    });

    it('locks PROGRADE vs RETROGRADE logic based on c_vec.z', () => {
        const mu = 1;
        const dt = 1.57; // arbitrary ~90 deg transfer time
        const pos1 = { x: 1, y: 0, z: 0 };
        
        // Counter-clockwise in XY -> c_vec is +Z.
        // Prograde should take the short way, Retrograde should take the long way.
        const pos2_ccw = { x: 0, y: 1, z: 0 };
        
        const resPrograde = solveLambertMath(pos1, pos2_ccw, dt, mu, 'PROGRADE');
        const resRetrograde = solveLambertMath(pos1, pos2_ccw, dt, mu, 'RETROGRADE');
        
        // The long-way (retrograde) will require wildly different departure velocity for the same TOF.
        expect(resPrograde.v1.x).not.toBeCloseTo(resRetrograde.v1.x, 5);
    });

    it('calculates LONG-way explicit route independently of plane normal', () => {
        const mu = 1;
        const dt = 5.0;
        const pos1 = { x: 1, y: 0, z: 0 };
        const pos2 = { x: 0, y: 1, z: 0 };

        const shortWay = solveLambertMath(pos1, pos2, dt, mu, 'SHORT');
        const longWay = solveLambertMath(pos1, pos2, dt, mu, 'LONG');

        expect(shortWay.v1.x).not.toBeCloseTo(longWay.v1.x, 5);
    });
});