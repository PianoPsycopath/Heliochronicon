// js/RenderPipeline.js
import { OrbitalMath } from './OrbitalMath.js';
import * as THREE from 'three';

// --- Constants ---
const CATEGORY_MOON = 'MOON';
const CATEGORY_ASTEROID = 'ASTEROID';
const CATEGORY_PROMOTED_ASTEROID = 'PROMOTED_ASTEROID';
const CATEGORY_RADAR_CONTACT = 'RADAR_CONTACT';
const CATEGORY_NONE = 'NONE';

const ORBIT_MODEL_MEEUS = 'MEEUS';
const ORBIT_MODEL_VSOP87 = 'VSOP87';
const ORBIT_MODEL_KEPLER = 'KEPLER';

const SUN_MASS_EARTH_MASSES = 1988500;
const MACRO_SCALE_ZOOM_THRESHOLD = 0.075;
const ORBIT_LINE_RESOLUTION = 720;

const DEEP_WELL_DEPTH = -60.0;
const DEEP_WELL_RADIUS = 0.15;
const PLANET_WELL_DEPTH = -15.0;

const COLOR_TARGET_ORBIT = 0x00aaff;
const COLOR_PREVIEW_ORBIT = 0xffffff;
const COLOR_DEFAULT_ORBIT = 0xff1111;

export function getActiveSystemName(currentTargetData) {
    if (!currentTargetData) {
        return CATEGORY_NONE;
    }

    if (currentTargetData.category === CATEGORY_MOON) {
        return currentTargetData.parent;
    }

    return currentTargetData.name;
}

export class RenderPipeline {
    constructor(pipelineContext) {
        this.camera = pipelineContext.camera;
        this.controls = pipelineContext.controls;
        this.gridMaterial = pipelineContext.gridMaterial;
        this.gpuParticleSystems = pipelineContext.gpuParticleSystems;
        this.uiController = pipelineContext.UI;
        this.savedColors = pipelineContext.savedColors;
        this.maximumWells = pipelineContext.MAX_WELLS;
        this.terrainController = pipelineContext.terrainController;
        this.daylightController = pipelineContext.daylightController;
        this.eclipseShadowController = pipelineContext.eclipseShadowController;

        this.PLANET_SPRITE_SIZE = 4.5;
        this.MOON_SPRITE_SIZE = 2.5;
        this.ASTEROID_SPRITE_SIZE = 1.2;
        this.STAR_SPRITE_SIZE = 8;
        this.OCCLUSION_DISTANCE_SQUARED = 35 * 35;

        this.LABEL_SAMPLE_COUNT = 64;
        this.LABEL_ZOOM_FADE_START = 8;
        this.LABEL_ZOOM_FADE_END = 30;
        this.LABEL_SMOOTHING = 0.05;

        // --- TIME-SLICING QUEUE ---
        this.activationQueue = new Set();
        this.MAX_ACTIVATIONS_PER_FRAME = 3;

        this._xAxis = new THREE.Vector3(1, 0, 0);
        this._yAxis = new THREE.Vector3(0, 1, 0);
        this._flatQuaternion = new THREE.Quaternion().setFromAxisAngle(this._xAxis, -Math.PI / 2);
        this._yawQuaternion = new THREE.Quaternion();

        this._projectionVector = new THREE.Vector3();
    }

    _hideBodyResources(celestialBody) {
        if (celestialBody.sprite.visible) celestialBody.sprite.visible = false;
        if (celestialBody.mesh.visible) celestialBody.mesh.visible = false;
        if (celestialBody.orbitLine?.visible) celestialBody.orbitLine.visible = false;
        if (celestialBody.orbitCurtain?.visible) celestialBody.orbitCurtain.visible = false;

        if (celestialBody.label && celestialBody.label.style.display !== 'none') {
            celestialBody.label.style.display = 'none';
        }

        if (this.activationQueue) this.activationQueue.delete(celestialBody);

        if (celestialBody._isMeshControllersActive !== false) {
            if (this.terrainController)
                this.terrainController.onMeshVisibilityChange(celestialBody, false);
            if (this.daylightController)
                this.daylightController.onMeshVisibilityChange(celestialBody, false);
            if (this.eclipseShadowController)
                this.eclipseShadowController.onMeshVisibilityChange(celestialBody, false);

            celestialBody._isMeshControllersActive = false;
        }
    }

