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
                varying vec3 vNormal;
                varying vec3 vViewDir;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewDir = normalize(-mvPosition.xyz);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                varying vec3 vNormal;
                varying vec3 vViewDir;
                void main() {
                    // Fresnel rim: glancing faces read brighter/denser, faces
                    // viewed head-on fall away -- gives a soft volumetric edge
                    // instead of a hard flat-shaded surface.
                    float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vViewDir)));
                    float density = pow(rim, 1.6) * 0.85 + 0.15;
                    gl_FragColor = vec4(uColor * density, uOpacity * density);
                }
            `,
            transparent: true,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
    }

    static setColor(material, colorHex) {
        if (material?.uniforms?.uColor) {
            material.uniforms.uColor.value.set(colorHex);
        }
    }
}