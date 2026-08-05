import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TimeThrottle } from '../js/TimeThrottle.js';

describe('TimeThrottle Logic', () => {
    let mockLabel;

    beforeEach(() => {
        mockLabel = { innerText: '', style: {} };
        const mockElement = () => ({
            addEventListener: vi.fn(),
            classList: { add: vi.fn(), remove: vi.fn() },
            style: {},
            value: 0
        });

        vi.stubGlobal('document', {
            getElementById: (id) => {
                if (id === 'throttle-label') return mockLabel;
                return mockElement();
            }
        });
    });

    it('maps slider indices to the correct multiplier and label', () => {
        const throttle = new TimeThrottle();
        
        // Test Paused (Index 10)
        throttle.applyThrottle(10);
        expect(throttle.timeMultiplier).toBe(0);
        expect(mockLabel.innerText).toBe("PAUSED");
        expect(throttle.isLiveTime).toBe(false);

        // Test 1x Speed (Index 11)
        throttle.applyThrottle(11);
        expect(throttle.timeMultiplier).toBe(1);
        expect(mockLabel.innerText).toBe("1 SEC / SEC");

        // Test max reverse (Index 0)
        throttle.applyThrottle(0);
        expect(throttle.timeMultiplier).toBe(-3153600000);
        expect(mockLabel.innerText).toBe("-100 YEARS / SEC");
        
        // Test max forward (Index 20)
        throttle.applyThrottle(20);
        expect(throttle.timeMultiplier).toBe(3153600000);
        expect(mockLabel.innerText).toBe("100 YEARS / SEC");
    });

    it('clamps out-of-bounds slider indices safely', () => {
        const throttle = new TimeThrottle();
        
        // Test undershoot
        throttle.applyThrottle(-5);
        expect(throttle.timeMultiplier).toBe(-3153600000); // Clamped to 0
        
        // Test overshoot
        throttle.applyThrottle(50);
        expect(throttle.timeMultiplier).toBe(3153600000); // Clamped to 20
    });

    it('toggles live time state when requested', () => {
        const throttle = new TimeThrottle();
        
        // Simulating the Live button click callback logic manually
        throttle.applyThrottle(11);
        throttle.isLiveTime = true;
        
        expect(throttle.isLiveTime).toBe(true);
        expect(throttle.timeMultiplier).toBe(1);

        // Applying throttle manually should immediately kill live time
        throttle.applyThrottle(12);
        expect(throttle.isLiveTime).toBe(false);
    });
});