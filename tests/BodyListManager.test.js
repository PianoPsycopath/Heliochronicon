import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BodyListManager } from '../js/BodyListManager.js';

describe('BodyListManager Search and Sort Logic', () => {
    let appendedItems = [];
    let mockSearchEl;

    const mockBodies = [
        { isMoon: false, data: { name: 'MARS', parent: 'SUN', a: 1.524, radius_km: 3389, category: 'Planet' } },
        { isMoon: false, data: { name: 'EARTH', parent: 'SUN', a: 1.000, radius_km: 6371, category: 'Planet' } },
        { isMoon: true,  data: { name: 'LUNA', parent: 'EARTH', a: 0.002, radius_km: 1737, category: 'Moon' } },
        { isMoon: true,  data: { name: 'PHOBOS', parent: 'MARS', a: 0.00006, radius_km: 11, category: 'Moon' } },
        { isMoon: false, data: { name: 'CERES', parent: 'SUN', a: 2.76, mass: 0.938, category: 'Planet' } }, 
        { isMoon: false, data: { name: 'SUN', parent: 'NONE', a: 0, radius_km: 696340, category: 'Star' } }
    ];

    beforeEach(() => {
        appendedItems = [];
        mockSearchEl = { value: '', addEventListener: vi.fn() };
        
        const mockContainer = {
            innerHTML: '',
            appendChild: vi.fn((el) => appendedItems.push(el))
        };

        vi.stubGlobal('document', {
            getElementById: (id) => {
                if (id === 'search-input') return mockSearchEl;
                if (id === 'body-list') return mockContainer;
                return { addEventListener: vi.fn() };
            },
            createElement: () => ({
                className: '',
                innerHTML: '',
                style: {},
                addEventListener: vi.fn()
            })
        });
    });

    it('filters correctly for the global view (primary planets only, excluding Sun)', () => {
        const manager = new BodyListManager();
        mockSearchEl.value = ''; 
        
        manager.render(mockBodies, null); // No target selected
        
        // Should only show Earth, Mars, and Ceres.
        expect(appendedItems.length).toBe(3);
        const textOutput = appendedItems.map(el => el.innerHTML).join(' ');
        expect(textOutput).toContain('EARTH');
        expect(textOutput).toContain('MARS');
        expect(textOutput).toContain('CERES');
        expect(textOutput).not.toContain('LUNA');
        expect(textOutput).not.toContain('SUN');
    });

    it('filters correctly for a specific planetary system', () => {
        const manager = new BodyListManager();
        
        // Target is Earth, should list Earth's moons
        const currentTarget = { name: 'EARTH', parent: 'SUN', isMoon: false, category: 'Planet' };
        manager.render(mockBodies, currentTarget);
        
        expect(appendedItems.length).toBe(1);
        expect(appendedItems[0].innerHTML).toContain('LUNA');
        expect(appendedItems[0].innerHTML).not.toContain('PHOBOS');
    });

    it('filters correctly by text search regardless of hierarchy', () => {
        const manager = new BodyListManager();
        mockSearchEl.value = 'os'; // Matches "PHOBOS"
        
        manager.render(mockBodies, null);
        
        expect(appendedItems.length).toBe(1);
        expect(appendedItems[0].innerHTML).toContain('PHOBOS');
    });

    it('sorts bodies by distance (a) in ascending order', () => {
        const manager = new BodyListManager();
        manager.currentSortMode = 'distance';
        manager.render(mockBodies, null); 
        
        expect(appendedItems[0].innerHTML).toContain('EARTH');
        expect(appendedItems[1].innerHTML).toContain('MARS');
    });

    it('sorts bodies by size in descending order with mass fallbacks', () => {
        const manager = new BodyListManager();
        manager.currentSortMode = 'size';
        manager.render(mockBodies, null); 
        
        expect(appendedItems[0].innerHTML).toContain('EARTH');
        expect(appendedItems[1].innerHTML).toContain('MARS');
        expect(appendedItems[2].innerHTML).toContain('CERES');
    });
});