    processFloatingOrigin(celestialBodies, trackingTargetData, currentOrigin, daysSinceJ2000) {
        let targetAbsolutePosition = new THREE.Vector3(0, 0, 0);

        if (trackingTargetData) {
            const targetBody = celestialBodies.find(
                (body) => body.data.name === trackingTargetData.name
            );

            if (targetBody) {
                targetAbsolutePosition.copy(targetBody.globalPos);
            } else if (trackingTargetData.datasetCategory === CATEGORY_ASTEROID) {
                const currentMeanAnomaly =
                    trackingTargetData.M0 + trackingTargetData.n * daysSinceJ2000;

                targetAbsolutePosition = OrbitalMath.calcPosFromM(
                    trackingTargetData.a,
                    trackingTargetData.e,
                    trackingTargetData.i,
                    trackingTargetData.w,
                    trackingTargetData.Node,
                    currentMeanAnomaly
                );
            }
        }

        const shiftDeltaVector = targetAbsolutePosition.clone().sub(currentOrigin);

        if (shiftDeltaVector.lengthSq() > 0) {
            this.camera.position.sub(shiftDeltaVector);
            this.controls.target.sub(shiftDeltaVector);
            currentOrigin.copy(targetAbsolutePosition);
        }
    }

    processScreenProjectionsAndCulling(
        celestialBodies,
        currentTargetData,
        currentOrigin,
        previewTargetData = null,
        daysSinceJ2000 = 0
    ) {
        const moonFilters = this.uiController.getMoonFilters();
        const activeSystemName = getActiveSystemName(currentTargetData);

        let activeWellIndex = 0;
        let trackingTargetPosition = new THREE.Vector3(0, 0, 0);

        const drawnScreenPositions = [];
        const screenHalfWidth = window.innerWidth * 0.5;
        const screenHalfHeight = window.innerHeight * 0.5;

        celestialBodies.forEach((celestialBody) => {
            celestialBody.renderPos = celestialBody.globalPos.clone().sub(currentOrigin);
        });

        celestialBodies.forEach((celestialBody) => {
            const bodyData = celestialBody.data;

            if (celestialBody.isCulled) {
                this._hideBodyResources(celestialBody);
                return;
            }

            const isTarget = currentTargetData ? bodyData.name === currentTargetData.name : false;
            const isPreview =
                !isTarget && previewTargetData ? bodyData === previewTargetData : false;

            if (celestialBody.isMoon) {
                const isTargetSystem = bodyData.parent === activeSystemName;
                const radiusKilometers = bodyData.radius_km || 0;
                const passesFilters =
                    bodyData.a >= moonFilters.distMin &&
                    bodyData.a <= moonFilters.distMax &&
                    radiusKilometers >= moonFilters.sizeMin &&
                    radiusKilometers <= moonFilters.sizeMax;

                if (!isTargetSystem || !passesFilters) {
                    celestialBody.isCulled = true;
                    this._hideBodyResources(celestialBody);
                    return;
                }
            }

            this._projectionVector.copy(celestialBody.renderPos).project(this.camera);

            const screenX = this._projectionVector.x * screenHalfWidth + screenHalfWidth;
            const screenY = -(this._projectionVector.y * screenHalfHeight) + screenHalfHeight;
            const isBehindCamera = this._projectionVector.z > 1;

            let isOccluded = false;

            if (!isTarget && !isBehindCamera && bodyData.parent !== bodyData.name) {
                for (let index = 0; index < drawnScreenPositions.length; index++) {
                    const position = drawnScreenPositions[index];
                    const deltaX = screenX - position.x;
                    const deltaY = screenY - position.y;

                    if (deltaX * deltaX + deltaY * deltaY < this.OCCLUSION_DISTANCE_SQUARED) {
                        isOccluded = true;
                        break;
                    }
                }
            }

            if (!isOccluded && !isBehindCamera) {
                if (
                    bodyData.datasetCategory !== CATEGORY_PROMOTED_ASTEROID &&
                    bodyData.datasetCategory !== CATEGORY_RADAR_CONTACT
                ) {
                    drawnScreenPositions.push({ x: screenX, y: screenY });
                }
            }

            celestialBody.mesh.quaternion.copy(celestialBody.poleQuaternion);
            celestialBody.mesh.rotateY(celestialBody.W_current);

            celestialBody.sprite.position.copy(celestialBody.renderPos);
            celestialBody.mesh.position.copy(celestialBody.renderPos);

            if (bodyData.parent === bodyData.name) {
                const sunVisibleSize = celestialBody.physicalRadius * 2 * this.camera.zoom;
                const isSunBigger = sunVisibleSize >= this.STAR_SPRITE_SIZE;
                const isMacroScale = this.camera.zoom <= MACRO_SCALE_ZOOM_THRESHOLD;

                celestialBody.mesh.visible = isSunBigger || isMacroScale;
                celestialBody.sprite.visible = !isOccluded && !isSunBigger && !isMacroScale;

                const starScale = this.STAR_SPRITE_SIZE / this.camera.zoom;
                celestialBody.sprite.scale.set(starScale, starScale, 1);

                this.gridMaterial.uniforms.wellPositions.value[activeWellIndex].set(0, 0);
                this.gridMaterial.uniforms.wellDepths.value[activeWellIndex] = DEEP_WELL_DEPTH;
                this.gridMaterial.uniforms.wellRadii.value[activeWellIndex] = DEEP_WELL_RADIUS;

                activeWellIndex++;
                if (isTarget) trackingTargetPosition = celestialBody.mesh.position;

                if (celestialBody.label) {
                    const labelVector = celestialBody.renderPos.clone();
                    labelVector.y += starScale * 0.6;
                    labelVector.project(this.camera);

                    if (labelVector.z < 1 && !isOccluded) {
                        celestialBody.label.style.display = 'block';
                        celestialBody.label.style.left = `${(labelVector.x * 0.5 + 0.5) * window.innerWidth}px`;
                        celestialBody.label.style.top = `${(labelVector.y * -0.5 + 0.5) * window.innerHeight}px`;
                    } else {
                        celestialBody.label.style.display = 'none';
                    }
                }

                celestialBody.mesh.updateMatrix();
                celestialBody.mesh.updateMatrixWorld();
                celestialBody.sprite.updateMatrix();
                celestialBody.sprite.updateMatrixWorld();
                return;
            }

            let baseSpriteSize = this.PLANET_SPRITE_SIZE;

            if (celestialBody.isMoon) {
                baseSpriteSize = this.MOON_SPRITE_SIZE;
            } else if (
                bodyData.datasetCategory === CATEGORY_PROMOTED_ASTEROID ||
                bodyData.datasetCategory === CATEGORY_RADAR_CONTACT
            ) {
                baseSpriteSize = this.ASTEROID_SPRITE_SIZE;
            }

            const spriteScale = baseSpriteSize / this.camera.zoom;
            celestialBody.sprite.scale.set(spriteScale, spriteScale, 1);

            const meshVisibleSize = celestialBody.physicalRadius * 2 * this.camera.zoom;
            const isMeshBigger = meshVisibleSize >= baseSpriteSize;
            const isMeshDetailed = meshVisibleSize >= 25.0;

            celestialBody.mesh.visible = isMeshBigger;
            celestialBody.sprite.visible = !isOccluded && !isMeshBigger;

            if (isMeshBigger) {
                if (
                    !celestialBody._isMeshControllersActive &&
                    !this.activationQueue.has(celestialBody)
                ) {
                    this.activationQueue.add(celestialBody);
                } else if (celestialBody._isMeshControllersActive) {
                    if (isMeshDetailed) {
                        if (this.daylightController)
                            this.daylightController.updateForBody(celestialBody);
                        if (this.eclipseShadowController)
                            this.eclipseShadowController.updateForBody(celestialBody);
                    }
                }
            } else {
                if (this.activationQueue.has(celestialBody)) {
                    this.activationQueue.delete(celestialBody);
                }

                if (celestialBody._isMeshControllersActive) {
                    if (this.terrainController)
                        this.terrainController.onMeshVisibilityChange(celestialBody, false);
                    if (this.daylightController)
                        this.daylightController.onMeshVisibilityChange(celestialBody, false);
                    if (this.eclipseShadowController)
                        this.eclipseShadowController.onMeshVisibilityChange(celestialBody, false);
                    celestialBody._isMeshControllersActive = false;
                }
            }

            if (activeWellIndex < this.maximumWells && bodyData.mass > 0 && !celestialBody.isMoon) {
                activeWellIndex = this._updateGravityWell(celestialBody, bodyData, activeWellIndex);
            }

            if (isTarget) {
                trackingTargetPosition = celestialBody.mesh.position;
                celestialBody.orbitLine.material.color.setHex(COLOR_TARGET_ORBIT);
                celestialBody.orbitLine.material.opacity = 1.0;
                if (celestialBody.orbitCurtain) celestialBody.orbitCurtain.visible = true;
            } else {
                if (isPreview) {
                    celestialBody.orbitLine.material.color.setHex(COLOR_PREVIEW_ORBIT);
                    celestialBody.orbitLine.material.opacity = 0.9;
                } else if (bodyData.datasetCategory === CATEGORY_PROMOTED_ASTEROID) {
                    const datasetColor = this.savedColors[bodyData.datasetName] || '#00ffff';
                    celestialBody.orbitLine.material.color.set(datasetColor);
                    celestialBody.orbitLine.material.opacity = celestialBody.isMoon ? 0.3 : 0.6;
                } else if (bodyData.datasetCategory === CATEGORY_RADAR_CONTACT) {
                    const datasetColor = this.savedColors[bodyData.datasetName] || '#00ff00';
                    celestialBody.orbitLine.material.color.set(datasetColor);
                    celestialBody.orbitLine.material.opacity = celestialBody.isMoon ? 0.3 : 0.6;
                } else {
                    celestialBody.orbitLine.material.color.setHex(COLOR_DEFAULT_ORBIT);
                    celestialBody.orbitLine.material.opacity = celestialBody.isMoon ? 0.3 : 0.6;
                }

                if (celestialBody.orbitCurtain) celestialBody.orbitCurtain.visible = false;
            }

            if (celestialBody.isMoon) {
                celestialBody.orbitLine.visible =
                    celestialBody.mesh.visible || celestialBody.sprite.visible;
            } else if (bodyData.datasetCategory === CATEGORY_PROMOTED_ASTEROID) {
                celestialBody.orbitLine.visible = isTarget || bodyData.isPinned || isPreview;
            } else if (bodyData.datasetCategory === CATEGORY_RADAR_CONTACT) {
                celestialBody.orbitLine.visible = isPreview;
            } else {
                celestialBody.orbitLine.visible = true;
            }

            if (
                celestialBody.orbitLine.visible ||
                (celestialBody.orbitCurtain && celestialBody.orbitCurtain.visible)
            ) {
                const isAnalytical =
                    bodyData.orbit_model === ORBIT_MODEL_MEEUS ||
                    bodyData.orbit_model === ORBIT_MODEL_VSOP87;

                const parentBody = celestialBodies.find((b) => b.data.name === bodyData.parent);
                const parentPoleQuat =
                    parentBody && parentBody.poleQuaternion ? parentBody.poleQuaternion : null;

                if (!celestialBody._orbitGenerated || isTarget || isAnalytical) {
                    this._updateOrbitLineGeometry(celestialBody, bodyData, daysSinceJ2000);
                    if (celestialBody.orbitCurtain) {
                        this._updateOrbitCurtainGeometry(
                            celestialBody,
                            bodyData,
                            daysSinceJ2000,
                            parentPoleQuat
                        );
                    }
                    celestialBody._orbitGenerated = true;
                }

                if (parentBody && bodyData.parent !== bodyData.name) {
                    celestialBody.orbitLine.position.copy(parentBody.renderPos);
                    if (celestialBody.orbitCurtain)
                        celestialBody.orbitCurtain.position.copy(parentBody.renderPos);
                    if (
                        celestialBody.isMoon &&
                        (!bodyData.orbit_model || bodyData.orbit_model === ORBIT_MODEL_KEPLER)
                    ) {
                        celestialBody.orbitLine.quaternion.copy(parentBody.poleQuaternion);
                        if (celestialBody.orbitCurtain)
                            celestialBody.orbitCurtain.quaternion.copy(parentBody.poleQuaternion);
                    } else {
                        celestialBody.orbitLine.quaternion.identity();
                        if (celestialBody.orbitCurtain)
                            celestialBody.orbitCurtain.quaternion.identity();
                    }
                } else {
                    const originOffset = new THREE.Vector3().copy(currentOrigin).negate();
                    celestialBody.orbitLine.position.copy(originOffset);
                    if (celestialBody.orbitCurtain)
                        celestialBody.orbitCurtain.position.copy(originOffset);

                    celestialBody.orbitLine.quaternion.identity();
                    if (celestialBody.orbitCurtain)
                        celestialBody.orbitCurtain.quaternion.identity();
                }
            }

            if (celestialBody.label) {
                const isInactivePromoted =
                    bodyData.datasetCategory === CATEGORY_PROMOTED_ASTEROID &&
                    !isTarget &&
                    !bodyData.isPinned &&
                    !isPreview;

                if (
                    (celestialBody.hideLabel && !isPreview) ||
                    isInactivePromoted ||
                    isOccluded ||
                    isBehindCamera
                ) {
                    celestialBody.label.style.display = 'none';
                } else {
                    const labelVector = celestialBody.renderPos.clone();
                    const verticalOffset = celestialBody.sprite.visible
                        ? spriteScale * 0.6
                        : celestialBody.physicalRadius * 1.5;

                    labelVector.y += verticalOffset;
                    labelVector.project(this.camera);

                    if (labelVector.z < 1) {
                        celestialBody.label.style.display = 'block';
                        celestialBody.label.style.left = `${(labelVector.x * 0.5 + 0.5) * window.innerWidth}px`;
                        celestialBody.label.style.top = `${(labelVector.y * -0.5 + 0.5) * window.innerHeight}px`;
                    } else {
                        celestialBody.label.style.display = 'none';
                    }
                }
            }

            celestialBody.mesh.updateMatrix();
            celestialBody.mesh.updateMatrixWorld();
            celestialBody.sprite.updateMatrix();
            celestialBody.sprite.updateMatrixWorld();

            if (celestialBody.orbitLine?.visible) {
                celestialBody.orbitLine.updateMatrix();
                celestialBody.orbitLine.updateMatrixWorld();
            }

            if (celestialBody.orbitCurtain?.visible) {
                celestialBody.orbitCurtain.updateMatrix();
                celestialBody.orbitCurtain.updateMatrixWorld();
            }
        });

        let activationsThisFrame = 0;
        for (const body of this.activationQueue) {
            if (activationsThisFrame >= this.MAX_ACTIVATIONS_PER_FRAME) break;

            if (this.terrainController) this.terrainController.onMeshVisibilityChange(body, true);

            if (this.daylightController) {
                this.daylightController.onMeshVisibilityChange(body, true);
                this.daylightController.updateForBody(body);
            }

            if (this.eclipseShadowController) {
                this.eclipseShadowController.onMeshVisibilityChange(body, true);
                this.eclipseShadowController.updateForBody(body);
            }

            body._isMeshControllersActive = true;
            this.activationQueue.delete(body);
            activationsThisFrame++;
        }

        this.gridMaterial.uniforms.numWells.value = activeWellIndex;
        return trackingTargetPosition;
    }

