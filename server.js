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

STEP 2: OUTPUT AS HTML

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
            font-size: 11pt;
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
        }
        .customer-profile li:before {
            content: "• ";
            font-weight: normal;
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
    
    <h3 class="section">North America</h3>
    
    ${locations.includes('Washington') || locations.includes('DC') ? `
    <h4 class="threat-title">Washington DC: [Specific Threat Headline]</h4>
    <p class="threat-description">As of ${today}, [describe the threat with specific timing and details]. [2-3 sentences with concrete facts]. [Why this matters for businesses].</p>
    <p class="business-impact"><strong>Business impact:</strong> [One sentence on operational impact]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [One specific actionable recommendation]</p>
    <div class="divider"></div>
    ` : ''}
    
    ${locations.includes('Chicago') ? `
    <h4 class="threat-title">Chicago IL: [Specific Threat Headline]</h4>
    <p class="threat-description">As of ${today}, [describe threat]. [Details and context].</p>
    <p class="business-impact"><strong>Business impact:</strong> [Impact statement]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [Recommendation]</p>
    <div class="divider"></div>
    ` : ''}
    
    ${locations.includes('Houston') ? `
    <h4 class="threat-title">Houston TX: [Specific Threat Headline]</h4>
    <p class="threat-description">As of ${today}, [describe threat]. [Details and context].</p>
    <p class="business-impact"><strong>Business impact:</strong> [Impact statement]</p>
    <p class="mitigation"><strong>Mitigation:</strong> [Recommendation]</p>
    <div class="divider"></div>
    ` : ''}
    
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
3. Include 4-6 threats total (mix location, regional, sector, global)
4. Fill in ALL bracketed [placeholders] with actual content
5. Business impact and Mitigation = ONE sentence each
6. Include source attribution where possible: "According to CISA...", "FBI reports..."
7. Remove the divider after the last threat in each section

TIMING GUIDANCE:
✓ IDEAL: "overnight incidents", "announced today", "confirmed this morning"
✓ GOOD: "following Friday's incident", "this week's developments"
✓ ACCEPTABLE: "persistent threats from past week"
✗ BAD: Events from May 2025, November 2025, January 2026 without new updates

SLOW NEWS DAY: If limited breaking news, include recent week events but frame as "continued monitoring" or "elevated risk following recent..." Be honest in Analyst Confidence.

ALWAYS GENERATE A REPORT. Even slow news days need threat assessments.`;
    
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
    
    // Extract the HTML content from Claude's response
    let reportHTML = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');
    
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
