// js/RenderPipeline.js
class RenderPipeline {
    constructor(ctx) {
        this.camera = ctx.camera;
        this.controls = ctx.controls;
        this.gridMaterial = ctx.gridMaterial;
        this.gpuParticleSystems = ctx.gpuParticleSystems;
        this.UI = ctx.UI;
        this.savedColors = ctx.savedColors;
        this.MAX_WELLS = ctx.MAX_WELLS;

        // Visual Pipeline Constants
        this.PLANET_SPRITE_SIZE = 4.5;
        this.MOON_SPRITE_SIZE = 2.5;
        this.ASTEROID_SPRITE_SIZE = 1.2;
        this.STAR_SPRITE_SIZE = 8;
        this.OCCLUSION_DIST_SQ = 35 * 35;
        
        this._projVec = new THREE.Vector3();
    }

    hideObject(b) {
        if (b.sprite.visible) b.sprite.visible = false;
        if (b.mesh.visible) b.mesh.visible = false;
        if (b.orbitLine && b.orbitLine.visible) b.orbitLine.visible = false;
        if (b.orbitCurtain && b.orbitCurtain.visible) b.orbitCurtain.visible = false;
        if (b.label && b.label.style.display !== 'none') b.label.style.display = 'none';
    }

    processFloatingOrigin(celestialBodies, trackingTargetData, currentOrigin, daysSinceJ2000) {
        let targetAbsolutePos = new THREE.Vector3(0, 0, 0);
        if (trackingTargetData) { 
            const tBody = celestialBodies.find(x => x.data.name === trackingTargetData.name);
            if (tBody) {
                targetAbsolutePos.copy(tBody.globalPos);
            } else if (trackingTargetData.datasetCategory === 'ASTEROID') {
                const M_current = trackingTargetData.M0 + (trackingTargetData.n * daysSinceJ2000);
                targetAbsolutePos = OrbitalMath.calcPosFromM(
                    trackingTargetData.a, trackingTargetData.e, trackingTargetData.i, 
                    trackingTargetData.w, trackingTargetData.Node, M_current
                );
            }
        }
        const shiftDelta = targetAbsolutePos.clone().sub(currentOrigin);
        if (shiftDelta.lengthSq() > 0) {
            this.camera.position.sub(shiftDelta);
            this.controls.target.sub(shiftDelta);
            currentOrigin.copy(targetAbsolutePos);
        }
    }

