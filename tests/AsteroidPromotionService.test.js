// tests/AsteroidPromotionService.test.js

import {
    describe,
    it,
    expect,
    vi,
} from 'vitest';

import {
    AsteroidPromotionService,
} from '@core/AsteroidPromotionService.js';

function asteroid(name = 'CERES', category = 'ASTEROID') {
    return {
        name,
        datasetCategory: category,
        datasetName: 'main-belt',
    };
}

function makeContext() {
    const celestialBodies = [];

    const bodyRegistry = {
        promote: vi.fn((body) => {
            celestialBodies.push(body);
            return body;
        }),

        removeBody: vi.fn(),

        purgeTacticalClones: vi.fn(),

        sweepForRescan: vi.fn(),
    };

    const systemBuilder = {
        createPromotedAsteroidBody: vi.fn((data) => ({
            data: {
                ...data,
                datasetCategory: 'PROMOTED_ASTEROID',
            },
        })),
    };

    return {
        celestialBodies,
        bodyRegistry,
        systemBuilder,
    };
}

describe('AsteroidPromotionService', () => {
    it('allows GPU ASTEROID records to cross the promotion boundary', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        expect(
            service.canPromote(
                asteroid('CERES', 'ASTEROID')
            )
        ).toBe(true);
    });

    it('allows RADAR_CONTACT records to be promoted', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        expect(
            service.canPromote(
                asteroid('CERES', 'RADAR_CONTACT')
            )
        ).toBe(true);
    });

    it('rejects already-promoted bodies as promotion inputs', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        expect(
            service.canPromote(
                asteroid(
                    'CERES',
                    'PROMOTED_ASTEROID'
                )
            )
        ).toBe(false);
    });

    it('constructs and registers a CPU representation', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        const source = asteroid();

        const promoted =
            service.promote(source);

        expect(
            ctx.systemBuilder
                .createPromotedAsteroidBody
        ).toHaveBeenCalledWith(source);

        expect(
            ctx.bodyRegistry.promote
        ).toHaveBeenCalledTimes(1);

        expect(promoted.data.datasetCategory)
            .toBe('PROMOTED_ASTEROID');
    });

    it('does not create a duplicate CPU representation', () => {
        const ctx = makeContext();

        const existing = {
            data: {
                name: 'CERES',
                datasetCategory: 'PROMOTED_ASTEROID',
            },
        };

        ctx.celestialBodies.push(existing);

        const service =
            new AsteroidPromotionService(ctx);

        const result =
            service.promote(asteroid());

        expect(result).toBe(existing);

        expect(
            ctx.systemBuilder
                .createPromotedAsteroidBody
        ).not.toHaveBeenCalled();

        expect(
            ctx.bodyRegistry.promote
        ).not.toHaveBeenCalled();
    });

    it('purges a promoted body through BodyRegistry', () => {
        const ctx = makeContext();

        const promoted = {
            data: {
                name: 'CERES',
                datasetCategory: 'PROMOTED_ASTEROID',
            },
        };

        ctx.celestialBodies.push(promoted);

        const service =
            new AsteroidPromotionService(ctx);

        expect(service.purge('CERES')).toBe(true);

        expect(
            ctx.bodyRegistry.removeBody
        ).toHaveBeenCalledWith(promoted);
    });

    it('returns false when purging a body that is not promoted', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        expect(
            service.purge('CERES')
        ).toBe(false);

        expect(
            ctx.bodyRegistry.removeBody
        ).not.toHaveBeenCalled();
    });

    it('delegates unpinned promotion cleanup to BodyRegistry', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        service.purgeUnpinned();

        expect(
            ctx.bodyRegistry
                .purgeTacticalClones
        ).toHaveBeenCalledTimes(1);
    });

    it('delegates rescan cleanup to BodyRegistry', () => {
        const ctx = makeContext();

        const service =
            new AsteroidPromotionService(ctx);

        const target = asteroid();

        service.sweepForRescan(target);

        expect(
            ctx.bodyRegistry
                .sweepForRescan
        ).toHaveBeenCalledWith(target);
    });
});