
/* ==========================================
   BIKANERVALA FOODBOT — FRONTEND
========================================== */

// DOM elements
const chatbox = document.getElementById('chatbox');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');

// Storage keys
const STORAGE_KEY = 'llama_chat_history';
const SESSION_KEY = 'chatSessionId';

let isSending = false;
let sessionId = sessionStorage.getItem(SESSION_KEY);


/* ==========================================
   WELCOME SCREEN
========================================== */

const WELCOME_HTML = `
  <div id="welcome" class="welcome-panel m-auto w-full max-w-2xl text-center">

    <div class="welcome-emblem mx-auto mb-5">
      <span>✦</span>
    </div>

    <p class="eyebrow mb-3">NAMASTE & WELCOME</p>

    <h2 class="welcome-title mb-3">
      What are you craving <span>today?</span>
    </h2>

    <p class="text-sm sm:text-base text-stone-500 leading-relaxed max-w-lg mx-auto">
      From traditional Indian sweets to delicious snacks and meals,
      let us help you find your next favourite.
    </p>

    <div class="mt-8 text-left">

      <p class="text-xs font-semibold tracking-widest text-stone-400 uppercase mb-3">
        Explore by category
      </p>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">

        <button class="category-card starter-btn"
          data-prompt="Show me some traditional Indian sweets.">
          <span class="category-icon">🍬</span>
          <span class="category-name">Sweets</span>
          <span class="category-description">Traditional delights</span>
        </button>

        <button class="category-card starter-btn"
          data-prompt="Suggest some tasty Indian snacks.">
          <span class="category-icon">🥨</span>
          <span class="category-name">Snacks</span>
          <span class="category-description">Quick bites</span>
        </button>

        <button class="category-card starter-btn"
          data-prompt="I want to explore some Indian chaat.">
          <span class="category-icon">🥣</span>
          <span class="category-name">Chaat</span>
          <span class="category-description">Tangy favourites</span>
        </button>

        <button class="category-card starter-btn"
          data-prompt="Recommend a satisfying Indian meal.">
          <span class="category-icon">🍛</span>
          <span class="category-name">Meals</span>
          <span class="category-description">Hearty choices</span>
        </button>

      </div>
    </div>

    <div class="suggestion-strip mt-6">
      <span class="text-xs text-stone-500">
        Not sure what to choose?
      </span>

      <button class="starter-btn suggestion-link"
        data-prompt="Recommend something delicious based on my taste.">
        Recommend something for me <span>→</span>
      </button>
    </div>

  </div>
`;


/* ==========================================
   SESSION MANAGEMENT
========================================== */

async function initializeSession(forceNew = false) {

  if (sessionId && !forceNew) {
    return;
  }

  const response = await fetch('/api/sessions', {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error('Unable to initialize chat session.');
  }

  const data = await response.json();

  if (!data.sessionId) {
    throw new Error('Server did not return a session ID.');
  }

  sessionId = data.sessionId;

  sessionStorage.setItem(SESSION_KEY, sessionId);
}


/* ==========================================
   MARKDOWN RENDERING
========================================== */

function parseMarkdown(text) {

  if (window.marked && window.DOMPurify) {

    const html = window.marked.parse(text);

    return window.DOMPurify.sanitize(html);
  }

  const div = document.createElement('div');

  div.textContent = text;

  return div.innerHTML.replace(/\n/g, '<br>');
}


/* ==========================================
   CODE COPY BUTTONS
========================================== */

function attachCopyButtons(container) {

  container.querySelectorAll('pre').forEach((pre) => {

    if (pre.querySelector('.copy-btn')) {
      return;
    }

    const btn = document.createElement('button');

    btn.className =
      'copy-btn absolute top-2.5 right-2.5 bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 text-[11px] px-2 py-1 rounded-md transition cursor-pointer';

    btn.textContent = 'Copy';

    btn.addEventListener('click', async () => {

      const code =
        pre.querySelector('code')?.innerText || pre.innerText;

      try {

        await navigator.clipboard.writeText(code);

        btn.textContent = 'Copied!';

        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1500);

      } catch (error) {

        console.error('Copy failed:', error);

        btn.textContent = 'Copy failed';

        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1500);
      }
    });

    pre.appendChild(btn);

  });
}


/* ==========================================
   MESSAGE CREATION
========================================== */

