/* Bikanervala FoodBot frontend — session-aware MVP */
const chatbox=document.getElementById('chatbox');
const input=document.getElementById('input');
const sendBtn=document.getElementById('sendBtn');
const clearBtn=document.getElementById('clearBtn');
const composerForm=document.getElementById('composerForm');
const STORAGE_KEY='llama_chat_history';
const SESSION_KEY='chatSessionId';
let sessionId=sessionStorage.getItem(SESSION_KEY);
let isSending=false;

const WELCOME_HTML=`
<section id="welcome" class="welcome-panel">
  <div class="welcome-kicker"><i></i> ROYAL RASOI &amp; MITHAI BHANDAR</div>
  <h1>Namaste! What are you<br class="desktop-break" /> craving today?</h1>
  <p class="welcome-copy">Discover traditional Indian sweets, delicious snacks, and satisfying meals. Let FoodBot help you find something you'll enjoy.</p>
  <div class="category-grid" aria-label="Explore food categories">
    <button class="category-card starter-btn" type="button" data-prompt="Show me some traditional Indian sweets."><span class="category-icon material-symbols-outlined">bakery_dining</span><span class="category-heading">Sweets <em>Mithai</em></span><span class="category-description">Traditional artisan confections</span></button>
    <button class="category-card starter-btn" type="button" data-prompt="Suggest some tasty Indian snacks."><span class="category-icon material-symbols-outlined">cookie</span><span class="category-heading">Snacks <em>Namkeen</em></span><span class="category-description">Savoury bites &amp; tea favourites</span></button>
    <button class="category-card starter-btn" type="button" data-prompt="I want to explore some Indian chaat."><span class="category-icon material-symbols-outlined">ramen_dining</span><span class="category-heading">Chaat <em>Chatpati</em></span><span class="category-description">Tangy street-food favourites</span></button>
    <button class="category-card starter-btn" type="button" data-prompt="Recommend a satisfying Indian meal."><span class="category-icon material-symbols-outlined">dinner_dining</span><span class="category-heading">Meals <em>Thali</em></span><span class="category-description">Wholesome, hearty choices</span></button>
  </div>
  <button class="recommend-link starter-btn" type="button" data-prompt="Recommend something delicious based on my taste."><span>Not sure what to choose?</span><strong>Recommend something for me <span>→</span></strong></button>
</section>`;

async function initializeSession(forceNew=false){
  if(sessionId&&!forceNew)return;
  const response=await fetch('/api/sessions',{method:'POST'});
  if(!response.ok)throw new Error('Unable to initialize chat session.');
  const data=await response.json();
  if(!data.sessionId)throw new Error('Server did not return a session ID.');
  sessionId=data.sessionId;sessionStorage.setItem(SESSION_KEY,sessionId);
}
function parseMarkdown(text){
  if(window.marked&&window.DOMPurify)return window.DOMPurify.sanitize(window.marked.parse(text));
  const node=document.createElement('div');node.textContent=text;return node.innerHTML.replace(/\n/g,'<br>');
}
function saveToStorage(role,content){
  try{const history=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');history.push({role,content});localStorage.setItem(STORAGE_KEY,JSON.stringify(history.slice(-60)));}
  catch(error){console.error('Unable to save chat history:',error);}
}
function attachCopyButtons(container){
  container.querySelectorAll('pre').forEach(pre=>{
    if(pre.querySelector('.copy-btn'))return;
    const button=document.createElement('button');button.className='copy-btn';button.type='button';button.textContent='Copy';
    button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(pre.querySelector('code')?.innerText||pre.innerText);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1300);}catch{button.textContent='Copy failed';}});
    pre.appendChild(button);
  });
}
function createMessageElement(role,content){
  const row=document.createElement('div');row.className=`message-row ${role==='user'?'user-row':'assistant-row'}`;
  if(role==='user'){const bubble=document.createElement('div');bubble.className='user-message';bubble.textContent=content;row.appendChild(bubble);return row;}
  const avatar=document.createElement('div');avatar.className='assistant-avatar';avatar.textContent='B';
  const bubble=document.createElement('div');bubble.className='assistant-message markdown-body';bubble.innerHTML=parseMarkdown(content);
  row.append(avatar,bubble);attachCopyButtons(row);return row;
}
function createTypingIndicator(){
  const row=document.createElement('div');row.className='message-row assistant-row';
  const avatar=document.createElement('div');avatar.className='assistant-avatar';avatar.textContent='B';
  const indicator=document.createElement('div');indicator.className='assistant-message typing-indicator';
  indicator.innerHTML='<span>FoodBot is thinking</span><span class="typing-dots"><i></i><i></i><i></i></span>';
  row.append(avatar,indicator);return row;
}
function restoreHistory(){
  try{
    const history=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    if(!Array.isArray(history)||!history.length)return;
    document.getElementById('welcome')?.remove();
    history.forEach(item=>{if(item&&['user','assistant'].includes(item.role)&&typeof item.content==='string')chatbox.appendChild(createMessageElement(item.role,item.content));});
    chatbox.scrollTop=chatbox.scrollHeight;
  }catch(error){console.error('Unable to restore chat history:',error);localStorage.removeItem(STORAGE_KEY);}
}
async function sendMessage(){
  const message=input.value.trim();if(!message||isSending)return;
  isSending=true;sendBtn.disabled=true;document.getElementById('welcome')?.remove();
  chatbox.appendChild(createMessageElement('user',message));saveToStorage('user',message);
  input.value='';input.style.height='auto';
  const pending=createTypingIndicator();chatbox.appendChild(pending);chatbox.scrollTop=chatbox.scrollHeight;
  try{
    await initializeSession();
    let response=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sessionId})});
    if(response.status===404){sessionStorage.removeItem(SESSION_KEY);sessionId=null;await initializeSession(true);response=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sessionId})});}
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed.');
    if(typeof data.reply!=='string')throw new Error('Invalid response from server.');
    pending.replaceWith(createMessageElement('assistant',data.reply));saveToStorage('assistant',data.reply);
  }catch(error){console.error('Chat error:',error);const bubble=pending.querySelector('.typing-indicator');if(bubble){bubble.classList.remove('typing-indicator');bubble.textContent=error.message||'Unable to connect to the server.';bubble.style.color='#a12626';}}
  finally{isSending=false;sendBtn.disabled=false;chatbox.scrollTop=chatbox.scrollHeight;input.focus();}
}
async function clearChat(){
  if(isSending)return;clearBtn.disabled=true;
  try{
    if(sessionId){const response=await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`,{method:'DELETE'});if(!response.ok&&response.status!==404)throw new Error('Unable to clear server session.');}
    localStorage.removeItem(STORAGE_KEY);sessionStorage.removeItem(SESSION_KEY);sessionId=null;chatbox.innerHTML=WELCOME_HTML;chatbox.scrollTop=0;
  }catch(error){console.error('Clear chat error:',error);alert('Unable to start a new chat. Please try again.');}
  finally{clearBtn.disabled=false;}
}
composerForm.addEventListener('submit',event=>{event.preventDefault();sendMessage();});
clearBtn.addEventListener('click',clearChat);
chatbox.addEventListener('click',event=>{const button=event.target.closest('.starter-btn');if(!button||isSending)return;input.value=button.dataset.prompt||'';sendMessage();});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,120)+'px';});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}});
restoreHistory();
