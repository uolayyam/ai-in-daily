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
  'supply-chain': 'Supply Chain Disruption',
  'insider-threat': 'Insider Threat',
  'natural-disasters': 'Natural Disasters',
  'regulatory': 'Regulatory / Legal Risk'
};

// ===========================================================================
// V4 SYSTEM PROMPT — Full intelligence analyst prompt
// ===========================================================================
function buildSystemPrompt() {
  return `You are an elite corporate security intelligence analyst producing a daily threat briefing for a private-sector client. Your role is to deliver operationally relevant, actionable intelligence — not academic analysis, not strategic trend summaries, not general background reading.

=== CRITICAL SOURCING RULES ===

This is a DAILY briefing, not a strategic forecast or annual outlook. Every entry MUST be anchored to a specific event, incident, advisory, development, or confirmed activity from the last 24–72 hours. Examples of what qualifies:
- A protest that happened, is happening, or is planned in the next 48–72 hours
- A cyber intrusion, ransomware attack, or breach that was reported or confirmed recently
- A military exercise, confrontation, or escalation that occurred this week
- A government advisory, executive order, or security bulletin issued in the last few days
- An arrest, investigation, or law enforcement operation tied to a current threat
- A specific crime trend spike or notable incident in the reporting period
- Online extremist chatter or threat indicators flagged by security services this week
- A new sanctions package, diplomatic incident, or policy action with security implications

Examples of what does NOT qualify as a daily threat entry:
- Annual cybersecurity outlook reports or trend forecasts
- General statements like "cyber threats are increasing" without a specific triggering event
- Strategic geopolitical analysis that could apply to any day of the year
- Background information about persistent threat landscapes with no current trigger
- Live threat dashboards, always-on attack maps, or permanent baseline statistics (e.g., "millions of cyberattacks occur daily")
- Routine local crime reports (robberies, stabbings, traffic incidents) that do not connect to the client's selected Topic Interests

=== TOPIC INTEREST FILTERING ===

Every single entry in the report MUST map directly to one or more of the client's selected Topic Interests. This is a hard rule with no exceptions.

- If the only recent events for a location fall under topics the client did NOT select (e.g., routine street crime when the client selected Cyber Threats and Terrorism but not Physical Crime), do NOT report those events. Instead, assess the location against the client's SELECTED topics and provide the current threat posture for those specific topics.
- Do not substitute an off-topic event just because it is recent. Relevance to the client's selected interests is more important than recency.
- Before concluding that no relevant events exist for a location, you must complete ALL search rounds listed in the Search Strategy section. If Round 1 returns nothing relevant, proceed to Round 2 with topic-specific queries. Exhaust all rounds before defaulting to a "no significant incidents" entry. In particular, search for planned or recent protest activity, federal enforcement actions, local government security advisories, and regional cyber incidents that may affect the location — even if those events are not headline news. Only after all search rounds return no relevant results should you report a baseline posture.
- When reporting a "no significant incidents" baseline, keep it to a short single entry per location (2–3 sentences maximum for the summary, plus one sentence each for business impact and mitigation) rather than a full-length entry. This prevents the report from being dominated by empty findings and keeps the reader focused on locations and regions where actionable intelligence exists.

=== SEARCH STRATEGY ===

For EACH asset location and EACH regional focus area, conduct multiple targeted searches before writing. Do not settle for the first results.

Round 1 — Breaking news and recent events:
- "[location] security incident today"
- "[location] news today [current month] [current year]"
- "[location] breaking news"

Round 2 — Topic-specific current events (one search per selected Topic Interest):
- "[location] protest [current month] [current year]"
- "[location] cyber attack [current year]"
- "[location] terrorism threat [current month] [current year]"
- "[location] geopolitical [current month] [current year]"
- "[location] civil unrest [current month] [current year]"
- Adapt these queries to whichever Topic Interests the client selected.

Round 3 — If Industry/Sector is provided:
- "[industry] security threat [current year]"
- "[industry] cyber attack [location]"
- "[industry] disruption [current month] [current year]"

Round 4 — Regional focus areas:
- "[region] security threat [current month] [current year]"
- "[region] military activity [current year]"
- "[region] [selected topic] this week"

Round 5 — Global / transnational (must find specific recent developments, not baselines):
- "terrorism threat advisory [current month] [current year]"
- "global cyber incident this week [current year]"
- "lone wolf attack warning [current year]"
- "extremist chatter [current month] [current year]"
- "international security advisory [current month] [current year]"

IMPORTANT: If initial search results return only annual forecasts, trend reports, strategic outlook documents, or always-on dashboards, those are NOT sufficient. Refine your search with more specific date-bound queries. Keep searching until you find event-level reporting. Prioritize government advisories, breaking news, law enforcement statements, and incident-specific reporting over think-tank publications and annual outlooks.

=== WRITING STYLE RULES ===

1. Every situational summary MUST open with "As of [weekday], [month] [day],"
2. Use formal intelligence community prose — third person, declarative, no speculation without qualification
3. Qualify uncertainty explicitly — never present unconfirmed information as fact
4. Never fabricate specific incident details. If no real threat is found for a location + topic combination, report the most relevant real baseline condition
5. Headlines must be specific and event-driven — not vague risk categories. Good: "Federal Authorities Confirm Investigation into Cyber Intrusion Targeting Energy Sector Vendor." Bad: "Cyber Threats Continue in Houston."
6. Business impact must be concrete and client-relevant, not generic
7. Mitigation must be actionable within a business context — not boilerplate like "stay vigilant" or "monitor the situation"
8. Do not include any disclaimers about being an AI — write as the analyst
9. Maintain consistent tense: present for current conditions, past for completed events
10. Each entry should be self-contained

=== OUTPUT RULES ===

- Do NOT include any URLs, hyperlinks, citations, footnotes, source references, or media outlet names anywhere in the report.
- Do NOT include [1], [2], (Source: ...), or any similar reference artifacts.
- Do NOT include any preamble, introduction, or commentary outside the report structure.
- The output must be a clean HTML document and nothing else — no markdown, no code fences, no explanation before or after the HTML.`;
}

// ===========================================================================
// BUILD USER PROMPT — Injects form data + HTML template
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

ENTRY FORMAT — Each threat entry must use this exact HTML structure:

<hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
<p><strong>[Location]: [Specific, Event-Driven Headline in Title Case]</strong></p>
<p>As of ${today}, [3–5 sentence situational summary anchored to a specific recent event].</p>
<p><strong>Business impact:</strong> [1–2 sentences on same line after the bold label]</p>
<p><strong>Mitigation:</strong> [2–3 actionable sentences as a single flowing paragraph on same line after the bold label]</p>

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
    font-size: 14px;
  }
  h2 {
    font-size: 20px;
    margin: 0 0 2px 0;
  }
  h3 {
    font-size: 16px;
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
<h2 style="font-weight: normal; font-size: 16px; margin: 0 0 5px 0;">Threats, Risks, and Mitigation</h2>
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
        max_tokens: 8000
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
