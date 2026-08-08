// js/main.js
import { DataLoader} from './DataLoader.js';
import { SceneManager} from './SceneManager.js';
import { Shaders} from './Shaders.js';
import { UIController} from './UIController.js';
import { SystemBuilder} from './SystemBuilder.js';
import { InteractionController} from './InteractionController.js';
import { RenderPipeline} from './RenderPipeline.js';
import { TacticalScanner} from './TacticalScanner.js';
import { PhysicsEngine} from './PhysicsEngine.js';
import { TutorialManager} from './TutorialManager.js';
import { StorageManager } from './storage.js';
import { ZoomRulerManager } from './ZoomRulerManager.js';
import { MeasurementManager } from './MeasurementManager.js';
import { StarLoader } from './StarLoader.js';

import * as THREE from 'three'

const AU_IN_KM = 149597870.7; 
const MAX_WELLS = 35; 

const storage = new StorageManager();
// --- DATA SOURCE (switchable at runtime from the browser console) ---
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

console.log(`[Heliochronicon] Data source: ${DATA_BASE_PATH} (switchDataSource('path/') to change, resetDataSource() to revert)`);

// --- INITIALIZE SCENE MANAGER ---
const sceneManager = new SceneManager('canvas-container');
const scene = sceneManager.scene;
const camera = sceneManager.camera;
const renderer = sceneManager.renderer;
const controls = sceneManager.controls;
const frustumSize = sceneManager.frustumSize;

// --- STATE MANAGEMENT ---
let systemDate = new Date();
let currentTargetData = null;  
let trackingTargetData = null; 
let previewTargetData = null;  // Hover-only preview target - never targeted, never sent to telemetry

const celestialBodies = []; 
const pickableObjects = []; 
const gpuParticleSystems = []; 
const currentOrigin = new THREE.Vector3(0, 0, 0); 

let assetManifest = null;      // cached data/manifest.json, used by the deep asteroid lookup
let lookupInFlight = false;    // guards against overlapping lookups

// --- GLOBAL ASSETS & MEMORY ---
const dotTexture = Shaders.createDotTexture();
const datasetMaterials = {}; 
const savedColors = storage.get('tacticalMapColors', {});

// --- INITIALIZE UI & MATERIALS ---
const gridMaterial = Shaders.getGridMaterial(MAX_WELLS);
const gridPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1000000, 1000000, 4, 4), 
    gridMaterial
);
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
const UI = new UIController();

// --- INITIALIZE SUBSYSTEMS ---
const systemBuilder = new SystemBuilder({
    scene, UI, celestialBodies, pickableObjects, gpuParticleSystems,
    datasetMaterials, savedColors, dotTexture, tacticalMaterial, AU_IN_KM,
    getCurrentTarget: () => currentTargetData,
    onClearTarget: () => { 
        currentTargetData = null; 
        trackingTargetData = null; 
    },
    onClearMemory: () => {
        
    }
});

const interactionController = new InteractionController({
    camera, controls, frustumSize, pickableObjects, UI,
    getCurrentTarget: () => currentTargetData,
    onBodyClicked: (data, isHardLock) => { 
        if (UI.isMeasureMode) {
            measurementManager.handleNodeSelection(data, celestialBodies);
        } else {
            UI.onFocusBody(data, isHardLock); 
        }
    },
    onTrackingBroken: () => { trackingTargetData = null; },
    onBodyHovered: (data) => { previewTargetData = data; }
});

const renderPipeline = new RenderPipeline({
    camera, controls, gridMaterial, gpuParticleSystems, UI, savedColors, MAX_WELLS
});

const tacticalScanner = new TacticalScanner({
    scene, camera, UI, celestialBodies, pickableObjects, gpuParticleSystems, currentOrigin, dotTexture, savedColors,
    systemBuilder,
    getSystemDate: () => systemDate,
    getCurrentTarget: () => currentTargetData,
    getJ2000Days: (date) => PhysicsEngine.getJ2000Days(date),
    onTargetPurged: () => {
        currentTargetData = null;
        trackingTargetData = null;
        interactionController.clearTracking();
        UI.updateTargetPanel(null);
        UI.renderBodyList(celestialBodies, null);
    }
});

