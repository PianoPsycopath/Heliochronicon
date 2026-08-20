// js/main.js
import { DataLoader } from './DataLoader.js';
import { AU_IN_KM, MAX_WELLS } from './constants.js';
import { SceneManager } from './SceneManager.js';
import { Shaders } from './Shaders.js';
import { UIController } from './UIController.js';
import { SystemBuilder } from './SystemBuilder.js';
import { InteractionController } from './InteractionController.js';
import { RenderPipeline } from './RenderPipeline.js';
import { TacticalScanner } from './TacticalScanner.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import { TutorialManager } from './TutorialManager.js';
import { BodyRegistry } from './BodyRegistry.js';
import { StorageManager } from './storage.js';
import { ZoomRulerManager } from './ZoomRulerManager.js';
import { MeasurementManager } from './MeasurementManager.js';
import { StarLoader } from './StarLoader.js';
import { PinnedStarManager } from './PinnedStarManager.js';
import { TerrainController } from './TerrainController.js';
import { CreditsManager } from './CreditsManager.js';
import { DaylightController } from './DaylightController.js';
import { EclipseEngine } from './EclipseEngine.js';
import { EclipseShadowController } from './EclipseShadowController.js';
import { SeasonMarkerController } from './SeasonMarkerController.js';
import { TooltipManager } from './TooltipManager.js';
import { logger } from './logger.js';
import { AppState } from './AppState.js';

import * as THREE from 'three';

const storage = new StorageManager();

const DATA_SOURCE_STORAGE_KEY = 'heliochronicon_dataSourcePath';
const DEFAULT_DATA_BASE_PATH = 'data/';

function normalizeDataBasePath(path) {
    const trimmed = (path || '').trim();
    if (!trimmed) return DEFAULT_DATA_BASE_PATH;
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const DATA_BASE_PATH = normalizeDataBasePath(
    new URLSearchParams(window.location.search).get('dataSource') ||
        storage.get(DATA_SOURCE_STORAGE_KEY) ||
        DEFAULT_DATA_BASE_PATH
);

const STAR_DATA_BASE_PATH = 'star_data/';

window.switchDataSource = function switchDataSource(path) {
    storage.set(DATA_SOURCE_STORAGE_KEY, normalizeDataBasePath(path));
    window.location.reload();
};

window.resetDataSource = function resetDataSource() {
    storage.remove(DATA_SOURCE_STORAGE_KEY);
    window.location.reload();
};

logger.info(
    `[Heliochronicon] Data source: ${DATA_BASE_PATH} (switchDataSource('path/') to change, resetDataSource() to revert)`
);

const sceneManager = new SceneManager('canvas-container');
const scene = sceneManager.scene;
const camera = sceneManager.camera;
const renderer = sceneManager.renderer;
const controls = sceneManager.controls;
const frustumSize = sceneManager.frustumSize;

const appState = new AppState();

const celestialBodies = [];
const pickableObjects = [];
const gpuParticleSystems = [];

let assetManifest = null;

const dotTexture = Shaders.createDotTexture();
const datasetMaterials = {};
const savedColors = storage.get('tacticalMapColors', {});

const gridMaterial = Shaders.getGridMaterial(MAX_WELLS);
const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(1000000, 1000000, 4, 4), gridMaterial);
gridPlane.rotation.x = -Math.PI / 2;
gridPlane.renderOrder = -2;
scene.add(gridPlane);

const equatorialMaterial = Shaders.getEquatorialGridMaterial();
const equatorialGridPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000, 4, 4),
    equatorialMaterial
);
equatorialGridPlane.visible = false;
equatorialGridPlane.renderOrder = -1;
scene.add(equatorialGridPlane);

const measurementManager = new MeasurementManager(scene, camera);
const tacticalMaterial = Shaders.getTacticalMaterial();

// Shared tooltip for world-space hover and button tooltips.
const tooltipManager = new TooltipManager();

const UI = new UIController({ tooltipManager });
tooltipManager.attachButtonTooltips();

