/* ─── NITT Connect — Frontend ────────────────────────────────────────────────── */

// ── State ──────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentTag  = 'all';
let currentSort = 'recent';
let searchQ     = '';
let rounds      = [''];
let postTypeMode= 'question';

const TAGS = ['placements','interview-experience','academics','internships','hostel','cse','ece','eee','mechanical','civil','gate','higher-studies','resume'];
const AVATAR_COLORS = ['#2563eb','#7c3aed','#db2777','#d97706','#059669','#dc2626','#0891b2','#0d9488'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
function avatarColor(name) {
  const h = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function $id(id) { return document.getElementById(id); }

// ── Init ───────────────────────────────────────────────────────────────────────
(async function init() {
  await fetchCurrentUser();
  updateNav();
  route(window.location.hash || '#feed');
  window.addEventListener('hashchange', () => route(window.location.hash));
  setupLoginModal();
  setupFeedControls();
  setupNewPostForm();
})();

// ── Router ─────────────────────────────────────────────────────────────────────
function route(hash) {
  const [page, param] = hash.replace('#', '').split('/');
  if (page === 'post' && param) {
    showPage('pageDetail');
    loadDetail(param);
  } else if (page === 'new') {
    if (!currentUser) { showLoginModal(); window.location.hash = '#feed'; return; }
    showPage('pageNewPost');
    initNewPostForm(param || 'question');
  } else {
    showPage('pageFeed');
    loadFeed();
  }
}

function showPage(id) {
  ['pageFeed', 'pageDetail', 'pageNewPost'].forEach(p => $id(p).classList.add('hidden'));
  $id(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}

// ── Auth ───────────────────────────────────────────────────────────────────────
async function fetchCurrentUser() {
  try {
    const r = await fetch('/api/auth/me');
    const d = await r.json();
    currentUser = d.user || null;
  } catch { currentUser = null; }
}

function updateNav() {
  if (currentUser) {
    $id('navLoginBtn').classList.add('hidden');
    $id('userChip').classList.remove('hidden');

    const av = $id('navAvatar');
    av.textContent      = initials(currentUser.name);
    av.style.background = avatarColor(currentUser.name);

    $id('navName').textContent = currentUser.name;
    $id('navMeta').textContent = currentUser.branch + ' · Batch ' + currentUser.year;
  } else {
    $id('navLoginBtn').classList.remove('hidden');
    $id('userChip').classList.add('hidden');
  }
}

$id('navLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  updateNav();
  window.location.hash = '#feed';
  loadFeed();
});

$id('navLoginBtn').addEventListener('click', showLoginModal);
$id('homeLink').addEventListener('click', e => { e.preventDefault(); window.location.hash = '#feed'; });
$id('navHome').addEventListener('click',  e => { e.preventDefault(); window.location.hash = '#feed'; });

// ── Login Modal (3 steps: email → otp → profile) ───────────────────────────────
let pendingEmail = '';
let isNewUser    = false;

function showLoginModal()  { $id('loginModal').classList.remove('hidden'); showStep('stepEmail'); $id('emailInput').focus(); }
function closeLoginModal() { $id('loginModal').classList.add('hidden'); resetLoginModal(); }

function showStep(stepId) {
  ['stepEmail', 'stepOTP', 'stepProfile'].forEach(s => $id(s).classList.add('hidden'));
  $id(stepId).classList.remove('hidden');
}

function resetLoginModal() {
  $id('emailInput').value   = '';
  $id('otpInput').value     = '';
  $id('profileName').value  = '';
  $id('profileBranch').value= '';
  $id('profileYear').value  = '';
  $id('emailError').textContent   = '';
  $id('otpError').textContent     = '';
  $id('profileError').textContent = '';
  pendingEmail = '';
  isNewUser    = false;
}

function setupLoginModal() {
  [$id('closeLogin'), $id('closeLogin2')].forEach(btn => {
    btn.addEventListener('click', closeLoginModal);
  });
  $id('loginModal').addEventListener('click', e => {
    if (e.target === $id('loginModal')) closeLoginModal();
  });

  // Step 1: send OTP
  $id('sendOtpBtn').addEventListener('click', sendOTP);
  $id('emailInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendOTP(); });

  // Step 2: verify OTP
  $id('verifyOtpBtn').addEventListener('click', verifyOTP);
  $id('otpInput').addEventListener('keydown', e => { if (e.key === 'Enter') verifyOTP(); });
  $id('backToEmail').addEventListener('click', () => { showStep('stepEmail'); $id('otpError').textContent = ''; });

  // Step 3: save profile
  $id('saveProfileBtn').addEventListener('click', saveProfile);
}

async function sendOTP() {
  const email = $id('emailInput').value.trim().toLowerCase();
  $id('emailError').textContent = '';
  if (!email) { $id('emailError').textContent = 'Please enter your email.'; return; }

  const btn = $id('sendOtpBtn');
  btn.disabled = true; btn.textContent = 'Sending…';

  try {
    const r = await fetch('/api/auth/send-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const d = await r.json();
    if (!r.ok) { $id('emailError').textContent = d.error; return; }
    pendingEmail = email;
    $id('otpSentTo').textContent = email;
    showStep('stepOTP');
    $id('otpInput').focus();
  } catch {
    $id('emailError').textContent = 'Network error. Please try again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Send OTP';
  }
}

async function verifyOTP() {
  const code = $id('otpInput').value.trim();
  $id('otpError').textContent = '';
  if (!code) { $id('otpError').textContent = 'Please enter the OTP.'; return; }

  const btn = $id('verifyOtpBtn');
  btn.disabled = true; btn.textContent = 'Verifying…';

  try {
    const r = await fetch('/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, code })
    });
    const d = await r.json();
    if (!r.ok) { $id('otpError').textContent = d.error; return; }

    // If profile already complete, log in directly
    if (d.user && d.user.name && d.user.branch && d.user.year && d.profileComplete) {
      currentUser = d.user;
      updateNav();
      closeLoginModal();
      loadFeed();
    } else {
      // New user — show profile step
      isNewUser = true;
      // pre-fill name if we got something from email
      if (d.user && d.user.name) $id('profileName').value = d.user.name;
      showStep('stepProfile');
      $id('profileName').focus();
    }
  } catch {
    $id('otpError').textContent = 'Network error. Please try again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Verify OTP';
  }
}

async function saveProfile() {
  const name   = $id('profileName').value.trim();
  const branch = $id('profileBranch').value;
  const year   = $id('profileYear').value;
  $id('profileError').textContent = '';

  if (!name)   { $id('profileError').textContent = 'Please enter your full name.'; return; }
  if (!branch) { $id('profileError').textContent = 'Please select your branch.'; return; }
  if (!year)   { $id('profileError').textContent = 'Please select your batch year.'; return; }

  const btn = $id('saveProfileBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const r = await fetch('/api/auth/update-profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail, name, branch, year })
    });
    const d = await r.json();
    if (!r.ok) { $id('profileError').textContent = d.error; return; }
    currentUser = d.user;
    updateNav();
    closeLoginModal();
    loadFeed();
  } catch {
    $id('profileError').textContent = 'Network error. Please try again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Save & continue';
  }
}

