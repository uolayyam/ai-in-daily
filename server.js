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

You are a threat intelligence analyst. You MUST use web_search tool to find breaking news from TODAY (${today}) or the past 24 hours ONLY.

STEP 1: SEARCH FOR BREAKING NEWS
Use web_search to find events from TODAY for each topic area:
- Search: "cyber attack today ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}"
- Search: "terrorism news today ${locations}"
- Search: "civil unrest overnight ${locations}"
- Search: "${regions} geopolitical tensions today"
- Search: "${industries} security incident today"

Focus ONLY on events that happened:
✓ TODAY (${today})
✓ Overnight (past 12 hours)
✓ Yesterday (past 24 hours)
✗ IGNORE anything older than 48 hours
✗ IGNORE May 2025 or January 2026 events unless there's a NEW development TODAY

STEP 2: WRITE THE REPORT
Write ONLY the report content. NO conversational text like "I searched..." or "Based on my findings...".

Format EXACTLY like this:

Daily Threat Outlook

Threats, Risks, and Mitigation

${today}

Customer Profile:
- Assets: ${locations}
- Interests: ${topics.join(' | ')}
${regions ? `• Regional Focus: ${regions}` : ''}
${industries ? `• Industry Focus: ${industries}` : ''}

North America

[City, State]: [Specific Breaking News Headline from TODAY]
As of ${today}, [what happened overnight or today - include specific time if known]. [Include concrete numbers, official statements, or specific details from your web search]. [Why this matters now - business/operational risk].

Business impact: [One sentence describing immediate operational impact to businesses in this location/sector]

Mitigation: [One actionable recommendation for risk reduction]

[Repeat 2-3 threats for North America if ${locations} includes US cities]

${regions ? `\n${regions}\n\n[Similar format - 2-3 threats from ${regions} region based on TODAY's breaking news]` : ''}

${industries ? `\n${industries.split(',')[0]} Sector\n\n[Similar format - 1-2 threats affecting ${industries} based on TODAY's news]` : ''}

Global / Transnational

[Global Breaking Threat from TODAY affecting all locations]

Analyst Confidence Assessment
Overall Threat Environment: [Low/Moderate/Elevated/High] - [brief justification based on today's events]

Confidence Level: [Low/Medium/High] — [explain why]

CRITICAL RULES:
1. Every threat MUST include "As of ${today}," in the first sentence
2. ONLY use events from TODAY or past 24 hours (search results should all be recent)
3. Include specific details: "60 arrests", "3pm EST", "overnight Friday"
4. Total of 4-6 threats maximum
5. NO events from May, June, January, or any month older than 2 days ago
6. If you can't find recent events for a location, search broader: "breaking news [city] today"
7. Use • for bullet points in Customer Profile section
8. Do NOT use markdown bold (**) anywhere

TIMING EXAMPLES:
✓ GOOD: "As of Monday, February 10, overnight arrests..." (happened last night)
✓ GOOD: "As of Monday, February 10, federal authorities confirmed today..." (announced today)
✗ BAD: "As of February 10, the May 21 shooting..." (event is 9 months old)
✗ BAD: "As of January 2026..." (event is a month old)`;
    
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
