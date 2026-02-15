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

const prompt = `Search for current threat intelligence and then write ONLY the final report content. Do not include any conversational preamble like "I'll search for..." or "Based on my research...". Start directly with "Daily Threat Outlook".

Format the report EXACTLY like this example structure:

Daily Threat Outlook

Threats, Risks, and Mitigation

${today}
Customer Profile:
- Assets: ${locations}
- Interests: ${topics.join(' | ')}
${regions ? `- Regional Focus: ${regions}` : ''}
${industries ? `- Industry Focus: ${industries}` : ''}

[Regional Section Header - e.g., "North America"]

[City/Location]: [Clear Headline Describing the Threat]

[2-3 paragraphs describing the threat with specific details, dates, and facts from web search]

Business impact: [One clear sentence describing business impact]
Mitigation: [One clear sentence with actionable recommendations]

[Repeat for 2-3 threats per region]

[Additional Regional Sections as needed - Asia-Pacific, Europe, Global/Transnational, etc.]

Analyst Confidence Assessment

Overall Threat Environment: [Assessment]
Confidence Level: [High/Medium/Low] — [Brief justification]

CRITICAL REQUIREMENTS:
1. DO NOT include conversational text like "I'll conduct searches" or "Based on my research"
2. Start directly with "Daily Threat Outlook" as the first line
3. Use web search to find 4-6 REAL current threats from the last 24-48 hours
4. Keep each threat description to 2-3 paragraphs maximum
5. Business impact and Mitigation should each be ONE sentence
6. Total report length: 1,000-1,500 words maximum
7. Focus on threats relevant to their specific locations and interests
8. Use professional intelligence report tone - factual, concise, actionable`;
// Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20251022',
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
