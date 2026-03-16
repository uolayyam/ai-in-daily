const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Ensure fetch exists (Node 18+ has it; fallback to node-fetch if not)
const fetch =
  global.fetch ||
  ((...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args)));

// ===========================================================================
// SUPABASE CLIENT
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file.
// Uses the service role key (server-side only — never expose to the browser).
//
// Table schema (run once in Supabase SQL editor):
//
//   CREATE TABLE dto_logs (
//     id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
//     created_at      timestamptz DEFAULT now(),
//     zendesk_user_id text        NOT NULL,
//     zendesk_user_name  text,
//     zendesk_user_email text,
//     locations       text[],
//     topics          text[],
//     regions         text,
//     industries      text,
//     report_html     text
//   );
//
//   -- Index for fast daily usage lookups per user
//   CREATE INDEX idx_dto_logs_user_date
//     ON dto_logs (zendesk_user_id, created_at DESC);
//
// ===========================================================================
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Daily generation limit per user
const DAILY_LIMIT = 5;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Daily Threat Outlook API is running' });
});

// ===========================================================================
// TOPIC VALUE → DISPLAY LABEL MAPPING
// The frontend sends short values like "cyber", "civil-unrest", "crime".
// The prompt and report need the full display labels.
// ===========================================================================
const TOPIC_LABELS = {
  'cyber': 'Cyber Threats',
  'terrorism': 'Terrorism',
  'civil-unrest': 'Civil Unrest',
  'geopolitics': 'Geopolitics',
  'crime': 'Physical Crime',
  'health': 'Health Risks',
  'military-conflict': 'Military Conflict',
  'weather': 'Extreme Weather',
  'supply-chain': 'Supply Chain Disruption',
  'natural-disasters': 'Natural Disasters'
};

// Regional Focus value → display label
// Defensive fallback: frontend now sends labels directly, but this map
// catches any raw slug that slips through to ensure clean display.
const REGION_LABELS = {
  'africa': 'Africa',
  'asia-pacific': 'Asia-Pacific',
  'europe': 'Europe',
  'latin-america': 'Latin America',
  'middle-east-north-africa': 'Middle East & North Africa',
  'north-america': 'North America',
  'russia-former-soviet-union': 'Russia & Former Soviet Union',
  'south-asia': 'South Asia',
  'sub-saharan-africa': 'Sub-Saharan Africa'
};

// Industry/Sector value → display label
const INDUSTRY_LABELS = {
  'chemical': 'Chemical',
  'commercial-facilities': 'Commercial Facilities',
  'communications': 'Communications',
  'critical-manufacturing': 'Critical Manufacturing',
  'defense': 'Defense Industrial Base',
  'emergency-services': 'Emergency Services',
  'energy': 'Energy',
  'financial-services': 'Financial Services',
  'food-agriculture': 'Food & Agriculture',
  'government': 'Government Facilities',
  'healthcare': 'Healthcare',
  'it': 'Information Technology',
  'nuclear': 'Nuclear',
  'transportation': 'Transportation',
  'water': 'Water & Wastewater'
};

