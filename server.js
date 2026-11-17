import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

import { generateFoodReply } from "./src/ai/food-assistant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.OLLAMA_MODEL || "llama3.2";

const sessions = new Map();

const SESSION_TTL = 30 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Remove expired sessions periodically.
function cleanupSessions() {
  const now = Date.now();

  for (const [sessionId, session] of sessions) {
    if (now - session.lastActivity > SESSION_TTL) {
      sessions.delete(sessionId);
    }
  }
}

const cleanupInterval = setInterval(cleanupSessions, 60 * 1000);
cleanupInterval.unref();

// Health check.
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: MODEL,
    activeSessions: sessions.size
  });
});

// Create a new conversation session.
app.post("/api/sessions", (req, res) => {
  cleanupSessions();

  const sessionId = randomUUID();

  sessions.set(sessionId, {
    history: [],
    lastActivity: Date.now(),
    isProcessing: false
  });

  return res.status(201).json({ sessionId });
});

// Delete a conversation session.
app.delete("/api/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: "Session not found" });
  }

  sessions.delete(sessionId);

  return res.json({ status: "cleared" });
});

// Generate a food-discovery response.
app.post("/chat", async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return res.status(400).json({
      error: "Message must contain 1-4000 characters"
    });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      error: "Session not found. Please start a new chat."
    });
  }

  if (session.isProcessing) {
    return res.status(409).json({
      error: "A response is already being generated for this session."
    });
  }

  session.isProcessing = true;
  const cleanMessage = message.trim();

  try {
    const reply = await generateFoodReply({
      message: cleanMessage,
      history: session.history
    });

    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("The model returned an empty response.");
    }

    // Commit both messages only after successful generation.
    session.history = [
      ...session.history,
      { role: "user", content: cleanMessage },
      { role: "assistant", content: reply }
    ].slice(-MAX_MESSAGES);

    session.lastActivity = Date.now();

    return res.json({ reply });
  } catch (error) {
    console.error("Food assistant error:", error);

    return res.status(502).json({
      error:
        "Unable to generate a response. Check that Ollama is running, the model is installed, and the configured Ollama URL is reachable."
    });
  } finally {
    session.isProcessing = false;
  }
});

// Handle malformed JSON and oversized request bodies.
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  console.error("Unhandled server error:", err);

  return res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FoodBot server running on port ${PORT}`);
  console.log(`LangChain model: ${MODEL}`);
  console.log(`Ollama URL: ${process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}`);
});
