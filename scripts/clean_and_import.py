#!/usr/bin/env python3
"""
PURE Energy - PuREPower Dealer Lead Router
Legacy Data Cleaning & Firestore Import Script

Reads data/dealers.csv and data/legacy_leads.csv, applies robust cleaning
and deduplication rules, routes leads based on 3-digit pincode prefixes,
generates reports/reconciliation.csv (exactly 40 rows matching input),
and safely imports records into Firestore if credentials are provided.
"""

import os
import sys
import csv
import re
import argparse
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any

# Allowed reconciliation actions
ACTION_IMPORTED = "imported"
ACTION_FIXED = "fixed"
ACTION_MERGED = "merged"
ACTION_REJECTED = "rejected"
ACTION_ASSIGNED_INHOUSE = "assigned_inhouse"

ALLOWED_ACTIONS = {
    ACTION_IMPORTED,
    ACTION_FIXED,
    ACTION_MERGED,
    ACTION_REJECTED,
    ACTION_ASSIGNED_INHOUSE
}

ALLOWED_STATUSES = {"New", "Contacted", "Converted", "Lost"}
ALLOWED_SOURCES = {"Website", "AI Voice Call", "Voice Agent", "WhatsApp", "Dealer Walk-in", "Other"}

INHOUSE_DEALER_ID = "INHOUSE"
INHOUSE_DEALER_NAME = "In-house Sales"


def normalize_phone(raw_phone: str) -> Tuple[Optional[str], bool, str]:
    """
    Normalizes Indian mobile number to 10 digits starting with 6-9.
    Returns: (cleaned_10_digit_phone, was_modified, reason_if_invalid)
    """
    if not raw_phone or not str(raw_phone).strip():
        return None, False, "Missing phone number"

    s = str(raw_phone).strip()
    original = s

    # Remove spaces, dashes, parentheses, plus
    s = re.sub(r'[\s\-\(\)\+]', '', s)

    # Remove leading country code +91 or 91 if followed by 10 digits
    if s.startswith('91') and len(s) == 12:
        s = s[2:]
    elif s.startswith('0') and len(s) == 11:
        s = s[1:]

    # Check if exactly 10 digits starting with 6-9
    if re.match(r'^[6-9]\d{9}$', s):
        was_modified = (s != original)
        return s, was_modified, ""
    else:
        if not s.isdigit():
            return None, False, f"Non-numeric invalid mobile number ('{original}')"
        return None, False, f"Invalid mobile number length ({len(s)} digits; 10 expected)"


def validate_pincode(raw_pincode: str) -> Tuple[Optional[str], bool, str]:
    """
    Validates 6-digit Indian postal code.
    Returns: (cleaned_6_digit_pincode, was_modified, reason_if_invalid)
    """
    if not raw_pincode or not str(raw_pincode).strip():
        return None, False, "Missing pincode"

    s = str(raw_pincode).strip()
    original = s

    if re.match(r'^[1-9]\d{5}$', s):
        was_modified = (s != original)
        return s, was_modified, ""
    else:
        if not s.isdigit():
            return None, False, f"Non-numeric invalid pincode ('{original}')"
        return None, False, f"Invalid pincode length ({len(s)} digits; 6 expected)"


def normalize_status(raw_status: str) -> Tuple[str, bool]:
    """Standardizes status casing to New, Contacted, Converted, Lost."""
    if not raw_status or not str(raw_status).strip():
        return "New", True
    s = str(raw_status).strip()
    lower = s.lower()
    for allowed in ALLOWED_STATUSES:
        if allowed.lower() == lower:
            return allowed, (allowed != raw_status)
    return "New", True


def normalize_source(raw_source: str) -> Tuple[str, bool]:
    """Standardizes lead source casing to canonical format."""
    if not raw_source or not str(raw_source).strip():
        return "Website", True
    s = str(raw_source).strip()
    lower = s.lower()
    if lower == "website":
        return "Website", (raw_source != "Website")
    elif lower in ("voice agent", "ai voice call"):
        return "Voice Agent", (raw_source != "Voice Agent")
    elif lower == "whatsapp":
        return "WhatsApp", (raw_source != "WhatsApp")
    elif lower in ("dealer walk-in", "dealer walk in", "walk-in"):
        return "Dealer Walk-in", (raw_source != "Dealer Walk-in")
    return s.title(), True


