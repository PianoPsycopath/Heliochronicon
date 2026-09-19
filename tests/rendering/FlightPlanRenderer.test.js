import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { FlightPlanRenderer, BURN_MARKER_PIXEL_SIZE } from '@rendering/FlightPlanRenderer.js';

describe('FlightPlanRenderer', () => {
    let scene;
    let renderer;
    let mockCamera;
    let mockWebGLRenderer;
    let mockGetCurrentOrigin; // Add variable for the mock

    beforeAll(() => {
        // Mock the browser document and canvas API required by getBurnDotTexture()
        vi.stubGlobal('document', {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    return {
                        width: 64,
                        height: 64,
                        getContext: () => ({
                            createRadialGradient: () => ({ addColorStop: () => {} }),
                            fillRect: () => {}
                        })
                    };
                }
                return {};
            }
        });

        // Mock browser animation frame APIs
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); 
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });
    beforeEach(() => {
        scene = new THREE.Scene();
        
        // Mock a basic PerspectiveCamera
        mockCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        
        // Mock the WebGLRenderer
        mockWebGLRenderer = {
            domElement: {
                clientHeight: 720
            }
        };

        // Mock the getCurrentOrigin function to return a 0,0,0 coordinate object
        mockGetCurrentOrigin = vi.fn(() => ({ x: 0, y: 0, z: 0 }));

        // Pass all four required dependencies
        renderer = new FlightPlanRenderer({ 
            scene,
            camera: mockCamera,
            renderer: mockWebGLRenderer,
            getCurrentOrigin: mockGetCurrentOrigin
        });
    });

    it('initializes cleanly and attaches trajectory group to scene', () => {
        expect(renderer.scene).toBe(scene);
        expect(scene.children.length).toBe(1);
        expect(scene.children[0].name).toBe('FlightPlanGroup');
        expect(renderer.activePlan).toBeNull();
    });

    it('renders trajectory line and burn markers when setPlan is called', () => {
        const mockPlan = {
            trajectorySamples: [
                { position: { x: 0, y: 0, z: 0 } },
                { position: { x: 1, y: 1, z: 1 } },
                { position: { x: 2, y: 2, z: 2 } }
            ],
            burns: [
                { position: { x: 0, y: 0, z: 0 } },
                { position: { x: 2, y: 2, z: 2 } }
            ]
        };

        renderer.setPlan(mockPlan);

        // 1 line geometry + 2 burn marker geometries
        expect(renderer.trajectoryGroup.children.length).toBe(3);
        expect(renderer.activePlan).toBe(mockPlan);
    });

    it('gracefully handles missing trajectorySamples', () => {
        const mockPlanNoSamples = {
            burns: [{ position: { x: 1, y: 1, z: 1 } }]
        };

        renderer.setPlan(mockPlanNoSamples);
        expect(renderer.trajectoryGroup.children.length).toBe(1); // Only the burn
    });

    it('clears previous geometries cleanly via clear()', () => {
        const mockPlan = {
            trajectorySamples: [
                { position: { x: 0, y: 0, z: 0 } },
                { position: { x: 1, y: 1, z: 1 } }
            ],
            burns: []
        };

        renderer.setPlan(mockPlan);
        expect(renderer.trajectoryGroup.children.length).toBe(1);

        renderer.clear();
        expect(renderer.trajectoryGroup.children.length).toBe(0);
        expect(renderer.activePlan).toBeNull();
    });

    it('cleans up resources and detaches on dispose()', () => {
        renderer.dispose();
        expect(scene.children.length).toBe(0);
    });
    describe('burn marker visibility (Phase 0)', () => {
        const VIEWPORT_PX = 720;

        function expectedPerspectiveSize(camera, distance) {
            const vFovRad = THREE.MathUtils.degToRad(camera.fov);
            return (BURN_MARKER_PIXEL_SIZE / VIEWPORT_PX) * 2 * Math.tan(vFovRad / 2) * distance;
        }

        it('sizes markers from the camera distance in scene space when the floating origin is non-zero', () => {
            // Heliocentric marker at (100,0,0); origin at (100,0,0) => the marker
            // sits at scene (0,0,0). Camera at scene (0,0,5) => true distance 5.
            // Measuring against the un-shifted heliocentric position would give ~100.
            mockGetCurrentOrigin.mockReturnValue({ x: 100, y: 0, z: 0 });
            mockCamera.position.set(0, 0, 5);

            renderer.setPlan({ burns: [{ position: { x: 100, y: 0, z: 0 } }] });

            const [marker] = renderer._burnMarkers;
            expect(marker.scale.x).toBeCloseTo(expectedPerspectiveSize(mockCamera, 5), 9);
        });

        it('keeps the apparent size constant in pixels as the floating origin moves', () => {
            mockCamera.position.set(0, 0, 5);

            mockGetCurrentOrigin.mockReturnValue({ x: 0, y: 0, z: 0 });
            renderer.setPlan({ burns: [{ position: { x: 0, y: 0, z: 0 } }] });
            const sizeAtZeroOrigin = renderer._burnMarkers[0].scale.x;

            // Same scene-space geometry, different origin bookkeeping.
            mockGetCurrentOrigin.mockReturnValue({ x: 1, y: 0.5, z: -0.25 });
            renderer.setPlan({ burns: [{ position: { x: 1, y: 0.5, z: -0.25 } }] });
            const sizeAtShiftedOrigin = renderer._burnMarkers[0].scale.x;

            expect(sizeAtShiftedOrigin).toBeCloseTo(sizeAtZeroOrigin, 9);
        });

        it('offsets the trajectory group by the negative floating origin', () => {
            mockGetCurrentOrigin.mockReturnValue({ x: 1, y: 2, z: 3 });
            renderer.setPlan({ burns: [{ position: { x: 1, y: 2, z: 3 } }] });

            expect(renderer.trajectoryGroup.position.toArray()).toEqual([-1, -2, -3]);
        });

        it('does not add markers for burns with NaN/Infinity positions and reports them', () => {
            renderer.setPlan({
                burns: [
                    { position: { x: 1, y: 0, z: 0 } },
                    { position: { x: NaN, y: 0, z: 0 } },
                    { position: { x: 0, y: Infinity, z: 0 } },
                    { position: null },
                ],
            });

            expect(renderer._burnMarkers.length).toBe(1);
            expect(renderer.lastPlanReport).toEqual({
                trajectoryPoints: 0,
                burnsTotal: 4,
                burnMarkersShown: 1,
                burnsWithoutPosition: 1,
                burnsWithNonFinitePosition: 2,
            });
        });

        it('reports departure + arrival markers for a production-shaped plan', () => {
            renderer.setPlan({
                trajectorySamples: [
                    { position: { x: 1, y: 0, z: 0 } },
                    { position: { x: 0.5, y: 0.8, z: 0.01 } },
                    { position: { x: -1.2, y: 0.9, z: 0.02 } },
                ],
                burns: [
                    { epochDaysJ2000: 0, deltaV: { x: 0, y: 0, z: 0 }, position: { x: 1.00004, y: 0, z: 0 } },
                    { epochDaysJ2000: 260, deltaV: { x: 0, y: 0, z: 0 }, position: { x: -1.2, y: 0.9, z: 0.02 } },
                ],
            });

            expect(renderer.lastPlanReport.burnMarkersShown).toBe(2);
            expect(renderer.lastPlanReport.trajectoryPoints).toBe(3);
        });

        it('leaves the shared sprite geometry intact when a plan is cleared', () => {
            renderer.setPlan({ burns: [{ position: { x: 1, y: 0, z: 0 } }] });
            const sharedGeometry = renderer._burnMarkers[0].geometry;
            const disposeSpy = vi.spyOn(sharedGeometry, 'dispose');

            renderer.clear();

            expect(disposeSpy).not.toHaveBeenCalled();
        });

        it('resets lastPlanReport when setPlan receives no plan', () => {
            renderer.setPlan({ burns: [{ position: { x: 1, y: 0, z: 0 } }] });
            renderer.setPlan(null);

            expect(renderer.lastPlanReport).toBeNull();
        });
    });
});