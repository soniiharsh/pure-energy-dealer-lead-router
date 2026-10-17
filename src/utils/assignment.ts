import { Dealer } from '../types';

export const INHOUSE_DEALER_ID = 'INHOUSE';
export const INHOUSE_DEALER_NAME = 'In-house Sales';

export interface DealerRoutingResult {
  dealerId: string;
  dealerName: string;
  matchedPrefix: string | null;
  isFallback: boolean;
  dealer?: Dealer;
}

/**
 * Assigns a lead to an authorized dealer based on the 3-digit pincode prefix.
 * If multiple dealers share a prefix (overlap), resolves deterministically by lowest dealerId.
 * If no dealer matches the prefix, routes to "In-house Sales".
 */
export function routeLeadToDealer(
  pincode: string,
  dealers: Dealer[]
): DealerRoutingResult {
  const cleanPincode = (pincode || '').trim();

  if (cleanPincode.length < 3) {
    return {
      dealerId: INHOUSE_DEALER_ID,
      dealerName: INHOUSE_DEALER_NAME,
      matchedPrefix: null,
      isFallback: true,
    };
  }

  const prefix = cleanPincode.slice(0, 3);

  // Sort dealers deterministically by dealerId ascending
  const sortedDealers = [...dealers].sort((a, b) =>
    a.dealerId.localeCompare(b.dealerId)
  );

  for (const dealer of sortedDealers) {
    const rawPrefixes = dealer.pincodePrefixes || '';
    const prefixes = rawPrefixes
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    if (prefixes.includes(prefix)) {
      return {
        dealerId: dealer.dealerId,
        dealerName: dealer.name,
        matchedPrefix: prefix,
        isFallback: false,
        dealer,
      };
    }
  }

  // Fallback to In-house Sales
  return {
    dealerId: INHOUSE_DEALER_ID,
    dealerName: INHOUSE_DEALER_NAME,
    matchedPrefix: prefix,
    isFallback: true,
  };
}

/**
 * Helper to split pipe-separated prefixes into a clean string array.
 */
export function parsePrefixes(pincodePrefixes?: string): string[] {
  if (!pincodePrefixes) return [];
  return pincodePrefixes
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
}
