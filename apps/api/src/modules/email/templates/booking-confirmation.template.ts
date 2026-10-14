/** Inputs are plain data; everything user-provided is HTML-escaped. */
export interface BookingConfirmationModel {
  reference: string;
  travellerName: string;
  airline: string;
  flightNumber: string;
  origin: { iata: string; city: string };
  destination: { iata: string; city: string };
  departureLocal: string;
  arrivalLocal: string;
  cabin: string;
  passengers: { name: string; seat: string | null }[];
  total: string;
  ticketReady: boolean;
  bookingUrl: string;
}

export const BOOKING_CONFIRMATION_TEMPLATE_VERSION = 1;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const day = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const when = (iso: string) =>
  `${day.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))}, ${iso.slice(11, 16)}`;

export function renderBookingConfirmation(m: BookingConfirmationModel): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Booking confirmed · ${m.origin.iata} → ${m.destination.iata} · ${m.reference}`;
  const ticketLine = m.ticketReady
    ? 'Your e-ticket is ready to view and download.'
    : 'Your e-ticket is being prepared and will be ready in your booking shortly.';
  const rows = m.passengers
    .map(
      (p) =>
        `<tr><td style="padding:6px 0;border-top:1px solid #E5E1D8">${esc(p.name)}</td><td style="padding:6px 0;border-top:1px solid #E5E1D8;text-align:right;font-family:monospace">${esc(p.seat ?? 'Lap')}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html><html><body style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#0B1B33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0A1F44;padding:20px 24px;color:#ffffff">
  <div style="font-size:22px;font-weight:bold">Fly<span style="color:#F2884B">Go</span></div>
  <div style="font-size:12px;color:#C4D0E6;margin-top:4px">Booking reference <strong style="font-family:monospace;color:#ffffff;letter-spacing:2px">${esc(m.reference)}</strong></div>
</td></tr>
<tr><td style="padding:24px">
  <h1 style="font-size:20px;margin:0 0 8px">Your booking is confirmed</h1>
  <p style="margin:0 0 16px;color:#5B6474">Hi ${esc(m.travellerName)}, thanks for booking with FlyGo. ${ticketLine}</p>
  <table role="presentation" width="100%" style="border:1px solid #E5E1D8;border-radius:10px;padding:14px">
    <tr><td style="font-size:26px;font-weight:bold;font-family:monospace">${esc(m.origin.iata)}</td><td style="text-align:center;color:#E06A2B">✈</td><td style="font-size:26px;font-weight:bold;font-family:monospace;text-align:right">${esc(m.destination.iata)}</td></tr>
    <tr><td style="color:#5B6474;font-size:13px">${esc(m.origin.city)}<br>${esc(when(m.departureLocal))}</td><td></td><td style="color:#5B6474;font-size:13px;text-align:right">${esc(m.destination.city)}<br>${esc(when(m.arrivalLocal))}</td></tr>
    <tr><td colspan="3" style="padding-top:10px;font-size:13px">${esc(m.airline)} · <span style="font-family:monospace">${esc(m.flightNumber)}</span> · ${esc(m.cabin)}</td></tr>
  </table>
  <table role="presentation" width="100%" style="margin-top:16px;font-size:14px">${rows}
    <tr><td style="padding-top:12px;border-top:1px solid #E5E1D8;font-weight:bold">Total paid</td><td style="padding-top:12px;border-top:1px solid #E5E1D8;text-align:right;font-weight:bold">${esc(m.total)}</td></tr>
  </table>
  <p style="margin:24px 0 0"><a href="${esc(m.bookingUrl)}" style="background:#C2541B;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold;display:inline-block">View booking &amp; e-ticket</a></p>
  <p style="margin:12px 0 0;font-size:12px;color:#5B6474">You'll be asked to sign in — your ticket is only shown to you.</p>
</td></tr>
<tr><td style="padding:16px 24px;background:#F7F5F0;font-size:11px;color:#5B6474">Times are local to each airport. FlyGo is a demo: flights are sample data and this ticket is not valid for travel.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `FlyGo — booking ${m.reference} is confirmed`,
    '',
    `Hi ${m.travellerName}, thanks for booking with FlyGo. ${ticketLine}`,
    '',
    `${m.origin.city} (${m.origin.iata}) → ${m.destination.city} (${m.destination.iata})`,
    `Departs: ${when(m.departureLocal)} (local)`,
    `Arrives: ${when(m.arrivalLocal)} (local)`,
    `${m.airline} ${m.flightNumber} · ${m.cabin}`,
    '',
    ...m.passengers.map((p) => `- ${p.name}: seat ${p.seat ?? 'lap (infant)'}`),
    '',
    `Total paid: ${m.total}`,
    '',
    `View your booking and e-ticket: ${m.bookingUrl}`,
    '',
    'FlyGo is a demo: flights are sample data and this ticket is not valid for travel.',
  ].join('\n');

  return { subject, html, text };
}