// ── Feed ───────────────────────────────────────────────────────────────────────
function setupFeedControls() {
  $id('heroAskBtn').addEventListener('click', () => {
    if (!currentUser) { showLoginModal(); return; }
    window.location.hash = '#new/question';
  });
  $id('heroShareBtn').addEventListener('click', () => {
    if (!currentUser) { showLoginModal(); return; }
    window.location.hash = '#new/experience';
  });

  let searchTimer;
  $id('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchQ = e.target.value;
    searchTimer = setTimeout(loadFeed, 300);
  });

  $id('sortSelect').addEventListener('change', e => { currentSort = e.target.value; loadFeed(); });

  $id('tagBar').addEventListener('click', e => {
    const btn = e.target.closest('.tag-pill');
    if (!btn) return;
    document.querySelectorAll('.tag-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTag = btn.dataset.tag;
    loadFeed();
  });
}

async function loadFeed() {
  const list = $id('postsList');
  list.innerHTML = '<div class="loading-msg">Loading questions…</div>';

  const params = new URLSearchParams({ sort: currentSort });
  if (currentTag && currentTag !== 'all') params.set('tag', currentTag);
  if (searchQ) params.set('q', searchQ);

  try {
    const r     = await fetch('/api/posts?' + params);
    const posts = await r.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">📭</div>
          <h3>No posts yet</h3>
          <p>Be the first to ask a question or share an experience!</p>
        </div>`;
      return;
    }

    list.innerHTML = posts.map(renderCard).join('');

    list.querySelectorAll('.post-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.card-upvote-btn')) return;
        window.location.hash = '#post/' + card.dataset.id;
      });
    });
    list.querySelectorAll('.card-upvote-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); handleCardUpvote(btn); });
    });
  } catch (err) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>Failed to load</h3>
        <p>Server may be down. Check terminal.</p>
      </div>`;
  }
}

