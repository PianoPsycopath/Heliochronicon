// js/TimeThrottle.test.js

import { describe, it, expect, vi } from 'vitest';
import { TimeThrottle, calculateThrottleState } from '../js/TimeThrottle.js';

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
        timeSlider: { value: 0, addEventListener: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } },
        throttleLabel: { innerText: '', style: {} },
        chronoWrapper: { classList: { add: vi.fn(), remove: vi.fn() } },
        btnRev: { addEventListener: vi.fn() },
        btnFwd: { addEventListener: vi.fn() },
        btnPause: { addEventListener: vi.fn() },
        btn1x: { addEventListener: vi.fn() },
        btnLive: { addEventListener: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } }
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
        expect(mocks.btnLive.classList.remove).toHaveBeenCalledWith('active');
    });
});