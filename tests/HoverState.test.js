//js/tests/HoverState.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoverState } from '@camera/HoverState.js';

describe('HoverState', () => {
    let tooltipManager;
    let onBodyHovered;
    let hoverState;
    let mockContext;

    beforeEach(() => {
        // Mock TooltipManager interface
        tooltipManager = {
            show: vi.fn(),
            hide: vi.fn(),
            move: vi.fn(),
            isOwnedBy: vi.fn().mockReturnValue(true) 
        };
        
        onBodyHovered = vi.fn();
        mockContext = { name: 'InteractionController' };

        hoverState = new HoverState({ tooltipManager, onBodyHovered });
    });

    it('should trigger hover and show tooltip on a new tactical body', () => {
        const bodyData = { name: 'Asteroid X', datasetCategory: 'ASTEROID', a: 2.5 };
        
        hoverState.updateHover(bodyData, 100, 200, mockContext);

        expect(hoverState._hoveredData).toBe(bodyData);
        expect(onBodyHovered).toHaveBeenCalledWith(bodyData);
        expect(tooltipManager.show).toHaveBeenCalledWith(
            mockContext, 
            expect.objectContaining({ html: expect.stringContaining('Asteroid X') }), 
            100, 
            200, 
            'tactical'
        );
    });

    it('should only move the tooltip if hovering over the same body', () => {
        const bodyData = { name: 'Asteroid X', datasetCategory: 'ASTEROID' };

        hoverState.updateHover(bodyData, 100, 200, mockContext);
        onBodyHovered.mockClear();
        tooltipManager.show.mockClear();

        hoverState.updateHover(bodyData, 150, 250, mockContext);

        expect(onBodyHovered).not.toHaveBeenCalled();
        expect(tooltipManager.show).not.toHaveBeenCalled();
        expect(tooltipManager.move).toHaveBeenCalledWith(150, 250);
    });

    it('should trigger a new hover when transitioning to a different body', () => {
        const body1 = { name: 'Asteroid 1', datasetCategory: 'ASTEROID' };
        const body2 = { name: 'Asteroid 2', datasetCategory: 'ASTEROID' };
        
        hoverState.updateHover(body1, 100, 200, mockContext);
        onBodyHovered.mockClear();

        hoverState.updateHover(body2, 150, 250, mockContext);

        expect(hoverState._hoveredData).toBe(body2);
        expect(onBodyHovered).toHaveBeenCalledWith(body2);
    });

    it('should clear hover and hide tooltip when moving into empty space', () => {
        const bodyData = { name: 'Asteroid X', datasetCategory: 'ASTEROID' };
        hoverState.updateHover(bodyData, 100, 200, mockContext);
        
        onBodyHovered.mockClear();
        tooltipManager.hide.mockClear();

        hoverState.updateHover(null, 300, 300, mockContext);

        expect(hoverState._hoveredData).toBeNull();
        expect(onBodyHovered).toHaveBeenCalledWith(null);
        expect(tooltipManager.hide).toHaveBeenCalledWith(mockContext);
    });

    it('should correctly format and show a star tooltip', () => {
        const starData = { proper: 'Sirius', datasetCategory: 'BACKGROUND_STAR', spect: 'A1V' };
        
        hoverState.updateHover(starData, 50, 50, mockContext);
        
        expect(tooltipManager.show).toHaveBeenCalledWith(
            mockContext,
            'Sirius  ·  A1V',
            50,
            50,
            'star'
        );
    });

    it('should clear hover completely when clearHover is explicitly called', () => {
        const bodyData = { name: 'Target', datasetCategory: 'PLANET' };
        hoverState.updateHover(bodyData, 0, 0, mockContext);
        
        hoverState.clearHover(mockContext);

        expect(hoverState._hoveredData).toBeNull();
        expect(onBodyHovered).toHaveBeenCalledWith(null);
        expect(tooltipManager.hide).toHaveBeenCalledWith(mockContext);
    });
});