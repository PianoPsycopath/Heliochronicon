// @vitest-environment jsdom
// tests/ui/FlightPlanningPanel.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlightPlanningPanel } from '@ui/FlightPlanningPanel.js';

function makeContainer() {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

describe('FlightPlanningPanel', () => {
    let container;
    let panel;

    beforeEach(() => {
        document.body.innerHTML = '';
        container = makeContainer();
        panel = new FlightPlanningPanel({ container });
    });

    it('throws if constructed without a container', () => {
        expect(() => new FlightPlanningPanel({})).toThrow();
        expect(() => new FlightPlanningPanel()).toThrow();
    });

    it('renders fleet identity, target control, and calculate button', () => {
        expect(container.querySelector('#fp-fleet-status').textContent).toBe('NO FLEET LOADED');
        expect(container.querySelector('#fp-target-input')).toBeTruthy();
        expect(container.querySelector('#fp-calculate-btn')).toBeTruthy();
        expect(container.querySelector('#fp-results').hidden).toBe(true);
    });

    describe('setFleet', () => {
        it('shows the fleet name and state once set', () => {
            panel.setFleet({ id: 'user-fleet', name: 'Astrum Domini', state: 'parked' });
            expect(container.querySelector('#fp-fleet-status').textContent).toBe(
                'ASTRUM DOMINI — PARKED'
            );
        });

        it('falls back to NO FLEET LOADED when name is missing', () => {
            panel.setFleet({ id: 'user-fleet', state: 'parked' });
            expect(container.querySelector('#fp-fleet-status').textContent).toBe(
                'NO FLEET LOADED'
            );
        });
    });

    describe('setTarget', () => {
        it('populates the target input', () => {
            panel.setTarget('Mars');
            expect(container.querySelector('#fp-target-input').value).toBe('Mars');
        });

        it('clears the input for a falsy target', () => {
            panel.setTarget('Mars');
            panel.setTarget(null);
            expect(container.querySelector('#fp-target-input').value).toBe('');
        });
    });

    describe('calculate trigger', () => {
        it('fires onCalculateRequested with fleetId + trimmed target name on button click', () => {
            const onCalculateRequested = vi.fn();
            panel.onCalculateRequested = onCalculateRequested;
            panel.setFleet({ id: 'user-fleet', name: 'Astrum Domini', state: 'parked' });

            const input = container.querySelector('#fp-target-input');
            input.value = '  Mars  ';
            container.querySelector('#fp-calculate-btn').click();

            expect(onCalculateRequested).toHaveBeenCalledTimes(1);
            expect(onCalculateRequested).toHaveBeenCalledWith({
                fleetId: 'user-fleet',
                targetName: 'Mars',
            });
        });

        it('also fires on Enter inside the target input', () => {
            const onCalculateRequested = vi.fn();
            panel.onCalculateRequested = onCalculateRequested;

            const input = container.querySelector('#fp-target-input');
            input.value = 'Venus';
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            expect(onCalculateRequested).toHaveBeenCalledWith({
                fleetId: null,
                targetName: 'Venus',
            });
        });

        it('does not throw when no callback is registered', () => {
            expect(() => container.querySelector('#fp-calculate-btn').click()).not.toThrow();
        });
    });

    describe('showFlightPlan', () => {
        it('renders a feasible plan with formatted numbers', () => {
            panel.showFlightPlan({
                totalDeltaV: 5.4321,
                propellantRequired: 1234.5,
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000: 270,
                isFeasible: true,
                warnings: [],
            });

            const results = container.querySelector('#fp-results');
            expect(results.hidden).toBe(false);
            expect(results.textContent).toContain('FEASIBLE');
            expect(results.textContent).not.toContain('NOT FEASIBLE');
            expect(results.textContent).toContain('5.432');
            expect(results.textContent).toContain('270.0');
            expect(results.textContent).toContain('1234.5');
        });

        it('derives TOF from epochs when plan.tof is absent, and prefers plan.tof when present', () => {
            panel.showFlightPlan({
                tof: 42,
                totalDeltaV: 1,
                propellantRequired: 1,
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000: 999,
                isFeasible: true,
            });
            expect(container.querySelector('#fp-results').textContent).toContain('42.0');
        });

        it('marks infeasible plans and surfaces warnings + fuelWarning', () => {
            panel.showFlightPlan({
                totalDeltaV: 3,
                propellantRequired: 999999,
                isFeasible: false,
                warnings: ['Departure window skipped'],
                fuelWarning: 'Insufficient propellant for this transfer',
            });

            const results = container.querySelector('#fp-results');
            expect(results.textContent).toContain('NOT FEASIBLE');
            expect(results.textContent).toContain('Departure window skipped');
            expect(results.textContent).toContain('Insufficient propellant for this transfer');
        });

        it('escapes warning text', () => {
            panel.showFlightPlan({
                totalDeltaV: 1,
                propellantRequired: 1,
                isFeasible: false,
                warnings: ['<script>alert(1)</script>'],
            });
            expect(container.querySelector('#fp-results').innerHTML).not.toContain('<script>');
        });

        it('shows placeholders for missing numeric fields', () => {
            panel.showFlightPlan({ isFeasible: true });
            const text = container.querySelector('#fp-results').textContent;
            expect(text).toContain('—');
        });

        it('treats a falsy plan as clearFlightPlan', () => {
            panel.showFlightPlan({ totalDeltaV: 1, propellantRequired: 1, isFeasible: true });
            panel.showFlightPlan(null);
            const results = container.querySelector('#fp-results');
            expect(results.hidden).toBe(true);
            expect(results.innerHTML).toBe('');
        });
    });

    describe('clearFlightPlan', () => {
        it('hides and empties the results container', () => {
            panel.showFlightPlan({ totalDeltaV: 1, propellantRequired: 1, isFeasible: true });
            panel.clearFlightPlan();
            const results = container.querySelector('#fp-results');
            expect(results.hidden).toBe(true);
            expect(results.innerHTML).toBe('');
        });
    });

    describe('destroy', () => {
        it('detaches listeners so calculate no longer fires', () => {
            const onCalculateRequested = vi.fn();
            panel.onCalculateRequested = onCalculateRequested;
            panel.destroy();

            container.querySelector('#fp-calculate-btn').click();
            container
                .querySelector('#fp-target-input')
                .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

            expect(onCalculateRequested).not.toHaveBeenCalled();
        });
    });
});