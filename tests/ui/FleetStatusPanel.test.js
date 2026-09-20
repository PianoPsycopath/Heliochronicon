// tests/ui/FleetStatusPanel.test.js
import { describe, it, expect } from 'vitest';
import { FleetStatusPanel } from '@ui/FleetStatusPanel.js';

function fakeElement() {
    return {
        innerHTML: '',
        value: '',
        disabled: false,
        addEventListener() {},
        removeEventListener() {},
        contains: () => false,
    };
}

function createPanel() {
    const elements = {
        '#fleet-search-input': fakeElement(),
        '#fleet-list': fakeElement(),
        '#fleet-detail': fakeElement(),
        '#fleet-focus-btn': fakeElement(),
    };
    const container = {
        innerHTML: '',
        querySelector: (selector) => elements[selector] ?? null,
    };
    const panel = new FleetStatusPanel({ container });
    return { panel, detail: () => elements['#fleet-detail'].innerHTML };
}

const BASE = { id: 'f', name: 'Fleet', state: 'parked', targetName: null, fuelRemaining: 10 };

describe('FleetStatusPanel parent body', () => {
    it('shows the parent body and its SOI when the fleet is inside one', () => {
        const { panel, detail } = createPanel();
        panel.setStatus({ ...BASE, parentBody: 'Earth', parentSoiKm: 924498.136 });

        expect(detail()).toContain('<span>PARENT</span> <span>EARTH</span>');
        expect(detail()).toContain('<span>SOI</span> <span>924498 KM</span>');
    });

    it('shows the parent but no SOI row for the Sun, whose SOI is unbounded', () => {
        const { panel, detail } = createPanel();
        panel.setStatus({ ...BASE, parentBody: 'SUN', parentSoiKm: null });

        expect(detail()).toContain('<span>PARENT</span> <span>SUN</span>');
        expect(detail()).not.toContain('SOI');
    });

    it('omits both rows when no parent could be resolved', () => {
        const { panel, detail } = createPanel();
        panel.setStatus({ ...BASE, parentBody: null, parentSoiKm: null });

        expect(detail()).not.toContain('PARENT');
        expect(detail()).not.toContain('SOI');
    });

    it('escapes the parent name', () => {
        const { panel, detail } = createPanel();
        panel.setStatus({ ...BASE, parentBody: '<b>x</b>' });

        expect(detail()).not.toContain('<b>');
        expect(detail()).toContain('&lt;B&gt;X&lt;/B&gt;');
    });

    it('still renders the existing rows alongside it', () => {
        const { panel, detail } = createPanel();
        panel.setStatus({ ...BASE, parentBody: 'EARTH', altitudeKm: 300, fuelRemaining: 12.34 });

        expect(detail()).toContain('<span>FUEL</span> <span>12.3</span>');
        expect(detail()).toContain('<span>ALTITUDE</span> <span>300 KM</span>');
    });
});