    _updateGravityWell(celestialBody, bodyData, activeWellIndex) {
        const isBeingRendered = celestialBody.mesh.visible || celestialBody.sprite.visible;

        if (!isBeingRendered) {
            return activeWellIndex;
        }

        this.gridMaterial.uniforms.wellPositions.value[activeWellIndex].set(
            celestialBody.renderPos.x,
            celestialBody.renderPos.z
        );

        const semiMajorAxis = celestialBody.scaledA || bodyData.a_au || 1.0;
        const hillRadius =
            semiMajorAxis * Math.pow(bodyData.mass / SUN_MASS_EARTH_MASSES, 1.0 / 3.0);

        let targetDepth = PLANET_WELL_DEPTH;
        let targetRadius = Math.max(hillRadius * 2.5, 0.05);

        const currentZoom = this.camera.zoom;
        const fadeFactor = Math.max(0.0, Math.min(1.0, 1.0 - (currentZoom - 50.0) / 150.0));
        targetDepth *= fadeFactor;

        this.gridMaterial.uniforms.wellDepths.value[activeWellIndex] = targetDepth;
        this.gridMaterial.uniforms.wellRadii.value[activeWellIndex] = targetRadius;

        return activeWellIndex + 1;
    }

    // Build orbit line placement after establishing relative geometry.
    // Use relative geometry for orbit lines to maintain Float32 precision.
    // Force the trailing end of the previous period to the origin (0,0,0) and place the line object at the render position of the body.
    _updateOrbitLineGeometry(celestialBody, bodyData, daysSinceJ2000) {
        const orbitPoints = [];

        if (
            bodyData.orbit_model === ORBIT_MODEL_MEEUS ||
            bodyData.orbit_model === ORBIT_MODEL_VSOP87
        ) {
            const orbitalPeriod = bodyData.period;
            for (let index = 0; index <= ORBIT_LINE_RESOLUTION; index++) {
                const timeInDays =
                    daysSinceJ2000 -
                    orbitalPeriod +
                    (index / ORBIT_LINE_RESOLUTION) * orbitalPeriod;
                const positionVector = OrbitalMath.calculatePosition(bodyData, timeInDays);
                orbitPoints.push(
                    new THREE.Vector3(positionVector.x, positionVector.y, positionVector.z)
                );
            }
        } else {
            const currentMeanAnomaly = bodyData.M0 + bodyData.n * daysSinceJ2000;
            for (let index = 0; index <= ORBIT_LINE_RESOLUTION; index++) {
                const meanAnomaly =
                    currentMeanAnomaly -
                    2 * Math.PI +
                    (index / ORBIT_LINE_RESOLUTION) * 2 * Math.PI;
                const rawPosition = OrbitalMath.calcPosFromM(
                    celestialBody.scaledA,
                    bodyData.e,
                    bodyData.i,
                    bodyData.w,
                    bodyData.Node,
                    meanAnomaly
                );
                orbitPoints.push(new THREE.Vector3(rawPosition.x, rawPosition.y, rawPosition.z));
            }
        }

        celestialBody.orbitLine.geometry.setFromPoints(orbitPoints);
    }

