import {
  getAllVenues,
  findMostBookedVenuesThisWeek,
} from "../services/VenueService.js";

// GET /api/venues
export const fetchAllVenues = async (req, res) => {
  try {
    const venues = await getAllVenues();
    res.json(venues);
  } catch (err) {
    console.error("Error fetching venues:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/venues/top-weekly
export const fetchTopWeeklyVenues = async (req, res) => {
  try {
    const venues = await findMostBookedVenuesThisWeek();
    res.json(venues);
  } catch (err) {
    console.error("Error fetching top weekly venues:", err);
    res.status(500).json({ message: "Server error" });
  }
};
