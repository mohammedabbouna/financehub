/**
 * Window event used to open the global quick-entry palette (⌘K).
 * Kept in its own module so Sidebar and CommandPalette can both
 * reference it without importing each other.
 */
export const OPEN_COMMAND_EVENT = 'fh:open-command';