    _updateOrbitCurtainGeometry(
        celestialBody,
        bodyData,
        daysSinceJ2000,
        parentPoleQuaternion = null
    ) {
        const curtainPoints = [];

        const isAnalytical =
            bodyData.orbit_model === ORBIT_MODEL_MEEUS ||
            bodyData.orbit_model === ORBIT_MODEL_VSOP87;

        const projectToEquator = (p) => {
            if (!parentPoleQuaternion || !isAnalytical || !celestialBody.isMoon) {
                return new THREE.Vector3(p.x, 0, p.z);
            }
            // Transform into the parent's equatorial frame (pole maps to +Y)
            const inv = parentPoleQuaternion.clone().invert();
            const eq = p.clone().applyQuaternion(inv);
            eq.y = 0; // zero height above equator
            return eq.applyQuaternion(parentPoleQuaternion); // back to ecliptic / world
        };

        if (isAnalytical) {
            const orbitalPeriod = bodyData.period;
            for (let index = 0; index <= ORBIT_LINE_RESOLUTION; index++) {
                const timeInDays =
                    daysSinceJ2000 -
                    orbitalPeriod +
                    (index / ORBIT_LINE_RESOLUTION) * orbitalPeriod;
                const positionVector = OrbitalMath.calculatePosition(bodyData, timeInDays);
                const p = new THREE.Vector3(positionVector.x, positionVector.y, positionVector.z);
                curtainPoints.push(p);
                curtainPoints.push(projectToEquator(p));
            }
        } else {
            const currentMeanAnomaly = bodyData.M0 + bodyData.n * daysSinceJ2000;
            for (let index = 0; index <= ORBIT_LINE_RESOLUTION; index++) {
                const meanAnomaly =
                    currentMeanAnomaly -
                    2 * Math.PI +
                    (index / ORBIT_LINE_RESOLUTION) * 2 * Math.PI;
                const rawPosition = OrbitalMath.calcPosFromM(
                    celestialBody.scaledA,
                    bodyData.e,
                    bodyData.i,
                    bodyData.w,
                    bodyData.Node,
                    meanAnomaly
                );
                const p = new THREE.Vector3(rawPosition.x, rawPosition.y, rawPosition.z);
                curtainPoints.push(p);
                curtainPoints.push(projectToEquator(p)); // still the simple y=0 path
            }
        }

        celestialBody.orbitCurtain.geometry.setFromPoints(curtainPoints);
    }

