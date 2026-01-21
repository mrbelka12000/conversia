/**
 * AI Summarizer module
 * Supports OpenAI GPT and Anthropic Claude APIs for transcript summarization
 */

const SUMMARIZE_PROMPT = `Summarize the following meeting transcript. Include:
- Key discussion points
- Decisions made
- Action items
- Important dates/deadlines mentioned

Be concise but comprehensive. Format the summary with clear sections.

Transcript:
`;

/**
 * Summarize transcript using OpenAI API
 * @param {string} transcript - The transcript to summarize
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<string>} - Summary text
 */
export async function summarizeWithOpenAI(transcript, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is empty');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes meeting transcripts. Provide clear, actionable summaries.',
        },
        {
          role: 'user',
          content: SUMMARIZE_PROMPT + transcript,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'Failed to generate summary';
}

/**
 * Summarize transcript using Claude API
 * @param {string} transcript - The transcript to summarize
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<string>} - Summary text
 */
export async function summarizeWithClaude(transcript, apiKey) {
  if (!apiKey) {
    throw new Error('Claude API key is required');
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is empty');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: SUMMARIZE_PROMPT + transcript,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Claude API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0]?.text || 'Failed to generate summary';
}

/**
 * Summarize transcript using the configured provider
 * @param {string} transcript - The transcript to summarize
 * @param {object} settings - Settings object with apiKey and summaryProvider
 * @returns {Promise<string>} - Summary text
 */
export async function summarize(transcript, settings) {
  const { apiKey, summaryProvider } = settings;

  if (summaryProvider === 'claude') {
    return summarizeWithClaude(transcript, apiKey);
  }

  // Default to OpenAI
  return summarizeWithOpenAI(transcript, apiKey);
}

/**
 * Generate a simple local summary without AI (fallback)
 * @param {string} transcript - The transcript to summarize
 * @returns {string} - Basic summary
 */
export function generateLocalSummary(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    return 'No transcript available.';
  }

  const lines = transcript.split('\n').filter(line => line.trim());
  const wordCount = transcript.split(/\s+/).length;
  const duration = lines.length > 0
    ? `${lines[0].match(/\[(.*?)\]/)?.[1] || 'N/A'} - ${lines[lines.length - 1].match(/\[(.*?)\]/)?.[1] || 'N/A'}`
    : 'N/A';

  return `## Meeting Summary (Local)

### Statistics
- **Total entries:** ${lines.length}
- **Approximate word count:** ${wordCount}
- **Time range:** ${duration}

### Note
This is a basic summary. For AI-powered summaries with key points and action items, please configure an API key in the settings.

### Transcript Preview
${lines.slice(0, 5).join('\n')}
${lines.length > 5 ? `\n... and ${lines.length - 5} more entries` : ''}
`;
}

export default { summarize, summarizeWithOpenAI, summarizeWithClaude, generateLocalSummary };