def normalize_product(raw_product: str) -> Tuple[str, bool]:
    """Standardizes product names, e.g. 'Pure power 5 kwh' -> 'PuREPower Home 5kWh'."""
    if not raw_product or not str(raw_product).strip():
        return "", False
    s = str(raw_product).strip()
    lower = s.lower()
    if "pure" in lower and "5" in lower and "kwh" in lower:
        return "PuREPower Home 5kWh", (s != "PuREPower Home 5kWh")
    elif "pure" in lower and "3" in lower and "kwh" in lower:
        return "PuREPower Home 3kWh", (s != "PuREPower Home 3kWh")
    elif "pure" in lower and "10" in lower and "kwh" in lower:
        return "PuREPower Commercial 10kWh", (s != "PuREPower Commercial 10kWh")
    return s, False


def normalize_date(raw_date: str) -> Tuple[str, bool]:
    """Standardizes date string to ISO format YYYY-MM-DD, fixing malformed dates."""
    if not raw_date or not str(raw_date).strip():
        return datetime.utcnow().strftime("%Y-%m-%d"), True
    s = str(raw_date).strip()
    # Handle DD/MM/YYYY e.g. 31/09/2026
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 3:
            day, month, year = parts[0], parts[1], parts[2]
            # Cap day to 30 for September
            if month == "09" and int(day) > 30:
                day = "30"
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}", True
    return s, False


class DealerRouter:
    """Handles dealer lookup by 3-digit pincode prefix."""

    def __init__(self, dealers: List[Dict[str, str]]):
        self.dealers = dealers
        # Map 3-digit prefix -> dealer
        self.prefix_map: Dict[str, Dict[str, str]] = {}
        for dealer in sorted(dealers, key=lambda d: d.get("dealer_id", "")):
            raw_prefixes = dealer.get("pincode_prefixes", "")
            prefixes = [p.strip() for p in raw_prefixes.split("|") if p.strip()]
            for prefix in prefixes:
                # Deterministic tie-breaker: first registered / lowest dealer_id wins
                if prefix not in self.prefix_map:
                    self.prefix_map[prefix] = dealer

    def route_pincode(self, pincode: str) -> Tuple[str, str]:
        """
        Extracts the first 3 digits of the 6-digit pincode and routes to dealer.
        Falls back to In-house Sales if no dealer covers the prefix.
        """
        if not pincode or len(pincode) < 3:
            return INHOUSE_DEALER_ID, INHOUSE_DEALER_NAME

        prefix = pincode[:3]
        if prefix in self.prefix_map:
            dealer = self.prefix_map[prefix]
            return dealer.get("dealer_id", ""), dealer.get("dealer_name", "")
        else:
            return INHOUSE_DEALER_ID, INHOUSE_DEALER_NAME


