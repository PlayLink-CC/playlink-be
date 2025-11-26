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

/**
 * Check if time is in valid 15-minute intervals
 * Valid times: 00:00, 00:15, 00:30, 00:45, 01:00, etc.
 *
 * @param {string} timeString - Time in "HH:MM" format
 * @returns {boolean} - True if time is in 15-minute intervals
 */
export const isValid15MinInterval = (timeString) => {
  if (!timeString) return false;
  
  const [hours, minutes] = timeString.split(':').map(Number);
  
  // Check if minutes are 0, 15, 30, or 45
  return [0, 15, 30, 45].includes(minutes);
};

/**
 * Check if time is within booking window (7am - 10pm)
 *
 * @param {string} timeString - Time in "HH:MM" format
 * @returns {boolean} - True if time is within 7am-10pm
 */
export const isWithinBookingWindow = (timeString) => {
  if (!timeString) return false;
  
  const [hours, minutes] = timeString.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  
  // 7am = 7 * 60 = 420 minutes
  // 10pm = 22 * 60 = 1320 minutes
  const startWindow = 7 * 60; // 7am
  const endWindow = 22 * 60; // 10pm
  
  return totalMinutes >= startWindow && totalMinutes < endWindow;
};

/**
 * Check if booking end time exceeds the window
 * End time must be before or at 10pm
 *
 * @param {string} startTimeString - Start time in "HH:MM" format
 * @param {number} durationHours - Duration in hours
 * @returns {boolean} - True if booking fits within window
 */
export const doesBookingFitInWindow = (startTimeString, durationHours) => {
  if (!startTimeString || !durationHours) return false;
  
  const [hours, minutes] = startTimeString.split(':').map(Number);
  const startTotalMinutes = hours * 60 + minutes;
  const endTotalMinutes = startTotalMinutes + durationHours * 60;
  
  // 10pm = 22 * 60 = 1320 minutes
  const endWindow = 22 * 60; // 10pm
  
  return endTotalMinutes <= endWindow;
};

/**
 * Get time validation error message
 *
 * @param {string} timeString - Time in "HH:MM" format
 * @param {number} durationHours - Duration in hours
 * @returns {string|null} - Error message or null if valid
 */
export const getTimeValidationError = (timeString, durationHours) => {
  if (!timeString) {
    return "Please select a time";
  }
  
  if (!isValid15MinInterval(timeString)) {
    return "Times must be in 15-minute intervals (9:00, 9:15, 9:30, 9:45, etc.)";
  }
  
  if (!isWithinBookingWindow(timeString)) {
    return "Booking must start between 7:00 AM and 10:00 PM";
  }
  
  if (!doesBookingFitInWindow(timeString, durationHours)) {
    return "Booking must end by 10:00 PM";
  }
  
  return null;
};
