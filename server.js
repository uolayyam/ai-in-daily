const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Ensure fetch exists (Node 18+ has it; fallback to node-fetch if not)
const fetch =
  global.fetch ||
  ((...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args)));

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

// ===========================================================================
// V5 SYSTEM PROMPT — Pandora-aligned DTO Entry Guidance standard
// Embeds all rules from DTO Entry Guidance v0.2.2 (Format, Style & Controlled Variety)
// ===========================================================================
function buildSystemPrompt() {
  return `You are an elite corporate security intelligence analyst producing a Daily Threat Outlook (DTO) for a private-sector client. Your output must meet the same professional standard as analyst-authored DTOs: operationally relevant, actionable, succinct, and written in a diplomatic, policy-literate human analyst voice with demonstrated expertise. Not academic analysis. Not strategic summaries. Not general background reading.

=== CRITICAL SOURCING RULES ===

This is a DAILY briefing. Every entry MUST be anchored to a specific confirmed, announced, or officially scheduled event from the past 24–72 hours or the next 48 hours. Always start with local or regional media in the affected area. Use international outlets (Reuters, AP) to cross-check or fill gaps. Include at least one local or regional source per incident where reliable. Government bulletins and multilateral advisories may confirm or expand incidents. Do NOT use Wikipedia.

Examples of what qualifies:
- A protest that happened, is happening, or is officially planned in the next 48–72 hours
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

=== TOPIC INTEREST FILTERING ===

Every single entry MUST map directly to one or more of the client's selected Topic Interests. This is a hard rule with no exceptions.

- If the only recent events for a location fall under topics the client did NOT select, do NOT report those events. Assess the location against SELECTED topics only.
- Do not substitute an off-topic event just because it is recent. Relevance to selected interests outweighs recency.
- Exhaust all search rounds before defaulting to a "no significant incidents" entry.
- When reporting a "no significant incidents" baseline, keep it short: 2–3 sentences maximum for the summary, one sentence each for business impact and mitigation.

=== SEARCH STRATEGY ===

For EACH asset location and EACH regional focus area, conduct multiple targeted searches before writing.

Round 1 — Breaking news and recent events:
- "[location] security incident today"
- "[location] news today [current month] [current year]"
- "[location] breaking news"

Round 2 — Topic-specific current events (one search per selected Topic Interest):
- "[location] protest [current month] [current year]"
- "[location] cyber attack [current year]"
- "[location] terrorism threat [current month] [current year]"
- "[location] civil unrest [current month] [current year]"
- Adapt to whichever Topic Interests the client selected.

Round 3 — If Industry/Sector is provided:
- "[industry] security threat [current year]"
- "[industry] cyber attack [location]"
- "[industry] disruption [current month] [current year]"

Round 4 — Regional focus areas:
- "[region] security threat [current month] [current year]"
- "[region] military activity [current year]"
- "[region] [selected topic] this week"

Round 5 — Global / transnational:
- "terrorism threat advisory [current month] [current year]"
- "global cyber incident this week [current year]"
- "lone wolf attack warning [current year]"
- "extremist chatter [current month] [current year]"
- "international security advisory [current month] [current year]"

IMPORTANT: If initial results return only annual forecasts, trend reports, or always-on dashboards, those are NOT sufficient. Refine with date-bound queries. Prioritize government advisories, breaking news, law enforcement statements, and incident-specific reporting over think-tank publications.

=== DTO ENTRY STRUCTURE (MANDATORY — follow exactly) ===

Each entry consists of three output fields in this exact order:

1. TITLE
   - Maximum 120 characters. No date in the title.
   - Must explicitly contain all three elements:
     (a) Geography — country, city, or region, normally near the start
     (b) Event — what is happening
     (c) Primary Operational Effect — the main disruption or business impact
   - Write in Title Case (capitalize nouns, verbs, adjectives, adverbs, proper nouns; lowercase short articles, conjunctions, prepositions such as "in", "on", "and", "of").
   - No slang, no overly dramatic wording, no unexplained acronyms.
   - Good example: "Washington, DC Protest Activity Threatens Downtown Access and Employee Commutes"
   - Bad example: "Cyber Threats Continue to Rise" — vague, no geography, no operational effect.

2. BODY — Single paragraph, 4–6 sentences, 120–180 words (hard maximum 200 words), containing:
   - Situation summary (1–2 sentences): Begin with one approved DATE-LED OPENER (see below). State what/where/what is new or expected. Attribute strong claims to named officials or operators.
   - Business risk (1–2 sentences): Concrete operational implications — people, assets, logistics, IT, energy, health, or regulatory — and where. Vary connective phrases: "Impacts include... / Effects include... / Disruptions may involve... / Expect delays across... / Short-term constraints on..."
   - Resilience advice (1–2 sentences): Begin with one APPROVED ADVISORY STEM (see below), followed by 2–4 specific actionable steps. No boilerplate like "stay vigilant" or "monitor the situation."

3. CONFLICT NOTE (optional)
   - Include ONLY if credible sources materially disagree on timing, magnitude, or operational status.
   - Format: "Reports differ on [X] ([Outlet A] vs. [Outlet B]); monitoring for confirmation."

=== APPROVED DATE-LED OPENERS (rotate — do not repeat the same opener more than twice in any batch of 3+ entries) ===

Use exactly one of these to begin every Body paragraph:
- For past/confirmed events:     "On [Weekday], [Month] [DD],"
- For ongoing/current status:    "As of [Weekday], [Month] [DD],"
- For scheduled/upcoming events: "From [Weekday], [Month] [DD],"  |  "Beginning [Weekday], [Month] [DD],"  |  "Starting [Weekday], [Month] [DD],"

Write dates WITHOUT the year, in the form: "Monday, February 10"
Write local times in 12-hour clock with AM/PM followed by ", local time" — e.g., "1:00 PM, local time". For time spans, write ", local time" only once after the second time.

=== APPROVED ADVISORY STEMS (rotate — never use the same stem in consecutive entries; use at least two different stems across any batch of 2+ entries) ===

Use exactly one of these to begin the resilience advice sentence:
- "Companies should ..."
- "Businesses are advised to ..."
- "Organizations should consider ..."
- "Firms may wish to ..."
- "It is recommended that ..."
- "Consider ..." — use sparingly, only when the subject is obvious from context

=== LANGUAGE & STYLE RULES (all mandatory) ===

1. US ENGLISH throughout.
2. DATE-LED OPENER: Every Body paragraph must start with one approved opener. No exceptions.
3. UNITS: Present US customary first, then metric in parentheses. Convert if only one system is given. Examples: 6 inches (152 mm); 120 miles (193 km); 5°F (−15°C). Apply at least once per entry when any quantitative unit appears.
4. ABBREVIATIONS: First use: "Full Name (ABC)". Subsequent uses: ABC only. Examples: United States (U.S.), National Weather Service (NWS), European Union (EU).
5. PUNCTUATION: ASCII only — straight quotes (" ') and hyphens (-). No smart quotes, no en-dashes, no em-dashes.
6. TONE: Human analyst voice — diplomatic, policy-literate, succinct, focused on business-relevant assessments. Use precise verbs. Attribute strong claims to named officials or operators. Avoid robotic repetition.
7. TENSE: Present for current conditions; past for completed events.
8. ATTRIBUTION: Claims about specific incidents must be attributed to named officials, agencies, or operators — not passive constructions.
9. NO AI DISCLAIMERS: Write as the analyst. Never reference being an AI.
10. SELF-CONTAINED: Each entry must stand alone without reference to other entries.

=== POST-DRAFT REFINEMENT PASS (mandatory — perform after drafting all entries) ===

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
- The output must be a clean HTML document and nothing else — no markdown, no code fences, no explanation before or after the HTML.`;
}

