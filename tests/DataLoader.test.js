import { describe, it, expect } from 'vitest';
import { DataLoader } from '../js/DataLoader.js';

describe('DataLoader.processPlanetaryData', () => {
    it('applies default values for missing fields', () => {
        const raw = [{ name: 'Mystery Object' }]; // Missing almost everything
        const result = DataLoader.processPlanetaryData(raw);
        
        expect(result[0].name).toBe('MYSTERY OBJECT');
        expect(result[0].category).toBe('ASTEROID'); // Fallback category
        expect(result[0].parent).toBe('SUN');        // Fallback parent
        expect(result[0].a).toBe(0);
        expect(result[0].e).toBe(0);
    });

    it('derives mean motion (n) if missing but period_days is present', () => {
        const raw = [{ name: 'Earth', period_days: '365.25' }];
        const result = DataLoader.processPlanetaryData(raw);
        
        // n = 360 / period_days
        const expectedRadians = (360 / 365.25) * (Math.PI / 180);
        expect(result[0].n).toBeCloseTo(expectedRadians, 4);
    });

    it('converts moon a_km to AU', () => {
        // Moon orbiting Earth at roughly 384,400 km
        const raw = [{ name: 'Luna', category: 'MOON', a_km: '384400' }];
        const result = DataLoader.processPlanetaryData(raw);
        
        expect(result[0].a).toBeCloseTo(384400 / 149597870.7, 6);
    });
});