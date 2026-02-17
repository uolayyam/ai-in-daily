const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Daily Threat Outlook API is running' });
});

app.post('/api/generate-threat-outlook', async (req, res) => {
  try {
    const { locations, topics, regions, industries, model } = req.body;

    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'Asset locations are required' });
    }

    if (!topics || topics.length === 0) {
      return res.status(400).json({ error: 'At least one topic interest is required' });
    }

    const today =
      req.body.today ||
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

    const prompt = `TODAY IS: ${today}

You are a senior threat intelligence analyst producing a Daily Threat Outlook.

Use live web search to identify real, current OSINT-reported threats.

STRICT TEMPORAL FILTER:
- Only include events within past 7 days
- Or events expected within next 72 hours
- No events weeks in the future
- No non-security announcements

FORMAT REQUIREMENT — MUST MATCH EXACTLY:

For EACH threat entry:

City, State: Concise Threat Headline

As of ${today}, [brief factual summary, 2–3 sentences]. Include analytical context and forward-looking 24–72 hour assessment.

Business impact: [2–3 operational sentences.]

Mitigation: [2–3 actionable sentences.]

REQUIREMENTS:
- Every asset city must have a unique threat.
- Include Asia-Pacific section if regional focus provided.
- Always include Global / Transnational section.
- No URLs.
- No hyperlinks.
- No citations.
- No media outlet names.
- Remove any source references before final output.

OUTPUT STRICTLY AS CLEAN HTML DOCUMENT.

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Daily Threat Outlook - ${today}</title>
<style>
body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
h1 { color: #1437C1; }
h3 { margin-top: 30px; }
</style>
</head>
<body>

<h1>Daily Threat Outlook</h1>
<h2>Threats, Risks, and Mitigation</h2>
<h3>${today}</h3>

<strong>Customer Profile:</strong><br>
Assets: ${locations}<br>
Interests: ${topics.join(' | ')}<br>
${regions ? `Regional Focus: ${regions}<br>` : ''}
${industries ? `Industry Focus: ${industries}<br>` : ''}

[INSERT REPORT BODY HERE]

<h3>Analyst Confidence Assessment</h3>
Overall Threat Environment: Moderate<br>
Confidence Level: Medium

</body>
</html>`;

    let response;

    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        messages: [
          {
            role: 'system',
            content:
              'You are a senior threat intelligence analyst. Use web search. Follow formatting exactly. Remove all citations, URLs, and source names before final output.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'Failed to generate report',
        details: errorData
      });
    }

    const data = await response.json();
    let reportHTML = data.choices[0].message.content;

    // Remove markdown fences if present
    reportHTML = reportHTML.replace(/```html/g, '').replace(/```/g, '');

    // Remove URLs if model still includes them
    reportHTML = reportHTML.replace(/https?:\/\/\S+/g, '');
    reportHTML = reportHTML.replace(/\(\s*\)/g, '');

    const htmlStart = reportHTML.indexOf('<!DOCTYPE html>');
    if (htmlStart > 0) {
      reportHTML = reportHTML.substring(htmlStart);
    }

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
