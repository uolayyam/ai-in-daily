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

const prompt = `You are a threat intelligence analyst writing today's Daily Threat Outlook.

REPORT DATE: ${today}

Search for threats and incidents from the PAST 24-48 HOURS (recent breaking events). Focus on:
- Breaking developments from the past 1-2 days
- Overnight incidents
- Recently announced investigations or alerts
- Current active threats
- Breaking news from the past day
- Overnight developments
- Events announced or confirmed today
- New investigations or alerts issued today

Write ONLY the final report. Do NOT include conversational text like "I'll search..." or "Based on my research...".

START DIRECTLY WITH:

Daily Threat Outlook

Threats, Risks, and Mitigation

${today}
Customer Profile:
- Assets: ${locations}
- Interests: ${topics.join(' | ')}
${regions ? `• Regional Focus: ${regions}` : ''}
${industries ? `• Industry Focus: ${industries}` : ''}

[Blank line]

[Regional Section - e.g., "North America"]

[Location]: [Specific Headline About TODAY's Threat]

As of ${today}, [describe what happened today or overnight - be specific about timing]. [2-3 sentences with concrete details, numbers, quotes from officials]. [Context about why this matters now].

Business impact: [One sentence - immediate operational impact]
Mitigation: [One sentence - specific actionable steps]

[Blank line]

[Repeat for 2-3 threats per region - each starting with "As of ${today}"]

CRITICAL FORMATTING RULES:
1. Every threat description MUST start with "As of ${today},"
2. Focus on events from the LAST 24 HOURS only
3. Use specific numbers, times, and facts (e.g., "60 arrests overnight", "issued at 3pm EST")
4. Be specific about timing: "overnight", "this morning", "announced today"
5. Keep total report to 4-6 threats maximum
6. Each threat = 2-3 paragraphs of description + business impact + mitigation
7. Business impact and Mitigation = ONE sentence each
8. Use simple line breaks between paragraphs, not double breaks

DO NOT:
- Include generic ongoing situations
- Use vague timeframes like "recent weeks"
- Write about threats from more than 48 hours ago
- Add conversational preamble
- Use markdown formatting (no ** for bold)`;
    
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
