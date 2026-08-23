// js/ui/MeasurementManager.js
import * as THREE from 'three';

const STAR_FAR_PLANE_AU = 1e14;

export class MeasurementManager {
    constructor(scene) {
        this.scene = scene;
        this.activeRulers = [];
        this.currentNodeA = null;
        this._farCamera = null;

        this.rulerMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uFarProjectionMatrix: { value: new THREE.Matrix4() },
                uColor: { value: new THREE.Color(0xffffff) },
                uOpacity: { value: 0.9 },
            },
            vertexShader: `
                uniform mat4 uFarProjectionMatrix;
                void main() {
                    vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
                    gl_Position = uFarProjectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                void main() {
                    gl_FragColor = vec4(uColor, uOpacity);
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.labelContainer = document.createElement('div');
        this.labelContainer.id = 'measurement-labels';
        this.labelContainer.style.position = 'absolute';
        this.labelContainer.style.top = '0';
        this.labelContainer.style.left = '0';
        this.labelContainer.style.width = '100%';
        this.labelContainer.style.height = '100%';
        this.labelContainer.style.pointerEvents = 'none';
        this.labelContainer.style.overflow = 'hidden';
        this.labelContainer.style.zIndex = '50';
        document.body.appendChild(this.labelContainer);
    }

    handleNodeSelection(bodyData, celestialBodies) {
        let node;

        if (bodyData.datasetCategory === 'BACKGROUND_STAR') {
            node = { data: bodyData, isStar: true };
        } else {
            const body =
                typeof celestialBodies.getByName === 'function'
                    ? celestialBodies.getByName(bodyData.name)
                    : celestialBodies.find((b) => b.data.name === bodyData.name);

            if (!body) return;
            node = body;
        }

        if (!this.currentNodeA) {
            this.currentNodeA = node;
        } else {
            this.createRuler(this.currentNodeA, node);
            this.currentNodeA = null;
        }
    }

    createRuler(bodyA, bodyB) {
        const geometry = new THREE.BufferGeometry();
        const line = new THREE.LineSegments(geometry, this.rulerMaterial);
        line.renderOrder = 999;
        this.scene.add(line);

        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.color = '#ffffff';
        label.style.fontFamily = 'Teko, sans-serif';
        label.style.fontSize = '18px';
        label.style.fontWeight = 'bold';
        label.style.textShadow = '1px 1px 2px #000';
        label.style.transform = 'translate(-50%, -50%)';
        label.innerText = 'CALCULATING...';
        this.labelContainer.appendChild(label);

        this.activeRulers.push({ bodyA, bodyB, line, label });
    }

    formatDistance(distAU) {
        const AU_IN_KM = 149597870.7;
        const LY_IN_AU = 63241.1;

        if (distAU > LY_IN_AU * 0.01) {
            return `${(distAU / LY_IN_AU).toFixed(4)} LY`;
        } else if (distAU > 0.05) {
            return `${distAU.toFixed(4)} AU`;
        } else {
            const distKm = distAU * AU_IN_KM;
            return `${distKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} KM`;
        }
    }

    _getNodePosition(node, currentOrigin, daysSinceJ2000) {
        if (node.isStar) {
            const d = node.data;
            const years = daysSinceJ2000 / 365.25;
            const wx = (d.engineX || 0) + (d.engineVx || 0) * years;
            const wy = (d.engineY || 0) + (d.engineVy || 0) * years;
            const wz = (d.engineZ || 0) + (d.engineVz || 0) * years;
            return new THREE.Vector3(wx, wy, wz).sub(currentOrigin);
        }
        return node.mesh.position;
    }

    update(camera, currentOrigin = new THREE.Vector3(), daysSinceJ2000 = 0) {
        if (this.activeRulers.length === 0) return;

        if (!this._farCamera) this._farCamera = camera.clone();
        this._farCamera.copy(camera);
        this._farCamera.far = STAR_FAR_PLANE_AU;
        this._farCamera.updateProjectionMatrix();
        this.rulerMaterial.uniforms.uFarProjectionMatrix.value.copy(
            this._farCamera.projectionMatrix
        );

        const tempVec = new THREE.Vector3();
        const lineDir = new THREE.Vector3();
        const toCamera = new THREE.Vector3();
        const perp = new THREE.Vector3();

        for (const ruler of this.activeRulers) {
            const posA = this._getNodePosition(ruler.bodyA, currentOrigin, daysSinceJ2000);
            const posB = this._getNodePosition(ruler.bodyB, currentOrigin, daysSinceJ2000);

            const points = [posA.x, posA.y, posA.z, posB.x, posB.y, posB.z];

            const midPoint = new THREE.Vector3().addVectors(posA, posB).multiplyScalar(0.5);
            lineDir.subVectors(posB, posA).normalize();
            toCamera.subVectors(camera.position, midPoint).normalize();
            perp.crossVectors(lineDir, toCamera).normalize();

            const dist = posA.distanceTo(posB);
            const tickSize = dist * 0.01;

            const numSegments = 10;
            for (let i = 1; i < numSegments; i++) {
                const fraction = i / numSegments;
                const tickCenter = new THREE.Vector3().lerpVectors(posA, posB, fraction);

                const scale = i === 5 ? tickSize * 1.8 : tickSize;

                const tickStart = new THREE.Vector3().copy(tickCenter).addScaledVector(perp, scale);
                const tickEnd = new THREE.Vector3().copy(tickCenter).addScaledVector(perp, -scale);

                points.push(tickStart.x, tickStart.y, tickStart.z, tickEnd.x, tickEnd.y, tickEnd.z);
            }

            ruler.line.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(points, 3)
            );

            ruler.label.innerText = this.formatDistance(dist);

            tempVec.copy(midPoint).project(this._farCamera);
            if (tempVec.z > 1.0) {
                ruler.label.style.display = 'none';
            } else {
                ruler.label.style.display = 'block';
                const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
                const y = (tempVec.y * -0.5 + 0.5) * window.innerHeight;
                ruler.label.style.left = `${x}px`;
                ruler.label.style.top = `${y - 20}px`;
            }
        }
    }

    breakCycleAndClear() {
        this.currentNodeA = null;
        for (const ruler of this.activeRulers) {
            this.scene.remove(ruler.line);
            ruler.line.geometry.dispose();
            if (ruler.label.parentNode) {
                ruler.label.parentNode.removeChild(ruler.label);
            }
        }
        this.activeRulers = [];
    }
}
