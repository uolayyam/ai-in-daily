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
    const today = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

const prompt = `TODAY IS: ${today}

You are a threat intelligence analyst writing a Daily Threat Outlook based on open-source intelligence (OSINT).

STEP 1: COMPREHENSIVE OSINT THREAT SEARCH
Use web_search to find relevant threats across these timeframes:
1. PRIORITY: Breaking news from past 24 hours
2. RECENT: Developing situations from past 48-72 hours
3. FORWARD-LOOKING: Upcoming threats in next 24-72 hours
4. PERSISTENT: Ongoing threats relevant to customer profile

Search authoritative OSINT sources:

GOVERNMENT/OFFICIAL (highest priority):
- "site:cisa.gov alert ${new Date().toLocaleDateString('en-US', { month: 'long' })} 2026"
- "site:fbi.gov ${locations}"
- "site:dhs.gov advisory"

CYBERSECURITY INTELLIGENCE:
- "site:bleepingcomputer.com ${industries} attack"
- "site:therecord.media ransomware"
- "CVE vulnerability ${industries} 2026"

GEOPOLITICAL/NEWS:
- "site:reuters.com ${regions} ${new Date().toLocaleDateString('en-US', { month: 'long' })} 2026"
- "site:apnews.com ${regions}"

LOCATION-SPECIFIC:
- "${locations} security incident this week"
- "${locations} civil unrest recent"

SECTOR-SPECIFIC:
- "${industries} cyberattack recent"
- "critical infrastructure ${industries} threat"

STEP 2: PARSE USER INPUTS AND SEARCH

ASSET LOCATIONS PROVIDED: ${locations}
Parse this as a comma-separated list. For EACH location, you must:
1. Search for location-specific threats: "[city] security incident today", "[city] protest", "[city] crime"
2. Create a threat entry specifically for that location
3. Make it geographically specific (not generic national threats)

REGIONAL FOCUS PROVIDED: ${regions || 'None'}
${regions ? `Create 1-2 threats specific to the ${regions} region` : 'Skip regional section'}

INDUSTRY SECTORS PROVIDED: ${industries || 'None'}
${industries ? `Create 1-2 threats specific to the ${industries.split(',').map(i => i.trim()).join(' and ')} sector(s)` : 'Skip sector section'}

STEP 3: OUTPUT AS HTML

Generate a complete HTML document with inline styles for professional PDF printing.

Output EXACTLY this structure (fill in the bracketed sections with actual threat content):

<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Daily Threat Outlook - ${today}</title>
    <style>
        @media print {
            body { margin: 0; }
            @page { margin: 0.5in; }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 40px 50px;
            color: #333;
            line-height: 1.7;
        }
        h1 { 
            color: #1437C1; 
            font-size: 24pt; 
            margin: 0 0 5px 0;
            font-weight: 700;
        }
        h2.subtitle {
            font-size: 16pt;
            font-weight: 700;
            margin: 0 0 5px 0;
            color: #1a1a1a;
        }
        h2.date {
            font-size: 14pt;
            font-weight: 700;
            margin: 0 0 20px 0;
            color: #1a1a1a;
        }
        h3.section { 
            color: #1a1a1a; 
            font-size: 16pt; 
            margin: 35px 0 20px 0; 
            padding-bottom: 8px;
            border-bottom: 2px solid #ddd;
            font-weight: 700;
        }
        h4.threat-title { 
            color: #2c3e50; 
            font-size: 12pt; 
            margin: 20px 0 10px 0; 
            font-weight: 700;
            line-height: 1.4;
        }
.customer-profile {
            margin: 20px 0;
        }
        .customer-profile p {
            margin: 10px 0;
            font-weight: 600;
        }
        .customer-profile ul {
            margin: 5px 0 15px 0;
            padding-left: 20px;
            list-style: none;
        }
        .customer-profile li {
            margin: 4px 0;
            line-height: 1.6;
            font-weight: 400;
        }
        .customer-profile li:before {
            content: "• ";
            font-weight: normal;
        }
        .customer-profile li strong {
            font-weight: 600;
        }
        .threat-description {
            margin: 10px 0;
            text-align: justify;
        }
        .business-impact {
            margin: 12px 0 8px 0;
        }
        .mitigation {
            margin: 8px 0 25px 0;
        }
        .divider {
            border-bottom: 1px solid #e8e8e8;
            margin: 25px 0;
        }
        strong { 
            font-weight: 600;
            color: #1a1a1a;
        }
        p {
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <h1>Daily Threat Outlook</h1>
    <h2 class="subtitle">Threats, Risks, and Mitigation</h2>
    <h2 class="date">${today}</h2>
    
    <div class="customer-profile">
        <p><strong>Customer Profile:</strong></p>
        <ul>
            <li><strong>Assets:</strong> ${locations}</li>
            <li><strong>Interests:</strong> ${topics.join(' | ')}</li>
            ${regions ? `<li><strong>Regional Focus:</strong> ${regions}</li>` : ''}
            ${industries ? `<li><strong>Industry Focus:</strong> ${industries}</li>` : ''}
        </ul>
    </div>
    
<h3 class="section">Asset Locations</h3>
    
    <!-- Generate one threat section for EACH location in: ${locations} -->
    <!-- Parse the locations string, split by commas, and create a threat for each -->
    <!-- Format for each location:
    
    <h4 class="threat-title">[City, State/Country]: [Specific Local Incident]</h4>
    <p class="threat-description">As of ${today}, [location-specific details]...</p>
    <p class="business-impact"><strong>Business impact:</strong> [local impact]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [local recommendation]</p>
    <div class="divider"></div>
    
    -->
    <!-- The AI should parse this list and create one threat entry per location -->
    
    [For each location in "${locations}", create a section following this format:]
    
    <h4 class="threat-title">[City Name]: [Location-Specific Incident Headline]</h4>
    <p class="threat-description">As of ${today}, [describe a threat SPECIFIC to this city - local protests, incidents, crimes, cyber attacks affecting local businesses]. [Must be geographically specific to this city]. [Include local landmarks, streets, or neighborhoods if available].</p>
    <p class="business-impact"><strong>Business impact:</strong> [How this affects businesses in this specific city]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [City-specific actionable steps]</p>
    <div class="divider"></div>
    
    ${regions ? `
    <h3 class="section">${regions}</h3>
    
    <h4 class="threat-title">[Regional Threat Headline]</h4>
    <p class="threat-description">As of ${today}, [describe regional threat]. [Details].</p>
    <p class="business-impact"><strong>Business impact:</strong> [Impact]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [Recommendation]</p>
    <div class="divider"></div>
    ` : ''}
    
${industries ? `
    <h3 class="section">${industries.split(',')[0].trim().charAt(0).toUpperCase() + industries.split(',')[0].trim().slice(1)} Sector</h3>
    
    <h4 class="threat-title">[Sector-Specific Threat Headline]</h4>
    <p class="threat-description">As of ${today}, [describe sector threat]. [Details].</p>
    <p class="business-impact"><strong>Business impact:</strong> [Impact]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [Recommendation]</p>
    <div class="divider"></div>
    ` : ''}
    
    <h3 class="section">Global / Transnational</h3>
    
    <h4 class="threat-title">[Global Threat Relevant to Customer]</h4>
    <p class="threat-description">As of ${today}, [describe global threat]. [Details].</p>
    <p class="business-impact"><strong>Business impact:</strong> [Impact]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [Recommendation]</p>
    
<h3 class="section">Analyst Confidence Assessment</h3>
    
    <p><strong>Overall Threat Environment: [Level]</strong> - [Brief justification based on today's threat landscape]</p>
    <p><strong>Confidence Level: [Level]</strong> — [Explain confidence level based on OSINT quality and sources used]</p>
</body>
</html>

CRITICAL RULES:
1. Output ONLY the HTML - no conversational text before or after
2. Every threat starts with "As of ${today},"
3. DYNAMICALLY CREATE SECTIONS: Parse the user inputs (locations: "${locations}", regions: "${regions || 'none'}", industries: "${industries || 'none'}") and create threat entries for EACH item provided
4. Do NOT skip any location - if the user provided 5 cities, create 5 location-specific threats
5. Each threat must be SPECIFIC to that location/region/sector - not generic
6. Include 4-6 threats total (mix location, regional, sector, global)
7. Fill in ALL bracketed [placeholders] with actual content
8. Business impact and Mitigation = ONE sentence each
9. Include source attribution where possible: "According to CISA...", "FBI reports..."
10. Remove the divider after the last threat in each section

TIMING GUIDANCE:
✓ IDEAL: "overnight incidents", "announced today", "confirmed this morning"
✓ GOOD: "following Friday's incident", "this week's developments"
✓ ACCEPTABLE: "persistent threats from past week"
✗ BAD: Events from May 2025, November 2025, January 2026 without new updates

WRITING STYLE - EXECUTIVE BRIEFING FORMAT:
This is a morning briefing for busy executives, not a technical research paper.

✓ Write for quick scanning - lead with "what happened" before technical details
✓ Use plain language - avoid excessive acronyms and jargon  
✓ Keep threat descriptions to 3-4 sentences maximum
✓ If technical terms are necessary, briefly explain them in parentheses
✓ Use concrete numbers and facts: "60 arrests", "30 wind farms", "published at 3pm"
✓ Avoid dense technical explanations - save detail for Business Impact/Mitigation

EXAMPLES OF GOOD VS BAD WRITING:

✗ BAD (too dense): "The emerging Reynolds ransomware incorporates BYOVD (Bring-Your-Own-Vulnerable-Driver) techniques directly within the payload, deploying signed vulnerable NsecSoft NSecKrnl drivers to disable security software from kernel mode rather than requiring separate tool deployment."

✓ GOOD (executive-friendly): "New ransomware uses advanced techniques to disable security software before attacking. This makes detection harder for companies. Manufacturing and energy firms are the primary targets, with 8 incidents in January alone."

✗ BAD (too technical): "CISA added six actively exploited Microsoft Windows and Office vulnerabilities to its Known Exploited Vulnerabilities Catalog on February 10, 2026, including critical zero-day flaws affecting Windows Shell Protection (CVE-2026-21510), MSHTML (CVE-2026-21513), and Windows Remote Desktop Services."

✓ GOOD (clear and scannable): "Microsoft patched six critical security flaws on February 10 that hackers are actively exploiting. The vulnerabilities allow attackers to take control of systems through malicious links or Office files with minimal user interaction."

SLOW NEWS DAY: If limited breaking news, include recent week events but frame as "continued monitoring" or "elevated risk following recent..." Be honest in Analyst Confidence.

ALWAYS GENERATE A REPORT. Even slow news days need threat assessments.`;
    
// Determine which API to call based on selected model
    let response;
    
if (model === 'gpt-4o-mini') {
      // Call OpenAI GPT-4o-mini (cheaper)
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a threat intelligence analyst. Generate threat reports in HTML format as instructed.'
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
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a threat intelligence analyst. Use web search to find current threats and generate reports in HTML format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 4000
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
  // OpenAI format
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
