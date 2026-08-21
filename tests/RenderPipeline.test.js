// tests/RenderPipeline.test.js
import { describe, it, expect } from 'vitest';
import { getActiveSystemName } from '@rendering/RenderPipeline.js';

describe('getActiveSystemName', () => {
    it('returns the target itself when it is a planet or star', () => {
        expect(getActiveSystemName({ name: 'KERBIN', parent: 'KERBOL', category: 'PLANET' })).toBe('KERBIN');
    });
    it('returns the parent planet when the target is a moon', () => {
        expect(getActiveSystemName({ name: 'MUN', parent: 'KERBIN', category: 'MOON' })).toBe('KERBIN');
    });
    it('returns NONE when nothing is targeted', () => {
        expect(getActiveSystemName(null)).toBe('NONE');
    });
});