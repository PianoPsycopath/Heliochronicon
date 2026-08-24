// js/main/main.js
import * as THREE from 'three';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { AU_IN_KM, MAX_WELLS } from '@core/constants.js';
import { SceneManager } from '@core/SceneManager.js';
import { Shaders } from '@rendering/Shaders.js';
import { UIController } from '@ui/UIController.js';
import { SystemBuilder } from '@core/SystemBuilder.js';
import { InteractionController } from '@ui/InteractionController.js';
import { RenderPipeline } from '@rendering/RenderPipeline.js';
import { TacticalScanner } from '@ui/TacticalScanner.js';
import { PhysicsEngine } from '@physics/PhysicsEngine.js';
import { BodyRegistry } from '@core/BodyRegistry.js';
import { StorageManager } from '@core/storage.js';
import { ZoomRulerManager } from '@ui/ZoomRulerManager.js';
import { MeasurementManager } from '@ui/MeasurementManager.js';
import { StarLoader } from '@rendering/StarLoader.js';
import { PinnedStarManager } from '@rendering/PinnedStarManager.js';
import { TerrainController } from '@rendering/TerrainController.js';
import { CreditsManager } from '@ui/CreditsManager.js';
import { DaylightController } from '@rendering/DaylightController.js';
import { EclipseEngine } from '@physics/EclipseEngine.js';
import { EclipseShadowController } from '@rendering/EclipseShadowController.js';
import { SeasonMarkerController } from '@rendering/SeasonMarkerController.js';
import { TooltipManager } from '@ui/TooltipManager.js';
import { AppState } from '@core/AppState.js';
import { logger } from '@core/logger.js';
import { BodyFactory } from '@core/BodyFactory.js';
import { OrbitFactory } from '@core/OrbitFactory.js';
import { AsteroidPromotionService } from '@core/AsteroidPromotionService.js';
import { DatasetCoordinator } from '@main/DatasetCoordinator.js';
import { AsteroidController } from '@main/AsteroidController.js';
import { RenderingLoop } from '@main/RenderingLoop.js';

inject();
injectSpeedInsights();

const STAR_DATA_BASE_PATH = 'star_data/';
const storage = new StorageManager();
const appState = new AppState();
const celestialBodies = [];
const pickableObjects = [];
const gpuParticleSystems = [];
const datasetMaterials = {};
const savedColors = storage.get('tacticalMapColors', {});

const sceneManager = new SceneManager('canvas-container');
const scene = sceneManager.scene;
const camera = sceneManager.camera;
const renderer = sceneManager.renderer;
const controls = sceneManager.controls;
const frustumSize = sceneManager.frustumSize;

const dotTexture = Shaders.createDotTexture();
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

const tacticalMaterial = Shaders.getTacticalMaterial();
const measurementManager = new MeasurementManager(scene, camera);
const tooltipManager = new TooltipManager();
const UI = new UIController({ tooltipManager });
tooltipManager.attachButtonTooltips();

const terrainController = new TerrainController({ celestialBodies });
const daylightController = new DaylightController({ scene, celestialBodies });
const eclipseShadowController = new EclipseShadowController({ scene, celestialBodies });