function authorLine(p) {
  // Shows: Name · Branch · Batch YYYY
  const name   = esc(p.authorName  || 'NITT Student');
  const branch = p.branch ? ' · ' + esc(p.branch) : '';
  const year   = p.year   ? ' · Batch ' + esc(p.year) : '';
  return name + branch + year;
}

function renderCard(p) {
  const badge = p.type === 'experience'
    ? '<span class="card-type-badge badge-experience">Experience</span>'
    : '<span class="card-type-badge badge-question">Question</span>';

  const companyLine = p.type === 'experience' && p.company
    ? `<span class="meta-item">🏢 ${esc(p.company)}${p.role ? ' · ' + esc(p.role) : ''}${p.ctc ? ' · ' + esc(p.ctc) : ''}</span>`
    : '';

  const tags = (p.tags || []).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');

  return `
  <div class="post-card" data-id="${esc(p.id)}">
    ${badge}
    <div class="card-title">${esc(p.title)}</div>
    <div class="card-meta">
      <span class="meta-item author-meta">
        <span class="author-avatar-sm" style="background:${avatarColor(p.authorName)}">${initials(p.authorName)}</span>
        ${authorLine(p)}
      </span>
      ${companyLine}
      <span class="meta-item muted">🕐 ${esc(p.timeAgo)}</span>
    </div>
    ${tags ? `<div class="card-tags-row">${tags}</div>` : ''}
    <div class="card-footer-row">
      <div class="card-stats">
        <button class="card-upvote-btn" data-id="${esc(p.id)}">
          <span class="stat upvote-stat ${p.hasUpvoted ? 'voted' : ''}">▲ ${p.upvotes} helpful</span>
        </button>
        <span class="stat">💬 ${p.answers} answers</span>
        <span class="stat">👁 ${p.views} views</span>
      </div>
    </div>
  </div>`;
}

async function handleCardUpvote(btn) {
  if (!currentUser) { showLoginModal(); return; }
  const id = btn.dataset.id;
  const r  = await fetch('/api/posts/' + id + '/upvote', { method: 'POST' });
  const d  = await r.json();
  if (!r.ok) return;
  const stat = btn.querySelector('.upvote-stat');
  stat.textContent = '▲ ' + d.upvotes + ' helpful';
  stat.classList.toggle('voted', d.hasUpvoted);
}

// ── Detail ─────────────────────────────────────────────────────────────────────
$id('backBtn').addEventListener('click', () => { window.location.hash = '#feed'; });

async function loadDetail(id) {
  const content = $id('detailContent');
  content.innerHTML = '<div class="loading-msg">Loading…</div>';

  try {
    const r = await fetch('/api/posts/' + id);
    if (!r.ok) { content.innerHTML = '<div class="empty-state"><div class="icon">😕</div><h3>Not found</h3></div>'; return; }
    const post = await r.json();
    content.innerHTML = renderDetail(post);
    attachDetailEvents(post);
  } catch {
    content.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Failed to load</h3></div>';
  }
}

