// tests/bodyRegistryPredicates.test.js
import { describe, it, expect } from 'vitest';
import {
    matchesDataset,
    matchesNameAndCategory,
    isRadarContact,
    isUnpinnedPromotedClone,
    isProtectedTarget,
    shouldPurgeInFullSweep,
    shouldPurgeInRescan
} from '@core/bodyRegistryPredicates.js';

function body(overrides = {}) {
    return {
        name: 'Bennu',
        datasetName: 'atira',
        datasetCategory: 'RADAR_CONTACT',
        isPinned: false,
        ...overrides
    };
}

describe('matchesDataset', () => {
    it('matches on datasetName', () => {
        expect(matchesDataset(body({ datasetName: 'atira' }), 'atira')).toBe(true);
        expect(matchesDataset(body({ datasetName: 'atira' }), 'kerbin')).toBe(false);
    });
});

describe('matchesNameAndCategory', () => {
    it('requires both name and category to match', () => {
        const b = body({ name: 'Bennu', datasetCategory: 'PROMOTED_ASTEROID' });
        expect(matchesNameAndCategory(b, 'Bennu', 'PROMOTED_ASTEROID')).toBe(true);
        expect(matchesNameAndCategory(b, 'Bennu', 'RADAR_CONTACT')).toBe(false);
        expect(matchesNameAndCategory(b, 'Ryugu', 'PROMOTED_ASTEROID')).toBe(false);
    });
});

describe('isRadarContact / isUnpinnedPromotedClone', () => {
    it('identifies radar contacts', () => {
        expect(isRadarContact(body({ datasetCategory: 'RADAR_CONTACT' }))).toBe(true);
        expect(isRadarContact(body({ datasetCategory: 'PROMOTED_ASTEROID' }))).toBe(false);
    });

    it('identifies unpinned promoted clones only', () => {
        expect(isUnpinnedPromotedClone(body({ datasetCategory: 'PROMOTED_ASTEROID', isPinned: false }))).toBe(true);
        expect(isUnpinnedPromotedClone(body({ datasetCategory: 'PROMOTED_ASTEROID', isPinned: true }))).toBe(false);
        expect(isUnpinnedPromotedClone(body({ datasetCategory: 'RADAR_CONTACT', isPinned: false }))).toBe(false);
    });
});

describe('isProtectedTarget', () => {
    it('is false with no target', () => {
        expect(isProtectedTarget(body({ name: 'Bennu' }), null)).toBe(false);
    });
    it('matches by name only', () => {
        expect(isProtectedTarget(body({ name: 'Bennu' }), { name: 'Bennu' })).toBe(true);
        expect(isProtectedTarget(body({ name: 'Bennu' }), { name: 'Ryugu' })).toBe(false);
    });
});

describe('shouldPurgeInFullSweep', () => {
    it('purges radar contacts unconditionally', () => {
        expect(shouldPurgeInFullSweep(body({ datasetCategory: 'RADAR_CONTACT' }))).toBe(true);
    });
    it('purges unpinned promoted clones', () => {
        expect(shouldPurgeInFullSweep(body({ datasetCategory: 'PROMOTED_ASTEROID', isPinned: false }))).toBe(true);
    });
    it('spares pinned promoted clones', () => {
        expect(shouldPurgeInFullSweep(body({ datasetCategory: 'PROMOTED_ASTEROID', isPinned: true }))).toBe(false);
    });
    it('spares unrelated categories', () => {
        expect(shouldPurgeInFullSweep(body({ datasetCategory: 'ASTEROID' }))).toBe(false);
    });
});

describe('shouldPurgeInRescan', () => {
    it('always purges radar contacts, even the current target', () => {
        const b = body({ name: 'Bennu', datasetCategory: 'RADAR_CONTACT' });
        expect(shouldPurgeInRescan(b, { name: 'Bennu' })).toBe(true);
    });
    it('purges an unpinned promoted clone that is not the current target', () => {
        const b = body({ name: 'Bennu', datasetCategory: 'PROMOTED_ASTEROID', isPinned: false });
        expect(shouldPurgeInRescan(b, { name: 'Ryugu' })).toBe(true);
        expect(shouldPurgeInRescan(b, null)).toBe(true);
    });
    it('spares the current target\'s unpinned promoted clone', () => {
        const b = body({ name: 'Bennu', datasetCategory: 'PROMOTED_ASTEROID', isPinned: false });
        expect(shouldPurgeInRescan(b, { name: 'Bennu' })).toBe(false);
    });
    it('spares pinned promoted clones regardless of target', () => {
        const b = body({ name: 'Bennu', datasetCategory: 'PROMOTED_ASTEROID', isPinned: true });
        expect(shouldPurgeInRescan(b, null)).toBe(false);
    });
});