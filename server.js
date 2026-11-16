import express from 'express';
import ollama from 'ollama';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Store conversation history in memory
const chatHistory = [
  { role: 'system', content: 'You are a helpful, concise AI assistant.' }
];

app.post('/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    chatHistory.push({ role: 'user', content: userMessage });

    // Talk directly to the local Ollama model (no API key needed)
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
  console.log('Keyless AI Chatbot running on http://localhost:3000');
});