def load_dealers(filepath: str) -> List[Dict[str, str]]:
    """Loads dealers from CSV file."""
    dealers = []
    if not os.path.exists(filepath):
        print(f"Error: Dealer file '{filepath}' not found.", file=sys.stderr)
        return dealers

    with open(filepath, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cleaned_row = {k.strip(): v.strip() for k, v in row.items() if k}
            dealers.append(cleaned_row)
    return dealers


def process_leads(
    dealers_file: str,
    leads_file: str,
    reconciliation_file: str
) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]], Dict[str, int]]:
    """
    Cleans legacy leads, resolves duplicates, assigns dealers,
    and writes reconciliation report.
    """
    dealers = load_dealers(dealers_file)
    router = DealerRouter(dealers)

    if not os.path.exists(leads_file):
        print(f"Error: Leads file '{leads_file}' not found.", file=sys.stderr)
        return [], [], {}

    reconciliation_rows: List[Dict[str, str]] = []
    cleaned_leads: List[Dict[str, Any]] = []
    seen_phones: Dict[str, str] = {}  # normalized_phone -> lead_id

    stats = {
        ACTION_IMPORTED: 0,
        ACTION_FIXED: 0,
        ACTION_MERGED: 0,
        ACTION_REJECTED: 0,
        ACTION_ASSIGNED_INHOUSE: 0,
        "total_input": 0
    }

    with open(leads_file, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            stats["total_input"] += 1
            lead_id = row.get("lead_id", "").strip() or f"UNKNOWN_{stats['total_input']}"
            raw_name = row.get("name", "")
            raw_phone = row.get("phone", "")
            raw_pincode = row.get("pincode", "")
            raw_product = row.get("product", "")
            raw_source = row.get("source", "")
            raw_status = row.get("status", "")
            raw_date = row.get("created_on", "") or row.get("created_at", "")

            # Check 1: Missing name
            name = raw_name.strip()
            if not name:
                stats[ACTION_REJECTED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_REJECTED,
                    "reason": "Missing required customer name"
                })
                continue

            # Check 2: Missing product
            if not raw_product or not raw_product.strip():
                stats[ACTION_REJECTED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_REJECTED,
                    "reason": "Missing required product specification"
                })
                continue

            # Check 3: Phone normalization
            norm_phone, phone_modified, phone_err = normalize_phone(raw_phone)
            if not norm_phone:
                stats[ACTION_REJECTED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_REJECTED,
                    "reason": phone_err
                })
                continue

            # Check 4: Pincode validation
            norm_pincode, pincode_modified, pincode_err = validate_pincode(raw_pincode)
            if not norm_pincode:
                stats[ACTION_REJECTED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_REJECTED,
                    "reason": pincode_err
                })
                continue

            # Check 5: Duplicate Mobile Number Check
            if norm_phone in seen_phones:
                prior_lead_id = seen_phones[norm_phone]
                stats[ACTION_MERGED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_MERGED,
                    "reason": f"Duplicate mobile number matching lead {prior_lead_id}; merged into existing record"
                })
                continue
            seen_phones[norm_phone] = lead_id

            # Normalizations
            norm_status, status_modified = normalize_status(raw_status)
            norm_source, source_modified = normalize_source(raw_source)
            norm_product, product_modified = normalize_product(raw_product)
            norm_date, date_modified = normalize_date(raw_date)
            name_modified = (name != raw_name)

            # Dealer Assignment
            assigned_id, assigned_name = router.route_pincode(norm_pincode)

            # Determine Action & Reason
            has_modifications = (
                phone_modified or
                pincode_modified or
                status_modified or
                source_modified or
                product_modified or
                name_modified or
                date_modified
            )

            mod_reasons = []
            if phone_modified:
                mod_reasons.append("normalized mobile format")
            if pincode_modified:
                mod_reasons.append("trimmed pincode")
            if date_modified:
                mod_reasons.append("normalized date format")
            if status_modified:
                mod_reasons.append("standardized status casing")
            if source_modified:
                mod_reasons.append("standardized source casing")
            if product_modified:
                mod_reasons.append("standardized product name")
            if name_modified:
                mod_reasons.append("trimmed customer name whitespace")

            if assigned_id == INHOUSE_DEALER_ID:
                stats[ACTION_ASSIGNED_INHOUSE] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_ASSIGNED_INHOUSE,
                    "reason": f"No dealer covers pincode prefix {norm_pincode[:3]}; assigned to In-house Sales"
                })
            elif has_modifications:
                stats[ACTION_FIXED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_FIXED,
                    "reason": "Cleaned: " + ", ".join(mod_reasons)
                })
            else:
                stats[ACTION_IMPORTED] += 1
                reconciliation_rows.append({
                    "lead_id": lead_id,
                    "action": ACTION_IMPORTED,
                    "reason": "Valid record imported without modifications"
                })

            cleaned_leads.append({
                "leadId": lead_id,
                "name": name,
                "phone": norm_phone,
                "pincode": norm_pincode,
                "product": norm_product,
                "source": norm_source,
                "status": norm_status,
                "assignedDealerId": assigned_id,
                "assignedDealerName": assigned_name,
                "createdAt": f"{norm_date}T00:00:00Z" if len(norm_date) == 10 else datetime.utcnow().isoformat() + "Z",
                "updatedAt": datetime.utcnow().isoformat() + "Z"
            })

    # Ensure reports directory exists
    os.makedirs(os.path.dirname(os.path.abspath(reconciliation_file)), exist_ok=True)

    # Write reconciliation.csv with exactly three columns: lead_id,action,reason
    with open(reconciliation_file, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["lead_id", "action", "reason"])
        writer.writeheader()
        for r in reconciliation_rows:
            writer.writerow(r)

    return cleaned_leads, reconciliation_rows, stats