const terrainController = new TerrainController({ celestialBodies });
const daylightController = new DaylightController({ scene, celestialBodies });
const eclipseShadowController = new EclipseShadowController({ scene, celestialBodies });

const creditsManager = new CreditsManager({
    el: document.getElementById('hud-credits'),
    terrainController,
});
let activeTerrainBodyNames = [];
let starFieldObject = null;

const STAR_CREDIT_ZOOM_THRESHOLD = 0.075;
let starsVisibleState = false;

function updateCredits() {
    creditsManager.update({
        currentTargetData: appState.currentTargetData,
        activeTerrainBodyNames,
        starsVisible: starsVisibleState && !!starFieldObject,
    });
}
terrainController.onActiveBodiesChanged = (names) => {
    activeTerrainBodyNames = names;
    updateCredits();
};

fetch(`${STAR_DATA_BASE_PATH}stars_manifest.json`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
        if (json && json.credit) {
            creditsManager.starsCredit = json.credit;
            updateCredits();
        }
    })
    .catch((err) => logger.warn('Could not load stars_manifest.json credit line', err));

const bodyRegistry = new BodyRegistry({
    scene,
    celestialBodies,
    pickableObjects,
    gpuParticleSystems,
    daylightController,
    eclipseShadowController,
});

const systemBuilder = new SystemBuilder({
    scene,
    UI,
    celestialBodies,
    pickableObjects,
    gpuParticleSystems,
    datasetMaterials,
    savedColors,
    dotTexture,
    tacticalMaterial,
    AU_IN_KM,
    bodyRegistry,
    getCurrentTarget: () => appState.currentTargetData,
    onClearTarget: () => {
        appState.currentTargetData = null;
        appState.trackingTargetData = null;
        updateCredits();
        seasonMarkerController.setTarget(null);
    },
    onClearMemory: () => {},
});

const interactionController = new InteractionController({
    camera,
    controls,
    frustumSize,
    pickableObjects,
    gpuParticleSystems,
    UI,
    renderer,
    tooltipManager,
    getCurrentOrigin: () => appState.currentOrigin,
    getDaysSinceJ2000: () => PhysicsEngine.getJ2000Days(appState.systemDate),
    getCurrentTarget: () => appState.currentTargetData,
    onBodyClicked: (data, isHardLock) => {
        if (data && data.datasetCategory === 'BACKGROUND_STAR') {
            if (UI.isMeasureMode) {
                measurementManager.handleNodeSelection(data, celestialBodies);
            } else {
                UI.showStarSelection(data);
            }
            return;
        }
        if (UI.isMeasureMode) {
            measurementManager.handleNodeSelection(data, celestialBodies);
        } else {
            UI.onFocusBody(data, isHardLock);
        }
    },
    onTrackingBroken: () => {
        appState.trackingTargetData = null;
    },
    onBodyHovered: (data) => {
        appState.previewTargetData = data;
    },
});

const renderPipeline = new RenderPipeline({
    camera,
    controls,
    gridMaterial,
    gpuParticleSystems,
    UI,
    savedColors,
    MAX_WELLS,
    terrainController,
    daylightController,
    eclipseShadowController,
});

const seasonMarkerController = new SeasonMarkerController({
    scene,
    celestialBodies,
    camera,
    tooltipManager,
});

const tacticalScanner = new TacticalScanner({
    scene,
    camera,
    UI,
    celestialBodies,
    pickableObjects,
    gpuParticleSystems,
    dotTexture,
    savedColors,
    systemBuilder,
    bodyRegistry,
    currentOrigin: appState.currentOrigin,
    getSystemDate: () => appState.systemDate,
    getCurrentTarget: () => appState.currentTargetData,
    onTargetPurged: () => {
        appState.currentTargetData = null;
        appState.trackingTargetData = null;
        interactionController.clearTracking();
        UI.updateTargetPanel(null);
        UI.renderBodyList(celestialBodies, null);
        updateCredits();
        seasonMarkerController.setTarget(null);
    },
});

