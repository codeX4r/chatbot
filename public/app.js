const chatbox = document.getElementById('chatbox');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');

const STORAGE_KEY = 'llama_chat_history';
let isSending = false;

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

// Parse Markdown safely
function parseMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text));
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// Add "Copy" button to every <pre> code block
function attachCopyButtons(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn absolute top-2.5 right-2.5 bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 text-[11px] px-2 py-1 rounded-md transition cursor-pointer';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText;
      navigator.clipboard.writeText(code);
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
    pre.appendChild(btn);
  });
}

// Build a user or assistant message bubble
function createMessageElement(role, content) {
  if (role === 'user') {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex justify-end';
    const bubble = document.createElement('div');
    bubble.className = 'max-w-[82%] bg-zinc-900 text-white text-sm px-4 py-3 rounded-2xl rounded-br-sm whitespace-pre-wrap break-words leading-relaxed shadow-xs';
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

// Persist messages in localStorage (last 60 messages)
function saveToStorage(role, content) {
  const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  history.push({ role, content });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-60)));
}

// Restore saved messages on page refresh
function restoreHistory() {
  const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (history.length === 0) return;

  const fragment = document.createDocumentFragment();
  history.forEach((msg) => {
    fragment.appendChild(createMessageElement(msg.role, msg.content));
  });

  document.getElementById('welcome')?.remove();
  chatbox.appendChild(fragment);
  chatbox.scrollTop = chatbox.scrollHeight;
}

// Send user message to backend
async function sendMessage() {
  const text = input.value.trim();
  if (!text || isSending) return;

  isSending = true;
  sendBtn.disabled = true;
  document.getElementById('welcome')?.remove();

  // 1. Render and save user message
  chatbox.appendChild(createMessageElement('user', text));
  saveToStorage('user', text);

  input.value = '';
  input.style.height = 'auto';
  chatbox.scrollTop = chatbox.scrollHeight;

  // 2. Show typing indicator
  const botWrapper = document.createElement('div');
  botWrapper.className = 'flex items-start gap-3 max-w-[92%]';
  botWrapper.innerHTML = `
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
  chatbox.appendChild(botWrapper);
  chatbox.scrollTop = chatbox.scrollHeight;

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    const reply = data.reply || data.error || 'No response received.';

    // 3. Render Markdown, attach copy buttons, and save
    const contentDiv = botWrapper.querySelector('.markdown-body');
    contentDiv.innerHTML = parseMarkdown(reply);
    attachCopyButtons(botWrapper);
    saveToStorage('assistant', reply);
  } catch (err) {
    botWrapper.querySelector('.markdown-body').innerHTML =
      '<p class="text-red-500">Error connecting to server. Make sure <code>node server.js</code> is running.</p>';
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    chatbox.scrollTop = chatbox.scrollHeight;
    input.focus();
  }
}

// Clear chat history from browser and server
async function clearChat() {
  localStorage.removeItem(STORAGE_KEY);
  try {
    await fetch('/reset', { method: 'POST' });
  } catch (e) {}

  chatbox.innerHTML = WELCOME_HTML;
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);
clearBtn.addEventListener('click', clearChat);

chatbox.addEventListener('click', (e) => {
  const btn = e.target.closest('.starter-btn');
  if (btn) {
    input.value = btn.dataset.prompt;
    sendMessage();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 128) + 'px';
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

window.addEventListener('DOMContentLoaded', restoreHistory);
