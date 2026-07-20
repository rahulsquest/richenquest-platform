/**
 * Zoho Bookings client — read services/availability, create appointments.
 *
 * The website's booking flow is the embedded Bookings page (dormant module
 * website/src/assets/js/modules/zoho-bookings.js). This server client is for a
 * future CUSTOM booking UI or automations; not required for the embed.
 *
 * Scopes: zohobookings.data.CREATE / zohobookings.data.READ (verify current
 * scope strings against Zoho's reference — docs/14 §11).
 */

import { zohoRequest } from "../client.mjs";

/** List bookable services/workspaces. */
export async function listServices() {
  const json = await zohoRequest("bookings", "/json/services");
  return json.response?.returnvalue ?? json;
}

/** Available slots for a service on a date (YYYY-MM-DD). */
export async function getAvailability(serviceId, date, staffId) {
  return zohoRequest("bookings", "/json/availableslots", {
    query: { service_id: serviceId, selected_date: date, staff_id: staffId },
  });
}

/**
 * Create an appointment. `data` is Bookings' appointment payload
 * (service_id, staff_id, from_time, customer_details, …).
 */
export async function bookAppointment(data) {
  return zohoRequest("bookings", "/json/appointment", {
    method: "POST",
    form: { data: JSON.stringify(data) },
  });
}
