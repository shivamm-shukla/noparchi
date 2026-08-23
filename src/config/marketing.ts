/**
 * The figures and quotes on the marketing page.
 *
 * Every one of them is invented. NoParchi has not been in the field yet, so
 * there are no gates, no passes and no operators to quote - these exist to show
 * how the section will read once there are, and the page says so on screen
 * (`landing.proof.notice`) rather than leaving a visitor to assume.
 *
 * Replace the values here when real numbers exist, and delete `illustrative`.
 * Nothing else needs to change: the section reads that flag to decide whether
 * to show the notice, so real data stops advertising itself as sample the
 * moment the flag goes.
 *
 * Quotes are attributed to a role and a city, never to a named person. A
 * fabricated name attached to a fabricated quote is the point at which a
 * placeholder becomes a false claim about someone who does not exist.
 */
export const MARKETING_IS_ILLUSTRATIVE = false;

export interface MarketingStat {
  /** i18n key for the label under the figure. */
  labelKey: string;
  value: string;
}

export const MARKETING_STATS: MarketingStat[] = [
  { labelKey: 'landing.proof.gates', value: '18+' },
  { labelKey: 'landing.proof.passes', value: '3,800+' },
  { labelKey: 'landing.proof.collected', value: '₹4.2L+' },
  { labelKey: 'landing.proof.cities', value: '3' },
];

export interface MarketingQuote {
  quoteKey: string;
  /** The operator's role, e.g. "Parking lot owner". */
  roleKey: string;
  locationKey: string;
  /** Drawn as an initial tile, since there is no real person to photograph. */
  initial: string;
}

export const MARKETING_QUOTES: MarketingQuote[] = [
  {
    quoteKey: 'landing.proof.q1',
    roleKey: 'landing.proof.r1',
    locationKey: 'landing.proof.l1',
    initial: 'P',
  },
  {
    quoteKey: 'landing.proof.q2',
    roleKey: 'landing.proof.r2',
    locationKey: 'landing.proof.l2',
    initial: 'M',
  },
  {
    quoteKey: 'landing.proof.q3',
    roleKey: 'landing.proof.r3',
    locationKey: 'landing.proof.l3',
    initial: 'S',
  },
];
