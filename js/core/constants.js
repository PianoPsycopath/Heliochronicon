// js/core/constants.js

export const AU_IN_KM = 149597870.7;

export const STAR_FAR_PLANE_AU = 1e14;

// Convert daysSinceJ2000 to centuries for pole-precession rates (deg/century).
export const JULIAN_CENTURY_DAYS = 36525.0;

// Default Earth-Moon barycenter weight when body data omits barycenter_mass_ratio.
export const EARTH_MOON_MASS_RATIO = 82.30059;

// Must match array length in main.js and shader loop bound in GridShaders.getGridMaterial.
export const MAX_WELLS = 35;

// Must match the candidate cap applied by EclipseShadowController.
export const MAX_SHADOWS = 8;

// Hard cap to prevent combinatorial explosion in moon-moon eclipse search.
export const MAX_MOON_MOON_MEMBERS = 8;

// --- SEASON MARKERS ---

// Gate 1: small bodies never receive tilt-based seasons.
export const SEASON_MIN_RADIUS_KM = 1000;

// Gate 2: distance-driven climate threshold (Gate 4 = negligible below this).
export const SEASON_ECCENTRICITY_THRESHOLD = 0.05;

// Gate 3: tilt-dominated seasons threshold.
export const SEASON_TILT_THRESHOLD_DEG = 10.0;

// True-anomaly window that triggers distance/node label modifiers.
export const SEASON_DISTANCE_MODIFIER_DEG = 15;

export const SEASON_SYMBOLS = {
    FIRE: '\u{1F702}', // Summer
    WATER: '\u{1F704}', // Winter
    AIR: '\u{1F701}', // Spring
    EARTH: '\u{1F703}', // Autumn
    PERI: 'P',
    APO: 'A',
    PERI_HOT: 'P\u{1F702}',
    APO_COLD: 'A\u{1F704}',
};
