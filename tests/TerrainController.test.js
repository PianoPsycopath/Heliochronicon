// tests/TerrainController.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// Mock it so we can test TerrainController's own branching logic (registry lookup,
// cache hit, pending-load guard) without needing the real shader material factory
// or a WebGL context.
vi.mock('../js/Shaders.js', () => ({
    Shaders: {
        createTerrainContourMat: vi.fn((texture, elevMin, elevMax) => ({
            isMockMaterial: true, texture, elevMin, elevMax
        }))
    }
}));

import { Shaders } from '../js/Shaders.js';
import { TerrainController } from '../js/TerrainController.js';

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

describe('TerrainController', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock;
        Shaders.createTerrainContourMat.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mkBody = (name) => ({
        data: { name },
        mesh: { material: 'ORIGINAL_MATERIAL' }
    });

    it('loads the manifest on construction and stores it once resolved', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ EARTH: { url: 'earth.png' } }) });
        const ctrl = new TerrainController({ celestialBodies: [] });

        expect(ctrl.registry).toBeNull();
        await ctrl.registryPromise;
        expect(ctrl.registry).toEqual({ EARTH: { url: 'earth.png' } });
    });

    it('falls back to an empty registry (terrain stays off) when the manifest fetch fails', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        fetchMock.mockRejectedValue(new Error('network down'));
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;
        expect(ctrl.registry).toEqual({});
        
        errSpy.mockRestore();
        warnSpy.mockRestore();
        logSpy.mockRestore();
    });

    it('falls back to an empty registry when the manifest response is not ok', async () => {
        fetchMock.mockResolvedValue({ ok: false });
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;
        expect(ctrl.registry).toEqual({});
    });

    it('does nothing on a visibility-off event', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const ctrl = new TerrainController({ celestialBodies: [] });
        const ensureSpy = vi.spyOn(ctrl, 'ensureLoaded');

        ctrl.onMeshVisibilityChange(mkBody('EARTH'), false);

        expect(ensureSpy).not.toHaveBeenCalled();
    });

    it('registry miss: does nothing (and does not call ensureLoaded) when the body has no manifest entry', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ MARS: { url: 'mars.png' } }) });
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;

        const ensureSpy = vi.spyOn(ctrl, 'ensureLoaded');
        ctrl.onMeshVisibilityChange(mkBody('EARTH'), true);

        expect(ensureSpy).not.toHaveBeenCalled();
    });

    it('defers the visibility check until the registry has loaded, then retries', async () => {
        let resolveManifest;
        fetchMock.mockReturnValue(new Promise(resolve => { resolveManifest = resolve; }));
        const ctrl = new TerrainController({ celestialBodies: [] });

        // Stub out the implementation -- we only care that it gets *called* once the
        // registry resolves, not about the real texture-loading side effects here.
        const ensureSpy = vi.spyOn(ctrl, 'ensureLoaded').mockImplementation(() => {});
        const body = mkBody('EARTH');
        ctrl.onMeshVisibilityChange(body, true); // registry not ready yet

        expect(ensureSpy).not.toHaveBeenCalled();

        resolveManifest({ ok: true, json: async () => ({ EARTH: { url: 'earth.png' } }) });
        await ctrl.registryPromise;
        await flushMicrotasks();

        expect(ensureSpy).toHaveBeenCalledWith(body, { url: 'earth.png' });
    });

    it('already-cached: reuses the cached material and swaps it onto the mesh without reloading', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;

        const cachedMaterial = { isMockMaterial: true, cached: true };
        ctrl.cache.set('EARTH', { texture: {}, material: cachedMaterial });

        const body = mkBody('EARTH');
        ctrl.ensureLoaded(body, { url: 'earth.png' });

        expect(body.mesh.material).toBe(cachedMaterial);
        expect(Shaders.createTerrainContourMat).not.toHaveBeenCalled();
    });

    it('already-cached: does not touch mesh.material if it already equals the cached material (no-op assignment)', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;

        const cachedMaterial = { isMockMaterial: true };
        ctrl.cache.set('EARTH', { texture: {}, material: cachedMaterial });
        const body = mkBody('EARTH');
        body.mesh.material = cachedMaterial;

        expect(() => ctrl.ensureLoaded(body, { url: 'earth.png' })).not.toThrow();
        expect(body.mesh.material).toBe(cachedMaterial);
    });

    it('pending guard: a second ensureLoaded call for the same body while a load is in flight does not trigger a second texture load', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;

        // Never invoke the load callbacks -> load stays "in flight" for this test
        const loadSpy = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => {});

        const body = mkBody('EARTH');
        ctrl.ensureLoaded(body, { url: 'earth.png' });
        ctrl.ensureLoaded(body, { url: 'earth.png' });

        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(ctrl.pending.has('EARTH')).toBe(true);
    });

    it('on successful load: builds the material via Shaders, caches it, clears the pending flag, and assigns it if the body is still registered', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const fakeTexture = { minFilter: null, magFilter: null, generateMipmaps: true };

        vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
            onLoad(fakeTexture);
        });

        const body = mkBody('EARTH');
        const ctrl = new TerrainController({ celestialBodies: [body] });
        await ctrl.registryPromise;

        ctrl.ensureLoaded(body, { url: 'earth.png', elevMin: -100, elevMax: 8000 });

        expect(Shaders.createTerrainContourMat).toHaveBeenCalledWith(fakeTexture, -100, 8000);
        expect(fakeTexture.generateMipmaps).toBe(false);
        expect(ctrl.pending.has('EARTH')).toBe(false);
        expect(ctrl.cache.has('EARTH')).toBe(true);
        expect(body.mesh.material).toBe(ctrl.cache.get('EARTH').material);
    });

    it('on successful load: does NOT assign the material if the body was removed from ctx.celestialBodies while loading', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const fakeTexture = {};
        vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad) => {
            onLoad(fakeTexture);
        });

        const body = mkBody('EARTH');
        // celestialBodies does NOT include this body (e.g. it was despawned mid-load)
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;

        ctrl.ensureLoaded(body, { url: 'earth.png' });

        expect(ctrl.cache.has('EARTH')).toBe(true); // still cached for later reuse
        expect(body.mesh.material).toBe('ORIGINAL_MATERIAL'); // left untouched
    });

    it('on load error: clears the pending flag and does not populate the cache', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, onLoad, onProgress, onError) => {
        onError(new Error('404'));
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const body = mkBody('EARTH');
    const ctrl = new TerrainController({ celestialBodies: [body] });
    await ctrl.registryPromise;

    ctrl.ensureLoaded(body, { url: 'earth.png' });

    expect(ctrl.pending.has('EARTH')).toBe(false);
    expect(ctrl.cache.has('EARTH')).toBe(false);
    
    consoleSpy.mockRestore();
});

    it('dispose() releases all cached textures/materials and clears both cache and pending sets', async () => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
        const ctrl = new TerrainController({ celestialBodies: [] });
        await ctrl.registryPromise;

        const dispose1 = vi.fn();
        const dispose2 = vi.fn();
        ctrl.cache.set('EARTH', { texture: { dispose: dispose1 }, material: { dispose: dispose2 } });
        ctrl.pending.add('MARS');

        ctrl.dispose();

        expect(dispose1).toHaveBeenCalled();
        expect(dispose2).toHaveBeenCalled();
        expect(ctrl.cache.size).toBe(0);
        expect(ctrl.pending.size).toBe(0);
    });
});