function createMessageElement(role, content) {

  // User message
  if (role === 'user') {

    const wrapper = document.createElement('div');

    wrapper.className = 'flex justify-end';

    const bubble = document.createElement('div');

    bubble.className = 'user-message';

    bubble.textContent = content;

    wrapper.appendChild(bubble);

    return wrapper;
  }

  // Assistant message
  const wrapper = document.createElement('div');

  wrapper.className = 'flex items-start gap-3 max-w-[95%]';

  const avatar = document.createElement('div');

  avatar.className = 'assistant-avatar';

  avatar.textContent = 'B';

  const message = document.createElement('div');

  message.className = 'assistant-message markdown-body flex-1';

  message.innerHTML = parseMarkdown(content);

  wrapper.appendChild(avatar);

  wrapper.appendChild(message);

  attachCopyButtons(wrapper);

  return wrapper;
}


/* ==========================================
   CHAT HISTORY STORAGE
========================================== */

function saveToStorage(role, content) {

  try {

    const history = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );

    history.push({
      role,
      content
    });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(history.slice(-60))
    );

  } catch (error) {

    console.error('Unable to save chat history:', error);
  }
}


/* ==========================================
   RESTORE CHAT HISTORY
========================================== */

function restoreHistory() {

  try {

    const history = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || '[]'
    );

    if (!Array.isArray(history) || history.length === 0) {
      return;
    }

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


/* ==========================================
   TYPING INDICATOR
========================================== */

function createTypingIndicator() {

  const wrapper = document.createElement('div');

  wrapper.className = 'flex items-start gap-3 max-w-[95%]';

  wrapper.innerHTML = `
    <div class="assistant-avatar">B</div>

    <div class="assistant-message markdown-body py-2">

      <div class="flex items-center gap-2 text-xs text-stone-400">

        <span>Finding something delicious</span>

        <span class="flex gap-1">

          <span class="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce"></span>

          <span class="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce [animation-delay:0.15s]"></span>

          <span class="w-1.5 h-1.5 rounded-full bg-amber-600 animate-bounce [animation-delay:0.3s]"></span>

        </span>

      </div>

    </div>
  `;

  return wrapper;
}


/* ==========================================
   SEND MESSAGE
========================================== */

async function sendMessage() {

  const text = input.value.trim();

  if (!text || isSending) {
    return;
  }

  isSending = true;

  sendBtn.disabled = true;

  document.getElementById('welcome')?.remove();

  // Display user message
  const userMessage = createMessageElement('user', text);

  chatbox.appendChild(userMessage);

  saveToStorage('user', text);

  input.value = '';

  input.style.height = 'auto';

  chatbox.scrollTop = chatbox.scrollHeight;

  // Display typing indicator
  const botWrapper = createTypingIndicator();

  chatbox.appendChild(botWrapper);

  chatbox.scrollTop = chatbox.scrollHeight;

  try {

    await initializeSession();

    const requestBody = {
      message: text,
      sessionId
    };

    let res = await fetch('/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    // Recover once if the server-side session has expired
    if (res.status === 404) {

      sessionStorage.removeItem(SESSION_KEY);

      sessionId = null;

      await initializeSession(true);

      res = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          sessionId
        })
      });
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Request failed.');
    }

    if (typeof data.reply !== 'string') {
      throw new Error('Invalid response from server.');
    }

    // Render assistant response
    const contentDiv = botWrapper.querySelector('.markdown-body');

    contentDiv.innerHTML = parseMarkdown(data.reply);

    attachCopyButtons(botWrapper);

    saveToStorage('assistant', data.reply);

  } catch (error) {

    console.error('Chat error:', error);

    const contentDiv = botWrapper.querySelector('.markdown-body');

    contentDiv.textContent =
      error.message || 'Unable to connect to the server.';

    contentDiv.classList.add('text-red-600');

  } finally {

    isSending = false;

    sendBtn.disabled = false;

    chatbox.scrollTop = chatbox.scrollHeight;

    input.focus();
  }
}


/* ==========================================
   NEW CHAT
========================================== */

async function clearChat() {

  if (isSending) {
    return;
  }

  clearBtn.disabled = true;

  try {

    if (sessionId) {

      const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE'
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error('Unable to clear server session.');
      }
    }

    // Clear browser storage
    localStorage.removeItem(STORAGE_KEY);

    sessionStorage.removeItem(SESSION_KEY);

    sessionId = null;

    // Restore welcome screen
    chatbox.innerHTML = WELCOME_HTML;

  } catch (error) {

    console.error('Clear chat error:', error);

    alert('Unable to start a new chat. Please try again.');

  } finally {

    clearBtn.disabled = false;
  }
}


/* ==========================================
   EVENT LISTENERS
========================================== */

// Send button
sendBtn.addEventListener('click', sendMessage);

// New chat button
clearBtn.addEventListener('click', clearChat);


// Starter prompts
chatbox.addEventListener('click', (event) => {

  const btn = event.target.closest('.starter-btn');

  if (!btn || isSending) {
    return;
  }

  input.value = btn.dataset.prompt || '';

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


// Restore history on page load
restoreHistory();
