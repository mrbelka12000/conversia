/**
 * AI Summarizer module
 * Supports OpenAI GPT and Anthropic Claude APIs for transcript summarization
 */

/**
 * Analysis types with their prompts and metadata
 */
export const ANALYSIS_TYPES = {
  general: {
    id: 'general',
    name: 'General Summary',
    description: 'General meeting summary with key points and action items',
    prompt: `Summarize the following meeting transcript. Include:
- Key discussion points
- Decisions made
- Action items
- Important dates/deadlines mentioned

Be concise but comprehensive. Format the summary with clear sections.

Transcript:
`,
  },
  daily: {
    id: 'daily',
    name: 'Daily Standup',
    description: 'Extract what each person is working on, blockers, and plans',
    prompt: `Analyze the following daily standup meeting transcript. For each participant, extract:

## Per Person Summary
For each person who spoke, create a section with:
- **Name/Speaker**: (identify from context if possible)
- **What they did yesterday/recently**:
- **What they're working on today/next**:
- **Blockers/Issues**: (if any mentioned)
- **Dependencies**: (if any mentioned)

## Team Overview
- Overall team progress
- Common blockers or themes
- Items requiring attention

Be specific and use direct quotes where helpful. If speaker names aren't clear, use "Speaker 1", "Speaker 2", etc.

Transcript:
`,
  },
  business: {
    id: 'business',
    name: 'Business Call',
    description: 'Extract all discussed details, requirements, and agreements',
    prompt: `Analyze the following business meeting transcript. Extract ALL discussed details comprehensively:

## Meeting Context
- Participants (if identifiable)
- Main topic/purpose of the call

## Key Discussion Points
List every significant topic discussed with details:
- What was proposed
- What was agreed
- What needs clarification

## Requirements & Specifications
- Any product/feature requirements discussed
- Technical specifications mentioned
- Business rules or constraints

## Decisions Made
- List all decisions with who made them (if clear)

## Action Items
- What needs to be done
- Who is responsible (if mentioned)
- Deadlines (if mentioned)

## Open Questions
- Unresolved items
- Topics that need follow-up

## Important Numbers/Data
- Any metrics, budgets, timelines, or specific numbers mentioned

Be thorough - capture every detail discussed in the call.

Transcript:
`,
  },
  technical: {
    id: 'technical',
    name: 'Technical Discussion',
    description: 'Extract technical decisions, architecture choices, and implementation details',
    prompt: `Analyze the following technical discussion transcript. Extract:

## Technical Context
- Systems/components being discussed
- Problem being solved

## Technical Decisions
- Architecture choices made
- Technology selections
- Design patterns discussed

## Implementation Details
- Specific approaches agreed upon
- Code changes discussed
- API contracts or interfaces mentioned

## Technical Debt & Concerns
- Risks identified
- Trade-offs discussed
- Future considerations

## Action Items
- Development tasks
- Research needed
- Reviews required

## Dependencies
- External services
- Team dependencies
- Blocking items

Use technical terminology accurately. Include code snippets or pseudo-code if discussed.

Transcript:
`,
  },
  interview: {
    id: 'interview',
    name: 'Interview Debrief',
    description: 'Summarize candidate assessment from interview discussion',
    prompt: `Analyze the following interview debrief transcript. Extract:

## Candidate Overview
- Position discussed
- Candidate background (as mentioned)

## Assessment Areas
For each skill/competency discussed:
- Technical skills
- Problem-solving ability
- Communication
- Cultural fit
- Domain knowledge

## Strengths Noted
- Specific positive observations
- Strong examples mentioned

## Concerns Raised
- Areas of weakness
- Red flags discussed
- Skills gaps identified

## Questions/Answers Highlights
- Notable responses from the candidate
- Good/poor answers mentioned

## Team Feedback
- Individual assessments (if multiple interviewers)
- Overall sentiment

## Hiring Recommendation
- Go/No-go discussed
- Conditions or concerns
- Next steps agreed

Maintain objectivity. Note specific examples given during the discussion.

Transcript:
`,
  },
};

/**
 * Get analysis type by ID
 * @param {string} typeId - The analysis type ID
 * @returns {object} Analysis type object
 */
export function getAnalysisType(typeId) {
  return ANALYSIS_TYPES[typeId] || ANALYSIS_TYPES.general;
}

/**
 * Get all available analysis types
 * @returns {object[]} Array of analysis type objects
 */
export function getAnalysisTypes() {
  return Object.values(ANALYSIS_TYPES);
}

/**
 * Summarize transcript using OpenAI API
 * @param {string} transcript - The transcript to summarize
 * @param {string} apiKey - OpenAI API key
 * @param {string} analysisTypeId - The type of analysis to perform
 * @returns {Promise<string>} - Summary text
 */
export async function summarizeWithOpenAI(transcript, apiKey, analysisTypeId = 'general') {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is empty');
  }

  const analysisType = getAnalysisType(analysisTypeId);

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
          content: 'You are a helpful assistant that analyzes meeting transcripts. Provide clear, structured, and actionable analysis.',
        },
        {
          role: 'user',
          content: analysisType.prompt + transcript,
        },
      ],
      max_tokens: 2000,
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
 * @param {string} analysisTypeId - The type of analysis to perform
 * @returns {Promise<string>} - Summary text
 */
export async function summarizeWithClaude(transcript, apiKey, analysisTypeId = 'general') {
  if (!apiKey) {
    throw new Error('Claude API key is required');
  }

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is empty');
  }

  const analysisType = getAnalysisType(analysisTypeId);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: analysisType.prompt + transcript,
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
 * @param {string} analysisTypeId - The type of analysis to perform
 * @returns {Promise<string>} - Summary text
 */
export async function summarize(transcript, settings, analysisTypeId = 'general') {
  const { apiKey, summaryProvider } = settings;

  if (summaryProvider === 'claude') {
    return summarizeWithClaude(transcript, apiKey, analysisTypeId);
  }

  // Default to OpenAI
  return summarizeWithOpenAI(transcript, apiKey, analysisTypeId);
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

export default {
  summarize,
  summarizeWithOpenAI,
  summarizeWithClaude,
  generateLocalSummary,
  ANALYSIS_TYPES,
  getAnalysisType,
  getAnalysisTypes,
};