new ZoomRulerManager({
    camera: sceneManager.camera,
    controls: sceneManager.controls,
});

const pinnedStarManager = new PinnedStarManager();

UI.onTimeChanged = (date) => {
    appState.systemDate = date;
};
UI.onClearData = () => {
    systemBuilder.clearSolarSystem();
    appState.clearActiveDatasets();
    appState.clearInFlightDatasets();
    appState.lookupInFlight = false;
    storage.set('activeDatasets', []);
};
UI.onRefreshList = () => {
    UI.renderBodyList(celestialBodies, appState.currentTargetData);
};

UI.onDatasetVisibilityChanged = async (datasetName, isVisible, urls) => {
    if (isVisible) {
        if (appState.hasActiveDataset(datasetName) || appState.hasInFlightDataset(datasetName))
            return;

        appState.addInFlightDataset(datasetName);
        const urlArray = Array.isArray(urls) ? urls : [urls];

        try {
            const fetchPromises = urlArray.map((url) => DataLoader.fetchJSONDataset(url));
            const chunkResults = await Promise.all(fetchPromises);

            if (!appState.hasInFlightDataset(datasetName)) {
                logger.info(
                    `[Heliochronicon] Load aborted for ${datasetName}; toggled off during fetch.`
                );
                return;
            }

            const mergedJSON = chunkResults.flat();
            const processedData = DataLoader.processPlanetaryData(mergedJSON, datasetName);
            systemBuilder.buildSolarSystem(processedData);
            appState.addActiveDataset(datasetName);
            storage.set('activeDatasets', appState.getActiveDatasets());
        } catch (error) {
            logger.error(`Failed to load chunk group for ${datasetName}`, error);
            UI.showLookupNotFound(`Failed to download ${datasetName} dataset. Check network.`);
        } finally {
            appState.removeInFlightDataset(datasetName);
        }
    } else {
        appState.removeInFlightDataset(datasetName);
        appState.removeActiveDataset(datasetName);
        storage.set('activeDatasets', appState.getActiveDatasets());

        bodyRegistry.removeByDataset(datasetName);
        delete datasetMaterials[datasetName];

        if (appState.currentTargetData && appState.currentTargetData.datasetName === datasetName) {
            tacticalScanner.onTargetPurged();
        }
    }
};

UI.onDatasetColorChanged = (datasetName, colorHex) => {
    savedColors[datasetName] = colorHex;
    storage.set('tacticalMapColors', savedColors);

    for (const system of gpuParticleSystems) {
        if (system.userData?.datasetName !== datasetName) continue;

        if (system.material?.uniforms?.uColor) {
            system.material.uniforms.uColor.value.set(colorHex);
        }

        const label = system.userData.groupLabel;
        if (label) {
            const meanA =
                system.userData.meanA ??
                (system.userData.sourceData?.length
                    ? system.userData.sourceData.reduce((s, d) => s + d.a, 0) /
                      system.userData.sourceData.length
                    : 2.5);

            Shaders.updateGroupLabelColor(label, datasetName, colorHex, meanA);
        }
    }

    const mat = datasetMaterials[datasetName];
    if (mat?.uniforms?.uColor) {
        mat.uniforms.uColor.value.set(colorHex);
    } else if (mat?.color) {
        mat.color.set(colorHex);
    }

    for (const body of celestialBodies) {
        if (
            body.data?.datasetCategory !== 'PROMOTED_ASTEROID' ||
            body.data?.datasetName !== datasetName
        ) {
            continue;
        }
        if (body.label) body.label.style.color = colorHex;
        if (body.sprite?.material?.color) body.sprite.material.color.set(colorHex);
        if (body.orbitLine?.material?.color) body.orbitLine.material.color.set(colorHex);
    }
};

