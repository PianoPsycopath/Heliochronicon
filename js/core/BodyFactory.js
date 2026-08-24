// js/core/BodyFactory.js
import { Shaders } from '@rendering/Shaders.js';
import { CelestialBody } from '@core/CelestialBody.js';
import * as THREE from 'three';

export class BodyFactory {
    constructor({
        scene,
        tacticalMaterial,
        auInKm,
        savedColors,
        dotTexture,
        datasetMaterials,
        orbitFactory,
    }) {
        this.scene = scene;
        this.tacticalMaterial = tacticalMaterial;
        this.auInKm = auInKm;
        this.savedColors = savedColors;
        this.dotTexture = dotTexture;
        this.datasetMaterials = datasetMaterials;
        this.orbitFactory = orbitFactory;
    }

    createTacticalBody(d) {
        const { scene, tacticalMaterial, auInKm } = this;

        const isSun = d.parent === d.name;
        const isMoon = !isSun && d.category === 'MOON';

        const scaledA = this.orbitFactory.getTacticalA(d, isMoon);

        const physicalRadius = d.radius_km > 0 ? d.radius_km / auInKm : 1.0 / auInKm;

        const geometry = new THREE.SphereGeometry(physicalRadius, 32, 32);
        geometry.rotateY(Math.PI / 2);
        const mesh = new THREE.Mesh(geometry, tacticalMaterial);
        mesh.userData = d;

        let rOrder = 500;
        if (isSun) rOrder = 2000;
        else if (d.datasetCategory === 'PLANET') rOrder = 1000;
        else if (d.datasetCategory === 'MOON') rOrder = 800;

        mesh.renderOrder = rOrder;

        const wireMat = new THREE.MeshBasicMaterial({
            color: isSun ? 0xffcc00 : 0xaaaaaa,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
        });
        const wireMesh = new THREE.Mesh(mesh.geometry, wireMat);
        mesh.add(wireMesh);

        if (!isSun) {
            const poleMat = new THREE.LineBasicMaterial({
                color: 0xff3333,
                transparent: true,
                opacity: 0.6,
            });
            const poleGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, physicalRadius * 1.5, 0),
                new THREE.Vector3(0, -physicalRadius * 1.5, 0),
            ]);
            mesh.add(new THREE.Line(poleGeo, poleMat));
        }

        scene.add(mesh);

        const label = document.createElement('div');
        label.className = 'tactical-label';
        label.innerText = d.name;
        label.style.color = isMoon ? '#aaa' : '#ffcc00';
        document.body.appendChild(label);

        const spriteMat = isSun
            ? Shaders.createStarSpriteMat()
            : Shaders.createDiamondSpriteMat(d.symbol);
        const sprite = new THREE.Sprite(spriteMat);
        sprite.userData = d;
        sprite.renderOrder = rOrder;
        scene.add(sprite);

        let orbitLine = null;
        let orbitCurtain = null;
        let orbitCurtainEcliptic = null;
        if (!isSun) {
            mesh.visible = false;
            orbitLine = this.orbitFactory.createOrbitPath(d, scaledA);
            scene.add(orbitLine);

            orbitCurtain = this.orbitFactory.createOrbitCurtain();
            scene.add(orbitCurtain);
            if (isMoon) {
                orbitCurtainEcliptic = this.orbitFactory.createOrbitCurtain(0xffaa00);
                scene.add(orbitCurtainEcliptic);
            }
        }

        mesh.matrixAutoUpdate = false;
        sprite.matrixAutoUpdate = false;
        if (orbitLine) orbitLine.matrixAutoUpdate = false;
        if (orbitCurtain) orbitCurtain.matrixAutoUpdate = false;
        if (orbitCurtainEcliptic) orbitCurtainEcliptic.matrixAutoUpdate = false;

        return new CelestialBody({
            data: d,
            mesh,
            sprite,
            orbitLine,
            orbitCurtain,
            orbitCurtainEcliptic,
            label,
            isMoon,
            scaledA,
            physicalRadius,
            datasetVisible: true,
            isCulled: false,
            hideLabel: false,
            baseRenderOrder: rOrder,
            distToCamSq: 0,
        });
    }

    createPromotedAsteroidBody(d) {
        const { scene, savedColors, dotTexture, tacticalMaterial, auInKm } = this;

        const promotedData = {
            ...d,
            datasetCategory: 'PROMOTED_ASTEROID',
        };

        const scaledA = this.orbitFactory.getTacticalA(promotedData, false);

        const physicalRadius =
            promotedData.radius_km > 0 ? promotedData.radius_km / auInKm : 1.0 / auInKm;

        // ---------------------------------------------------------------------
        // CPU mesh representation
        // ---------------------------------------------------------------------

        const geometry = new THREE.SphereGeometry(physicalRadius, 32, 32);
        geometry.rotateY(Math.PI / 2);

        const mesh = new THREE.Mesh(geometry, tacticalMaterial);
        mesh.userData = promotedData;
        mesh.renderOrder = 1500;

        const wireMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            wireframe: true,
            transparent: true,
            opacity: 0.4,
        });
        mesh.add(new THREE.Mesh(mesh.geometry, wireMat));

        const poleMat = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
        });
        const poleGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, physicalRadius * 1.5, 0),
            new THREE.Vector3(0, -physicalRadius * 1.5, 0),
        ]);
        mesh.add(new THREE.Line(poleGeo, poleMat));

        scene.add(mesh);

        // ---------------------------------------------------------------------
        // Label
        // ---------------------------------------------------------------------

        const datasetColor = savedColors[promotedData.datasetName] || '#00ffff';

        const label = document.createElement('div');
        label.className = 'tactical-label';
        label.innerText = promotedData.name;
        label.style.color = datasetColor;
        document.body.appendChild(label);

        // ---------------------------------------------------------------------
        // Sprite
        // ---------------------------------------------------------------------

        const spriteMat = new THREE.SpriteMaterial({
            map: dotTexture,
            depthTest: false,
        });
        spriteMat.color.set(datasetColor);

        const sprite = new THREE.Sprite(spriteMat);
        sprite.userData = promotedData;
        sprite.renderOrder = 1500;

        scene.add(sprite);

        // ---------------------------------------------------------------------
        // Orbit representation
        // ---------------------------------------------------------------------

        const orbitLine = this.orbitFactory.createOrbitPath(promotedData, scaledA);
        orbitLine.material.color.set(datasetColor);
        scene.add(orbitLine);

        const orbitCurtain = this.orbitFactory.createOrbitCurtain();
        scene.add(orbitCurtain);

        // ---------------------------------------------------------------------
        // Static transforms
        // ---------------------------------------------------------------------

        mesh.matrixAutoUpdate = false;
        sprite.matrixAutoUpdate = false;
        orbitLine.matrixAutoUpdate = false;
        orbitCurtain.matrixAutoUpdate = false;

        return new CelestialBody({
            data: promotedData,
            mesh,
            label,
            sprite,
            orbitLine,
            orbitCurtain,
            isMoon: false,
            scaledA,
            physicalRadius,
            datasetVisible: true,
            isCulled: false,
            hideLabel: false,
        });
    }

    createAsteroidParticleSystem(planetaryData, datasetName) {
        const { scene, savedColors, datasetMaterials } = this;

        const count = planetaryData.length;
        const geometry = new THREE.BufferGeometry();

        const a_arr = new Float32Array(count);
        const e_arr = new Float32Array(count);
        const i_arr = new Float32Array(count);
        const w_arr = new Float32Array(count);
        const Node_arr = new Float32Array(count);
        const M0_arr = new Float32Array(count);
        const n_arr = new Float32Array(count);
        const pos_arr = new Float32Array(count * 3);

        for (let idx = 0; idx < count; idx++) {
            const d = planetaryData[idx];
            a_arr[idx] = d.a;
            e_arr[idx] = d.e;
            i_arr[idx] = d.i;
            w_arr[idx] = d.w;
            Node_arr[idx] = d.Node;
            M0_arr[idx] = d.M0;
            n_arr[idx] = d.n;
        }

        let minA = Infinity,
            maxA = -Infinity,
            sumA = 0;
        for (let idx = 0; idx < count; idx++) {
            if (a_arr[idx] < minA) minA = a_arr[idx];
            if (a_arr[idx] > maxA) maxA = a_arr[idx];
            sumA += a_arr[idx];
        }
        const aSpread = maxA - minA;
        const meanA = sumA / count;

        geometry.setAttribute('position', new THREE.BufferAttribute(pos_arr, 3));
        geometry.setAttribute('a', new THREE.BufferAttribute(a_arr, 1));
        geometry.setAttribute('e', new THREE.BufferAttribute(e_arr, 1));
        geometry.setAttribute('i', new THREE.BufferAttribute(i_arr, 1));
        geometry.setAttribute('w', new THREE.BufferAttribute(w_arr, 1));
        geometry.setAttribute('Node', new THREE.BufferAttribute(Node_arr, 1));
        geometry.setAttribute('M0', new THREE.BufferAttribute(M0_arr, 1));
        geometry.setAttribute('n', new THREE.BufferAttribute(n_arr, 1));

        const savedInitialColor = savedColors[datasetName] || '#ffff00';
        const material = Shaders.getAsteroidParticleMaterial(savedInitialColor);
        datasetMaterials[datasetName] = material;

        const particleSystem = new THREE.Points(geometry, material);
        particleSystem.frustumCulled = false;
        particleSystem.userData = {
            datasetName,
            datasetVisible: true,
            sourceData: planetaryData,
            aSpread,
        };
        particleSystem.renderOrder = 200;
        particleSystem.matrixAutoUpdate = false;
        particleSystem.updateMatrix();

        scene.add(particleSystem);

        const groupLabel = this.createGroupLabel(datasetName, savedInitialColor, meanA, aSpread);
        scene.add(groupLabel);
        particleSystem.userData.groupLabel = groupLabel;

        return particleSystem;
    }

    createGroupLabel(text, colorHex, meanA, aSpread) {
        const mat = Shaders.createGroupLabelMat(text, colorHex, meanA);

        const SPREAD_MIN = 0.05,
            SPREAD_MAX = 1.5;
        const SIZE_MULT_MIN = 0.8,
            SIZE_MULT_MAX = 2.0;
        const t = Math.min(1, Math.max(0, (aSpread - SPREAD_MIN) / (SPREAD_MAX - SPREAD_MIN)));
        const multiplier = SIZE_MULT_MIN + t * (SIZE_MULT_MAX - SIZE_MULT_MIN);

        const BASE_WORLD_SIZE = 3.0;
        const worldSize = BASE_WORLD_SIZE * multiplier;

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldSize, worldSize), mat);
        mesh.renderOrder = 250;
        mesh.matrixAutoUpdate = false;
        return mesh;
    }
}
