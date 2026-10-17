-- =====================================================================
-- PURE Energy PuREPower — BigQuery Lead Analytics Schema & Queries
-- Dataset: pure_energy_analytics
-- Table:   leads_changelog (Partitioned by DAY on event_timestamp)
-- View:    v_latest_leads   (Deduplicated latest state of all leads)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DDL: Create Dataset & Partitioned Changelog Table
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `pure_energy_analytics`
OPTIONS (
  location = "US",
  description = "Operational and territory analytics for PURE Energy PuREPower leads"
);

CREATE TABLE IF NOT EXISTS `pure_energy_analytics.leads_changelog` (
  event_id STRING NOT NULL OPTIONS(description="Unique CloudEvent ID for idempotency"),
  lead_id STRING NOT NULL OPTIONS(description="Stable business lead identifier"),
  customer_name STRING OPTIONS(description="Customer full name"),
  pincode STRING OPTIONS(description="Customer 6-digit postal code"),
  pincode_prefix STRING OPTIONS(description="Territory 3-digit pincode prefix"),
  product STRING OPTIONS(description="Energy storage product inquired"),
  source STRING OPTIONS(description="Acquisition channel"),
  assigned_dealer_id STRING OPTIONS(description="Assigned dealership ID or INHOUSE"),
  assigned_dealer_name STRING OPTIONS(description="Assigned dealership name or In-house Sales"),
  status STRING OPTIONS(description="Current lead status: New, Contacted, Converted, Lost"),
  created_at TIMESTAMP OPTIONS(description="Lead creation timestamp"),
  updated_at TIMESTAMP OPTIONS(description="Last status update timestamp"),
  event_timestamp TIMESTAMP NOT NULL OPTIONS(description="Changelog event ingestion timestamp"),
  change_type STRING NOT NULL OPTIONS(description="Event mutation: CREATE, UPDATE, DELETE"),
  notes STRING OPTIONS(description="Customer notes")
)
PARTITION BY DATE(event_timestamp)
CLUSTER BY assigned_dealer_id, status, product;

-- ---------------------------------------------------------------------
-- 2. Deduplicated Latest View (v_latest_leads)
-- Uses window function to collapse all CDC revisions into the single latest state
-- Filters out deleted leads
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW `pure_energy_analytics.v_latest_leads` AS
SELECT
  lead_id,
  customer_name,
  pincode,
  pincode_prefix,
  product,
  source,
  assigned_dealer_id,
  assigned_dealer_name,
  status,
  created_at,
  updated_at,
  notes
FROM `pure_energy_analytics.leads_changelog`
WHERE change_type != 'DELETE'
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY lead_id 
  ORDER BY updated_at DESC, event_timestamp DESC
) = 1;


-- =====================================================================
-- 3. The 5 Required Analytical Queries
-- =====================================================================

-- ---------------------------------------------------------------------
-- Query 1: Lead Counts by Dealer
-- Provides total volume, active pipeline, and completed leads per dealership
-- ---------------------------------------------------------------------
SELECT
  assigned_dealer_id,
  assigned_dealer_name,
  COUNT(1) AS total_leads,
  COUNTIF(status = 'New') AS new_leads,
  COUNTIF(status = 'Contacted') AS contacted_leads,
  COUNTIF(status = 'Converted') AS converted_leads,
  COUNTIF(status = 'Lost') AS lost_leads,
  ROUND(COUNT(1) * 100.0 / SUM(COUNT(1)) OVER (), 2) AS percentage_of_total
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY assigned_dealer_id, assigned_dealer_name
ORDER BY total_leads DESC;

-- ---------------------------------------------------------------------
-- Query 2: Lead Counts by Status
-- Executive summary of the entire sales pipeline distribution
-- ---------------------------------------------------------------------
SELECT
  status,
  COUNT(1) AS lead_count,
  ROUND(COUNT(1) * 100.0 / SUM(COUNT(1)) OVER (), 2) AS percentage_of_pipeline
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'New' THEN 1
    WHEN 'Contacted' THEN 2
    WHEN 'Converted' THEN 3
    WHEN 'Lost' THEN 4
    ELSE 5
  END;

-- ---------------------------------------------------------------------
-- Query 3: Conversion Rate by Dealer
-- Measures sales effectiveness: (Converted leads / Total terminal leads)
-- ---------------------------------------------------------------------
SELECT
  assigned_dealer_id,
  assigned_dealer_name,
  COUNT(1) AS total_assigned_leads,
  COUNTIF(status = 'Converted') AS converted_count,
  COUNTIF(status = 'Lost') AS lost_count,
  COUNTIF(status IN ('Converted', 'Lost')) AS closed_leads,
  -- Conversion Rate against all assigned leads
  ROUND(
    SAFE_DIVIDE(COUNTIF(status = 'Converted') * 100.0, COUNT(1)), 
    2
  ) AS overall_conversion_rate_pct,
  -- Win Rate against closed opportunities
  ROUND(
    SAFE_DIVIDE(
      COUNTIF(status = 'Converted') * 100.0, 
      NULLIF(COUNTIF(status IN ('Converted', 'Lost')), 0)
    ), 
    2
  ) AS closed_deal_win_rate_pct
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY assigned_dealer_id, assigned_dealer_name
ORDER BY converted_count DESC, overall_conversion_rate_pct DESC;

-- ---------------------------------------------------------------------
-- Query 4: Leads Created Per Day
-- Daily inbound velocity broken down by top lead source
-- ---------------------------------------------------------------------
SELECT
  DATE(created_at, 'Asia/Kolkata') AS lead_date,
  COUNT(1) AS daily_new_leads,
  COUNTIF(source = 'Website') AS website_leads,
  COUNTIF(source = 'AI Voice Call' OR source = 'Voice Agent') AS voice_agent_leads,
  COUNTIF(source = 'WhatsApp') AS whatsapp_leads,
  COUNTIF(source = 'Dealer Walk-in') AS walkin_leads,
  COUNTIF(source NOT IN ('Website', 'AI Voice Call', 'Voice Agent', 'WhatsApp', 'Dealer Walk-in')) AS other_leads
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY lead_date
ORDER BY lead_date DESC;

-- ---------------------------------------------------------------------
-- Query 5: Product-wise Lead Distribution
-- Product demand mix across PuREPower home and commercial energy storage
-- ---------------------------------------------------------------------
SELECT
  product,
  COUNT(1) AS total_enquiries,
  ROUND(COUNT(1) * 100.0 / SUM(COUNT(1)) OVER (), 2) AS demand_share_pct,
  COUNTIF(status = 'Converted') AS converted_units,
  ROUND(SAFE_DIVIDE(COUNTIF(status = 'Converted') * 100.0, COUNT(1)), 2) AS conversion_rate_pct
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY product
ORDER BY total_enquiries DESC;