UI.onFocusBody = (data, isHardLock = true) => {
    if (data && data.datasetCategory === 'BACKGROUND_STAR') {
        UI.showStarSelection(data);
        return;
    }
    if (data.datasetCategory === 'ASTEROID' || data.datasetCategory === 'RADAR_CONTACT') {
        systemBuilder.promoteAsteroidToCPU(data);
        data = celestialBodies.find(
            (b) => b.data.name === data.name && b.data.datasetCategory === 'PROMOTED_ASTEROID'
        ).data;
    }

    appState.currentTargetData = data;
    UI.updateTargetPanel(data);
    UI.renderBodyList(celestialBodies, appState.currentTargetData);
    updateCredits();
    seasonMarkerController.setTarget(appState.currentTargetData);

    appState.trackingTargetData = isHardLock ? data : null;
    interactionController.triggerFocus(data, isHardLock, AU_IN_KM);
};

UI.onPinRequested = (data) => {
    const b = celestialBodies.find(
        (x) => x.data.name === data.name && x.data.datasetCategory === 'PROMOTED_ASTEROID'
    );
    if (b) {
        b.data.isPinned = !b.data.isPinned;
        UI.updateTargetPanel(b.data);

        let pinned = storage.get('pinnedAsteroids', []);

        if (b.data.isPinned) {
            if (!pinned.some((p) => p.name === b.data.name)) {
                pinned.push(b.data);
            }
        } else {
            pinned = pinned.filter((p) => p.name !== b.data.name);
        }

        storage.set('pinnedAsteroids', pinned);
    }
};

UI.onPurgeRequested = (data) => {
    bodyRegistry.removeByNameAndCategory(data.name, 'PROMOTED_ASTEROID');

    let pinned = storage.get('pinnedAsteroids', []);
    const initialLength = pinned.length;
    pinned = pinned.filter((p) => p.name !== data.name);

    if (pinned.length !== initialLength) {
        storage.set('pinnedAsteroids', pinned);
    }

    // Route state clears through appState
    appState.currentTargetData = null;
    appState.trackingTargetData = null;

    interactionController.clearTracking();
    UI.updateTargetPanel(null);
    UI.renderBodyList(celestialBodies, appState.currentTargetData);
    updateCredits();
    seasonMarkerController.setTarget(null);
};

UI.onPinStarRequested = (data) => {
    pinnedStarManager.toggle(data);
    UI.showStarSelection(data);
};

UI.onAsteroidLookup = async (rawQuery) => {
    if (appState.lookupInFlight) return;

    const query = rawQuery.trim();
    if (!query) return;

    const target = DataLoader.normalizeDesignation(query);

    const tracked = celestialBodies.find(
        (b) => DataLoader.normalizeDesignation(b.data.name) === target
    );

    if (tracked) {
        UI.onFocusBody(tracked.data);
        return;
    }

    for (const system of gpuParticleSystems) {
        const source = system.userData && system.userData.sourceData;
        if (!source) continue;

        const hit = source.find((d) => DataLoader.normalizeDesignation(d.name) === target);

        if (hit) {
            UI.onFocusBody(hit);
            return;
        }
    }

    appState.lookupInFlight = true;
    UI.showLookupPending(query);

    try {
        const skipGroups = appState.getActiveDatasets();

        const found = await DataLoader.findAsteroidInManifest(query, assetManifest, skipGroups);

        if (found) {
            UI.onFocusBody(found);
        } else {
            UI.showLookupNotFound(query);
        }
    } catch (error) {
        logger.error(`Asteroid lookup failed due to network or parsing error:`, error);
        UI.showLookupNotFound(`Network error querying ${query}`);
    } finally {
        appState.lookupInFlight = false;
    }
};

UI.onScanRequested = (isActive) => {
    if (isActive) {
        tacticalScanner.performTacticalScan();
    } else {
        tacticalScanner.purgeTacticalClones();
    }
};

UI.onSearch = (query) => {
    tacticalScanner.executeSearch(query);
};

UI.onMeasureModeChanged = (isActive) => {
    if (!isActive) {
        measurementManager.breakCycleAndClear();
    }
};

