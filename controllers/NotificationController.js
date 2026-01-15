import * as NotificationRepository from "../repositories/NotificationRepository.js";

/**
 * Fetch notifications for the logged-in user
 */
export const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = await NotificationRepository.getUserNotifications(userId);
        res.json(notifications);
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Mark a single notification as read
 */
export const markRead = async (req, res) => {
    try {
        const { id } = req.params;
        await NotificationRepository.markAsRead(id);
        res.json({ success: true });
    } catch (err) {
        console.error("Error marking notification as read:", err);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Mark all user notifications as read
 */
export const markAllRead = async (req, res) => {
    try {
        const userId = req.user.id;
        await NotificationRepository.markAllAsRead(userId);
        res.json({ success: true });
    } catch (err) {
        console.error("Error marking all notifications as read:", err);
        res.status(500).json({ message: "Server error" });
    }
};