function renderDetail(p) {
  const badge = p.type === 'experience'
    ? '<span class="card-type-badge badge-experience">Experience</span>'
    : '<span class="card-type-badge badge-question">Question</span>';

  const tags = (p.tags || []).map(t => `<span class="card-tag">${esc(t)}</span>`).join('');

  const expInfo = p.type === 'experience' ? `
    <div class="exp-info">
      ${p.company ? `<div class="exp-info-item"><label>Company</label><span>${esc(p.company)}</span></div>` : ''}
      ${p.role    ? `<div class="exp-info-item"><label>Role</label><span>${esc(p.role)}</span></div>` : ''}
      ${p.ctc     ? `<div class="exp-info-item"><label>Package</label><span>${esc(p.ctc)}</span></div>` : ''}
      ${p.mode    ? `<div class="exp-info-item"><label>Mode</label><span>${p.mode === 'oncampus' ? 'On-campus' : 'Off-campus'}</span></div>` : ''}
    </div>` : '';

  const roundsHtml = p.rounds && p.rounds.length ? `
    <div class="section-heading">Interview Rounds</div>
    <div class="rounds-list">
      ${p.rounds.map((r, i) => `
        <div class="round-item">
          <div class="round-num">${i + 1}</div>
          <div class="round-text">${esc(r)}</div>
        </div>`).join('')}
    </div>` : '';

  const resHtml = p.resources && p.resources.length ? `
    <div class="section-heading" style="margin-top:20px">Resources Used</div>
    <div class="resources-row">
      ${p.resources.map(r => `<span class="resource-chip">📎 ${esc(r)}</span>`).join('')}
    </div>` : '';

  const answers = p.answerList || [];
  const answersHtml = answers.length
    ? answers.map(a => renderAnswer(a)).join('')
    : '<p class="no-answers">No answers yet. Be the first to answer!</p>';

  const answerFormHtml = currentUser ? `
    <div class="answer-form">
      <h4>Your Answer</h4>
      <textarea id="answerInput" rows="4" placeholder="Write your answer…"></textarea>
      <p class="field-error" id="answerError"></p>
      <button class="btn-primary" id="submitAnswerBtn">Post Answer</button>
    </div>` : `
    <div class="answer-form">
      <p style="font-size:14px;color:var(--text-2)">
        <a href="javascript:void(0)" id="loginToAnswer">Sign in</a> to post an answer.
      </p>
    </div>`;

  return `
    <div class="detail-card">
      <div class="detail-type-badge">${badge}</div>
      <div class="detail-title">${esc(p.title)}</div>

      <!-- Author info block -->
      <div class="detail-author-block">
        <div class="detail-author-avatar" style="background:${avatarColor(p.authorName)}">${initials(p.authorName)}</div>
        <div class="detail-author-info">
          <div class="detail-author-name">${esc(p.authorName || 'NITT Student')}</div>
          <div class="detail-author-meta">
            ${p.branch ? esc(p.branch) : ''}
            ${p.year   ? ' · Batch ' + esc(p.year) : ''}
            <span class="muted"> · ${esc(p.timeAgo)}</span>
          </div>
        </div>
      </div>

      ${tags ? `<div class="detail-tags">${tags}</div>` : ''}
      ${expInfo}
      ${roundsHtml}
      <div class="detail-body">${esc(p.body)}</div>
      ${resHtml}

      <div class="detail-actions">
        <button class="upvote-btn ${p.hasUpvoted ? 'voted' : ''}" id="detailUpvoteBtn" data-id="${p.id}">
          ▲ <span id="upvoteCount">${p.upvotes}</span> helpful
        </button>
        <button class="share-btn" id="shareBtn">Share ↗</button>
      </div>
    </div>

    <div class="answers-section">
      <h3>${p.answers} Answer${p.answers !== 1 ? 's' : ''}</h3>
      <div id="answersList">${answersHtml}</div>
      ${answerFormHtml}
    </div>`;
}

function renderAnswer(a) {
  return `
    <div class="answer-card">
      <div class="answer-author">
        <div class="answer-avatar" style="background:${avatarColor(a.authorName)}">${initials(a.authorName)}</div>
        <div>
          <div class="answer-name">${esc(a.authorName || 'NITT Student')}</div>
          <div class="answer-meta">
            ${a.branch ? esc(a.branch) : ''}
            ${a.year   ? ' · Batch ' + esc(a.year) : ''}
            ${a.timeAgo ? ' · ' + esc(a.timeAgo) : ''}
          </div>
        </div>
      </div>
      <div class="answer-body">${esc(a.body)}</div>
    </div>`;
}

function attachDetailEvents(post) {
  const upvoteBtn = $id('detailUpvoteBtn');
  if (upvoteBtn) {
    upvoteBtn.addEventListener('click', async () => {
      if (!currentUser) { showLoginModal(); return; }
      const r = await fetch('/api/posts/' + post.id + '/upvote', { method: 'POST' });
      const d = await r.json();
      $id('upvoteCount').textContent = d.upvotes;
      upvoteBtn.classList.toggle('voted', d.hasUpvoted);
    });
  }

  const shareBtn = $id('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      navigator.clipboard && navigator.clipboard.writeText(window.location.href).then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => { shareBtn.textContent = 'Share ↗'; }, 2000);
      });
    });
  }

  const loginLink = $id('loginToAnswer');
  if (loginLink) loginLink.addEventListener('click', showLoginModal);

  const submitAnswerBtn = $id('submitAnswerBtn');
  if (submitAnswerBtn) {
    submitAnswerBtn.addEventListener('click', async () => {
      const body  = $id('answerInput').value.trim();
      const errEl = $id('answerError');
      errEl.textContent = '';
      if (!body || body.length < 5) { errEl.textContent = 'Answer is too short.'; return; }

      submitAnswerBtn.disabled = true; submitAnswerBtn.textContent = 'Posting…';

      const r = await fetch('/api/posts/' + post.id + '/answers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      });
      const d = await r.json();
      submitAnswerBtn.disabled = false; submitAnswerBtn.textContent = 'Post Answer';

      if (!r.ok) { errEl.textContent = d.error; return; }

      $id('answerInput').value = '';
      const list = $id('answersList');
      const empty = list.querySelector('.no-answers');
      if (empty) list.innerHTML = '';
      list.insertAdjacentHTML('beforeend', renderAnswer({ ...d.answer, timeAgo: 'just now' }));

      const heading = document.querySelector('.answers-section h3');
      if (heading) {
        const c = list.querySelectorAll('.answer-card').length;
        heading.textContent = c + ' Answer' + (c !== 1 ? 's' : '');
      }
    });
  }
}