const zoomRuler = new ZoomRulerManager({
    camera: sceneManager.camera,
    controls: sceneManager.controls
});

// --- UI CALLBACKS ---
UI.onTimeChanged = (date) => { systemDate = date; };
UI.onClearData = () => { systemBuilder.clearSolarSystem(); };
UI.onRefreshList = () => { UI.renderBodyList(celestialBodies, currentTargetData); };

// Stateful Toggles
const activeDatasets = new Set(); 

UI.onDatasetVisibilityChanged = async (datasetName, isVisible, urls) => {
    if (isVisible) {
        if (activeDatasets.has(datasetName)) return; 
        
        const urlArray = Array.isArray(urls) ? urls : [urls];
        
        try {
            // Fetch all chunks in parallel
            const fetchPromises = urlArray.map(url => DataLoader.fetchJSONDataset(url));
            const chunkResults = await Promise.all(fetchPromises);
            
            // Merge all parsed chunk arrays into single dataset, 
            // TODO: GET RID OF PLANET AND MOON DUPLICATE CHUNKS
            const mergedJSON = chunkResults.flat();
            
            const processedData = DataLoader.processPlanetaryData(mergedJSON, datasetName);
            systemBuilder.buildSolarSystem(processedData);
            activeDatasets.add(datasetName);
        } catch (error) {
            console.error(`Failed to load chunk group for ${datasetName}`, error);
        }
        
    } else {
        // PURGE SEQUENCE
        activeDatasets.delete(datasetName);
        
        // 1. Purge Standard Bodies
        for (let i = celestialBodies.length - 1; i >= 0; i--) {
            const b = celestialBodies[i];
            if (b.data.datasetName === datasetName) {
                scene.remove(b.mesh);
                if (b.sprite) scene.remove(b.sprite);
                if (b.orbitLine) scene.remove(b.orbitLine);
                if (b.orbitCurtain) scene.remove(b.orbitCurtain);
                if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
                
                let pIdx = pickableObjects.indexOf(b.mesh);
                if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                pIdx = pickableObjects.indexOf(b.sprite);
                if (pIdx > -1) pickableObjects.splice(pIdx, 1);
                
                celestialBodies.splice(i, 1);
            }
        }
        for (let i = gpuParticleSystems.length - 1; i >= 0; i--) {
            const sys = gpuParticleSystems[i];
            if (sys.userData && sys.userData.datasetName === datasetName) {
                scene.remove(sys); 
                if (sys.geometry) sys.geometry.dispose();
                if (sys.material) sys.material.dispose();
            
                if (sys.userData.groupLabel) {
                    scene.remove(sys.userData.groupLabel);
                    if (sys.userData.groupLabel.material.map) sys.userData.groupLabel.material.map.dispose();
                    sys.userData.groupLabel.material.dispose();
                    sys.userData.groupLabel.geometry.dispose();
                }
            
                gpuParticleSystems.splice(i, 1);
            }
        }

        if (currentTargetData && currentTargetData.datasetName === datasetName) {
            tacticalScanner.onTargetPurged();
        }
    }
};

UI.onDatasetColorChanged = (datasetName, colorHex) => {
    if (datasetMaterials[datasetName]) {
        if (datasetMaterials[datasetName].uniforms && datasetMaterials[datasetName].uniforms.uColor) {
            datasetMaterials[datasetName].uniforms.uColor.value.set(colorHex);
        } else {
            datasetMaterials[datasetName].color.set(colorHex);
        }
    }
    savedColors[datasetName] = colorHex;
    storage.set('tacticalMapColors', savedColors)
};


