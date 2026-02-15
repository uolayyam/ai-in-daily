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

    const prompt = `You are a professional threat intelligence analyst. Generate a comprehensive Daily Threat Outlook report for today (${today}).

Customer Profile:
- Asset Locations: ${locations}
- Interests: ${topics.join(', ')}
${regions ? `- Regional Focus: ${regions}` : ''}
${industries ? `- Industry Focus: ${industries}` : ''}

Using web search, find and analyze current threats relevant to:
1. The specific cities/locations where they have assets
2. Their topic interests
3. Their regional focus areas (if provided)
4. Their industry sectors (if provided)

Create a professional threat intelligence report formatted like the example below. Use actual current threats from today's news, government advisories, cyber threat intelligence feeds, and OSINT sources.

Format the report with these sections:
- Brief introduction
- Regional sections (organize by geography: North America, Asia-Pacific, Europe, Middle East, etc. as relevant)
- For each threat/incident include:
  * Clear headline describing the threat
  * Detailed explanation with specific facts and data points
  * Business impact assessment
  * Mitigation recommendations
- Global/Transnational threats section (if applicable)
- Analyst confidence assessment at the end

Make it actionable, specific, and professional. Focus on threats that are recent (within last 24-48 hours) and relevant to their profile.

IMPORTANT: Search for real current information. Do not make up incidents or threats. If you cannot find enough current threats for a specific location or topic, focus on the areas where there ARE current threats.`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
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
    const reportText = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');

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
