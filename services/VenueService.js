import * as venueRepository from "../repositories/VenueRepository.js";

export const getAllVenues = async () => {
  const venues = await venueRepository.findAllVenues();

  return venues.map((v) => ({
    id: v.venue_id,
    name: v.venue_name,
    location: v.location, // already "address, city"
    courtTypes: v.court_types
      ? v.court_types.split(",").map((c) => c.trim())
      : [],
    pricePerHour: v.price_per_hour,
    image: v.primary_image,
    amenities: v.amenities ? v.amenities.split(",").map((a) => a.trim()) : [],
  }));
};

export const findMostBookedVenuesThisWeek = async () => {
  const venues = await venueRepository.findMostBookedVenuesThisWeek();

  return venues.map((v) => ({
    id: v.venue_id,
    name: v.name,
    address: v.address,
    city: v.city,
    pricePerHour: v.price_per_hour,
    image: v.primary_image,
    bookingsLastWeek: v.bookings_last_week,
  }));
};