// ===========================================================================
// V6 SYSTEM PROMPT — Pandora-aligned DTO Entry Guidance standard
// Embeds all rules from DTO Entry Guidance v0.2.2 (Format, Style & Controlled Variety)
// ===========================================================================
function buildSystemPrompt() {
  return `You are an elite corporate security intelligence analyst producing a Daily Threat Outlook (DTO) for a private-sector client. Your output must meet the same professional standard as analyst-authored DTOs: operationally relevant, actionable, succinct, and written in a diplomatic, policy-literate human analyst voice with demonstrated expertise. Not academic analysis. Not strategic summaries. Not general background reading.

=== CRITICAL SOURCING RULES ===

This is a DAILY briefing. Every entry MUST be anchored to a specific confirmed, announced, or officially scheduled event from the past 24-72 hours or the next 48 hours. Always start with local or regional media in the affected area. Use international outlets (Reuters, AP) to cross-check or fill gaps. Include at least one local or regional source per incident where reliable. Government bulletins and multilateral advisories may confirm or expand incidents. Do NOT use Wikipedia.

Examples of what qualifies:
- A protest that happened, is happening, or is officially planned in the next 48-72 hours
- A cyber intrusion, ransomware attack, or breach reported or confirmed recently
- A military exercise, confrontation, or escalation that occurred this week
- A government advisory, executive order, or security bulletin issued in the last few days
- An arrest, investigation, or law enforcement operation tied to a current threat
- Online extremist chatter or threat indicators flagged by security services this week
- A new sanctions package, diplomatic incident, or policy action with security implications

Examples of what does NOT qualify:
- Annual cybersecurity outlook reports or trend forecasts
- General statements like "cyber threats are increasing" without a specific triggering event
- Strategic geopolitical analysis that could apply to any day of the year
- Live threat dashboards, always-on attack maps, or permanent baseline statistics
- Routine local crime reports that do not connect to the client's selected Topic Interests

=== FRESHNESS GATE (apply before writing every single entry) ===

The user prompt contains two critical dates: TODAY'S DATE and a FRESHNESS CUTOFF date. Before writing any entry, apply this gate:

STEP 1 - CHECK THE EVENT DATE.
If the triggering event occurred before the FRESHNESS CUTOFF date provided in the user prompt, it is STALE. A stale event CANNOT be used as the primary anchor for a daily entry. Do not write the entry using that event's original date. Go to Step 2.

STEP 2 - RE-SEARCH.
Run at least two additional targeted searches to find a fresher event for that location and those topics. Use date-specific queries such as:
- "[location] [topic] today"
- "[location] [topic] [today's weekday] [today's month] [today's year]"
- "[location] security advisory [today's date]"

STEP 3 - ONGOING STATUS EXCEPTION.
If the original event predates the cutoff BUT is confirmed to be still actively developing today (e.g., an ongoing military operation, an active strike, a continuing outage, a live investigation), you MAY write the entry - but ONLY using "As of [today's weekday], [today's month and day]," as the opener, framing the situation as its current status today, NOT as the original event date.
CORRECT: event started March 4, still ongoing March 12 -> opens "As of Thursday, March 12,"
WRONG: event started March 4, still ongoing March 12 -> opens "As of Wednesday, March 4,"

STEP 4 - FALLBACK BASELINE.
Only after exhausting all search rounds AND finding no qualifying fresh event AND confirming no ongoing situation: write a short current-status baseline using today's date opener. Keep it to 2-3 sentences for the situation, one sentence each for business impact and mitigation. Do not fabricate incident details. Never write a date in the opener that is before the cutoff date.

=== TOPIC INTEREST FILTERING & MANDATORY LOCATION COVERAGE ===

Every single entry MUST map directly to one or more of the client's selected Topic Interests. This is a hard rule with no exceptions.

- If the only recent events for a location fall under topics the client did NOT select, do NOT report those events. Assess the location against SELECTED topics only.
- Do not substitute an off-topic event just because it is recent. Relevance to selected interests outweighs recency.

MANDATORY COVERAGE RULE - Every asset location listed in the customer profile MUST have at least one entry in the report. Skipping a location entirely is not permitted under any circumstances. If you cannot find a qualifying event for a location after exhausting all search rounds, write a current-status baseline for that location using the FALLBACK BASELINE protocol from the FRESHNESS GATE section above. The baseline must still use today's date opener, still reference the client's selected topics, and still be specific to that city or region - never generic filler.

Before outputting the final report, run a mental checklist: confirm that every asset location from the customer profile appears as a section heading or within a section. If any location is missing, go back and add it before finalising.

=== SEARCH STRATEGY ===

For EACH asset location and EACH regional focus area, conduct multiple targeted searches before writing.

Round 1 - Breaking news and recent events:
- "[location] security incident today"
- "[location] news today [current month] [current year]"
- "[location] breaking news"

Round 2 - Topic-specific current events (one search per selected Topic Interest):
- "[location] protest [current month] [current year]"
- "[location] cyber attack [current year]"
- "[location] terrorism threat [current month] [current year]"
- "[location] civil unrest [current month] [current year]"
- Adapt to whichever Topic Interests the client selected.

Round 3 - If Industry/Sector is provided:
- "[industry] security threat [current year]"
- "[industry] cyber attack [location]"
- "[industry] disruption [current month] [current year]"

Round 4 - Regional focus areas:
- "[region] security threat [current month] [current year]"
- "[region] military activity [current year]"
- "[region] [selected topic] this week"

Round 5 - Global / transnational:
- "terrorism threat advisory [current month] [current year]"
- "global cyber incident this week [current year]"
- "lone wolf attack warning [current year]"
- "extremist chatter [current month] [current year]"
- "international security advisory [current month] [current year]"

IMPORTANT: If initial results return only annual forecasts, trend reports, or always-on dashboards, those are NOT sufficient. Refine with date-bound queries. Prioritize government advisories, breaking news, law enforcement statements, and incident-specific reporting over think-tank publications.

=== DTO ENTRY STRUCTURE (MANDATORY - follow exactly) ===

Each entry consists of three output fields in this exact order:

1. TITLE
   - Maximum 120 characters. No date in the title.
   - Must explicitly contain all three elements:
     (a) Geography - country, city, or region, normally near the start
     (b) Event - what is happening
     (c) Primary Operational Effect - the main disruption or business impact
   - Write in Title Case (capitalize nouns, verbs, adjectives, adverbs, proper nouns; lowercase short articles, conjunctions, prepositions such as "in", "on", "and", "of").
   - No slang, no overly dramatic wording, no unexplained acronyms.
   - Good example: "Washington, DC Protest Activity Threatens Downtown Access and Employee Commutes"
   - Bad example: "Cyber Threats Continue to Rise" - vague, no geography, no operational effect.

2. BODY - three distinct fields, each with its own paragraph. DO NOT duplicate content across fields:
   - SITUATION (1-2 sentences): Begin with one approved DATE-LED OPENER. State what/where/what is new. Attribute claims to named officials or operators. Do NOT include business risk or mitigation here.
   - BUSINESS IMPACT (1-2 sentences): Concrete operational implications - people, assets, logistics, IT, energy, health, regulatory. Vary connective phrases: "Impacts include... / Effects include... / Disruptions may involve... / Expect delays across... / Short-term constraints on..."
   - MITIGATION (1 flowing paragraph): Begin with one APPROVED ADVISORY STEM. Give 2-4 specific actionable steps. No "stay vigilant" or "monitor the situation."

3. CONFLICT NOTE (optional)
   - Include ONLY if credible sources materially disagree on timing, magnitude, or operational status.
   - Format: "Reports differ on [X] ([Outlet A] vs. [Outlet B]); monitoring for confirmation."

=== APPROVED DATE-LED OPENERS (rotate - do not repeat the same opener more than twice in any batch of 3+ entries) ===

Use exactly one of these to begin every situation paragraph:
- For events within the cutoff window, now concluded:  "On [Weekday], [Month] [DD],"
- For ongoing/current/active situations:               "As of [Weekday], [Month] [DD],"
- For scheduled/upcoming events:                       "From [Weekday], [Month] [DD],"  |  "Beginning [Weekday], [Month] [DD],"  |  "Starting [Weekday], [Month] [DD],"

DATE RULES - mandatory:
1. ALWAYS include the weekday. Correct: "As of Monday, March 10," - Wrong: "As of March 10,"
2. NEVER include the year in the opener date.
3. For an event that started before the cutoff but is actively ongoing today, use today's date with "As of" - not the original start date.
4. For an event that occurred within the cutoff window and is now concluded, use the actual event date with "On".
5. Never write a date before the FRESHNESS CUTOFF in any opener.

OPENER SELECTION GUIDANCE:
- If the situation is still active, developing, or has ongoing implications TODAY - use "As of [today's date]," even if the triggering event occurred earlier within the cutoff window.
- Only use "On [event date]," for events that are clearly concluded with no active ongoing dimension.
- In practice, most intelligence entries involve ongoing or developing situations - "As of" will often be the most accurate opener. Actively prefer it over "On" where the situation is still live.
- Scheduled or announced future events always use "From / Beginning / Starting."

=== APPROVED ADVISORY STEMS (rotate - never use the same stem in consecutive entries; use at least two different stems across any batch of 2+ entries) ===

Use exactly one of these to begin the resilience advice sentence:
- "Companies should ..."
- "Businesses are advised to ..."
- "Organizations should consider ..."
- "Firms may wish to ..."
- "It is recommended that ..."
- "Consider ..." - use sparingly, only when the subject is obvious from context

=== LANGUAGE & STYLE RULES (all mandatory) ===

1. US ENGLISH throughout.
2. DATE-LED OPENER: Every situation paragraph must start with one approved opener. No exceptions.
3. UNITS: Present US customary first, then metric in parentheses. Convert if only one system is given. Examples: 6 inches (152 mm); 120 miles (193 km); 5 degrees F (-15 degrees C). Apply at least once per entry when any quantitative unit appears.
4. ABBREVIATIONS: First use: "Full Name (ABC)". Subsequent uses: ABC only. Examples: United States (U.S.), National Weather Service (NWS), European Union (EU).
5. PUNCTUATION: ASCII only - straight quotes and hyphens. No smart quotes, no en-dashes, no em-dashes.
6. TONE: Human analyst voice - diplomatic, policy-literate, succinct, focused on business-relevant assessments. Use precise verbs. Attribute strong claims to named officials or operators. Avoid robotic repetition.
7. TENSE: Present for current conditions; past for completed events.
8. ATTRIBUTION: Every claim about a specific incident must be attributed to a named official, agency, or operator - e.g., "Boston Police Department confirmed", "the U.S. Federal Bureau of Investigation (FBI) stated", "Taiwan's Ministry of National Defense reported." If no named source is available, restructure the sentence to describe the observable confirmed fact rather than attributing it to an unnamed party. Never use vague constructions like "officials noted," "authorities said," or "sources indicate" without naming the specific agency or official.
9. NO AI DISCLAIMERS: Write as the analyst. Never reference being an AI.
10. SELF-CONTAINED: Each entry must stand alone without reference to other entries.

=== POST-DRAFT REFINEMENT PASS (mandatory - perform after drafting all entries) ===

After producing the initial entries strictly per the structure above, perform one refinement pass with these rules:
- Do NOT change factual substance, risk judgments, ratings, locations, dates, or field structure.
- Improve tone and flow only: lightly edit wording to elevate professional tone, tighten phrasing, and improve logical flow while preserving all original meanings.
- Remove all system artifacts: delete any internal citation tags, source annotation strings, tool markers, or technical annotations. These must never appear in a finalized DTO entry.
- Respect all length and structure constraints defined above.
- Verify opener variety and advisory stem rotation across the full batch before finalizing.

=== OUTPUT RULES ===

- Do NOT include any URLs, hyperlinks, citations, footnotes, source references, or media outlet names anywhere in the report.
- Do NOT include [1], [2], (Source: ...), or any similar reference artifacts.
- Do NOT include any preamble, introduction, or commentary outside the report HTML.
- The output must be a clean HTML document and nothing else - no markdown, no code fences, no explanation before or after the HTML.`;
}