UI.onDaylightToggleChanged = (isEnabled) => {
    daylightController.setEnabled(isEnabled);
};

UI.onCurtainDisplayModeChanged = (mode) => {
    renderPipeline.setCurtainMode(mode);
};

UI.onEclipseNavRequested = (direction) => {
    if (!appState.currentTargetData) return;

    const allBodiesData = [
        ...celestialBodies.map((b) => b.data),
        ...gpuParticleSystems.flatMap((s) => s.userData.sourceData || []),
    ];

    const fromDays = PhysicsEngine.getJ2000Days(appState.systemDate);

    const event = EclipseEngine.findNextEclipse(
        appState.currentTargetData,
        allBodiesData,
        fromDays,
        direction
    );

    if (event) {
        const newDate = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + event.days * 86400000);

        appState.systemDate = newDate;

        UI.updateTimeInput(newDate);

        // Pause so the jumped date is not immediately overwritten.
        UI.timeThrottle.pauseForManualInput();

        UI.telemetryManager.renderEclipseResult(event);
    } else {
        UI.telemetryManager.renderEclipseResult(null);
    }
};

let starFieldMaterial = null;
const STAR_FAR_PLANE_AU = 1e14;

async function initStarField() {
    const starGeometry = await StarLoader.loadStars(STAR_DATA_BASE_PATH, scene);
    if (!starGeometry) return;

    const starMaterial = Shaders.getStarFieldMaterial();
    const starField = new THREE.Points(starGeometry, starMaterial);

    starField.frustumCulled = false;
    starField.matrixAutoUpdate = false;
    starField.renderOrder = -10;
    starField.userData = { datasetVisible: true };

    scene.add(starField);
    gpuParticleSystems.push(starField);
    starFieldMaterial = starMaterial;
    starFieldObject = starField;
    updateCredits();
}
initStarField();

function updateStarFieldFarProjection(cam, material) {
    if (!material || typeof cam.updateProjectionMatrix !== 'function') return;
    const realFar = cam.far;
    cam.far = STAR_FAR_PLANE_AU;
    cam.updateProjectionMatrix();
    material.uniforms.uStarProjectionMatrix.value.copy(cam.projectionMatrix);
    cam.far = realFar;
    cam.updateProjectionMatrix();
}

