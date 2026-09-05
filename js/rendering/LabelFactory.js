// js/rendering/LabelFactory.js
import * as THREE from 'three';
import { TacticalShaders } from '@rendering/shaders/tactical.js';

export class LabelFactory {
    static buildGroupLabel(datasetName, colorHex, meanA = 2.5) {
        const labelMaterial = TacticalShaders.createGroupLabelMat(
            datasetName, 
            colorHex, 
            meanA
        );
        
        const sizeAU = Math.max(1.2, meanA * 0.9);
        return new THREE.Mesh(new THREE.PlaneGeometry(sizeAU, sizeAU), labelMaterial);
    }
}