    _smoothstep(edge0, edge1, x) {
        const interpolationMultiplier = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return (
            interpolationMultiplier * interpolationMultiplier * (3 - 2 * interpolationMultiplier)
        );
    }

    computeGroupAnchor(sourceData, daysSinceJ2000) {
        const totalItems = sourceData.length;
        const sampleStep = Math.max(1, Math.floor(totalItems / this.LABEL_SAMPLE_COUNT));

        let sumRadius = 0;
        let sumSine = 0;
        let sumCosine = 0;
        let sumPositionY = 0;
        let sampleCount = 0;

        for (let index = 0; index < totalItems; index += sampleStep) {
            const bodyData = sourceData[index];
            const currentMeanAnomaly = bodyData.M0 + bodyData.n * daysSinceJ2000;
            const rawPosition = OrbitalMath.calcPosFromM(
                bodyData.a,
                bodyData.e,
                bodyData.i,
                bodyData.w,
                bodyData.Node,
                currentMeanAnomaly
            );

            const positionVector = new THREE.Vector3(rawPosition.x, rawPosition.y, rawPosition.z);
            const radius = Math.hypot(positionVector.x, positionVector.z);
            const thetaAngle = Math.atan2(positionVector.z, positionVector.x);

            sumRadius += radius;
            sumSine += Math.sin(thetaAngle);
            sumCosine += Math.cos(thetaAngle);
            sumPositionY += positionVector.y;
            sampleCount++;
        }

        if (sampleCount === 0) {
            return new THREE.Vector3();
        }

        const meanRadius = sumRadius / sampleCount;
        const meanThetaAngle = Math.atan2(sumSine, sumCosine);
        const meanPositionY = sumPositionY / sampleCount;

        return new THREE.Vector3(
            meanRadius * Math.cos(meanThetaAngle),
            meanPositionY,
            meanRadius * Math.sin(meanThetaAngle)
        );
    }

