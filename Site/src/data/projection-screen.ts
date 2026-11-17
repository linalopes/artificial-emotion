/**
 * Atelier Projection Screen — community funding (v1, static/manual).
 *
 * Update only `raised` when a Stripe or TWINT contribution arrives,
 * then rebuild/deploy. No Sheets/Stripe API in this version.
 */

export const projectionScreenFund = {
  goal: 460,
  /** Manually updated total received toward this campaign. */
  raised: 20,
  currency: 'CHF',
  stripeUrl: 'https://donate.stripe.com/7sY6oGbB581H5XL8Vfcwg00',
  productUrl:
    'https://www.galaxus.ch/en/s1/product/avtek-cinema-electric-300p-projection-screen-16-9-131-3327-cm-131-13098-169-projector-screens-30701272?offertype=retail&offerid=406802',
  productName: 'Avtek Cinema Electric 300P',
  /** Stripe payment QR (served from `public/`). */
  qrSrc: '/projection-screen.png',
} as const;

export type ProjectionScreenFund = typeof projectionScreenFund;

export type ProjectionScreenFundState = {
  goal: number;
  raised: number;
  remaining: number;
  currency: string;
  percent: number;
  percentLabel: string;
  complete: boolean;
  stripeUrl: string;
  productUrl: string;
  productName: string;
  qrSrc?: string;
};

/** Clamp visual progress to 0–100 and derive remaining / complete. */
export function getProjectionScreenFundState(
  fund: ProjectionScreenFund = projectionScreenFund,
): ProjectionScreenFundState {
  const goal = Math.max(0, fund.goal);
  const raised = Math.max(0, fund.raised);
  const remaining = Math.max(0, goal - raised);
  const complete = goal > 0 && raised >= goal;
  const rawPercent = goal === 0 ? 100 : (raised / goal) * 100;
  const percent = Math.min(100, Math.max(0, rawPercent));

  return {
    goal,
    raised,
    remaining,
    currency: fund.currency,
    percent,
    percentLabel: `${Math.round(percent)}%`,
    complete,
    stripeUrl: fund.stripeUrl,
    productUrl: fund.productUrl,
    productName: fund.productName,
    qrSrc: fund.qrSrc,
  };
}

/** Display amounts as `CHF 460` (Swiss grouping when needed). */
export function formatFundAmount(amount: number, currency: string = 'CHF'): string {
  const formatted = new Intl.NumberFormat('de-CH', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, amount));
  return `${currency} ${formatted}`;
}
