
const chatbox = document.getElementById('chatbox');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');

const STORAGE_KEY = 'llama_chat_history';
const SESSION_KEY = 'chatSessionId';

let isSending = false;
let sessionId = sessionStorage.getItem(SESSION_KEY);

const WELCOME_HTML = `
  <div id="welcome" class="m-auto text-center max-w-sm px-4">
    <div class="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-800 flex items-center justify-center text-xl mx-auto mb-4">
      ✦
    </div>
    <h2 class="text-xl font-semibold tracking-tight text-zinc-900 mb-2">How can I help today?</h2>
    <p class="text-xs text-zinc-500 leading-relaxed mb-6">
      Running locally with zero external API keys. Ask a question, write code, or brainstorm ideas.
    </p>
    <div class="flex flex-wrap justify-center gap-2">
      <button
        data-prompt="Explain how Transformers work simply"
        class="starter-btn text-xs text-zinc-600 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 px-3 py-1.5 rounded-full transition cursor-pointer"
      >
        Explain Transformers
      </button>
      <button
        data-prompt="Write a clean Express.js REST API example"
        class="starter-btn text-xs text-zinc-600 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 px-3 py-1.5 rounded-full transition cursor-pointer"
      >
        Express API snippet
      </button>
    </div>
  </div>
`;

// Initialize a server-side chat session
async function initializeSession() {
  if (sessionId) return;

  const response = await fetch('/api/sessions', {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error('Unable to initialize chat session');
  }

  const data = await response.json();

  if (!data.sessionId) {
    throw new Error('Server did not return a session ID');
  }

  sessionId = data.sessionId;
  sessionStorage.setItem(SESSION_KEY, sessionId);
}

// Parse Markdown safely
function parseMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text));
  }

  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// Add Copy buttons to code blocks
function attachCopyButtons(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return;

    const btn = document.createElement('button');

    btn.className =
      'copy-btn absolute top-2.5 right-2.5 bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 text-[11px] px-2 py-1 rounded-md transition cursor-pointer';

    btn.textContent = 'Copy';

    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText;

      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy'), 1500);
      } catch {
        btn.textContent = 'Copy failed';
        setTimeout(() => (btn.textContent = 'Copy'), 1500);
      }
    });

    pre.appendChild(btn);
  });
}

// Create user or assistant message
function createMessageElement(role, content) {
  if (role === 'user') {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex justify-end';

    const bubble = document.createElement('div');

    bubble.className =
      'max-w-[82%] bg-zinc-900 text-white text-sm px-4 py-3 rounded-2xl rounded-br-sm whitespace-pre-wrap break-words leading-relaxed shadow-xs';

    bubble.textContent = content;

    wrapper.appendChild(bubble);

    return wrapper;
  }

  const wrapper = document.createElement('div');

  wrapper.className = 'flex items-start gap-3 max-w-[92%]';

  wrapper.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-zinc-100 border border-zinc-200/80 text-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
      ✦
    </div>
    <div class="markdown-body text-sm text-zinc-800 leading-relaxed break-words flex-1 min-w-0">
      ${parseMarkdown(content)}
    </div>
  `;

  attachCopyButtons(wrapper);

  return wrapper;
}

// Persist last 60 messages
function saveToStorage(role, content) {
  try {
    const history = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );

    history.push({ role, content });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history.slice(-60))
    );
  } catch (error) {
    console.error('Unable to save chat history:', error);
  }
}

// Restore messages after refresh
function restoreHistory() {
  try {
    const history = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );

    if (!Array.isArray(history) || history.length === 0) return;

    const fragment = document.createDocumentFragment();

    history.forEach((msg) => {
      if (
        !msg ||
        !['user', 'assistant'].includes(msg.role) ||
        typeof msg.content !== 'string'
      ) {
        return;
      }

      fragment.appendChild(
        createMessageElement(msg.role, msg.content)
      );
    });

    document.getElementById('welcome')?.remove();

    chatbox.appendChild(fragment);

    chatbox.scrollTop = chatbox.scrollHeight;
  } catch (error) {
    console.error('Unable to restore chat history:', error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Create typing indicator
function createTypingIndicator() {
  const wrapper = document.createElement('div');

  wrapper.className = 'flex items-start gap-3 max-w-[92%]';

  wrapper.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-zinc-100 border border-zinc-200/80 text-zinc-700 flex items-center justify-center text-xs shrink-0 mt-0.5">
      ✦
    </div>
    <div class="markdown-body text-sm text-zinc-800 leading-relaxed break-words flex-1 min-w-0 py-1.5">
      <div class="flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
        <span class="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.15s]"></span>
        <span class="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.3s]"></span>
      </div>
    </div>
  `;

  return wrapper;
}

// Send message to backend
async function sendMessage() {
  const text = input.value.trim();

  if (!text || isSending) return;

  isSending = true;
  sendBtn.disabled = true;

  document.getElementById('welcome')?.remove();

  const userMessage = createMessageElement('user', text);

  chatbox.appendChild(userMessage);

  saveToStorage('user', text);

  input.value = '';
  input.style.height = 'auto';

  chatbox.scrollTop = chatbox.scrollHeight;

  const botWrapper = createTypingIndicator();

  chatbox.appendChild(botWrapper);

  chatbox.scrollTop = chatbox.scrollHeight;

  try {
    // Ensure a session exists
    await initializeSession();

    // Send message to the new backend
    const res = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    const reply = data.reply;

    if (typeof reply !== 'string') {
      throw new Error('Invalid response from server');
    }

    // Render assistant response
    const contentDiv = botWrapper.querySelector('.markdown-body');

    contentDiv.innerHTML = parseMarkdown(reply);

    attachCopyButtons(botWrapper);

    saveToStorage('assistant', reply);

  } catch (error) {
    console.error('Chat error:', error);

    const contentDiv = botWrapper.querySelector('.markdown-body');

    contentDiv.innerHTML = '';

    const errorMessage = document.createElement('p');

    errorMessage.className = 'text-red-500';
    errorMessage.textContent = error.message || 'Unable to connect to the server.';

    contentDiv.appendChild(errorMessage);

  } finally {
    isSending = false;
    sendBtn.disabled = false;

    chatbox.scrollTop = chatbox.scrollHeight;

    input.focus();
  }
}

// Start a new chat
async function clearChat() {
  if (isSending) return;

  clearBtn.disabled = true;

  try {
    if (sessionId) {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok) {
        throw new Error('Unable to clear server session');
      }
    }

    // Clear browser-side data
    localStorage.removeItem(STORAGE_KEY);

    sessionStorage.removeItem(SESSION_KEY);

    sessionId = null;

    // Reset UI
    chatbox.innerHTML = WELCOME_HTML;

  } catch (error) {
    console.error('Clear chat error:', error);
    alert('Unable to start a new chat. Please try again.');

  } finally {
    clearBtn.disabled = false;
  }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

clearBtn.addEventListener('click', clearChat);

// Starter prompts
chatbox.addEventListener('click', (event) => {
  const btn = event.target.closest('.starter-btn');

  if (!btn) return;

  input.value = btn.dataset.prompt;

  sendMessage();
});

// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';

  input.style.height =
    Math.min(input.scrollHeight, 128) + 'px';
});

// Enter to send, Shift + Enter for newline
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();

    sendMessage();
  }
});

// Restore chat history when page loads
window.addEventListener('DOMContentLoaded', restoreHistory);
