// js/TimeThrottle.test.js

import { describe, it, expect, vi } from 'vitest';
import { TimeThrottle, calculateThrottleState } from '@ui/TimeThrottle.js';

describe('TimeThrottle Pure Logic (calculateThrottleState)', () => {
    
    it('maps slider indices to the correct multiplier and label', () => {
        // Test Paused (Index 10)
        const pausedState = calculateThrottleState(10);
        expect(pausedState.multiplier).toBe(0);
        expect(pausedState.label).toBe("PAUSED");
        expect(pausedState.isPaused).toBe(true);

        // Test 1x Speed (Index 11)
        const normalState = calculateThrottleState(11);
        expect(normalState.multiplier).toBe(1);
        expect(normalState.label).toBe("1 SEC / SEC");
        expect(normalState.isPaused).toBe(false);

        // Test max reverse (Index 0)
        const reverseState = calculateThrottleState(0);
        expect(reverseState.multiplier).toBe(-3153600000);
        expect(reverseState.label).toBe("-100 YEARS / SEC");
        expect(reverseState.isReversed).toBe(true);
        
        // Test max forward (Index 20)
        const forwardState = calculateThrottleState(20);
        expect(forwardState.multiplier).toBe(3153600000);
        expect(forwardState.label).toBe("100 YEARS / SEC");
    });

    it('clamps out-of-bounds slider indices safely', () => {
        // Test undershoot
        expect(calculateThrottleState(-5).index).toBe(0);
        
        // Test overshoot
        expect(calculateThrottleState(50).index).toBe(20);
    });
});

describe('TimeThrottle Class State & DOM Mutations', () => {
    
    // A helper to generate isolated mock elements for each test
    const createMockElements = () => ({
        timeSlider: { 
            value: 0, 
            addEventListener: vi.fn(), 
            classList: { add: vi.fn(), remove: vi.fn() },
            setAttribute: vi.fn()
        },
        throttleLabel: { innerText: '', style: {} },
        chronoWrapper: { classList: { add: vi.fn(), remove: vi.fn() } },
        btnRev: { addEventListener: vi.fn() },
        btnFwd: { addEventListener: vi.fn() },
        btnPause: { addEventListener: vi.fn() },
        btn1x: { addEventListener: vi.fn() },
        btnLive: { 
            addEventListener: vi.fn(), 
            classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
            setAttribute: vi.fn()
        }
    });

    it('toggles live time state and correctly triggers DOM mutations', () => {
        const mocks = createMockElements();
        
        // Dependency Injection in action: pass the mocks in
        const throttle = new TimeThrottle(mocks);
        
        // Simulating the Live button behavior manually
        throttle.applyThrottle(11);
        throttle.isLiveTime = true; 
        
        expect(throttle.isLiveTime).toBe(true);
        expect(throttle.timeMultiplier).toBe(1);

        // Applying throttle manually should immediately kill live time
        throttle.applyThrottle(12);
        
        expect(throttle.isLiveTime).toBe(false);
        expect(throttle.timeMultiplier).toBe(60);
        
        // Verify the class updated the injected mock elements
        expect(mocks.throttleLabel.innerText).toBe("1 MIN / SEC");
        // Update this assertion to check for toggle instead of remove
        expect(mocks.btnLive.classList.toggle).toHaveBeenCalledWith('active', false);
    });
});

describe('TimeThrottle Planning Session Pause/Resume', () => {
    const createMockElements = () => ({
        timeSlider: {
            value: 0,
            addEventListener: vi.fn(),
            classList: { add: vi.fn(), remove: vi.fn() },
            setAttribute: vi.fn()
        },
        throttleLabel: { innerText: '', style: {} },
        chronoWrapper: { classList: { add: vi.fn(), remove: vi.fn() } },
        btnRev: { addEventListener: vi.fn() },
        btnFwd: { addEventListener: vi.fn() },
        btnPause: { addEventListener: vi.fn() },
        btn1x: { addEventListener: vi.fn() },
        btnLive: {
            addEventListener: vi.fn(),
            classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
            setAttribute: vi.fn()
        }
    });

    it('pauseForPlanning freezes the chronometer and resumeFromPlanning restores the prior throttle index', () => {
        const mocks = createMockElements();
        const throttle = new TimeThrottle(mocks);

        throttle.applyThrottle(14); // 1 DAY / SEC
        throttle.pauseForPlanning();

        expect(throttle.timeMultiplier).toBe(0);
        expect(mocks.throttleLabel.innerText).toBe('PAUSED');

        throttle.resumeFromPlanning();

        expect(throttle.timeMultiplier).toBe(86400);
        expect(mocks.throttleLabel.innerText).toBe('1 DAY / SEC');
    });

    it('resumeFromPlanning restores live time and re-presses the Live button when it was live', () => {
        const mocks = createMockElements();
        const throttle = new TimeThrottle(mocks);

        throttle.applyThrottle(11);
        throttle.isLiveTime = true;

        throttle.pauseForPlanning();
        expect(throttle.isLiveTime).toBe(false);

        throttle.resumeFromPlanning();

        expect(throttle.timeMultiplier).toBe(1);
        expect(throttle.isLiveTime).toBe(true);
        expect(mocks.btnLive.classList.toggle).toHaveBeenCalledWith('active', true);
    });

    it('a repeated pauseForPlanning call before resuming does not overwrite the original snapshot', () => {
        const mocks = createMockElements();
        const throttle = new TimeThrottle(mocks);

        throttle.applyThrottle(15); // 1 WEEK / SEC
        throttle.pauseForPlanning();
        throttle.pauseForPlanning(); // nested/duplicate call — must not snapshot "PAUSED"

        throttle.resumeFromPlanning();

        expect(throttle.timeMultiplier).toBe(604800);
        expect(mocks.throttleLabel.innerText).toBe('1 WEEK / SEC');
    });

    it('resumeFromPlanning is a safe no-op when nothing was paused for planning', () => {
        const mocks = createMockElements();
        const throttle = new TimeThrottle(mocks);

        throttle.applyThrottle(13); // 1 HOUR / SEC
        throttle.resumeFromPlanning();

        expect(throttle.timeMultiplier).toBe(3600);
    });
});