    updateGPU(daysSinceJ2000, currentOrigin) {
        this.gridMaterial.uniforms.zoomScale.value = this.camera.zoom;
        this.gridMaterial.uniforms.cameraPos.value.copy(this.camera.position);

        const currentZoom = this.camera.zoom;
        const fadeOpacity =
            1.0 -
            this._smoothstep(this.LABEL_ZOOM_FADE_START, this.LABEL_ZOOM_FADE_END, currentZoom);

        this.gpuParticleSystems.forEach((particleSystem) => {
            particleSystem.visible = particleSystem.userData.datasetVisible !== false;

            if (particleSystem.visible) {
                particleSystem.material.uniforms.uTime.value = daysSinceJ2000;
                particleSystem.material.uniforms.uOrigin.value.copy(currentOrigin);
                particleSystem.material.uniforms.uZoom.value = currentZoom;
            }

            const systemLabel = particleSystem.userData.groupLabel;
            if (!systemLabel) return;

            if (!particleSystem.visible || fadeOpacity <= 0.01) {
                systemLabel.visible = false;
                particleSystem.userData._labelWasVisible = false;
                return;
            }

            systemLabel.visible = true;

            const rawAnchorVector = this.computeGroupAnchor(
                particleSystem.userData.sourceData,
                daysSinceJ2000
            );

            if (!particleSystem.userData._labelWasVisible) {
                if (!particleSystem.userData._smoothAnchor) {
                    particleSystem.userData._smoothAnchor = new THREE.Vector3();
                }
                particleSystem.userData._smoothAnchor.copy(rawAnchorVector);
            } else {
                particleSystem.userData._smoothAnchor.lerp(rawAnchorVector, this.LABEL_SMOOTHING);
            }

            particleSystem.userData._labelWasVisible = true;

            const anchorPosition = particleSystem.userData._smoothAnchor;
            systemLabel.position.copy(anchorPosition).sub(currentOrigin);

            const angleFromSunRadians = Math.atan2(anchorPosition.z, anchorPosition.x);
            const yawAngle = -angleFromSunRadians - Math.PI / 2;

            this._yawQuaternion.setFromAxisAngle(this._yAxis, yawAngle);
            systemLabel.quaternion.copy(this._yawQuaternion).multiply(this._flatQuaternion);

            systemLabel.material.opacity = fadeOpacity;

            systemLabel.updateMatrix();
            systemLabel.updateMatrixWorld();
        });
    }

    computeGroupCentroid(sourceData, daysSinceJ2000) {
        const totalItems = sourceData.length;
        const sampleStep = Math.max(1, Math.floor(totalItems / this.LABEL_SAMPLE_COUNT));
        const sumVector = new THREE.Vector3();

        let sampleCount = 0;

        for (let index = 0; index < totalItems; index += sampleStep) {
            const bodyData = sourceData[index];
            const currentMeanAnomaly = bodyData.M0 + bodyData.n * daysSinceJ2000;

            sumVector.add(
                OrbitalMath.calcPosFromM(
                    bodyData.a,
                    bodyData.e,
                    bodyData.i,
                    bodyData.w,
                    bodyData.Node,
                    currentMeanAnomaly
                )
            );
            sampleCount++;
        }

        if (sampleCount > 0) {
            return sumVector.divideScalar(sampleCount);
        }

        return sumVector;
    }
}