// ── New Post Form ──────────────────────────────────────────────────────────────
function setupNewPostForm() {
  $id('backFromForm').addEventListener('click', () => { window.location.hash = '#feed'; });
  $id('fTitle').addEventListener('input', e => { $id('titleCount').textContent = e.target.value.length + ' / 150'; });
  $id('addRoundBtn').addEventListener('click', () => { rounds.push(''); renderRoundsUI(); });
  $id('submitPostBtn').addEventListener('click', submitPost);
}

function initNewPostForm(type) {
  postTypeMode = type;
  rounds       = [''];
  $id('formTitle').textContent  = type === 'experience' ? 'Share your experience' : 'Ask a question';
  $id('postType').value         = type;
  $id('fTitle').value           = '';
  $id('fBody').value            = '';
  $id('titleCount').textContent = '0 / 150';
  $id('formError').textContent  = '';

  if (type === 'experience') {
    $id('expFields').classList.remove('hidden');
    $id('fCompany').value  = '';
    $id('fRole').value     = '';
    $id('fCtc').value      = '';
    $id('fResources').value= '';
  } else {
    $id('expFields').classList.add('hidden');
  }

  renderRoundsUI();
  renderTagCheckboxes();
}

function renderRoundsUI() {
  const container = $id('roundsList');
  container.innerHTML = rounds.map((r, i) => `
    <div class="round-row">
      <div class="round-row-num">${i + 1}</div>
      <input type="text" value="${esc(r)}" data-idx="${i}" placeholder="e.g. Online Assessment — 3 DSA questions, 90 min" class="round-input">
    </div>`).join('');

  container.querySelectorAll('.round-input').forEach(inp => {
    inp.addEventListener('input', e => { rounds[parseInt(e.target.dataset.idx)] = e.target.value; });
  });
}

function renderTagCheckboxes() {
  const box = $id('tagCheckboxes');
  box.innerHTML = TAGS.map(tag => `
    <label class="tag-check-label" data-tag="${tag}">
      <input type="checkbox" value="${tag}" style="display:none"> ${tag}
    </label>`).join('');

  box.querySelectorAll('.tag-check-label').forEach(lbl => {
    lbl.querySelector('input').addEventListener('change', e => {
      lbl.classList.toggle('checked', e.target.checked);
    });
  });
}

async function submitPost() {
  const btn = $id('submitPostBtn');
  const err = $id('formError');
  err.textContent = '';

  const type      = $id('postType').value;
  const title     = $id('fTitle').value.trim();
  const body      = $id('fBody').value.trim();
  const company   = $id('fCompany')   ? $id('fCompany').value.trim()   : '';
  const role      = $id('fRole')      ? $id('fRole').value.trim()      : '';
  const ctc       = $id('fCtc')       ? $id('fCtc').value.trim()       : '';
  const mode      = $id('fMode')      ? $id('fMode').value             : '';
  const resStr    = $id('fResources') ? $id('fResources').value        : '';
  const resources = resStr.split(',').map(s => s.trim()).filter(Boolean);
  const validRounds = rounds.filter(r => r.trim());
  const tags = Array.from(document.querySelectorAll('#tagCheckboxes input:checked')).map(i => i.value);

  if (!title || title.length < 10)  { err.textContent = 'Title must be at least 10 characters.'; return; }
  if (!body  || body.length < 30)   { err.textContent = 'Body must be at least 30 characters.'; return; }
  if (type === 'experience' && !company) { err.textContent = 'Please enter the company name.'; return; }

  btn.disabled = true; btn.textContent = 'Posting…';

  try {
    const r = await fetch('/api/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, body, company, role, ctc, mode, rounds: validRounds, resources, tags })
    });
    const d = await r.json();
    if (!r.ok) { err.textContent = d.error; return; }
    window.location.hash = '#post/' + d.post.id;
  } catch {
    err.textContent = 'Network error. Please try again.';
  } finally {
    btn.disabled = false; btn.textContent = 'Post';
  }
}