// ===========================================================================
// BUILD USER PROMPT — Injects form data + Pandora-aligned HTML template (V6)
// ===========================================================================
function buildUserPrompt(locations, topicLabels, regions, industries, today, cutoffDateStr) {

  // Build customer profile lines - only include fields with values
  const locationsDisplay = Array.isArray(locations) ? locations.join(' | ') : locations;

  let profileBullets = `<ul style="margin: 5px 0 0 0; padding-left: 20px;">
      <li>Assets: ${locationsDisplay}</li>
      <li>Interests: ${topicLabels.join(' | ')}</li>`;
  if (regions) {
    profileBullets += `\n      <li>Regional Focus: ${regions}</li>`;
  }
  if (industries) {
    profileBullets += `\n      <li>Industry: ${industries}</li>`;
  }
  profileBullets += '\n    </ul>';

  // Build the customer profile block for the prompt (plain text for the AI to read)
  let profileText = `Asset Locations: ${locationsDisplay}
Topic Interests: ${topicLabels.join(', ')}`;
  if (regions) {
    profileText += `\nRegional Focus: ${regions}`;
  }
  if (industries) {
    profileText += `\nIndustry/Sector: ${industries}`;
  }

  // Build explicit per-location coverage checklist for the prompt
  const locationList = Array.isArray(locations) ? locations : [locations];
  const locationChecklist = locationList.map((loc, i) => `  ${i + 1}. ${loc}`).join('\n');

  return `Generate a Daily Threat Outlook report.

=== DATE ANCHOR ===
Today's date is: ${today}
Freshness cutoff: ${cutoffDateStr}

This is the report date. The FRESHNESS CUTOFF is a hard limit - do not use any event that occurred before ${cutoffDateStr} as the primary anchor for an entry, unless that situation is confirmed to be actively ongoing today. All date-led openers for ongoing situations must use today's date (${today}), not the original event start date. Do not use any other date as the anchor.

=== CUSTOMER PROFILE ===

${profileText}

=== MANDATORY LOCATION COVERAGE CHECKLIST ===

You MUST produce at least one threat entry for EACH of the following asset locations. This is non-negotiable. Before finalising the report, verify every location below is covered. If a location is missing, add it before outputting.

${locationChecklist}

Do not group these locations in a way that causes any of them to be omitted. Each location gets its own entry, grouped under the correct continental/regional section header.

=== REPORT STRUCTURE ===

Output the report as a complete, clean HTML document using the exact template below. Replace [PLACEHOLDERS] with the generated content. Do not add anything outside the HTML.

BODY SECTION RULES:
- Group asset locations by continent/region. Section names are dynamic - derive from locations entered.
- Generate 1-2 threat entries per asset location, relevant to selected Topic Interests, grounded in specific recent events after the FRESHNESS CUTOFF date OR confirmed ongoing situations reported using today's date.
- ${regions ? `Add a "${regions}" section with 1-3 entries since Regional Focus was provided. GEOGRAPHIC CONTAINMENT RULE: this section may ONLY contain events physically located within the ${regions} region. Events that are thematically related to ${regions} but physically located elsewhere (e.g. a military exercise in Asia connected to Middle East tensions) do NOT belong here - place them in Global / Transnational instead.` : 'No Regional Focus was provided - do NOT create a regional section.'}
- Always end with a "Global / Transnational" section (1-2 entries). This is the correct home for: events affecting multiple regions simultaneously, transnational threats, and any event thematically related to a regional focus but physically located outside it.
- ${industries ? `Weight entries toward ${industries} sector threats where relevant.` : 'No Industry/Sector was provided - keep entries sector-agnostic.'}

ENTRY FORMAT RULES (read carefully before writing any entry):

TITLE: Write a Title Case headline of max 120 characters (no date). Must contain:
  1. Geography (country/city/region - near the start)
  2. Event (what is happening)
  3. Primary Operational Effect (main disruption or impact)

BODY PARAGRAPH STRUCTURE - three distinct fields, each with its own <p> tag. DO NOT duplicate content across fields:
  - SITUATION (the main <p> tag): 1-2 sentences ONLY. Start with one APPROVED OPENER (see below). State what/where/what is new. Attribute claims to named officials or operators. Do NOT include business risk or mitigation here.
  - BUSINESS IMPACT (the <strong>Business impact:</strong> field): 1-2 sentences. Concrete operational implications. Vary connective phrases.
  - MITIGATION (the <strong>Mitigation:</strong> field): Start with one APPROVED ADVISORY STEM. 2-4 specific actionable steps. No boilerplate.

APPROVED OPENERS - rotate; never use the same opener more than twice in this report:
  - Past/confirmed event after cutoff, now concluded:  "On [Weekday], [Month DD],"
  - Ongoing/active/developing situation:               "As of [Weekday], [Month DD],"  <- use TODAY's date
  - Scheduled/upcoming:                                "From [Weekday], [Month DD],"  |  "Beginning [Weekday], [Month DD],"  |  "Starting [Weekday], [Month DD],"

  OPENER DATE RULES:
  - ALWAYS include the weekday. RIGHT: "As of Thursday, March 12,"  WRONG: "As of March 12,"
  - NEVER use a date before the freshness cutoff.
  - NEVER include the year.
  - Actively prefer "As of [today]" for any situation still live or developing. Reserve "On" for clearly concluded events only.

APPROVED ADVISORY STEMS - rotate; never repeat in back-to-back entries; use at least two different stems across the full report:
  - "Companies should ..."
  - "Businesses are advised to ..."
  - "Organizations should consider ..."
  - "Firms may wish to ..."
  - "It is recommended that ..."
  - "Consider ..." (sparingly)

CONFLICT NOTE (optional - include only when credible sources materially disagree):
  Format: "Reports differ on [X] ([Outlet A] vs. [Outlet B]); monitoring for confirmation."

UNITS RULE: US customary first, metric in parentheses. Example: "120 miles (193 km)".
ABBREVIATIONS RULE: First use = "Full Name (ABBR)". All subsequent uses = ABBR only.

Each threat entry must use this exact HTML structure:

<hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
<p><strong>[Geography + Event + Primary Operational Effect - Title Case, max 120 chars, no date]</strong></p>
<p>[SITUATION ONLY: 1-2 sentences starting with APPROVED OPENER. Named attribution. No risk or mitigation here.]</p>
<p><strong>Business impact:</strong> [1-2 sentences - concrete operational implications. No repetition of situation text.]</p>
<p><strong>Mitigation:</strong> [APPROVED ADVISORY STEM + 2-4 specific actionable steps. No boilerplate. No repetition.]</p>
<!-- Include ONLY if sources materially disagree: -->
<!-- <p><em>Reports differ on [X] ([Outlet A] vs. [Outlet B]); monitoring for confirmation.</em></p> -->

REGION HEADER FORMAT - Before the first entry in each geographic section:

<hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
<h3 style="margin: 25px 0 10px 0;">[Region Name]</h3>

HERE IS THE FULL HTML TEMPLATE - output this exactly, replacing only the [PLACEHOLDERS]:

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Daily Threat Outlook - ${today}</title>
<style>
  body {
    font-family: Arial, sans-serif;
    margin: 50px;
    line-height: 1.7;
    color: #1a1a1a;
  }
  h2 {
    margin: 0 0 2px 0;
  }
  h3 {
    margin: 25px 0 10px 0;
  }
  p {
    margin: 10px 0;
  }
  ul {
    line-height: 2;
  }
  hr {
    border: none;
    border-top: 1px solid #ccc;
    margin: 30px 0;
  }
  @media print {
    body { margin: 30px; }
  }
</style>
</head>
<body>

<h2>Daily Threat Outlook</h2>
<h2 style="font-weight: normal; margin: 0 0 5px 0;">Threats, Risks, and Mitigation</h2>
<p style="margin: 0;"><strong>${today}</strong></p>
<p style="margin: 5px 0 0 0;"><strong>Customer Profile:</strong></p>
${profileBullets}

[INSERT ALL GEOGRAPHIC SECTIONS WITH THREAT ENTRIES HERE]

<hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
<h3>Analyst Confidence Assessment</h3>
<p><strong>Overall Threat Environment:</strong> [Low / Moderate / Elevated / High / Critical], with [brief qualifier tied to specific conditions identified in the report]</p>
<p><strong>Confidence Level:</strong> [Low / Medium / High] - [1-2 sentence note on methodology and source types used]</p>

</body>
</html>`;
}

