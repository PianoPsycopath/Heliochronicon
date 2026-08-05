import { describe, it, expect, vi } from 'vitest';
import { BodyListManager, getFilteredAndSortedBodies } from '../js/BodyListManager.js';

const mockBodies = [
    { isMoon: false, data: { name: 'MARS', parent: 'SUN', a: 1.524, radius_km: 3389, category: 'Planet' } },
    { isMoon: false, data: { name: 'EARTH', parent: 'SUN', a: 1.000, radius_km: 6371, category: 'Planet' } },
    { isMoon: true,  data: { name: 'LUNA', parent: 'EARTH', a: 0.002, radius_km: 1737, category: 'Moon' } },
    { isMoon: true,  data: { name: 'PHOBOS', parent: 'MARS', a: 0.00006, radius_km: 11, category: 'Moon' } },
    { isMoon: false, data: { name: 'CERES', parent: 'SUN', a: 2.76, mass: 0.938, category: 'Planet' } }, 
    { isMoon: false, data: { name: 'SUN', parent: 'NONE', a: 0, radius_km: 696340, category: 'Star' } }
];

describe('BodyListManager Pure Logic (getFilteredAndSortedBodies)', () => {
    it('filters correctly for the global view (primary planets only, excluding Sun)', () => {
        const results = getFilteredAndSortedBodies(mockBodies, null, '', 'distance');
        expect(results.length).toBe(3);
        
        const names = results.map(b => b.data.name);
        expect(names).toContain('EARTH');
        expect(names).toContain('MARS');
        expect(names).toContain('CERES');
        expect(names).not.toContain('LUNA');
        expect(names).not.toContain('SUN');
    });

    it('filters correctly for a specific planetary system', () => {
        const currentTarget = { name: 'EARTH', parent: 'SUN', isMoon: false, category: 'Planet' };
        const results = getFilteredAndSortedBodies(mockBodies, currentTarget, '', 'distance');
        
        expect(results.length).toBe(1);
        expect(results[0].data.name).toBe('LUNA');
    });

    it('filters correctly by text search regardless of hierarchy', () => {
        const results = getFilteredAndSortedBodies(mockBodies, null, 'os', 'distance'); // Matches PHOBOS
        expect(results.length).toBe(1);
        expect(results[0].data.name).toBe('PHOBOS');
    });

    it('sorts bodies by distance (a) in ascending order', () => {
        const results = getFilteredAndSortedBodies(mockBodies, null, '', 'distance');
        expect(results[0].data.name).toBe('EARTH');
        expect(results[1].data.name).toBe('MARS');
    });

    it('sorts bodies by size in descending order with mass fallbacks', () => {
        const results = getFilteredAndSortedBodies(mockBodies, null, '', 'size');
        expect(results[0].data.name).toBe('EARTH');
        expect(results[1].data.name).toBe('MARS');
        expect(results[2].data.name).toBe('CERES');
    });
});

describe('BodyListManager Class State & DOM Mutations', () => {
    const createMockElements = () => ({
        listContainer: { innerHTML: '', appendChild: vi.fn() },
        searchEl: { value: '', addEventListener: vi.fn() },
        sortToggleEl: { addEventListener: vi.fn(), innerText: '' }
    });

    it('initializes default state and triggers sorting via DOM interactions', () => {
        const mocks = createMockElements();
        const manager = new BodyListManager(mocks);
        
        expect(manager.currentSortMode).toBe('distance');
        
        // Extract the click callback bound in initBindings
        const toggleCallback = mocks.sortToggleEl.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
        
        // Fire the fake event
        toggleCallback({ target: mocks.sortToggleEl });
        
        expect(manager.currentSortMode).toBe('size');
        expect(mocks.sortToggleEl.innerText).toBe('SORT: SIZE');
    });
});