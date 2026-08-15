// js/constants.js
// Astronomical unit, in kilometers.
export const AU_IN_KM = 149597870.7;

// Days in a Julian century. Used to convert daysSinceJ2000 into centuries
// for pole-precession rate calculations (pole_ra_rate / pole_dec_rate are
// expressed as deg/century).
export const JULIAN_CENTURY_DAYS = 36525.0;

// Earth/Moon system mass ratio (Earth mass / Moon mass). Used as the
// default Earth-Moon barycenter correction weight when a body's data
// doesn't supply its own barycenter_mass_ratio.
export const EARTH_MOON_MASS_RATIO = 82.30059;


// Fixed size of the gravity-well uniform arrays in GridShaders.getGridMaterial.
// Must match the array length main.js allocates and the loop bound baked
// into the fragment shader at material-creation time.
export const MAX_WELLS = 35;

// Fixed size of the multi-shadow uniform arrays in EclipseShaders.createEclipseShadowMat.
// Must match the cap EclipseShadowController applies when it ranks and
// truncates eclipse candidates before uploading them to the shader.
export const MAX_SHADOWS = 8;