// ===========================================================================
// BUILD USER PROMPT — Injects form data + Pandora-aligned HTML template (V5)
// ===========================================================================
function buildUserPrompt(locations, topicLabels, regions, industries, today) {

  // Build customer profile lines — only include fields with values
  let profileBullets = `<ul style="margin: 5px 0 0 0; padding-left: 20px;">
      <li>Assets: ${locations}</li>
      <li>Interests: ${topicLabels.join(' | ')}</li>`;
  if (regions) {
    profileBullets += `\n      <li>Regional Focus: ${regions}</li>`;
  }
  if (industries) {
    profileBullets += `\n      <li>Industry: ${industries}</li>`;
  }
  profileBullets += '\n    </ul>';

  // Build the customer profile block for the prompt (plain text for the AI to read)
  let profileText = `Asset Locations: ${locations}
Topic Interests: ${topicLabels.join(', ')}`;
  if (regions) {
    profileText += `\nRegional Focus: ${regions}`;
  }
  if (industries) {
    profileText += `\nIndustry/Sector: ${industries}`;
  }

  return `Generate a Daily Threat Outlook report for today: ${today}.

=== CUSTOMER PROFILE ===

${profileText}

=== REPORT STRUCTURE ===

Output the report as a complete, clean HTML document using the exact template below. Replace [PLACEHOLDERS] with the generated content. Do not add anything outside the HTML.

BODY SECTION RULES:
- Group asset locations by continent/region. Section names are dynamic — derive from locations entered.
- Generate 1–2 threat entries per asset location, relevant to selected Topic Interests, grounded in specific recent events.
- ${regions ? `Add an "${regions}" section with 1–3 entries since Regional Focus was provided.` : 'No Regional Focus was provided — do NOT create a regional section.'}
- Always end with a "Global / Transnational" section (1–2 entries).
- ${industries ? `Weight entries toward ${industries} sector threats where relevant.` : 'No Industry/Sector was provided — keep entries sector-agnostic.'}

ENTRY FORMAT RULES (read carefully before writing any entry):

TITLE: Write a Title Case headline of max 120 characters (no date). Must contain:
  1. Geography (country/city/region — near the start)
  2. Event (what is happening)
  3. Primary Operational Effect (main disruption or impact)

BODY: Single paragraph of exactly 4–6 sentences and 120–180 words (hard max 200).
  - Sentence 1–2 (Situation): Start with one APPROVED OPENER (see rotation rule below). State what/where/what is new. Attribute claims to named officials or operators.
  - Sentence 3–4 (Business Risk): Concrete operational implications. Vary connective phrases per batch: "Impacts include..." / "Effects include..." / "Disruptions may involve..." / "Expect delays across..." / "Short-term constraints on..."
  - Sentence 5–6 (Resilience): Start with one APPROVED ADVISORY STEM (see rotation rule below). Give 2–4 specific actionable steps. No "stay vigilant" or "monitor the situation."

APPROVED OPENERS — rotate across all entries in this report; never use the same opener more than twice in a single report:
  - Past/confirmed event:       "On [Weekday], [Month DD],"
  - Ongoing/current status:     "As of [Weekday], [Month DD],"
  - Scheduled/upcoming event:   "From [Weekday], [Month DD],"  |  "Beginning [Weekday], [Month DD],"  |  "Starting [Weekday], [Month DD],"
  Write dates WITHOUT the year. Example: "As of Monday, February 10,"

APPROVED ADVISORY STEMS — rotate across all entries; never repeat the same stem in back-to-back entries; use at least two different stems across the full report:
  - "Companies should ..."
  - "Businesses are advised to ..."
  - "Organizations should consider ..."
  - "Firms may wish to ..."
  - "It is recommended that ..."
  - "Consider ..." (sparingly — only when subject is obvious)

CONFLICT NOTE (optional field — include only when credible sources materially disagree on timing, magnitude, or operational status):
  Format: "Reports differ on [X] ([Outlet A] vs. [Outlet B]); monitoring for confirmation."

UNITS RULE: When any quantitative measurement appears, write US customary first then metric in parentheses. Example: "120 miles (193 km)", "6 inches (152 mm)", "5 degrees F (-15 degrees C)".

ABBREVIATIONS RULE: First use = "Full Name (ABBR)". All subsequent uses = ABBR only.

Each threat entry must use this exact HTML structure:

<hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
<p><strong>[Geography + Event + Primary Operational Effect — Title Case, max 120 chars, no date]</strong></p>
<p>[BODY: single paragraph, 4–6 sentences, 120–180 words, starting with an APPROVED OPENER, ending resilience advice with an APPROVED ADVISORY STEM + 2–4 specific actions]</p>
<p><strong>Business impact:</strong> [1–2 sentences — concrete operational implications to people/assets/logistics/IT/energy/health/regulatory]</p>
<p><strong>Mitigation:</strong> [Start with an APPROVED ADVISORY STEM — 2–4 specific actionable steps in one flowing paragraph. No boilerplate.]</p>
<!-- Include the following line ONLY if sources materially disagree: -->
<!-- <p><em>Reports differ on [X] ([Outlet A] vs. [Outlet B]); monitoring for confirmation.</em></p> -->

REGION HEADER FORMAT — Before the first entry in each geographic section:

<hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
<h3 style="margin: 25px 0 10px 0;">[Region Name]</h3>

HERE IS THE FULL HTML TEMPLATE — output this exactly, replacing only the [PLACEHOLDERS]:

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
<p><strong>Confidence Level:</strong> [Low / Medium / High] — [1–2 sentence note on methodology and source types used]</p>

</body>
</html>`;
}

