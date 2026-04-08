/**
 * Date/Time Formatting Utilities
 * 
 * Provides consistent date/time formatting across the application
 * using the user's timezone and format preferences.
 */

// Default preferences (used before user prefs are loaded)
const DEFAULT_PREFS = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  time_format: '24h',
  date_format: 'YYYY-MM-DD',
};

// Cache for user preferences
let cachedPrefs = null;

/**
 * Get user preferences from localStorage or use defaults
 */
export const getUserPreferences = () => {
  if (cachedPrefs) return cachedPrefs;
  
  try {
    const stored = localStorage.getItem('userPreferences');
    if (stored) {
      cachedPrefs = { ...DEFAULT_PREFS, ...JSON.parse(stored) };
      return cachedPrefs;
    }
  } catch (e) {
    console.warn('Failed to load user preferences:', e);
  }
  
  return DEFAULT_PREFS;
};

/**
 * Update cached preferences (call this when preferences change)
 */
export const updateCachedPreferences = (prefs) => {
  cachedPrefs = { ...DEFAULT_PREFS, ...prefs };
  try {
    localStorage.setItem('userPreferences', JSON.stringify(cachedPrefs));
  } catch (e) {
    console.warn('Failed to save user preferences:', e);
  }
};

/**
 * Clear cached preferences (call on logout)
 */
export const clearCachedPreferences = () => {
  cachedPrefs = null;
  try {
    localStorage.removeItem('userPreferences');
  } catch (e) {
    // Ignore
  }
};

/**
 * Get the user's timezone
 */
export const getUserTimezone = () => {
  const prefs = getUserPreferences();
  return prefs.timezone || DEFAULT_PREFS.timezone;
};

/**
 * Format a date string or Date object according to user preferences
 * @param {string|Date} dateInput - The date to format
 * @param {Object} options - Additional formatting options
 * @param {boolean} options.includeTime - Include time in output (default: false)
 * @param {boolean} options.relative - Use relative time if recent (default: false)
 * @param {string} options.format - Override format ('short', 'medium', 'long', 'full')
 * @returns {string} Formatted date string
 */
export const formatDate = (dateInput, options = {}) => {
  if (!dateInput) return '-';
  
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '-';
    
    const prefs = getUserPreferences();
    const timezone = prefs.timezone || DEFAULT_PREFS.timezone;
    const dateFormat = prefs.date_format || DEFAULT_PREFS.date_format;
    const timeFormat = prefs.time_format || DEFAULT_PREFS.time_format;
    
    // Handle relative time
    if (options.relative) {
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
    }
    
    // Build Intl options based on format preference
    const intlOptions = {
      timeZone: timezone,
    };
    
    // Date formatting based on user preference
    switch (dateFormat) {
      case 'DD/MM/YYYY':
        intlOptions.day = '2-digit';
        intlOptions.month = '2-digit';
        intlOptions.year = 'numeric';
        break;
      case 'MM/DD/YYYY':
        intlOptions.day = '2-digit';
        intlOptions.month = '2-digit';
        intlOptions.year = 'numeric';
        break;
      case 'DD-MM-YYYY':
        intlOptions.day = '2-digit';
        intlOptions.month = '2-digit';
        intlOptions.year = 'numeric';
        break;
      case 'DD MMM YYYY':
        intlOptions.day = '2-digit';
        intlOptions.month = 'short';
        intlOptions.year = 'numeric';
        break;
      case 'YYYY-MM-DD':
      default:
        intlOptions.year = 'numeric';
        intlOptions.month = '2-digit';
        intlOptions.day = '2-digit';
        break;
    }
    
    // Override with format option
    if (options.format === 'short') {
      intlOptions.month = 'short';
      intlOptions.day = 'numeric';
      delete intlOptions.year;
    } else if (options.format === 'long') {
      intlOptions.weekday = 'long';
      intlOptions.month = 'long';
      intlOptions.day = 'numeric';
      intlOptions.year = 'numeric';
    }
    
    // Add time if requested
    if (options.includeTime) {
      intlOptions.hour = '2-digit';
      intlOptions.minute = '2-digit';
      intlOptions.hour12 = timeFormat === '12h';
    }
    
    let formatted = date.toLocaleString(undefined, intlOptions);
    
    // Manual formatting for specific date formats (browser doesn't support all)
    if (dateFormat === 'DD/MM/YYYY' || dateFormat === 'MM/DD/YYYY' || dateFormat === 'DD-MM-YYYY' || dateFormat === 'YYYY-MM-DD') {
      const parts = {
        year: date.toLocaleString(undefined, { timeZone: timezone, year: 'numeric' }),
        month: date.toLocaleString(undefined, { timeZone: timezone, month: '2-digit' }),
        day: date.toLocaleString(undefined, { timeZone: timezone, day: '2-digit' }),
      };
      
      switch (dateFormat) {
        case 'DD/MM/YYYY':
          formatted = `${parts.day}/${parts.month}/${parts.year}`;
          break;
        case 'MM/DD/YYYY':
          formatted = `${parts.month}/${parts.day}/${parts.year}`;
          break;
        case 'DD-MM-YYYY':
          formatted = `${parts.day}-${parts.month}-${parts.year}`;
          break;
        case 'YYYY-MM-DD':
          formatted = `${parts.year}-${parts.month}-${parts.day}`;
          break;
      }
      
      if (options.includeTime) {
        const timeOpts = {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: timeFormat === '12h',
        };
        formatted += ' ' + date.toLocaleString(undefined, timeOpts);
      }
    }
    
    return formatted;
  } catch (e) {
    console.warn('Date formatting error:', e);
    return String(dateInput);
  }
};

/**
 * Format time only
 */
export const formatTime = (dateInput) => {
  if (!dateInput) return '-';
  
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '-';
    
    const prefs = getUserPreferences();
    const timezone = prefs.timezone || DEFAULT_PREFS.timezone;
    const timeFormat = prefs.time_format || DEFAULT_PREFS.time_format;
    
    return date.toLocaleTimeString(undefined, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    });
  } catch (e) {
    console.warn('Time formatting error:', e);
    return String(dateInput);
  }
};

/**
 * Format date and time together
 */
export const formatDateTime = (dateInput, options = {}) => {
  return formatDate(dateInput, { ...options, includeTime: true });
};

/**
 * Format date for display in a compact way (e.g., for lists)
 */
export const formatDateCompact = (dateInput) => {
  return formatDate(dateInput, { format: 'short' });
};

/**
 * Format date with relative time for recent dates
 */
export const formatDateRelative = (dateInput) => {
  return formatDate(dateInput, { relative: true });
};

/**
 * Convert a date to the user's timezone for display
 */
export const toUserTimezone = (dateInput) => {
  if (!dateInput) return null;
  
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return null;
    
    const prefs = getUserPreferences();
    const timezone = prefs.timezone || DEFAULT_PREFS.timezone;
    
    // Return a new Date object adjusted for display purposes
    // Note: JavaScript Date objects are always in local time internally
    return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  } catch (e) {
    return null;
  }
};

/**
 * Get current date/time in user's timezone formatted
 */
export const getCurrentDateTime = () => {
  return formatDateTime(new Date());
};

/**
 * Get current date in user's timezone formatted
 */
export const getCurrentDate = () => {
  return formatDate(new Date());
};

// Export as default object for convenience
export default {
  formatDate,
  formatTime,
  formatDateTime,
  formatDateCompact,
  formatDateRelative,
  getUserTimezone,
  getUserPreferences,
  updateCachedPreferences,
  clearCachedPreferences,
  toUserTimezone,
  getCurrentDateTime,
  getCurrentDate,
};
