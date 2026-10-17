export const PURE_PRODUCTS = [
  'PuREPower Home 5kWh',
  'PuREPower Home 3kWh',
  'PuREPower Commercial 10kWh',
  'PuREPower Commercial 15kWh',
  'PuREPower Commercial 20kWh',
  'PuREPower Commercial 25kWh',
  'PuREPower Industrial 50kWh+',
] as const;

export const LEAD_SOURCES = [
  'Website',
  'Voice Agent',
  'AI Voice Call',
  'WhatsApp',
  'Dealer Walk-in',
  'Other',
] as const;

export const LEAD_STATUSES = [
  'New',
  'Contacted',
  'Converted',
  'Lost',
] as const;

/**
 * Normalizes Indian mobile number to 10 digits starting with 6, 7, 8, or 9.
 * Strips whitespace, dashes, parenthetical notation, and +91/91/0 prefixes.
 */
export function normalizeIndianPhone(rawPhone: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  if (!rawPhone || !rawPhone.trim()) {
    return { isValid: false, normalized: '', error: 'Mobile number is required' };
  }

  let cleaned = rawPhone.trim().replace(/[\s\-()+]/g, '');

  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return { isValid: true, normalized: cleaned };
  }

  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      normalized: cleaned,
      error: 'Mobile number must contain digits only',
    };
  }

  return {
    isValid: false,
    normalized: cleaned,
    error: `Must be exactly 10 digits starting with 6-9 (got ${cleaned.length} digits)`,
  };
}

/**
 * Validates 6-digit Indian pincode.
 */
export function validateIndianPincode(rawPincode: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  if (!rawPincode || !rawPincode.trim()) {
    return { isValid: false, normalized: '', error: 'Pincode is required' };
  }

  const cleaned = rawPincode.trim();

  if (/^[1-9]\d{5}$/.test(cleaned)) {
    return { isValid: true, normalized: cleaned };
  }

  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      normalized: cleaned,
      error: 'Pincode must contain numbers only',
    };
  }

  return {
    isValid: false,
    normalized: cleaned,
    error: `Pincode must be exactly 6 digits (got ${cleaned.length})`,
  };
}
