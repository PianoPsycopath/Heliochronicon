// js/core/SystemBuilder.js

export class SystemBuilder {
    constructor({
        bodyRegistry,
        celestialBodies,
        bodyFactory,
        orbitFactory,
        getCurrentTarget,
        onClearTarget,
        onSystemCleared,
        onClearMemory,
        onBodiesChanged,
    }) {
        this.bodyRegistry = bodyRegistry;
        this.celestialBodies = celestialBodies;
        this.bodyFactory = bodyFactory;
        this.orbitFactory = orbitFactory;
        this.getCurrentTarget = getCurrentTarget;
        this.onClearTarget = onClearTarget;
        this.onSystemCleared = onSystemCleared;
        this.onClearMemory = onClearMemory;
        this.onBodiesChanged = onBodiesChanged;
    }

    clearSolarSystem() {
        const { bodyRegistry, onClearTarget, onSystemCleared, onClearMemory } = this;

        bodyRegistry.clearAll();

        onClearTarget();
        onSystemCleared();
        onClearMemory();
    }

    buildSolarSystem(planetaryData) {
        if (planetaryData.length === 0) return;

        const { celestialBodies, bodyRegistry, getCurrentTarget, onBodiesChanged } = this;
        const datasetCategory = planetaryData[0].datasetCategory;
        const datasetName = planetaryData[0].datasetName;
        const currentTargetData = getCurrentTarget();

        // --- PATH A: GPU PARTICLE (ASTEROIDS ONLY) ---
        if (datasetCategory === 'ASTEROID') {
            const particleSystem = this.bodyFactory.createAsteroidParticleSystem(
                planetaryData,
                datasetName
            );
            bodyRegistry.registerParticleSystem(particleSystem);

            onBodiesChanged(celestialBodies, currentTargetData);
            return;
        }

        // --- PATH B: CPU LOGIC (PLANETS & MOONS ONLY) ---
        let index = 0;
        const CHUNK_SIZE = 150;

        const registeredNames = new Set(celestialBodies.map((b) => b.data.name));

        const buildChunk = () => {
            const end = Math.min(index + CHUNK_SIZE, planetaryData.length);

            for (; index < end; index++) {
                const d = planetaryData[index];
                if (registeredNames.has(d.name)) continue;
                registeredNames.add(d.name);

                bodyRegistry.registerBody(this.bodyFactory.createTacticalBody(d));
            }

            if (index < planetaryData.length) {
                requestAnimationFrame(buildChunk);
            } else {
                onBodiesChanged(celestialBodies, currentTargetData);
            }
        };

        buildChunk();
    }

    createPromotedAsteroidBody(d) {
        return this.bodyFactory.createPromotedAsteroidBody(d);
    }

    createOrbitPath(data, semiMajorAxis) {
        return this.orbitFactory.createOrbitPath(data, semiMajorAxis);
    }

    getTacticalA(data, isMoon = false) {
        return this.orbitFactory.getTacticalA(data, isMoon);
    }

    createOrbitCurtain(color) {
        return this.orbitFactory.createOrbitCurtain(color);
    }

    createGroupLabel(text, colorHex, meanA, aSpread) {
        return this.bodyFactory.createGroupLabel(text, colorHex, meanA, aSpread);
    }
}
