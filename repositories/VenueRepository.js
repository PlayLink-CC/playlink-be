import connectDB from "../config/dbconnection.js";

export const findAllVenues = async () => {
  const sql = `
    SELECT 
        v.venue_id,
        v.name AS venue_name,
        CONCAT_WS(', ', v.address, v.city) AS location,
        GROUP_CONCAT(DISTINCT s.name ORDER BY s.name) AS court_types,
        v.price_per_hour,
        vi.image_url AS primary_image,
        GROUP_CONCAT(DISTINCT a.name ORDER BY a.name) AS amenities
    FROM venues v
    LEFT JOIN venue_sports vs 
        ON vs.venue_id = v.venue_id
    LEFT JOIN sports s 
        ON s.sport_id = vs.sport_id
    LEFT JOIN venue_images vi 
        ON vi.venue_id = v.venue_id
        AND vi.is_primary = 1
    LEFT JOIN venue_amenities va 
        ON va.venue_id = v.venue_id
    LEFT JOIN amenities a 
        ON a.amenity_id = va.amenity_id
    GROUP BY 
        v.venue_id,
        v.name,
        location,
        v.price_per_hour,
        vi.image_url
  `;

  const [rows] = await connectDB.execute(sql);
  return rows;
};

export const findMostBookedVenuesThisWeek = async () => {
  const sql = `
    SELECT 
      v.venue_id,
      v.name,
      v.address,
      v.city,
      v.price_per_hour,
      vi.image_url AS primary_image,
      COUNT(b.booking_id) AS bookings_last_week
    FROM venues v
    LEFT JOIN bookings b
      ON b.venue_id = v.venue_id
      AND b.booking_start >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      AND b.booking_start < NOW()
      AND b.status <> 'CANCELLED'
    LEFT JOIN venue_images vi
      ON vi.venue_id = v.venue_id
      AND vi.is_primary = 1
    WHERE v.is_active = 1
    GROUP BY 
      v.venue_id,
      v.name,
      v.address,
      v.city,
      v.price_per_hour,
      vi.image_url
    ORDER BY bookings_last_week DESC
    LIMIT 4;
  `;

  const [rows] = await connectDB.execute(sql);
  return rows;
};