const bodyRegistry = new BodyRegistry({
    scene,
    celestialBodies,
    pickableObjects,
    gpuParticleSystems,
    daylightController,
    eclipseShadowController,
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

const pinnedStarManager = new PinnedStarManager();

const creditsManager = new CreditsManager({
    el: document.getElementById('hud-credits'),
    terrainController,
});

let activeTerrainBodyNames = [];
let starFieldObject = null;
let starFieldMaterial = null;
let starsVisibleState = false;

const updateCredits = () => {
    creditsManager.update({
        currentTargetData: appState.currentTargetData,
        activeTerrainBodyNames,
        starsVisible: starsVisibleState && !!starFieldObject,
    });
};

terrainController.onActiveBodiesChanged = (names) => {
    activeTerrainBodyNames = names;
    updateCredits();
};

const seasonMarkerController = new SeasonMarkerController({
    scene,
    celestialBodies,
    camera,
    tooltipManager,
});

const dataSource =
    new URLSearchParams(window.location.search).get('dataSource') ||
    storage.get('heliochronicon_dataSourcePath') ||
    'data/';

const orbitFactory = new OrbitFactory();
const bodyFactory = new BodyFactory({
    scene,
    tacticalMaterial,
    auInKm: AU_IN_KM,
    savedColors,
    dotTexture,
    datasetMaterials,
    orbitFactory,
});

const systemBuilder = new SystemBuilder({
    bodyRegistry,
    celestialBodies,
    bodyFactory,
    orbitFactory,
    getCurrentTarget: () => appState.currentTargetData,
    onClearTarget: () => {
        appState.currentTargetData = null;
        appState.trackingTargetData = null;
    },
    onSystemCleared: () => {
        UI.updateTargetPanel(null);
        UI.renderBodyList(celestialBodies, null);
    },
    onBodiesChanged: (bodies, target) => UI.renderBodyList(bodies, target),
    onClearMemory: () => {},
});

const asteroidPromotionService = new AsteroidPromotionService({
    bodyRegistry,
    systemBuilder,
});

const datasetCoordinator = new DatasetCoordinator({
    storage,
    appState,
    systemBuilder,
    bodyRegistry,
    UI,
    datasetMaterials,
    savedColors,
    dataBasePath: dataSource,
    asteroidPromotionService,
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

const asteroidController = new AsteroidController({
    appState,
    UI,
    asteroidPromotionService,
    bodyRegistry,
    interactionController,
    seasonMarkerController,
    storage,
    celestialBodies,
    gpuParticleSystems,
    updateCredits,
    getAssetManifest: () => datasetCoordinator.manifest,
    auInKm: AU_IN_KM,
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
    asteroidPromotionService,
    currentOrigin: appState.currentOrigin,
    getSystemDate: () => appState.systemDate,
    getCurrentTarget: () => appState.currentTargetData,
    getJ2000Days: (date) => PhysicsEngine.getJ2000Days(date),
    onTargetPurged: () => {
        asteroidController.clearTarget();
    },
});

new ZoomRulerManager({
    camera,
    controls,
});

const renderingLoop = new RenderingLoop({
    appState,
    UI,
    scene,
    camera,
    renderer,
    controls,
    renderPipeline,
    celestialBodies,
    measurementManager,
    pinnedStarManager,
    seasonMarkerController,
    gridPlane,
    equatorialGridPlane,
    equatorialMaterial,
    interactionController,
    starFieldMaterialRef: () => starFieldMaterial,
    getStarVisibilityState: () => starsVisibleState,
    setStarVisibilityState: (value) => {
        starsVisibleState = value;
    },
    updateCredits,
});

async function initializeStarField() {
    const starGeometry = await StarLoader.loadStars(STAR_DATA_BASE_PATH, scene);
    if (!starGeometry) return;

    const material = Shaders.getStarFieldMaterial();
    const starField = new THREE.Points(starGeometry, material);
    starField.frustumCulled = false;
    starField.matrixAutoUpdate = false;
    starField.renderOrder = -10;
    starField.userData = { datasetVisible: true };

    scene.add(starField);
    gpuParticleSystems.push(starField);

    starFieldMaterial = material;
    starFieldObject = starField;
    updateCredits();
}

initializeStarField();

UI.onTimeChanged = (date) => {
    appState.systemDate = date;
};

UI.onClearData = () => {
    datasetCoordinator.clearAll();
};

UI.onRefreshList = () => {
    UI.renderBodyList(celestialBodies, appState.currentTargetData);
};

UI.onDatasetVisibilityChanged = async (datasetName, isVisible, urls) => {
    const result = await datasetCoordinator.setDatasetVisibility(datasetName, isVisible, urls);
    if (
        result?.removedDataset &&
        appState.currentTargetData?.datasetName === result.removedDataset
    ) {
        asteroidController.clearTarget();
    }
};

UI.onFocusBody = (data, isHardLock = true) => {
    asteroidController.focus(data, isHardLock);
};

UI.onAsteroidLookup = (query) => {
    asteroidController.lookup(query);
};

UI.onPinRequested = (data) => {
    asteroidController.togglePin(data);
};

UI.onPurgeRequested = (data) => {
    asteroidController.purge(data);
};

UI.onPinStarRequested = (data) => {
    pinnedStarManager.toggle(data);
    UI.showStarSelection(data);
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
        ...celestialBodies.map((body) => body.data),
        ...gpuParticleSystems.flatMap((system) => system.userData?.sourceData || []),
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
        UI.timeThrottle.pauseForManualInput();
        UI.telemetryManager.renderEclipseResult(event);
    } else {
        UI.telemetryManager.renderEclipseResult(null);
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
                    ? system.userData.sourceData.reduce((sum, data) => sum + data.a, 0) /
                      system.userData.sourceData.length
                    : 2.5);
            Shaders.updateGroupLabelColor(label, datasetName, colorHex, meanA);
        }
    }

    const material = datasetMaterials[datasetName];
    if (material?.uniforms?.uColor) {
        material.uniforms.uColor.value.set(colorHex);
    } else if (material?.color) {
        material.color.set(colorHex);
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

datasetCoordinator.configureGlobalDataSourceControls();

logger.info(`[Heliochronicon] Data source: ${datasetCoordinator.dataSourcePath}`);

async function startApplication() {
    creditsManager.setAssetManifest(
        await datasetCoordinator.initialize().then(() => datasetCoordinator.manifest)
    );
    updateCredits();
    renderingLoop.start();
}

startApplication();
