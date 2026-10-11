import { z } from 'zod';

export const CABINS = ['ECONOMY', 'BUSINESS'] as const;
export const SORTS = ['price', 'departure', 'duration'] as const;
export type Sort = (typeof SORTS)[number];

const iata = z.string().regex(/^[A-Z]{3}$/);

const schema = z
  .object({
    from: iata,
    to: iata,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    adults: z.coerce.number().int().min(1).max(9).catch(1),
    children: z.coerce.number().int().min(0).max(8).catch(0),
    infants: z.coerce.number().int().min(0).max(9).catch(0),
    cabin: z.enum(CABINS).catch('ECONOMY'),
    sort: z.enum(SORTS).catch('departure'),
    page: z.coerce.number().int().min(1).max(100).catch(1),
  })
  .refine((v) => v.from !== v.to)
  .refine((v) => v.adults + v.children <= 9)
  .transform((v) => ({ ...v, infants: Math.min(v.infants, v.adults) }));

export type FlightSearch = z.infer<typeof schema>;

/** Parses the results-page URL; null when the essential fields are missing or invalid. */
export function parseSearch(params: URLSearchParams): FlightSearch | null {
  const raw = Object.fromEntries(
    ['from', 'to', 'date', 'adults', 'children', 'infants', 'cabin', 'sort', 'page']
      .map((k) => [k, params.get(k) ?? undefined])
      .filter(([, v]) => v !== undefined),
  );
  if (typeof raw.from === 'string') raw.from = raw.from.toUpperCase();
  if (typeof raw.to === 'string') raw.to = raw.to.toUpperCase();
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function toSearchParams(s: Partial<FlightSearch>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null) continue;
    if ((k === 'children' || k === 'infants') && v === 0) continue;
    if (k === 'sort' && v === 'departure') continue;
    if (k === 'page' && v === 1) continue;
    p.set(k, String(v));
  }
  return p;
}