UI.onFocusBody = (data, isHardLock = true) => {
    if (data.datasetCategory === 'ASTEROID' || data.datasetCategory === 'RADAR_CONTACT') {
        systemBuilder.promoteAsteroidToCPU(data);
        data = celestialBodies.find(b => b.data.name === data.name && b.data.datasetCategory === 'PROMOTED_ASTEROID').data;
    }

    currentTargetData = data;
    UI.updateTargetPanel(data);
    UI.renderBodyList(celestialBodies, currentTargetData);

    trackingTargetData = isHardLock ? data : null;
    interactionController.triggerFocus(data, isHardLock, AU_IN_KM);
};

UI.onPinRequested = (data) => {
    const b = celestialBodies.find(x => x.data.name === data.name && x.data.datasetCategory === 'PROMOTED_ASTEROID');
    if (b) {
        b.data.isPinned = !b.data.isPinned; 
        UI.updateTargetPanel(b.data); 
    }
};

UI.onPurgeRequested = (data) => {
    const idx = celestialBodies.findIndex(x => x.data.name === data.name && x.data.datasetCategory === 'PROMOTED_ASTEROID');
    if (idx !== -1) {
        const b = celestialBodies[idx];
        scene.remove(b.mesh);
        scene.remove(b.sprite);
        scene.remove(b.orbitLine);
        scene.remove(b.orbitCurtain);
        if (b.label && b.label.parentNode) b.label.parentNode.removeChild(b.label);
        
        let pIdx = pickableObjects.indexOf(b.mesh);
        if (pIdx > -1) pickableObjects.splice(pIdx, 1);
        pIdx = pickableObjects.indexOf(b.sprite);
        if (pIdx > -1) pickableObjects.splice(pIdx, 1);
        
        celestialBodies.splice(idx, 1);
    }
    
    currentTargetData = null;
    trackingTargetData = null;
    interactionController.clearTracking();
    UI.updateTargetPanel(null);
    UI.renderBodyList(celestialBodies, currentTargetData);
};
UI.onAsteroidLookup = async (rawQuery) => {
    if (lookupInFlight) return;
    const query = rawQuery.trim();
    if (!query) return;

    const target = DataLoader.normalizeDesignation(query);

    const tracked = celestialBodies.find(b => DataLoader.normalizeDesignation(b.data.name) === target);
    if (tracked) {
        UI.onFocusBody(tracked.data);
        return;
    }

    for (const system of gpuParticleSystems) {
        const source = system.userData && system.userData.sourceData;
        if (!source) continue;
        const hit = source.find(d => DataLoader.normalizeDesignation(d.name) === target);
        if (hit) {
            UI.onFocusBody(hit);
            return;
        }
    }

    lookupInFlight = true;
    UI.showLookupPending(query);
    try {
        // Skip whatever's already loaded/active -- core datasets (planets,
        // moons, custom systems) are found earlier in this function via the
        // celestialBodies/gpuParticleSystems scan, so there's no need to
        // hardcode specific group names here anymore.
        const skipGroups = [...activeDatasets];
        const found = await DataLoader.findAsteroidInManifest(query, assetManifest, skipGroups);
        if (found) {
            UI.onFocusBody(found);
        } else {
            UI.showLookupNotFound(query);
        }
    } finally {
        lookupInFlight = false;
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
        // Clear all active rulers and the pending node when untoggled
        measurementManager.breakCycleAndClear();
    }
};
// ==========================================
// BACKGROUND STAR FIELD (GPU PARTICLES)
// ==========================================
let starFieldMaterial = null;
const STAR_FAR_PLANE_AU = 1e14;

