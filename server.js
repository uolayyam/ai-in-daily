const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Daily Threat Outlook API is running' });
});

// Generate threat outlook endpoint
app.post('/api/generate-threat-outlook', async (req, res) => {
  try {
    const { locations, topics, regions, industries } = req.body;

    // Validate input
    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'Asset locations are required' });
    }

    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: 'At least one topic interest is required' });
    }

    // Build the prompt for Claude
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

const prompt = `TODAY IS: ${today}

You are a threat intelligence analyst writing a Daily Threat Outlook based on open-source intelligence (OSINT). This report is generated every morning for a customer to review their personalized threat landscape.

STEP 1: COMPREHENSIVE OSINT THREAT SEARCH
Use web_search to find relevant threats across these timeframes:
1. PRIORITY: Breaking news from past 24 hours
2. RECENT: Developing situations from past 48-72 hours (weekend events if today is Monday)
3. FORWARD-LOOKING: Upcoming threats in next 24-72 hours
4. PERSISTENT: Ongoing threats relevant to customer profile

Search authoritative OSINT sources across these categories:

GOVERNMENT/OFFICIAL ADVISORIES (highest priority):
- "site:cisa.gov alert ${new Date().toLocaleDateString('en-US', { month: 'long' })} 2026"
- "site:fbi.gov ${locations}"
- "site:dhs.gov advisory"

CYBERSECURITY THREAT INTELLIGENCE:
- "site:bleepingcomputer.com ${industries} attack"
- "site:therecord.media ransomware ${new Date().toLocaleDateString('en-US', { month: 'long' })} 2026"
- "CVE vulnerability ${industries} 2026"

GEOPOLITICAL & BREAKING NEWS:
- "site:reuters.com ${regions} ${new Date().toLocaleDateString('en-US', { month: 'long' })} 2026"
- "site:apnews.com ${regions} conflict"
- "site:bloomberg.com ${industries} security"

LOCATION-SPECIFIC NEWS:
- "${locations} security incident this week"
- "${locations} protest civil unrest recent"
- "site:washingtonpost.com DC security" (for DC-specific)

SECTOR-SPECIFIC:
- "${industries} sector cyberattack recent"
- "critical infrastructure ${industries} threat 2026"
- "site:energyintel.com ${industries}" (for energy sector)

When reporting threats, include source attribution where possible:
- "According to CISA advisory..."
- "FBI reports..."
- "Reuters confirmed..."
- "BleepingComputer analysis shows..."

This establishes credibility and allows customers to verify information.

STEP 2: WRITE THE DAILY THREAT OUTLOOK

Generate a comprehensive report with 4-6 threats covering:
- Location-specific threats (Washington DC, Chicago, Houston, etc.)
- Regional threats (Asia-Pacific, etc.)
- Sector/industry threats (energy, manufacturing, etc.)
- Global/transnational threats

Format EXACTLY as shown below. Write ONLY the report - NO conversational preamble.

---

Daily Threat Outlook

Threats, Risks, and Mitigation

${today}

Customer Profile:
- Assets: ${locations}
- Interests: ${topics.join(' | ')}
${regions ? `• Regional Focus: ${regions}` : ''}
${industries ? `• Industry Focus: ${industries}` : ''}

North America

${locations.includes('Washington') || locations.includes('DC') ? `
Washington DC: [Specific Threat Headline]

As of ${today}, [describe the threat - be specific about timing]. [2-3 sentences with details]. [Why this matters for businesses].

Business impact: [One sentence on operational impact]

Mitigation: [One specific actionable recommendation]
` : ''}

${locations.includes('Chicago') ? `
Chicago IL: [Specific Threat Headline]

As of ${today}, [describe the threat]. [Details and context].

Business impact: [Impact statement]

Mitigation: [Recommendation]
` : ''}

${locations.includes('Houston') ? `
Houston TX: [Specific Threat Headline]

As of ${today}, [describe the threat]. [Details and context].

Business impact: [Impact statement]

Mitigation: [Recommendation]
` : ''}

${regions ? `
${regions}

[Regional Threat Headline]

As of ${today}, [describe regional threat affecting customer's focus area]. [Details].

Business impact: [Impact]

Mitigation: [Recommendation]
` : ''}

${industries ? `
${industries.split(',')[0]} Sector

[Sector-Specific Threat Headline]

As of ${today}, [describe sector threat]. [Details].

Business impact: [Impact]

Mitigation: [Recommendation]
` : ''}

Global / Transnational

[Global Threat Relevant to Customer Profile]

As of ${today}, [describe global threat]. [Details].

Business impact: [Impact]

Mitigation: [Recommendation]

Analyst Confidence Assessment

Overall Threat Environment: [Low/Moderate/Elevated/High] - [Brief justification based on today's threat landscape]

Confidence Level: [Low/Medium/High] — [Explain confidence level based on available OSINT and search results quality]

---

CRITICAL FORMATTING RULES:
1. Every threat starts with "As of ${today},"
2. Include 4-6 total threats (mix of location, regional, sector, global)
3. Business impact = ONE sentence
4. Mitigation = ONE actionable sentence
5. Use simple line breaks between sections
6. Use • for bullets in Customer Profile only
7. NO markdown bold (**) anywhere

TIMING GUIDANCE:
✓ IDEAL: "As of ${today}, overnight incidents..."
✓ IDEAL: "As of ${today}, authorities announced today..."
✓ GOOD: "As of ${today}, continued monitoring following Friday's incident..."
✓ ACCEPTABLE: "As of ${today}, elevated risk detected following recent attacks this week..."
✓ FORWARD-LOOKING: "As of ${today}, protests expected in next 48 hours..."

✗ BAD: Events from May 2025, November 2025, January 2026 UNLESS there's a new development today
✗ BAD: Generic statements without specific incidents or timeframes

SLOW NEWS DAY HANDLING:
If limited breaking news from past 24 hours:
- Include developing situations from past week
- Add forward-looking threats (next 24-72 hours)
- Reference persistent/ongoing threats
- Be honest in Analyst Confidence section: "Limited breaking activity detected today. Assessment based on recent week trends and persistent threats."

ALWAYS GENERATE A REPORT. Even slow news days need threat assessments - that's the value proposition.`;
    
// Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search"
          }
        ],
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API Error:', errorData);
      return res.status(response.status).json({ 
        error: 'Failed to generate report',
        details: errorData 
      });
    }

const data = await response.json();
    
    // Extract the text content from Claude's response
    let reportText = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');
    
    // Remove any conversational preamble (text before "Daily Threat Outlook")
    const reportStart = reportText.indexOf('Daily Threat Outlook');
    if (reportStart > 0) {
      reportText = reportText.substring(reportStart);
    }
    
    // Remove any conversational text at the beginning
    reportText = reportText.replace(/^(I'll|Let me|Based on my research|I've|I will)[^]*?(?=Daily Threat Outlook)/i, '');

    res.json({
      success: true,
      report: reportText,
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
