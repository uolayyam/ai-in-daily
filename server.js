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

// Check API credits endpoint
app.get('/api/check-credits', async (req, res) => {
  try {
    const credits = {
      claude: { available: 0, error: null },
      openai: { available: 0, error: null }
    };
    
    // Check Claude credits (Anthropic doesn't have a direct credits API, so we'll use a workaround)
    try {
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        })
      });
      
      if (claudeResponse.ok) {
        // If API call succeeds, credits are available
        // Note: Anthropic doesn't expose credit balance directly
        credits.claude.available = true;
        credits.claude.message = 'API key valid - balance check not available via API';
      } else {
        const errorData = await claudeResponse.json();
        credits.claude.error = errorData.error?.message || 'API call failed';
        credits.claude.available = false;
      }
    } catch (error) {
      credits.claude.error = error.message;
      credits.claude.available = false;
    }
    
    // Check OpenAI credits
    if (process.env.OPENAI_API_KEY) {
      try {
        // OpenAI also doesn't have a direct credits endpoint, but we can check if key is valid
        const openaiResponse = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          }
        });
        
        if (openaiResponse.ok) {
          credits.openai.available = true;
          credits.openai.message = 'API key valid - balance check not available via API';
        } else {
          const errorData = await openaiResponse.json();
          credits.openai.error = errorData.error?.message || 'API call failed';
          credits.openai.available = false;
        }
      } catch (error) {
        credits.openai.error = error.message;
        credits.openai.available = false;
      }
    } else {
      credits.openai.available = false;
      credits.openai.error = 'No OpenAI API key configured';
    }
    
    res.json({
      success: true,
      credits: credits,
      note: 'Neither Anthropic nor OpenAI provide direct API credit balance endpoints. This checks if API keys are valid and working.'
    });
    
  } catch (error) {
    console.error('Credit Check Error:', error);
    res.status(500).json({ 
      error: 'Failed to check credits',
      message: error.message 
    });
  }
});

// Generate threat outlook endpoint
app.post('/api/generate-threat-outlook', async (req, res) => {
  try {
    const { locations, topics, regions, industries, model } = req.body;

    // Validate input
    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'Asset locations are required' });
    }

    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: 'At least one topic interest is required' });
    }

    // Build the prompt for Claude
const today = req.body.today || new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