const CORE_CATEGORIES = new Set(['STAR', 'PLANET', 'DWARF_PLANET', 'MOON']);
const ASTEROID_TOGGLE_COLORS = ['#ff3333', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff'];

async function bootEngine() {
    let manifest = null;
    try {
        manifest = await DataLoader.fetchJSONDataset(`${DATA_BASE_PATH}manifest.json`);
    } catch (err) {
        logger.error(`Failed to load manifest.json from ${DATA_BASE_PATH}`, err);
    }

    if (!manifest || !manifest.datasets || Object.keys(manifest.datasets).length === 0) {
        logger.error(`No datasets found in manifest at ${DATA_BASE_PATH}manifest.json`);
        new TutorialManager(storage);
        return;
    }
    assetManifest = manifest;
    creditsManager.setAssetManifest(assetManifest);
    updateCredits();

    let asteroidColorIdx = 0;

    const savedActiveDatasets = storage.get('activeDatasets', null);

    for (const [groupName, groupData] of Object.entries(manifest.datasets)) {
        const chunkUrls = (groupData.chunks || []).map(
            (chunkFile) => `${DATA_BASE_PATH}${chunkFile}`
        );
        if (chunkUrls.length === 0) continue;

        let firstChunkRows = [];
        try {
            firstChunkRows = await DataLoader.fetchJSONDataset(chunkUrls[0]);
        } catch (err) {
            logger.error(`Failed to load first chunk for dataset "${groupName}"`, err);
        }

        if (!firstChunkRows || firstChunkRows.length === 0) continue;

        const categoriesPresent = new Set(
            firstChunkRows.map((row) => (row.category || '').toString().toUpperCase())
        );
        const isCore = [...categoriesPresent].some((cat) => CORE_CATEGORIES.has(cat));

        const shouldBeActive =
            savedActiveDatasets !== null ? savedActiveDatasets.includes(groupName) : isCore;

        const iconCategory = isCore
            ? categoriesPresent.has('STAR') || categoriesPresent.has('PLANET')
                ? 'PLANET'
                : categoriesPresent.has('MOON')
                  ? 'MOON'
                  : 'PLANET'
            : 'ASTEROID';

        if (!savedColors[groupName]) {
            if (isCore) {
                savedColors[groupName] = '#ffffff';
            } else {
                savedColors[groupName] =
                    ASTEROID_TOGGLE_COLORS[asteroidColorIdx % ASTEROID_TOGGLE_COLORS.length];
                asteroidColorIdx++;
            }
        }

        if (shouldBeActive) {
            try {
                const remainingChunks =
                    chunkUrls.length > 1
                        ? await Promise.all(
                              chunkUrls.slice(1).map((url) => DataLoader.fetchJSONDataset(url))
                          )
                        : [];
                const mergedJSON = [firstChunkRows, ...remainingChunks].flat();
                const processedData = DataLoader.processPlanetaryData(mergedJSON, groupName);

                if (processedData.length > 0) {
                    systemBuilder.buildSolarSystem(processedData);
                    appState.addActiveDataset(groupName);

                    UI.addDatasetToggle(
                        groupName,
                        iconCategory,
                        savedColors[groupName],
                        true,
                        chunkUrls
                    );
                }
            } catch (err) {
                logger.error(`Failed to load dataset "${groupName}"`, err);
            }
        } else {
            UI.addDatasetToggle(groupName, iconCategory, savedColors[groupName], false, chunkUrls);
        }
    }
    const pinnedAsteroids = storage.get('pinnedAsteroids', []);

    pinnedAsteroids.forEach((astData) => {
        astData.isPinned = true;
        systemBuilder.promoteAsteroidToCPU(astData);
    });

    new TutorialManager(storage);
}

bootEngine();
let lastFrameTime = performance.now();

function updateSystemTimeStage(ui, currentSysDate, deltaSec) {
    let dateToUse = currentSysDate;
    if (ui.timeThrottle.isLiveTime) {
        dateToUse = new Date();
    }
    return PhysicsEngine.updateSystemTime(ui, dateToUse, deltaSec);
}

function runPhysicsStage(bodies, trackingTarget, origin, cam, daysSinceJ2000, pipeline) {
    PhysicsEngine.calculateKeplerianKinematics(bodies, daysSinceJ2000);
    PhysicsEngine.applyMoonParentOffsets(bodies);
    pipeline.processFloatingOrigin(bodies, trackingTarget, origin, daysSinceJ2000);
    PhysicsEngine.zSortCelestialBodies(bodies, cam.position, origin);
}

function updateHardwareStage(bodies, currentTarget, ui, interactionCtrl, ctrls, cam) {
    if (currentTarget) {
        const tBody = bodies.find((x) => x.data.name === currentTarget.name);
        if (tBody) {
            let wDeg = ((tBody.W_current * 180) / Math.PI) % 360;
            if (wDeg < 0) wDeg += 360;
            ui.updateLiveTelemetry(wDeg, tBody.RA_current_deg, tBody.DEC_current_deg);
            interactionCtrl.updateCamera(tBody.mesh.position);
        }
    }
    ctrls.update();
    cam.updateMatrixWorld();
}

function runRenderPrePassStage(
    pipeline,
    bodies,
    currentTarget,
    origin,
    previewTarget,
    daysSinceJ2000
) {
    return pipeline.processScreenProjectionsAndCulling(
        bodies,
        currentTarget,
        origin,
        previewTarget,
        daysSinceJ2000
    );
}

function updateDualGridsStage(bodies, currentTarget, eclipticGrid, eqGrid, eqMat, cam, origin) {
    eclipticGrid.position.set(-origin.x, -origin.y, -origin.z);
    eclipticGrid.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

    if (currentTarget) {
        const tBody = bodies.find((x) => x.data.name === currentTarget.name);

        if (tBody) {
            const isPlanet = !tBody.isMoon && tBody.data.parent !== tBody.data.name;
            if (tBody.data.parent !== tBody.data.name && (isPlanet || tBody.isMoon)) {
                eqGrid.visible = true;
                let anchorPos = tBody.renderPos;
                let anchorQuat = tBody.poleQuaternion;
                let targetMass = tBody.data.mass;

                if (tBody.isMoon) {
                    const parentPlanet = bodies.find((x) => x.data.name === tBody.data.parent);
                    if (parentPlanet) {
                        anchorPos = parentPlanet.renderPos;
                        anchorQuat = parentPlanet.poleQuaternion;
                        targetMass = parentPlanet.data.mass;
                    }
                }
                const massRatio = targetMass / 5.97;
                const dynamicRadius = 0.5 * Math.pow(massRatio, 0.3333);
                eqMat.uniforms.uGridRadius.value = dynamicRadius;

                eqGrid.position.lerp(anchorPos, 0.1);
                const eclipticQuat = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(1, 0, 0),
                    -Math.PI / 2
                );
                const finalQuat = anchorQuat.clone().multiply(eclipticQuat);
                eqGrid.quaternion.slerp(finalQuat, 0.1);
                eqMat.uniforms.cameraPos.value.copy(cam.position);
            } else {
                eqGrid.visible = false;
            }
        } else {
            eqGrid.visible = false;
        }
    } else {
        eqGrid.visible = false;
    }
}

