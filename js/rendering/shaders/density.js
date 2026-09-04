// js/rendering/shaders/density.js
import * as THREE from 'three';

export class DensityShaders {
    static getDensitySurfaceMaterial(colorHex = '#ffffff', baseOpacity = 0.16) {
        return new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(colorHex) },
                uOpacity: { value: baseOpacity },
            },
            vertexShader: `
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending, // Changed from AdditiveBlending to prevent glowing overlaps
        });
    }

    static setColor(material, colorHex) {
        if (material?.uniforms?.uColor) {
            material.uniforms.uColor.value.set(colorHex);
        }
    }
}