# Security Specification & Threat Model — Dealer Lead Router

## 1. Data Invariants

1. **Lead Immutability & Phone Uniqueness**: A lead's `phone` cannot be altered once created, and no two leads may share the same normalized 10-digit phone number.
2. **Dealer Integrity**: Only authorized dealers from the defined network exist in `/dealers`. Dealer prefix mappings cannot be maliciously altered by client operations.
3. **Atomic Uniqueness Reservation**: Every lead creation must atomically write to `/lead_uniqueness/{phone}` where the document ID matches the normalized phone number.
4. **Valid Enums**: Lead `status` must strictly be one of `['New', 'Contacted', 'Converted', 'Lost']`. Lead `source` must strictly be one of `['Website', 'AI Voice Call', 'WhatsApp', 'Dealer Walk-in', 'Other']`.
5. **Pincode & Phone Format**: Phone numbers must be strictly 10 numeric digits. Pincodes must be strictly 6 numeric digits.
6. **No Privilege Escalation**: Unauthorized or unauthenticated clients cannot perform bulk data manipulation or modify admin documents.

## 2. The Dirty Dozen Attack Payloads

1. **Payload 1 (Ghost Field Injection)**: Creating a lead with an extra unrecognized property `{ isSuperAdmin: true }` — Rejected by strict key validation.
2. **Payload 2 (Phone Number Hijacking)**: Attempting to update a lead's `phone` to a different number — Rejected by immutable field rule.
3. **Payload 3 (Arbitrary Status Injection)**: Updating `status` to an unsupported value like `"Archived"` or `"Deleted"` — Rejected by enum check.
4. **Payload 4 (Pincode Poisoning)**: Submitting a 200-character alphanumeric string as pincode — Rejected by 6-digit regex / size constraint.
5. **Payload 5 (Concurrent Duplicate Race)**: Submitting the same phone number simultaneously — Blocked by atomic document creation on `/lead_uniqueness/{phone}`.
6. **Payload 6 (Oversized Payload / Denial of Wallet)**: Submitting a customer name of 500,000 characters — Rejected by string length limit (max 100 characters).
7. **Payload 7 (Uniqueness ID Mismatch)**: Attempting to write a `/lead_uniqueness/{phone}` document where document ID does not match the payload's `phone` property — Rejected.
8. **Payload 8 (Terminal State Tampering)**: Attempting to arbitrarily reopen or manipulate converted leads without proper authorization.
9. **Payload 9 (Dealer Coverage Manipulation)**: Attempting to overwrite dealer pincode prefixes with non-standard strings.
10. **Payload 10 (Invalid Source Injection)**: Creating a lead with source `"HackerChannel"` — Rejected by allowed source enum.
11. **Payload 11 (Empty Customer Name)**: Creating a lead with whitespace-only or empty name — Rejected by min-length constraint.
12. **Payload 12 (Blanket Collection Scraping)**: Attempting to read unauthorized private records without an established read session.
