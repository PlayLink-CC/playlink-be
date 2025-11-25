/**
 * Date Utilities
 *
 * Helper functions for date formatting and conversion.
 *
 * @module utils/dateUtil
 */

/**
 * Convert JavaScript Date object to MySQL DATETIME format
 * Format: "YYYY-MM-DD HH:MM:SS"
 *
 * @param {Date} dateObj - The date object to convert
 * @returns {string} - Formatted date string for MySQL
 */
export const toMySQLDateTime = (dateObj) => {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  const mm = pad(dateObj.getMonth() + 1);
  const dd = pad(dateObj.getDate());
  const hh = pad(dateObj.getHours());
  const mi = pad(dateObj.getMinutes());
  const ss = pad(dateObj.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};
