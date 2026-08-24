// @vitest-environment jsdom
// js/ui/__tests__/AccessibilityManager.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessibilityManager } from '@ui/AccessibilityManager.js';

function makeButton() {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    return btn;
}

function makeDiv() {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

describe('AccessibilityManager', () => {
    let a11y;

    beforeEach(() => {
        document.body.innerHTML = '';
        a11y = new AccessibilityManager();
    });

    describe('kind: toggle', () => {
        it('sets initial aria-pressed and active class from `pressed`', () => {
            const btn = makeButton();
            a11y.register({ element: btn, kind: 'toggle', label: 'Scan', pressed: true });

            expect(btn.getAttribute('aria-pressed')).toBe('true');
            expect(btn.classList.contains('active')).toBe(true);
            expect(btn.getAttribute('aria-label')).toBe('Scan');
        });

        it('calls onActivate on click and keeps state in sync via the handle', () => {
            const btn = makeButton();
            const onActivate = vi.fn();
            const handle = a11y.register({ element: btn, kind: 'toggle', onActivate });

            btn.click();
            expect(onActivate).toHaveBeenCalledTimes(1);

            handle.setPressed(true);
            expect(btn.getAttribute('aria-pressed')).toBe('true');
            expect(btn.classList.contains('active')).toBe(true);

            handle.setPressed(false);
            expect(btn.getAttribute('aria-pressed')).toBe('false');
            expect(btn.classList.contains('active')).toBe(false);
        });

        it('respects a custom activeClass', () => {
            const btn = makeButton();
            const handle = a11y.register({
                element: btn,
                kind: 'toggle',
                activeClass: 'mode-both',
            });
            handle.setPressed(true);
            expect(btn.classList.contains('mode-both')).toBe(true);
            expect(btn.classList.contains('active')).toBe(false);
        });
    });

    describe('kind: checkbox (non-native, keyboard-activatable)', () => {
        it('assigns role, tabIndex, and aria-checked automatically', () => {
            const row = makeDiv();
            a11y.register({ element: row, kind: 'checkbox', checked: false });

            expect(row.getAttribute('role')).toBe('checkbox');
            expect(row.tabIndex).toBe(0);
            expect(row.getAttribute('aria-checked')).toBe('false');
        });

        it('activates on Enter and Space, not on other keys', () => {
            const row = makeDiv();
            const onActivate = vi.fn();
            a11y.register({ element: row, kind: 'checkbox', onActivate });

            row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
            row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

            expect(onActivate).toHaveBeenCalledTimes(2);
        });

        it('does not double-wire keyboard activation for native buttons', () => {
            const btn = makeButton();
            const onActivate = vi.fn();
            a11y.register({ element: btn, kind: 'toggle', onActivate });

            // Native buttons get Enter/Space activation from the browser itself;
            // AccessibilityManager should not attach its own keydown handler.
            btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            expect(onActivate).not.toHaveBeenCalled();
        });
    });

    describe('disabled sync', () => {
        it('syncs native .disabled, aria-disabled, and removes the control from tab order', () => {
            const btn = makeButton();
            const handle = a11y.register({ element: btn, kind: 'toggle' });

            handle.setDisabled(true);
            expect(btn.disabled).toBe(true);
            expect(btn.getAttribute('aria-disabled')).toBe('true');
            expect(btn.tabIndex).toBe(-1);

            handle.setDisabled(false);
            expect(btn.disabled).toBe(false);
            expect(btn.getAttribute('aria-disabled')).toBe('false');
        });

        it('blocks onActivate while disabled', () => {
            const btn = makeButton();
            const onActivate = vi.fn();
            const handle = a11y.register({ element: btn, kind: 'toggle', onActivate });

            handle.setDisabled(true);
            btn.click();
            expect(onActivate).not.toHaveBeenCalled();
        });
    });

    describe('kind: cycle', () => {
        const states = [
            { className: 'mode-a', label: 'Mode A', tooltip: 'First mode', pressed: false },
            { className: 'mode-b', label: 'Mode B', tooltip: 'Second mode' },
            { className: 'mode-c', label: 'Mode C', tooltip: 'Third mode' },
        ];

        it('applies the initial state on registration', () => {
            const btn = makeButton();
            a11y.register({ element: btn, kind: 'cycle', states });

            expect(btn.classList.contains('mode-a')).toBe(true);
            expect(btn.getAttribute('aria-label')).toBe('Mode A');
            expect(btn.getAttribute('aria-pressed')).toBe('false');
        });

        it('advances through states and wraps around', () => {
            const btn = makeButton();
            const handle = a11y.register({ element: btn, kind: 'cycle', states });

            handle.nextState();
            expect(btn.classList.contains('mode-b')).toBe(true);
            expect(btn.classList.contains('mode-a')).toBe(false);
            expect(btn.getAttribute('aria-label')).toBe('Mode B');
            expect(btn.getAttribute('aria-pressed')).toBe('true');

            handle.nextState();
            expect(btn.classList.contains('mode-c')).toBe(true);

            handle.nextState(); // wraps back to state 0
            expect(btn.classList.contains('mode-a')).toBe(true);
            expect(btn.getAttribute('aria-pressed')).toBe('false');
        });
    });

    describe('tooltip integration', () => {
        it('falls back to the native title attribute when no TooltipManager is supplied', () => {
            const btn = makeButton();
            a11y.register({ element: btn, kind: 'static', tooltip: 'Hello' });
            expect(btn.title).toBe('Hello');
        });

        it('routes through TooltipManager.setButtonTooltip and re-attaches when provided', () => {
            const tooltipManager = {
                setButtonTooltip: vi.fn(),
                attachButtonTooltips: vi.fn(),
            };
            const a11yWithTooltips = new AccessibilityManager({ tooltipManager });
            const btn = makeButton();

            a11yWithTooltips.register({
                element: btn,
                kind: 'toggle',
                tooltip: 'Scan for nearby objects',
                tooltipLive: true,
            });

            expect(btn.dataset.tooltipLive).toBe('');
            expect(tooltipManager.setButtonTooltip).toHaveBeenCalledWith(
                btn,
                'Scan for nearby objects'
            );
            expect(tooltipManager.attachButtonTooltips).toHaveBeenCalled();
            expect(btn.title).toBe(''); // never falls back once a TooltipManager exists
        });
    });

    describe('unregister', () => {
        it('removes activation listeners so onActivate no longer fires', () => {
            const btn = makeButton();
            const onActivate = vi.fn();
            const handle = a11y.register({ element: btn, kind: 'toggle', onActivate });

            handle.destroy();
            btn.click();
            expect(onActivate).not.toHaveBeenCalled();
        });
    });

    describe('describedBy', () => {
        it('accepts a plain id or an element with an id', () => {
            const btn = makeButton();
            const label = makeDiv();
            label.id = 'search-label';

            a11y.register({ element: btn, kind: 'static', describedBy: label });
            expect(btn.getAttribute('aria-describedby')).toBe('search-label');

            const btn2 = makeButton();
            a11y.register({ element: btn2, kind: 'static', describedBy: 'other-id' });
            expect(btn2.getAttribute('aria-describedby')).toBe('other-id');
        });
    });
});