async function initStarField() {
    const starGeometry = await StarLoader.loadStars(STAR_DATA_BASE_PATH, scene);
    if (!starGeometry) return; // no stars_manifest.json for this data source -- skip silently

    const starMaterial = Shaders.getStarFieldMaterial();
    const starField = new THREE.Points(starGeometry, starMaterial);

    starField.frustumCulled = false; // positions are computed in-shader (proper motion + origin shift)
    starField.matrixAutoUpdate = false;
    starField.renderOrder = -10; // draw behind everything else
    starField.userData = { datasetVisible: true };

    scene.add(starField);
    gpuParticleSystems.push(starField);
    starFieldMaterial = starMaterial;
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

// ==========================================
// SYSTEM BOOTLOADER
// ==========================================
const CORE_CATEGORIES = new Set(['STAR', 'PLANET', 'DWARF_PLANET', 'MOON']);
const ASTEROID_TOGGLE_COLORS = ['#ff3333', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#ff00ff'];

async function bootEngine() {
    let manifest = null;
    try {
        manifest = await DataLoader.fetchJSONDataset(`${DATA_BASE_PATH}manifest.json`);
    } catch (err) {
        console.error(`Failed to load manifest.json from ${DATA_BASE_PATH}`, err);
    }

    if (!manifest || !manifest.datasets || Object.keys(manifest.datasets).length === 0) {
        console.error(`No datasets found in manifest at ${DATA_BASE_PATH}manifest.json`);
        new TutorialManager(storage);
        return;
    }
    assetManifest = manifest;

    let asteroidColorIdx = 0;

    for (const [groupName, groupData] of Object.entries(manifest.datasets)) {
        const chunkUrls = (groupData.chunks || []).map(chunkFile => `${DATA_BASE_PATH}${chunkFile}`);
        if (chunkUrls.length === 0) continue;

        // Peek at the first chunk to see what this dataset actually contains.
        // The category field on the rows -- not the group/file name -- decides
        // whether it's a core system to load immediately or an asteroid-style
        // group the user opts into.
        let firstChunkRows = [];
        try {
            firstChunkRows = await DataLoader.fetchJSONDataset(chunkUrls[0]);
        } catch (err) {
            console.error(`Failed to load first chunk for dataset "${groupName}"`, err);
        }

        if (!firstChunkRows || firstChunkRows.length === 0) continue;

        const categoriesPresent = new Set(
            firstChunkRows.map(row => (row.category || '').toString().toUpperCase())
        );
        const isCore = [...categoriesPresent].some(cat => CORE_CATEGORIES.has(cat));

        if (isCore) {
            try {
                const remainingChunks = chunkUrls.length > 1
                    ? await Promise.all(chunkUrls.slice(1).map(url => DataLoader.fetchJSONDataset(url)))
                    : [];
                const mergedJSON = [firstChunkRows, ...remainingChunks].flat();
                const processedData = DataLoader.processPlanetaryData(mergedJSON, groupName);

                if (processedData.length > 0) {
                    systemBuilder.buildSolarSystem(processedData);
                    activeDatasets.add(groupName);

                    if (!savedColors[groupName]) savedColors[groupName] = '#ffffff';

                    // Icon/category shown on the toggle -- prefer STAR/PLANET
                    // over MOON so mixed systems read as "planet" toggles.
                    const iconCategory = (categoriesPresent.has('STAR') || categoriesPresent.has('PLANET'))
                        ? 'PLANET'
                        : (categoriesPresent.has('MOON') ? 'MOON' : 'PLANET');

                    UI.addDatasetToggle(groupName, iconCategory, savedColors[groupName], true, chunkUrls);
                }
            } catch (err) {
                console.error(`Failed to load core dataset "${groupName}"`, err);
            }
        } else {
            // Asteroid-style dataset: register the toggle off by default; its
            // chunks are fetched lazily by onDatasetVisibilityChanged when
            // the user switches it on.
            if (!savedColors[groupName]) {
                savedColors[groupName] = ASTEROID_TOGGLE_COLORS[asteroidColorIdx % ASTEROID_TOGGLE_COLORS.length];
                asteroidColorIdx++;
            }
            UI.addDatasetToggle(groupName, 'ASTEROID', savedColors[groupName], false, chunkUrls);
        }
    }

    const tutorialManager = new TutorialManager(storage);
}

// ==========================================
// SYSTEM BOOTLOADER
// ==========================================
bootEngine();
let lastFrameTime = performance.now();

// ==========================================
// FRAME PIPELINE STAGES
// ==========================================

function updateSystemTimeStage(ui, currentSysDate, deltaSec) {
    let dateToUse = currentSysDate;
    if (ui.isLiveTime) {
        dateToUse = new Date(); // Lock strictly to system clock
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
        const tBody = bodies.find(x => x.data.name === currentTarget.name);
        if (tBody) {
            let wDeg = (tBody.W_current * 180 / Math.PI) % 360;
            if (wDeg < 0) wDeg += 360;
            ui.updateLiveTelemetry(wDeg, tBody.RA_current_deg, tBody.DEC_current_deg);
            interactionCtrl.updateCamera(tBody.mesh.position);
        }
    }
    ctrls.update();
    cam.updateMatrixWorld();
}

function runRenderPrePassStage(pipeline, bodies, currentTarget, origin, previewTarget) {
    return pipeline.processScreenProjectionsAndCulling(bodies, currentTarget, origin, previewTarget);
}

function updateDualGridsStage(bodies, currentTarget, eclipticGrid, eqGrid, eqMat, cam) {
    // Force the massive Ecliptic Grid to remain perfectly flat at the solar Y=0 baseline
    eclipticGrid.position.set(0, 0, 0);
    eclipticGrid.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

    // Manage the Targeted Equatorial Grid
    if (currentTarget) {
        const tBody = bodies.find(x => x.data.name === currentTarget.name);

        if (tBody) { 
            const isPlanet = !tBody.isMoon && tBody.data.parent !== tBody.data.name;
            if (tBody.data.parent !== tBody.data.name && (isPlanet || tBody.isMoon)) {
                eqGrid.visible = true;
                let anchorPos = tBody.renderPos;
                let anchorQuat = tBody.poleQuaternion;
                let targetMass = tBody.data.mass;

                if (tBody.isMoon) {
                    const parentPlanet = bodies.find(x => x.data.name === tBody.data.parent);
                    if (parentPlanet) {
                        anchorPos = parentPlanet.renderPos;
                        anchorQuat = parentPlanet.poleQuaternion;
                        targetMass = parentPlanet.data.mass; // Inherit parent planet's mass size
                    }
                }
                const massRatio = targetMass / 5.97;
                const dynamicRadius = 0.5 * Math.pow(massRatio, 0.3333);
                eqMat.uniforms.uGridRadius.value = dynamicRadius;

                eqGrid.position.lerp(anchorPos, 0.1);
                const eclipticQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
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

function executeFinalRenderStage(pipeline, webglRenderer, scn, cam, daysSinceJ2000, origin, eclipticGrid) {
    pipeline.updateGPU(daysSinceJ2000, origin, eclipticGrid);
    updateStarFieldFarProjection(cam, starFieldMaterial);
    webglRenderer.render(scn, cam);
}

// ==========================================
// THE MAIN LOOP
// ==========================================

function animate() {
    requestAnimationFrame(animate);
    const deltaSec = (performance.now() - lastFrameTime) / 1000;
    lastFrameTime = performance.now();
    
    // 1. Time Update
    const timeData = updateSystemTimeStage(UI, systemDate, deltaSec);
    systemDate = timeData.newDate;
    const daysSinceJ2000 = timeData.daysSinceJ2000;
    
    // 2. Physics & Logic Pipelines
    runPhysicsStage(celestialBodies, trackingTargetData, currentOrigin, camera, daysSinceJ2000, renderPipeline);
    
    // 3. Hardware Updates (Camera, Telemetry, Shaders)
    updateHardwareStage(celestialBodies, currentTargetData, UI, interactionController, controls, camera);
    
    // 4. Render Pre-Pass (Projections, Culling, Matrices)
    const trackTargetPos = runRenderPrePassStage(renderPipeline, celestialBodies, currentTargetData, currentOrigin, previewTargetData);
    
    // 5. Dual-Grid Architecture Logic
    updateDualGridsStage(celestialBodies, currentTargetData, gridPlane, equatorialGridPlane, equatorialMaterial, camera);
    
    measurementManager.update(camera);
    
    // 6. Final GPU Updates
    executeFinalRenderStage(renderPipeline, renderer, scene, camera, daysSinceJ2000, currentOrigin, gridPlane);
}

animate();