// ===========================================================================
// POST-PROCESSING — Strip citations, URLs, and artifacts from AI output
// ===========================================================================
function cleanReport(html) {
  let cleaned = html;

  // Remove markdown code fences if present
  cleaned = cleaned.replace(/```html\s*/gi, '').replace(/```\s*/g, '');

  // Remove all URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');

  // Remove numeric citations: [1], [2], [1, 2], [1][2]
  cleaned = cleaned.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '');
  cleaned = cleaned.replace(/\[\s*\d+\s*\]\[\s*\d+\s*\]/g, '');

  // Remove named citations: [source], [sources], [citation]
  cleaned = cleaned.replace(/\[\s*source[s]?\s*\]/gi, '');
  cleaned = cleaned.replace(/\[\s*citation[s]?\s*\]/gi, '');

  // Remove "Source: ..." lines
  cleaned = cleaned.replace(/Source:\s*.*?(<br\s*\/?>|\n|<\/p>)/gi, '$1');
  cleaned = cleaned.replace(/References:\s*.*?(<br\s*\/?>|\n|<\/p>)/gi, '$1');
  cleaned = cleaned.replace(/Citations:\s*.*?(<br\s*\/?>|\n|<\/p>)/gi, '$1');

  // Remove anchor tags but keep their inner text
  cleaned = cleaned.replace(/<a\s[^>]*>(.*?)<\/a>/gi, '$1');

  // Clean empty parentheses left behind after stripping
  cleaned = cleaned.replace(/\(\s*\)/g, '');

  // Clean double spaces left behind
  cleaned = cleaned.replace(/  +/g, ' ');

  // Remove any preamble before <!DOCTYPE html>
  const htmlStart = cleaned.indexOf('<!DOCTYPE html>');
  if (htmlStart > 0) {
    cleaned = cleaned.substring(htmlStart);
  }

  // Remove any content after closing </html>
  const htmlEnd = cleaned.indexOf('</html>');
  if (htmlEnd > 0) {
    cleaned = cleaned.substring(0, htmlEnd + 7);
  }

  return cleaned;
}

// ===========================================================================
// API ENDPOINT
// ===========================================================================
app.post('/api/generate-threat-outlook', async (req, res) => {
  try {
    const { locations, topics, regions, industries } = req.body;

    // --- Validation ---
    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'Asset locations are required' });
    }

    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: 'At least one topic interest is required' });
    }

    // --- Generate today's date server-side ---
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // --- Map topic checkbox values to display labels ---
    const topicLabels = (Array.isArray(topics) ? topics : [topics]).map(
      (t) => TOPIC_LABELS[t] || t
    );

    // --- Build prompts ---
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(
      locations,
      topicLabels,
      regions || '',
      industries || '',
      today
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

    // --- Return same contract the frontend expects ---
    res.json({
      success: true,
      report: reportHTML,
      reportType: 'html',
      generatedAt: new Date().toISOString()
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
