import express from 'express';
import ollama from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const systemPrompt = { role: 'system', content: 'You are a helpful, concise AI assistant.' };
let chatHistory = [systemPrompt];

// 1. Send existing chat history when the page reloads
app.get('/history', (req, res) => {
  // Exclude the hidden system prompt from the UI
  res.json({ history: chatHistory.filter((msg) => msg.role !== 'system') });
});

// 2. Clear chat history
app.post('/reset', (req, res) => {
  chatHistory = [systemPrompt];
  res.json({ status: 'cleared' });
});

app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    chatHistory.push({ role: 'user', content: userMessage });

    const response = await ollama.chat({
      model: 'llama3.2',
      messages: chatHistory,
    });

    const botReply = response.message.content;
    chatHistory.push({ role: 'assistant', content: botReply });

    res.json({ reply: botReply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Make sure "ollama serve" is running in your terminal.' });
  }
});

app.listen(3000, () => {
  console.log('Local Llama 3.2 Chatbot running on http://localhost:3000');
});