const prompt = `TODAY IS: ${today}

You are a senior threat intelligence analyst at a professional risk advisory firm. Your job is to produce a Daily Threat Outlook that reads like it was written by an experienced human analyst — not a news aggregator.

CUSTOMER PROFILE:
- Asset Locations: ${locations}
- Topic Interests: ${topics.join(', ')}
- Regional Focus: ${regions || 'None'}
- Industry Focus: ${industries || 'None'}

STEP 1: RESEARCH — USE WEB SEARCH NOW
Search for current threats relevant to this customer. For each asset location, search:
- "[city] protest 2026"
- "[city] security threat 2026"  
- "[city] civil unrest 2026"
- "[city] cyber attack 2026"

For regional/sector focus, search:
- "${regions || ''} security threat 2026"
- "${industries || ''} cyberattack 2026"
- "terrorism threat 2026"
- "geopolitical risk 2026"

STEP 2: WRITE THE REPORT

Write like a senior intelligence analyst, not a journalist. The difference:
- A journalist reports what happened
- An analyst explains what it MEANS, what comes NEXT, and what to DO about it

For every threat entry you MUST:
1. State the facts briefly (1-2 sentences)
2. Add analytical context — historical patterns, escalation indicators, related activity
3. Project forward — what is the elevated risk in the next 24-72 hours?
4. Connect to the customer's specific assets/interests

WRITING STANDARDS — STUDY THESE EXAMPLES:

✓ ANALYST VOICE (what we want):
"As of ${today}, multiple national advocacy organizations have announced coordinated demonstrations in Washington, DC following the issuance of a new executive order expanding federal immigration enforcement authorities. Permits have been requested for gatherings near the National Mall and federal buildings, with online mobilization indicating turnout potentially in the tens of thousands over the next 48–72 hours. While the majority of activity is expected to remain peaceful, past protest cycles tied to immigration policy in DC have produced intermittent clashes with law enforcement, vandalism of government property, and isolated assaults near protest perimeters."

✗ NEWS SUMMARY VOICE (what we don't want):
"A protest occurred in Washington DC. Police were present. Businesses were affected."

✓ ANALYST BUSINESS IMPACT (specific and operational):
"Heightened security posture, restricted vehicle access, traffic disruptions, and increased duty-of-care risk for employees commuting into central DC."

✗ GENERIC BUSINESS IMPACT (too vague):
"Local businesses may face disruptions."

✓ ANALYST MITIGATION (actionable and specific):
"Organizations with DC offices should consider remote work options, staggered schedules, and proactive coordination with building security and local authorities regarding access restrictions."

✗ GENERIC MITIGATION (useless):
"Enhance security measures and monitor the situation."

SECTION STRUCTURE RULES:
- Group asset locations under ONE geographic header (e.g. "North America") — do NOT use "Asset Locations" as a header
- Each city gets its own threat entry under that geographic header
- Add regional section only if regional focus provided: ${regions || 'skip'}
- Add industry section only if industry focus provided: ${industries || 'skip'}
- Always include a "Global / Transnational" section
- End with "Analyst Confidence Assessment"

STRICT RULES:
0. WHAT COUNTS AS A THREAT — CRITICAL: Only include items that represent an active security risk RIGHT NOW or within the next 72 hours. NEVER include: future scheduled events (protests weeks away, conferences, summits), events older than 14 days unless still actively escalating, or news stories that are not security threats (awards, announcements, summits).
1. Every city in "${locations}" MUST have a UNIQUE threat — never repeat the same story for two cities
2. NO INLINE URLS — never include hyperlinks or source URLs in the report text. No "[source.com]" anywhere.
3. ASIA-PACIFIC ONLY includes: China, Japan, South Korea, Taiwan, Australia, New Zealand, Southeast Asia (Thailand, Vietnam, Philippines, Indonesia, Malaysia, Singapore), Pacific Islands. Pakistan, India, Afghanistan, Bangladesh = South Asia. NEVER put South Asia in the Asia-Pacific section.
4. If you cannot find a relevant current threat for a section, write about the elevated persistent threat environment for that location — do not fill it with irrelevant old news or future events.
5. Washington DC threats = focus on federal government, Capitol Hill, DC metro, federal agencies
6. Do NOT use inline URLs or hyperlinks — no "[source.com]" in the text
7. Use accurate dates — do NOT say "As of ${today}" for an event that happened 2 weeks ago. Say "On [actual date]..." then "As of ${today}, [current status/risk]..."
8. Geography: Asia-Pacific = East/Southeast Asia + Pacific. NOT Pakistan, India, Middle East
9. Descriptions = 3-5 sentences. Business Impact = 2-3 sentences. Mitigation = 2-3 sentences
10. Use specific facts: numbers, percentages, named organizations, named threat actors where known
11. Forward-looking language: "risk of follow-on activity", "elevated through the weekend", "indicators suggest..."
12. Output ONLY the HTML document — no text before or after

STEP 3: OUTPUT AS HTML

<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Daily Threat Outlook - ${today}</title>
    <style>
        @media print { body { margin: 0; } @page { margin: 0.5in; } }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px 50px; color: #333; line-height: 1.7; }
        h1 { color: #1437C1; font-size: 24pt; margin: 0 0 5px 0; font-weight: 700; }
        h2.subtitle { font-size: 16pt; font-weight: 700; margin: 0 0 5px 0; color: #1a1a1a; }
        h2.date { font-size: 14pt; font-weight: 700; margin: 0 0 20px 0; color: #1a1a1a; }
        h3.section { color: #1a1a1a; font-size: 16pt; margin: 35px 0 20px 0; padding-bottom: 8px; border-bottom: 2px solid #ddd; font-weight: 700; }
        h4.threat-title { color: #2c3e50; font-size: 12pt; margin: 20px 0 10px 0; font-weight: 700; }
        p { margin: 8px 0; font-size: 11pt; }
        .divider { border-top: 1px solid #eee; margin: 20px 0; }
        .customer-profile { background: #f8f9fa; padding: 15px 20px; border-radius: 4px; margin-bottom: 25px; font-size: 11pt; }
    </style>
</head>
<body>
    <h1>Daily Threat Outlook</h1>
    <h2 class="subtitle">Threats, Risks, and Mitigation</h2>
    <h2 class="date">${today}</h2>
    
    <div class="customer-profile">
        <strong>Customer Profile:</strong><br>
        Assets: ${locations}<br>
        Interests: ${topics.join(' | ')}<br>
        ${regions ? `Regional Focus: ${regions}<br>` : ''}
        ${industries ? `Industry Focus: ${industries}` : ''}
    </div>

    [GEOGRAPHIC SECTION — e.g. "North America" — containing one entry per asset city]
    [REGIONAL SECTION — only if regional focus provided]
    [INDUSTRY SECTION — only if industry focus provided]
    [GLOBAL / TRANSNATIONAL SECTION]
    [ANALYST CONFIDENCE ASSESSMENT]
</body>
</html>`;
    
// Determine which API to call based on selected model
    let response;
    
if (model === 'gpt-4o-mini') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-search-preview',
          messages: [
            {
              role: 'system',
              content: 'You are a threat intelligence analyst. Use your web search capability to find current, real threats and generate reports in HTML format as instructed.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 4000
        })
      });
} else if (model === 'gpt-4o') {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-search-preview',
          messages: [
            {
              role: 'system',
              content: 'You are a senior threat intelligence analyst. Use your web search capability to find current, real threats from today and recent days. Generate professional threat reports in HTML format as instructed.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 12000
        })
      });
    } else if (model === 'claude-sonnet') {
      // Call Claude Sonnet 4.5
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
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
    } else {
      // Default: Claude Haiku 4.5 (cheapest)
      response = await fetch('https://api.anthropic.com/v1/messages', {
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
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API Error:', errorData);
      return res.status(response.status).json({ 
        error: 'Failed to generate report',
        details: errorData 
      });
    }

const data = await response.json();
    
    // Extract HTML content - format differs by provider
    let reportHTML;
    
if (model === 'gpt-4o' || model === 'gpt-4o-mini') {
  // OpenAI Chat Completions format
      reportHTML = data.choices[0].message.content;
    } else {
      // Claude format
      reportHTML = data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n\n');
    }
    
    // Remove any conversational preamble (text before "<!DOCTYPE html>")
    const htmlStart = reportHTML.indexOf('<!DOCTYPE html>');
    if (htmlStart > 0) {
      reportHTML = reportHTML.substring(htmlStart);
    }
    
    // Clean up any markdown code fences if present
    reportHTML = reportHTML.replace(/```html\n?/g, '').replace(/```\n?/g, '');

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
