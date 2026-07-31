// tests/PhysicsEngine.test.js
import { describe, it, expect } from 'vitest';
import { PhysicsEngine } from '../js/PhysicsEngine.js';

describe('PhysicsEngine', () => {
    describe('getJ2000Days', () => {
        it('should return exactly 0 for the J2000 Epoch (Jan 1, 2000, 12:00:00 UTC)', () => {
            const date = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
            expect(PhysicsEngine.getJ2000Days(date)).toBe(0);
        });

        it('should accurately calculate exactly 1 day interval', () => {
            const date = new Date(Date.UTC(2000, 0, 2, 12, 0, 0));
            expect(PhysicsEngine.getJ2000Days(date)).toBe(1);
        });

        it('should accurately handle dates prior to J2000 (negative days)', () => {
            const date = new Date(Date.UTC(1999, 11, 31, 12, 0, 0));
            expect(PhysicsEngine.getJ2000Days(date)).toBe(-1);
        });
    });
});