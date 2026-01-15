import pool from "../config/dbconnection.js";

/**
 * Create a new notification for a user
 * 
 * @param {number} userId 
 * @param {string} message 
 * @param {string} type 
 */
export const createNotification = async (userId, message, type = 'GENERAL') => {
    const sql = `
        INSERT INTO notifications (user_id, message, type)
        VALUES (?, ?, ?)
    `;
    const [result] = await pool.execute(sql, [userId, message, type]);
    return result.insertId;
};

/**
 * Fetch all notifications for a specific user
 * 
 * @param {number} userId 
 */
export const getUserNotifications = async (userId) => {
    const sql = `
        SELECT notification_id, message, type, is_read, created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
    `;
    const [rows] = await pool.execute(sql, [userId]);
    return rows;
};

/**
 * Mark a notification as read
 * 
 * @param {number} notificationId 
 */
export const markAsRead = async (notificationId) => {
    const sql = `UPDATE notifications SET is_read = 1 WHERE notification_id = ?`;
    await pool.execute(sql, [notificationId]);
};

/**
 * Mark all notifications for a user as read
 * 
 * @param {number} userId 
 */
export const markAllAsRead = async (userId) => {
    const sql = `UPDATE notifications SET is_read = 1 WHERE user_id = ?`;
    await pool.execute(sql, [userId]);
};
