// js/logger.js
//
// Minimal leveled logger.
//
// Levels (ascending severity): debug < info < warn < error < silent
// Only messages at or above the current level are printed.
//
// Default level:
//   - Vite prod build (import.meta.env.PROD === true): 'warn'
//   - Everything else (dev server, tests, no bundler): 'debug'
//
// Runtime override (browser console):
//   window.setLogLevel('info')
//   window.getLogLevel()   -> current level string
//
// Usage:
//   import { logger } from '@core/logger.js';
//   logger.debug('verbose detail', payload);
//   logger.info('notable event');
//   logger.warn('recoverable problem', err);
//   logger.error('failure', err);

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

function detectDefaultLevel() {
    try {
        // Vite exposes import.meta.env.PROD / DEV at build time.
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            return import.meta.env.PROD ? 'warn' : 'debug';
        }
    } catch (_e) {
        // import.meta not available in this environment (e.g. some test runners) -- fall through.
    }
    return 'debug';
}

class Logger {
    constructor(level = detectDefaultLevel()) {
        this.setLevel(level);
    }

    setLevel(level) {
        if (!Object.prototype.hasOwnProperty.call(LEVELS, level)) {
            console.warn(`[logger] Unknown log level "${level}". Falling back to "debug".`);
            level = 'debug';
        }
        this.level = level;
        this._threshold = LEVELS[level];
    }

    getLevel() {
        return this.level;
    }

    _enabled(level) {
        return LEVELS[level] >= this._threshold;
    }

    debug(...args) {
        if (this._enabled('debug')) console.debug(...args);
    }

    info(...args) {
        if (this._enabled('info')) console.info(...args);
    }

    warn(...args) {
        if (this._enabled('warn')) console.warn(...args);
    }

    error(...args) {
        if (this._enabled('error')) console.error(...args);
    }
}

export const logger = new Logger();

// Runtime toggle, mirroring the existing window.switchDataSource / resetDataSource pattern in main.js.
if (typeof window !== 'undefined') {
    window.setLogLevel = (level) => logger.setLevel(level);
    window.getLogLevel = () => logger.getLevel();
}
