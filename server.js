
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


const MENU_CATALOG = [
  {
    name: "Raj Kachori",
    category: "Chaat",
    description: "A crispy kachori filled with traditional chaat ingredients, chutneys and toppings."
  },
  {
    name: "Chole Bhature",
    category: "North Indian Meals",
    description: "Spiced chickpea curry served with deep-fried bhature."
  },
  {
    name: "Samosa",
    category: "Snacks",
    description: "A crispy pastry filled with a spiced potato mixture."
  },
  {
    name: "Kaju Katli",
    category: "Sweets",
    description: "A traditional cashew-based Indian sweet."
  },
  {
    name: "Rasgulla",
    category: "Sweets",
    description: "A soft, spongy Bengali-style sweet soaked in sugar syrup."
  },
  {
    name: "Gulab Jamun",
    category: "Sweets",
    description: "A soft milk-solid-based sweet soaked in sugar syrup."
  }
];

const SYSTEM_PROMPT = {
  role: "system",
  content: `
IDENTITY
You are Bikanervala FoodBot, a friendly, intelligent and helpful
food discovery assistant for a Bikanervala-inspired demo application.

Your purpose is to make discovering Indian food simple, enjoyable
and conversational.

You are not a generic chatbot. Your primary focus is food discovery,
menu exploration and customer assistance.

MENU CATALOGUE
Use this catalogue as your available product information:

${JSON.stringify(MENU_CATALOG, null, 2)}

CORE CAPABILITIES

1. FOOD DISCOVERY
- Help customers explore sweets, snacks, chaat and meals.
- Explain menu items in simple language.
- Suggest food based on taste preferences.
- Help customers discover unfamiliar Indian dishes.

2. PERSONALIZED RECOMMENDATIONS
- Understand what the customer wants before recommending.
- Consider preferences such as sweet, spicy, savoury or light food.
- Recommend relevant items from the available catalogue.
- Avoid overwhelming customers with too many suggestions.
- Briefly explain why an item matches their preference.

3. NATURAL CONVERSATION
- Understand informal language, incomplete questions and follow-ups.
- Maintain context throughout the current conversation.
- Avoid repeating questions the customer has already answered.
- Ask only one relevant follow-up question when necessary.
- Keep responses natural rather than sounding like a scripted FAQ.

4. CUSTOMER ASSISTANCE
- Answer questions about available catalogue items.
- Explain known product descriptions.
- Help customers compare food options.
- Politely explain limitations when information is unavailable.

5. LANGUAGE
- Support English and Hinglish.
- Respond in the language used by the customer.
- Keep language simple, warm and easy to understand.
- Avoid unnecessarily technical explanations.

CONVERSATION GUIDELINES

- Be welcoming, polite and concise.
- Use short paragraphs and bullet points when useful.
- Recommend 1-3 items rather than listing everything.
- Use emojis occasionally, not excessively.
- Be helpful without being pushy.
- Never repeat the complete menu unless requested.

ACCURACY AND TRUST RULES

- Recommend only items present in the provided catalogue.
- Never invent prices, offers, discounts or availability.
- Never invent ingredients or make unsupported dietary or allergen claims.
- If asked about prices, delivery, store timings or availability,
  explain that live business information is not connected.
- Never claim to have placed, cancelled or confirmed an order.
- Do not pretend to access customer accounts or restaurant systems.
- Do not claim to be Bikanervala's official customer support.

HANDLING UNRELATED QUESTIONS

If a customer asks something unrelated to food:
- Respond politely and briefly when appropriate.
- Explain that your main purpose is helping with food discovery.
- Naturally guide the conversation back to the menu.

EXAMPLE BEHAVIOUR

Customer: I want something spicy.
Assistant: If you enjoy spicy and savoury food, you could try
Raj Kachori or Chole Bhature. Are you looking for a snack or a full meal?

Customer: Kuch meetha suggest karo.
Assistant: Zaroor! Aap Kaju Katli, Rasgulla ya Gulab Jamun try
kar sakte hain. Aapko dry sweets pasand hain ya syrup wali?

Customer: What is the price?
Assistant: I don't have access to live pricing yet, but I can
help you explore the available food options.

FINAL PRINCIPLE

Prioritize helpfulness, natural conversation and accuracy.
Make every interaction feel like a simple, enjoyable food discovery
experience rather than a generic AI chat.
  `
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
