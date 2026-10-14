import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { TicketSnapshotDoc } from '../../../database/mongo/collections';

/** Bump when the layout changes; stored on each snapshot for traceability. */
export const TICKET_TEMPLATE_VERSION = 2;

const NAVY = '#0A1F44';
const SAFFRON = '#E06A2B';
const INK = '#0B1B33';
const MUTED = '#5B6474';
const LINE = '#E5E1D8';
const TEAL = '#0F766E';

const PAGE = { width: 595.28, height: 841.89, margin: 40 };

const money = (minor: string, currency: string) => {
  const amount = Number(BigInt(minor)) / 100;
  return `${currency} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
/** Airport-local wall clock straight from the stored ISO string (no timezone conversion). */
const localTime = (iso: string) => iso.slice(11, 16);
const localDay = (iso: string) => dayFormat.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
const duration = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

/** Contents of the QR code: identifiers only, never personal data. */
export const ticketQrPayload = (s: TicketSnapshotDoc) =>
  `FLYGO|${s.reference}|${s.ticketNumber}|${s.flight.flightNumber}|${s.flight.departureLocal.slice(0, 10)}`;

/**
 * Renders the e-ticket PDF from a stored snapshot. Deterministic: fixed metadata dates and
 * no random values, so the same snapshot always yields byte-identical output (safe retries,
 * verifiable checksum). Uses the PDF standard fonts — names outside Latin-1 would need an
 * embedded Unicode font (documented limitation).
 */
export async function renderTicketPdf(s: TicketSnapshotDoc): Promise<Buffer> {
  const qr = await QRCode.toBuffer(ticketQrPayload(s), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    compress: true,
    info: {
      Title: `FlyGo e-ticket ${s.reference}`,
      Author: 'FlyGo',
      Subject: `${s.flight.origin.iata}-${s.flight.destination.iata} ${s.flight.flightNumber}`,
      CreationDate: s.issuedAt,
      ModDate: s.issuedAt,
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const { margin: M, width: W } = PAGE;
  const inner = W - 2 * M;

  // ── Header band ────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 96).fill(NAVY);
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor('#FFFFFF')
    .text('Fly', M, 32, { continued: true })
    .fillColor(SAFFRON)
    .text('Go');
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#C4D0E6')
    .text('ELECTRONIC TICKET · ITINERARY RECEIPT', M, 64, { characterSpacing: 1.2 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#C4D0E6')
    .text('Booking reference', W - M - 200, 30, { width: 200, align: 'right' });
  doc
    .font('Courier-Bold')
    .fontSize(22)
    .fillColor('#FFFFFF')
    .text(s.reference, W - M - 200, 44, { width: 200, align: 'right', characterSpacing: 3 });

  // ── Flight ─────────────────────────────────────────────────────────────────
  let y = 120;
  const f = s.flight;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(SAFFRON)
    .text(`${s.cabin} CLASS`, M, y, { characterSpacing: 1 });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(`${f.airline.name} · ${f.flightNumber} · ${f.aircraft}`, M, y, {
      width: inner,
      align: 'right',
    });
  y += 26;
  const col = inner / 3;
  doc.font('Courier-Bold').fontSize(36).fillColor(INK).text(f.origin.iata, M, y);
  doc
    .font('Courier-Bold')
    .fontSize(36)
    .fillColor(INK)
    .text(f.destination.iata, M + 2 * col, y, { width: col, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(MUTED)
    .text(duration(f.durationMinutes), M + col, y + 8, { width: col, align: 'center' });
  doc
    .moveTo(M + col + 20, y + 26)
    .lineTo(M + 2 * col - 20, y + 26)
    .dash(2, { space: 3 })
    .strokeColor(SAFFRON)
    .stroke()
    .undash();
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(TEAL)
    .text('Non-stop', M + col, y + 32, { width: col, align: 'center' });
  y += 44;
  const originLabel = `${f.origin.city} · ${f.origin.name}`;
  const destinationLabel = `${f.destination.city} · ${f.destination.name}`;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED);
  doc.text(originLabel, M, y, { width: col + 40 });
  doc.text(destinationLabel, M + 2 * col - 40, y, { width: col + 40, align: 'right' });
  // Long airport names wrap: move the times below whichever name is taller.
  y +=
    Math.max(
      doc.heightOfString(originLabel, { width: col + 40 }),
      doc.heightOfString(destinationLabel, { width: col + 40 }),
    ) + 12;
  doc.font('Courier-Bold').fontSize(16).fillColor(INK).text(localTime(f.departureLocal), M, y);
  doc.text(localTime(f.arrivalLocal), M + 2 * col, y, { width: col, align: 'right' });
  y += 20;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(localDay(f.departureLocal), M, y);
  doc.text(localDay(f.arrivalLocal), M + 2 * col, y, { width: col, align: 'right' });
  y += 16;
  doc.fontSize(8).fillColor(MUTED).text('All times are local to each airport.', M, y);

  // ── Perforation ─────────────────────────────────────────────────────────────
  y += 22;
  doc
    .moveTo(M, y)
    .lineTo(W - M, y)
    .dash(4, { space: 4 })
    .strokeColor(LINE)
    .stroke()
    .undash();

  // ── Passengers ──────────────────────────────────────────────────────────────
  y += 18;
  const qrSize = 120;
  const tableW = inner - qrSize - 24;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
  doc.text('PASSENGER', M, y, { characterSpacing: 0.8 });
  doc.text('TYPE', M + tableW * 0.55, y, { characterSpacing: 0.8 });
  doc.text('SEAT', M + tableW * 0.78, y, {
    width: tableW * 0.22,
    align: 'right',
    characterSpacing: 0.8,
  });
  y += 14;
  for (const p of s.passengers) {
    doc
      .moveTo(M, y)
      .lineTo(M + tableW, y)
      .strokeColor(LINE)
      .lineWidth(0.5)
      .stroke();
    y += 7;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(INK)
      .text(`${p.lastName.toUpperCase()} / ${p.firstName}`, M, y, { width: tableW * 0.55 - 8 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(p.type.toLowerCase(), M + tableW * 0.55, y);
    doc
      .font('Courier-Bold')
      .fontSize(12)
      .fillColor(INK)
      .text(p.seatLabel ?? 'Lap', M + tableW * 0.78, y, { width: tableW * 0.22, align: 'right' });
    y += 20;
  }
  doc.image(qr, W - M - qrSize, y - 20 * s.passengers.length - 30, {
    width: qrSize,
    height: qrSize,
  });

  y = Math.max(y, 470) + 10;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Ticket number', M, y);
  doc
    .font('Courier-Bold')
    .fontSize(13)
    .fillColor(INK)
    .text(s.ticketNumber, M, y + 12);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('Issued', M + 200, y);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(INK)
    .text(s.issuedAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC', M + 200, y + 12);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text('Payment', W - M - 160, y, { width: 160, align: 'right' });
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(TEAL)
    .text(`PAID · ${money(s.payment.amountMinor, s.payment.currency)}`, W - M - 200, y + 12, {
      width: 200,
      align: 'right',
    });

  // ── Fare summary ────────────────────────────────────────────────────────────
  const names = new Map(s.passengers.map((p) => [p.ordinal, `${p.firstName} ${p.lastName}`]));
  // Large bookings: one subtotal per passenger instead of every line, so it stays readable.
  const rows =
    s.price.lines.length <= 14
      ? s.price.lines.map((l) => ({
          label: `${l.description.split(' · ')[0]}${l.passengerOrdinal ? ` (${names.get(l.passengerOrdinal) ?? `Passenger ${l.passengerOrdinal}`})` : ''}`,
          amountMinor: l.amountMinor,
        }))
      : [...new Set(s.price.lines.map((l) => l.passengerOrdinal))].map((ordinal) => ({
          label: `Fare, taxes & fees (${ordinal ? (names.get(ordinal) ?? `Passenger ${ordinal}`) : 'booking'})`,
          amountMinor: s.price.lines
            .filter((l) => l.passengerOrdinal === ordinal)
            .reduce((sum, l) => sum + BigInt(l.amountMinor), 0n)
            .toString(),
        }));
  const fy = PAGE.height - 120;
  y += 48;
  if (y + 60 + rows.length * 13 > fy - 10) {
    doc.addPage({ size: 'A4', margin: 0 });
    y = M;
  }
  doc
    .moveTo(M, y)
    .lineTo(W - M, y)
    .strokeColor(LINE)
    .stroke();
  y += 14;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Fare summary', M, y);
  y += 18;
  for (const row of rows) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(row.label, M, y, { width: inner - 140 });
    doc.fillColor(INK).text(money(row.amountMinor, s.price.currency), W - M - 140, y, {
      width: 140,
      align: 'right',
    });
    y += 13;
  }
  y += 4;
  doc
    .moveTo(M, y)
    .lineTo(W - M, y)
    .strokeColor(LINE)
    .stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text('Total', M, y);
  doc.text(money(s.price.totalMinor, s.price.currency), W - M - 200, y, {
    width: 200,
    align: 'right',
  });

  // ── Notes & footer (on the last page) ───────────────────────────────────────
  doc.rect(M, fy, inner, 64).fill('#F7F5F0');
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(INK)
    .text('Before you fly', M + 12, fy + 10);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      'Check-in closes 60 minutes before domestic and 90 minutes before international departures. Carry a valid photo ID ' +
        'matching the passenger name. Present this e-ticket or its QR code at check-in.',
      M + 12,
      fy + 24,
      { width: inner - 24 },
    );
  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(SAFFRON)
    .text(
      'DEMONSTRATION TICKET — FlyGo uses sample flight data. Not valid for travel.',
      M,
      PAGE.height - 40,
      { width: inner, align: 'center' },
    );
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(
      `Ticket v${s.version} · template v${s.templateVersion}${s.contactEmail ? ` · sent to ${s.contactEmail}` : ''}`,
      M,
      PAGE.height - 26,
      { width: inner, align: 'center' },
    );

  doc.end();
  return done;
}
