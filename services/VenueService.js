import * as venueRepository from "../repositories/VenueRepository.js";

export const getAllVenues = async () => {
  const venues = await venueRepository.findAllVenues();
  return venues;
};

export const findMostBookedVenuesThisWeek = async () => {
  const venues = await venueRepository.findMostBookedVenuesThisWeek();
  return venues;
};
