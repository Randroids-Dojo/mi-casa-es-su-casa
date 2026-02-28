/**
 * Bump this integer whenever a deploy includes changes that make persisted
 * character state from older clients incompatible — e.g. schema changes,
 * new/removed rooms or activities, position semantics, simulation logic.
 *
 * Old browser tabs that still have the previous value baked into their JS
 * bundle will have their save requests rejected (409) by the server,
 * preventing stale state from overwriting current data.
 */
export const PERSISTENCE_VERSION = 2