function executeFinalRenderStage(
    pipeline,
    webglRenderer,
    scn,
    cam,
    daysSinceJ2000,
    origin,
    eclipticGrid
) {
    pipeline.updateGPU(daysSinceJ2000, origin, eclipticGrid);
    updateStarFieldFarProjection(cam, starFieldMaterial);
    webglRenderer.render(scn, cam);
}

function animate() {
    requestAnimationFrame(animate);
    const deltaSec = (performance.now() - lastFrameTime) / 1000;
    lastFrameTime = performance.now();

    const perfSample = UI.performanceMonitor.tick(deltaSec);
    if (perfSample) UI.updatePerf(perfSample);

    const starsVisibleNow = camera.zoom <= STAR_CREDIT_ZOOM_THRESHOLD;
    if (starsVisibleNow !== starsVisibleState) {
        starsVisibleState = starsVisibleNow;
        updateCredits();
    }

    const timeData = updateSystemTimeStage(UI, appState.systemDate, deltaSec);
    appState.systemDate = timeData.newDate;
    const daysSinceJ2000 = timeData.daysSinceJ2000;

    runPhysicsStage(
        celestialBodies,
        appState.trackingTargetData,
        appState.currentOrigin,
        camera,
        daysSinceJ2000,
        renderPipeline
    );
    updateHardwareStage(
        celestialBodies,
        appState.currentTargetData,
        UI,
        interactionController,
        controls,
        camera
    );
    runRenderPrePassStage(
        renderPipeline,
        celestialBodies,
        appState.currentTargetData,
        appState.currentOrigin,
        appState.previewTargetData,
        daysSinceJ2000
    );
    updateDualGridsStage(
        celestialBodies,
        appState.currentTargetData,
        gridPlane,
        equatorialGridPlane,
        equatorialMaterial,
        camera,
        appState.currentOrigin
    );

    measurementManager.update(camera, appState.currentOrigin, daysSinceJ2000);
    pinnedStarManager.update(camera, appState.currentOrigin, daysSinceJ2000);
    seasonMarkerController.update(appState.systemDate, daysSinceJ2000, appState.currentOrigin);

    executeFinalRenderStage(
        renderPipeline,
        renderer,
        scene,
        camera,
        daysSinceJ2000,
        appState.currentOrigin,
        gridPlane
    );
}

animate();
