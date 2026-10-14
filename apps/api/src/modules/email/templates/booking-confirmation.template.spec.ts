import { renderBookingConfirmation } from './booking-confirmation.template';

const model = {
  reference: 'NQKD8U',
  travellerName: 'Asha <script>alert(1)</script>',
  airline: 'Saffron Airlines',
  flightNumber: 'XS121',
  origin: { iata: 'DEL', city: 'New Delhi' },
  destination: { iata: 'GOX', city: 'Goa' },
  departureLocal: '2026-10-15T06:10:00+05:30',
  arrivalLocal: '2026-10-15T08:40:00+05:30',
  cabin: 'Economy',
  passengers: [
    { name: "Asha O'Neil", seat: '3A' },
    { name: 'Mira', seat: null },
  ],
  total: '₹25,148.28',
  ticketReady: false,
  bookingUrl: 'http://localhost:5173/bookings/NQKD8U',
};

describe('booking confirmation email', () => {
  it('includes the essentials in both HTML and text', () => {
    const { subject, html, text } = renderBookingConfirmation(model);
    expect(subject).toBe('Booking confirmed · DEL → GOX · NQKD8U');
    for (const part of [
      'NQKD8U',
      'XS121',
      '06:10',
      '₹25,148.28',
      'http://localhost:5173/bookings/NQKD8U',
    ]) {
      expect(html).toContain(part);
      expect(text).toContain(part);
    }
    expect(text).toContain('seat lap (infant)');
  });

  it('escapes user-provided values in HTML', () => {
    const { html } = renderBookingConfirmation(model);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('O&#39;Neil');
  });
});
