
import express from 'express';
import ollama from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const sessions = new Map();

const SYSTEM_PROMPT = {
  role: 'system',
  content: 'You are a helpful, concise AI assistant.'
};

const SESSION_TTL = 30 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Remove expired sessions periodically
function cleanupSessions() {
  const now = Date.now();

  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

const cleanupInterval = setInterval(cleanupSessions, 60 * 1000);
cleanupInterval.unref();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    model: MODEL,
    activeSessions: sessions.size
  });
});

// Create a new chat session
app.post('/api/sessions', (req, res) => {
  cleanupSessions();

  const sessionId = randomUUID();

  sessions.set(sessionId, {
    messages: [SYSTEM_PROMPT],
    lastActivity: Date.now(),
    isProcessing: false
  });

  res.status(201).json({ sessionId });
});

// Delete a chat session
app.delete('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!sessions.has(sessionId)) {
    return res.status(404).json({
      error: 'Session not found'
    });
  }

  sessions.delete(sessionId);

  return res.json({
    status: 'cleared'
  });
});

// Send a chat message
app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (typeof sessionId !== 'string') {
    return res.status(400).json({
      error: 'Session ID is required'
    });
  }

  if (
    typeof message !== 'string' ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return res.status(400).json({
      error: 'Message must contain 1-4000 characters'
    });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      error: 'Session not found. Please start a new chat.'
    });
  }

  if (session.isProcessing) {
    return res.status(409).json({
      error: 'A response is already being generated for this session.'
    });
  }

  session.isProcessing = true;

  const userMessage = {
    role: 'user',
    content: message.trim()
  };

  // Preserve history if the model request fails
  const previousMessages = [...session.messages];

  try {
    const messages = [
      ...session.messages,
      userMessage
    ];

    const response = await ollama.chat({
      model: MODEL,
      messages
    });

    const reply = response?.message?.content;

    if (typeof reply !== 'string' || !reply.trim()) {
      throw new Error('Ollama returned an empty response');
    }

    session.messages = [
      SYSTEM_PROMPT,
      ...messages.slice(1).slice(-(MAX_MESSAGES - 1)),
      {
        role: 'assistant',
        content: reply
      }
    ];

    session.lastActivity = Date.now();

    return res.json({ reply });

  } catch (error) {
    session.messages = previousMessages;

    console.error('Ollama error:', error.message);

    return res.status(502).json({
      error: 'Unable to generate response. Check whether Ollama is running and the model is installed.'
    });

  } finally {
    session.isProcessing = false;
  }
});

// Handle malformed JSON and oversized requests
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body is too large'
    });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON'
    });
  }

  console.error(err);

  return res.status(500).json({
    error: 'Internal server error'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Chatbot running on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
});
