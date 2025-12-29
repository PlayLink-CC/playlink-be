import * as VenueRepository from "../repositories/VenueRepository.js";

/**
 * Get all cancellation policies
 * 
 * @param {Object} req 
 * @param {Object} res 
 */
export const fetchAllPolicies = async (req, res) => {
    try {
        const policies = await VenueRepository.getAllPolicies();
        return res.json(policies);
    } catch (err) {
        console.error("Error fetching policies:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