// ===========================================================================
// POST-PROCESSING — Strip citations, URLs, and artifacts from AI output
// ===========================================================================
function cleanReport(html) {
  let cleaned = html;

  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/```html\s*/gi, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '');
  cleaned = cleaned.replace(/\[\s*\d+\s*\]\[\s*\d+\s*\]/g, '');
  cleaned = cleaned.replace(/\[\s*source[s]?\s*\]/gi, '');
  cleaned = cleaned.replace(/\[\s*citation[s]?\s*\]/gi, '');
  cleaned = cleaned.replace(/Source:\s*.*?(<br\s*\/?>|\n|<\/p>)/gi, '$1');
  cleaned = cleaned.replace(/References:\s*.*?(<br\s*\/?>|\n|<\/p>)/gi, '$1');
  cleaned = cleaned.replace(/Citations:\s*.*?(<br\s*\/?>|\n|<\/p>)/gi, '$1');
  cleaned = cleaned.replace(/<a\s[^>]*>(.*?)<\/a>/gi, '$1');
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  cleaned = cleaned.replace(/  +/g, ' ');

  const htmlStart = cleaned.indexOf('<!DOCTYPE html>');
  if (htmlStart > 0) cleaned = cleaned.substring(htmlStart);

  const htmlEnd = cleaned.indexOf('</html>');
  if (htmlEnd > 0) cleaned = cleaned.substring(0, htmlEnd + 7);

  return cleaned;
}

// ===========================================================================
// USAGE CHECK — How many reports has this user generated today?
// "Today" = midnight-to-midnight in UTC.
// ===========================================================================
async function getUserUsageToday(zendeskUserId) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('dto_logs')
    .select('id', { count: 'exact', head: true })
    .eq('zendesk_user_id', String(zendeskUserId))
    .gte('created_at', startOfDay.toISOString());

  if (error) {
    console.error('Supabase usage check error:', error.message);
    // Fail open — if we can't check, don't block the user
    return 0;
  }
  return count ?? 0;
}

// ===========================================================================
// LOG REPORT — Write one row to dto_logs after a successful generation
// ===========================================================================
async function logReport({ zendeskUserId, zendeskUserName, zendeskUserEmail,
                            locations, topics, regions, industries, reportHtml }) {
  const { error } = await supabase.from('dto_logs').insert({
    zendesk_user_id:    String(zendeskUserId),
    zendesk_user_name:  zendeskUserName  || null,
    zendesk_user_email: zendeskUserEmail || null,
    locations:          Array.isArray(locations) ? locations : [locations],
    topics:             Array.isArray(topics)    ? topics    : [topics],
    regions:            regions    || null,
    industries:         industries || null,
    report_html:        reportHtml
  });

  if (error) {
    // Log the error but don't fail the request — the user already has their report
    console.error('Supabase log error:', error.message);
  }
}

// ===========================================================================
// USAGE ENDPOINT — GET /api/usage?userId=xxx
// Called on page load so the counter shows immediately, not just post-generation.
// ===========================================================================
app.get('/api/usage', async (req, res) => {
  try {
    const userId = req.query.userId || 'anonymous';
    const usageToday = await getUserUsageToday(userId);
    res.json({
      usageToday,
      dailyLimit: DAILY_LIMIT,
      remaining:  Math.max(0, DAILY_LIMIT - usageToday)
    });
  } catch (error) {
    console.error('Usage endpoint error:', error);
    res.status(500).json({ error: 'Could not fetch usage' });
  }
});

// ===========================================================================
// API ENDPOINT — /api/generate-threat-outlook
// ===========================================================================
app.post('/api/generate-threat-outlook', async (req, res) => {
  try {
    const {
      locations, topics, regions, industries,
      zendesk_user_id, zendesk_user_name, zendesk_user_email
    } = req.body;

    // --- Validation ---
    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'Asset locations are required' });
    }
    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: 'At least one topic interest is required' });
    }

    // --- Rate limit check ---
    // Only enforce if we have a user ID. Anonymous requests are not blocked
    // (Zendesk Guide pages are only accessible to logged-in users anyway).
    const userId = zendesk_user_id || 'anonymous';
    const usageToday = await getUserUsageToday(userId);

    if (usageToday >= DAILY_LIMIT) {
      return res.status(429).json({
        error: 'daily_limit_reached',
        message: `You have reached your daily limit of ${DAILY_LIMIT} reports. Your limit resets at midnight UTC.`,
        usageToday,
        dailyLimit: DAILY_LIMIT
      });
    }

    // --- Generate today's date server-side ---
    const now = new Date();
    const today = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // --- Compute the 72-hour freshness cutoff date (today minus 3 days) ---
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - 3);
    const cutoffDateStr = cutoffDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // --- Map topic checkbox values to display labels ---
    const topicLabels = (Array.isArray(topics) ? topics : [topics]).map(
      (t) => TOPIC_LABELS[t] || t
    );

    // --- Map region values to display labels (defensive fallback) ---
    const regionLabels = regions
      ? (Array.isArray(regions) ? regions : regions.split(/[,|]/).map(r => r.trim()))
          .map(r => REGION_LABELS[r] || r)
          .join(' | ')
      : '';

    // --- Map industry values to display labels (defensive fallback) ---
    const industryLabels = industries
      ? (Array.isArray(industries) ? industries : industries.split(/[,|]/).map(i => i.trim()))
          .map(i => INDUSTRY_LABELS[i] || i)
          .join(' | ')
      : '';

    // --- Build prompts ---
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(
      locations,
      topicLabels,
      regionLabels,
      industryLabels,
      today,
      cutoffDateStr
    );

    // --- Call OpenAI ---
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 10000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', JSON.stringify(errorData, null, 2));
      return res.status(response.status).json({
        error: 'Failed to generate report',
        details: errorData
      });
    }

    const data = await response.json();
    let reportHTML = data.choices?.[0]?.message?.content || '';

    // --- Post-process to strip citations/URLs ---
    reportHTML = cleanReport(reportHTML);

    // --- Log to Supabase (fire-and-forget — don't await, don't block the response) ---
    logReport({
      zendeskUserId:    userId,
      zendeskUserName:  zendesk_user_name,
      zendeskUserEmail: zendesk_user_email,
      locations,
      topics,
      regions:    regionLabels,
      industries: industryLabels,
      reportHtml: reportHTML
    });

    // --- Return response with usage info so frontend can update the counter ---
    res.json({
      success:     true,
      report:      reportHTML,
      reportType:  'html',
      generatedAt: new Date().toISOString(),
      usageToday:  usageToday + 1,   // +1 because this generation just succeeded
      dailyLimit:  DAILY_LIMIT,
      remaining:   DAILY_LIMIT - (usageToday + 1)
    });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
