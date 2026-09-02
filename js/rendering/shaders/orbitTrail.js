// js/shaders/orbitTrail.js
import * as THREE from 'three';

export class OrbitTrailShaders {
    static createOrbitTrailMaterial({
        color = 0xff1111,
        opacity = 0.5,
        solidFraction = 0.25,
        dashCycles = 28,
        dashRatio = 0.55,
        depthTest = false,
    } = {}) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uOpacity: { value: opacity },
                uPhase: { value: 0 }, // the only per-frame update
                uSolidFraction: { value: solidFraction },
                uDashCycles: { value: dashCycles },
                uDashRatio: { value: dashRatio },
            },
            vertexShader: `
                attribute float aProgress; // static: index / ORBIT_RESOLUTION
                varying float vProgress;
                void main() {
                    vProgress = aProgress;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uPhase;
                uniform float uSolidFraction;
                uniform float uDashCycles;
                uniform float uDashRatio;
                varying float vProgress;

                void main() {
                    float deltaBehind = mod(uPhase - vProgress, 1.0);

                    float alpha = 1.0;
                    if (deltaBehind >= uSolidFraction) {
                        float dashPhase = vProgress * uDashCycles;
                        float frac = fract(dashPhase);

                        float behindNorm = clamp((deltaBehind - uSolidFraction) / (1.0 - uSolidFraction), 0.0, 1.0);
                        float dashWidth = uDashRatio * (1.0 - behindNorm);

                        alpha = step(frac, dashWidth);
                        if (alpha <= 0.0) discard;
                    }

                    gl_FragColor = vec4(uColor, uOpacity * alpha);
                }
            `,
            transparent: true,
            depthTest,
        });

        Object.defineProperty(material, 'color', {
            get() { return this.uniforms.uColor.value; },
        });
        Object.defineProperty(material, 'opacity', {
            get() { return this.uniforms.uOpacity.value; },
            set(v) { this.uniforms.uOpacity.value = v; },
        });

        return material;
    }
}