    processScreenProjectionsAndCulling(celestialBodies, currentTargetData, currentOrigin) {
        const filters = this.UI.getMoonFilters();
        const activeSystemName = currentTargetData ? (currentTargetData.parent !== "SUN" ? currentTargetData.parent : currentTargetData.name) : "NONE";
        
        let wellIndex = 0;
        let trackTargetPos = new THREE.Vector3(0,0,0);
        
        const drawnScreenPositions = [];
        const halfW = window.innerWidth * 0.5;
        const halfH = window.innerHeight * 0.5;
        
        celestialBodies.forEach(b => {
            const d = b.data;
            if (b.isCulled) { this.hideObject(b); return; }

            const isTarget = currentTargetData ? (d.name === currentTargetData.name) : false;
            
            if (b.isMoon) {
                const isTargetSystem = (d.parent === activeSystemName);
                const rKm = d.radius_km || 0;
                const passesFilters = (d.a >= filters.distMin && d.a <= filters.distMax) && (rKm >= filters.sizeMin && rKm <= filters.sizeMax);
                if (!isTargetSystem || !passesFilters) {
                    b.isCulled = true; this.hideObject(b); return; 
                }
            }

            b.renderPos = b.globalPos.clone().sub(currentOrigin);
            this._projVec.copy(b.renderPos).project(this.camera);
            
            const screenX = (this._projVec.x * halfW) + halfW;
            const screenY = -(this._projVec.y * halfH) + halfH;
            const isBehindCamera = this._projVec.z > 1;

            let isOccluded = false;
            if (!isTarget && !isBehindCamera && d.name !== "SUN") {
                for (let i = 0; i < drawnScreenPositions.length; i++) {
                    const pos = drawnScreenPositions[i];
                    const dx = screenX - pos.x;
                    const dy = screenY - pos.y;
                    if (dx * dx + dy * dy < this.OCCLUSION_DIST_SQ) {
                        isOccluded = true;
                        break;
                    }
                }
            }

            if (!isOccluded && !isBehindCamera) {
                drawnScreenPositions.push({ x: screenX, y: screenY });
            }
            
            b.mesh.quaternion.copy(b.poleQuaternion);
            b.mesh.rotateY(b.W_current);
            
            b.sprite.position.copy(b.renderPos);
            b.mesh.position.copy(b.renderPos);

            if (d.name === "SUN") {
                const sunVisSize = b.physicalRadius * 2 * this.camera.zoom;
                const isSunBigger = sunVisSize >= this.STAR_SPRITE_SIZE;
                
                b.mesh.visible = isSunBigger; 
                b.sprite.visible = !isOccluded && !isSunBigger; 
                
                const starScale = this.STAR_SPRITE_SIZE / this.camera.zoom;
                b.sprite.scale.set(starScale, starScale, 1);
                
                this.gridMaterial.uniforms.wellPositions.value[wellIndex].set(0, 0);
                this.gridMaterial.uniforms.wellDepths.value[wellIndex] = -40.0; 
                this.gridMaterial.uniforms.wellRadii.value[wellIndex] = 12000.0; 
                wellIndex++;
                if (isTarget) trackTargetPos = b.mesh.position;
                
                if (b.label) {
                    const vec = b.renderPos.clone();
                    vec.y += 15; vec.project(this.camera);
                    if (vec.z < 1 && !isOccluded) { 
                        b.label.style.display = 'block'; 
                        b.label.style.left = `${(vec.x * .5 + .5) * window.innerWidth}px`; 
                        b.label.style.top = `${(vec.y * -.5 + .5) * window.innerHeight}px`; 
                    } 
                    else { b.label.style.display = 'none'; }
                }
                
                b.mesh.updateMatrix(); b.mesh.updateMatrixWorld();
                b.sprite.updateMatrix(); b.sprite.updateMatrixWorld();
                return; 
            }

            let baseSize = this.PLANET_SPRITE_SIZE;
            if (b.isMoon) {
                baseSize = this.MOON_SPRITE_SIZE;
            } else if (d.datasetCategory === 'PROMOTED_ASTEROID' || d.datasetCategory === 'RADAR_CONTACT') {
                baseSize = this.ASTEROID_SPRITE_SIZE; 
            }
            
            const spriteScale = baseSize / this.camera.zoom;
            b.sprite.scale.set(spriteScale, spriteScale, 1);
            
            const meshVisSize = b.physicalRadius * 2 * this.camera.zoom;
            const isMeshBigger = meshVisSize >= baseSize;
            
            b.mesh.visible = isMeshBigger; 
            b.sprite.visible = !isOccluded && !isMeshBigger; 
            
            b.orbitLine.position.copy(b.parentPos.clone().sub(currentOrigin));
            if (b.isMoon) b.orbitLine.quaternion.copy(b.parentQuat);

            if (wellIndex < this.MAX_WELLS && d.mass > 0 && !b.isMoon) {
                this.gridMaterial.uniforms.wellPositions.value[wellIndex].set(b.renderPos.x, b.renderPos.z);
                const logMass = Math.max(0.1, Math.log10(d.mass + 1)); 
                this.gridMaterial.uniforms.wellDepths.value[wellIndex] = -(logMass * 4.0);
                this.gridMaterial.uniforms.wellRadii.value[wellIndex] = (logMass * 200.0) + 100.0;
                wellIndex++;
            }

            if (isTarget) {
                trackTargetPos = b.mesh.position;
                b.orbitLine.material.color.setHex(0x00aaff); b.orbitLine.material.opacity = 1.0;
                
                if (b.orbitCurtain) {
                    b.orbitCurtain.visible = true;
                    const points = [];
                    for(let j=0; j<=128; j++) {
                        const lPos = OrbitalMath.calcPosFromM(b.scaledA, d.e, d.i, d.w, d.Node, (j / 128) * Math.PI * 2);
                        points.push(lPos.clone());
                        points.push(new THREE.Vector3(lPos.x, 0, lPos.z)); 
                    }
                    b.orbitCurtain.geometry.setFromPoints(points);
                    b.orbitCurtain.position.copy(b.parentPos.clone().sub(currentOrigin));
                    if (b.isMoon) b.orbitCurtain.quaternion.copy(b.parentQuat);
                }
            } else {
                if (d.datasetCategory === 'PROMOTED_ASTEROID') {
                    const dColor = this.savedColors[d.datasetName] || '#00ffff';
                    b.orbitLine.material.color.set(dColor);
                } else {
                    b.orbitLine.material.color.setHex(0xff1111);
                }
                b.orbitLine.material.opacity = b.isMoon ? 0.3 : 0.6; 
                if (b.orbitCurtain) b.orbitCurtain.visible = false;
            }

            if (b.isMoon) {
                b.orbitLine.visible = b.mesh.visible || b.sprite.visible;
            } else if (d.datasetCategory === 'PROMOTED_ASTEROID') {
                b.orbitLine.visible = isTarget || d.isPinned;
            } else {
                b.orbitLine.visible = true;
            }

            if (b.label) {
                if (b.hideLabel || isOccluded || isBehindCamera) {
                    b.label.style.display = 'none';
                } else {
                    const vec = b.renderPos.clone();
                    const verticalOffset = b.sprite.visible ? (spriteScale * 0.6) : (b.physicalRadius * 1.5);
                    vec.y += verticalOffset; 
                    vec.project(this.camera);
                    
                    if (vec.z < 1) { 
                        b.label.style.display = 'block'; 
                        b.label.style.left = `${(vec.x * .5 + .5) * window.innerWidth}px`; 
                        b.label.style.top = `${(vec.y * -.5 + .5) * window.innerHeight}px`; 
                    } else { 
                        b.label.style.display = 'none'; 
                    }
                }
            }

            b.mesh.updateMatrix(); b.mesh.updateMatrixWorld();
            b.sprite.updateMatrix(); b.sprite.updateMatrixWorld();
            if (b.orbitLine && b.orbitLine.visible) { b.orbitLine.updateMatrix(); b.orbitLine.updateMatrixWorld(); }
            if (b.orbitCurtain && b.orbitCurtain.visible) { b.orbitCurtain.updateMatrix(); b.orbitCurtain.updateMatrixWorld(); }
        });

        this.gridMaterial.uniforms.numWells.value = wellIndex;
        return trackTargetPos;
    }

    updateGPU(daysSinceJ2000, currentOrigin) {
        this.gridMaterial.uniforms.zoomScale.value = this.camera.zoom;
        
        this.gpuParticleSystems.forEach(system => {
            system.visible = system.userData.datasetVisible !== false;
            if (system.visible) {
                system.material.uniforms.uTime.value = daysSinceJ2000;
                system.material.uniforms.uOrigin.value.copy(currentOrigin);
                system.material.uniforms.uZoom.value = this.camera.zoom;
            }
        });
    }
}