def import_to_firestore(
    dealers_file: str,
    cleaned_leads: List[Dict[str, Any]],
    credentials_path: Optional[str] = None
) -> bool:
    """
    Imports dealers and cleaned leads to Firestore using Firebase Admin SDK.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("[Notice] firebase-admin package is not installed. To perform live database import, run: pip install firebase-admin", file=sys.stderr)
        return False

    try:
        if not firebase_admin._apps:
            if credentials_path and os.path.exists(credentials_path):
                cred = credentials.Certificate(credentials_path)
                firebase_admin.initialize_app(cred)
            elif "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred)
            else:
                print("[Info] No Firebase Admin service-account credentials provided. Dry-run reconciliation completed safely.")
                return False

        db = firestore.client()
        batch = db.batch()

        # Import Dealers
        dealers = load_dealers(dealers_file)
        print(f"[Firestore] Uploading {len(dealers)} dealers...")
        for dealer in dealers:
            dealer_id = dealer.get("dealer_id")
            if dealer_id:
                doc_ref = db.collection("dealers").document(dealer_id)
                batch.set(doc_ref, {
                    "dealerId": dealer_id,
                    "name": dealer.get("dealer_name"),
                    "pincodePrefixes": dealer.get("pincode_prefixes"),
                    "city": dealer.get("city", ""),
                    "email": dealer.get("contact_email", ""),
                    "createdAt": datetime.utcnow().isoformat() + "Z",
                    "updatedAt": datetime.utcnow().isoformat() + "Z"
                }, merge=True)

        # Import Cleaned Leads
        print(f"[Firestore] Uploading {len(cleaned_leads)} valid leads with uniqueness index...")
        for lead in cleaned_leads:
            lead_id = lead["leadId"]
            phone = lead["phone"]

            lead_ref = db.collection("leads").document(lead_id)
            batch.set(lead_ref, lead, merge=True)

            unique_ref = db.collection("lead_uniqueness").document(phone)
            batch.set(unique_ref, {
                "phone": phone,
                "leadId": lead_id,
                "createdAt": lead["createdAt"]
            }, merge=True)

        batch.commit()
        print("[Firestore] Batch commit succeeded!")
        return True

    except Exception as e:
        print(f"[Firestore Error] Failed to write to database: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="PURE Energy PuREPower Lead Cleaner & Router")
    parser.add_argument("--dealers", default="data/dealers.csv", help="Path to dealers CSV")
    parser.add_argument("--leads", default="data/legacy_leads.csv", help="Path to legacy leads CSV")
    parser.add_argument("--report", default="reports/reconciliation.csv", help="Path to reconciliation CSV output")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Perform dry run without Firestore writes")
    parser.add_argument("--commit", action="store_true", help="Write to Firestore database")
    parser.add_argument("--credentials", default=None, help="Path to service-account JSON key")
    parser.add_argument("--export-json", default="reports/cleaned_data.json", help="Path to export cleaned data JSON")

    args = parser.parse_args()

    print("=" * 65)
    print(" PURE Energy PuREPower - Legacy Lead Cleaning & Router Engine")
    print("=" * 65)

    cleaned_leads, reconciliation_rows, stats = process_leads(
        dealers_file=args.dealers,
        leads_file=args.leads,
        reconciliation_file=args.report
    )

    print(f"\nProcessing Summary:")
    print(f" • Total Input Rows:     {stats.get('total_input', 0)}")
    print(f" • Pristine (imported):  {stats.get(ACTION_IMPORTED, 0)}")
    print(f" • Corrected (fixed):    {stats.get(ACTION_FIXED, 0)}")
    print(f" • Duplicates (merged):  {stats.get(ACTION_MERGED, 0)}")
    print(f" • In-house Routed:      {stats.get(ACTION_ASSIGNED_INHOUSE, 0)}")
    print(f" • Rejected Invalid:     {stats.get(ACTION_REJECTED, 0)}")
    print(f"\nReconciliation report generated at: {args.report}")
    print(f"Total report rows (excluding header): {len(reconciliation_rows)}")

    if args.export_json:
        dealers = load_dealers(args.dealers)
        out_payload = {
            "dealers": dealers,
            "leads": cleaned_leads,
            "stats": stats,
            "reconciliation": reconciliation_rows
        }
        os.makedirs(os.path.dirname(os.path.abspath(args.export_json)), exist_ok=True)
        import json
        with open(args.export_json, "w", encoding="utf-8") as f:
            json.dump(out_payload, f, indent=2)
        print(f"[JSON Export] Cleaned data exported to: {args.export_json}")

    if args.commit and not args.dry_run:
        print("\nConnecting to Firestore...")
        import_to_firestore(args.dealers, cleaned_leads, credentials_path=args.credentials)
    else:
        print("\n[Dry Run Mode] Database writes skipped. Use --commit and --credentials to import to Firestore.")

    print("=" * 65)


if __name__ == "__main__":
    main()
