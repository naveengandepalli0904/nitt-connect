require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const { OTP, Users, Posts } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ─── Email transporter ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DOMAIN  = process.env.ALLOWED_EMAIL_DOMAIN || 'nitt.edu';
const OTP_EXP = parseInt(process.env.OTP_EXPIRY_MINUTES || '10');

function genOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function isNITTEmail(email) { return typeof email === 'string' && email.trim().toLowerCase().endsWith('@' + DOMAIN); }

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function deriveName(email) {
  const local = email.split('@')[0].toLowerCase();
  const clean = local.replace(/^b\d+/, '').replace(/[^a-z]/g, ' ').trim();
  if (!clean) return 'NITT Student';
  return clean.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function deriveBranch(email) {
  const local = email.split('@')[0].toLowerCase();
  const m = local.match(/^b\d{2}([a-z]+)\d+/);
  if (!m) return 'CSE';
  const map = { cs:'CSE', ec:'ECE', ee:'EEE', me:'Mech', ce:'Civil', ch:'Chemical', mt:'Metallurgy', pr:'Production' };
  return map[m[1]] || m[1].toUpperCase();
}
function deriveYear(email) {
  const m = email.split('@')[0].match(/^b(\d{2})/);
  return m ? '20' + m[1] : String(new Date().getFullYear());
}
function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return Math.floor(s/60) + 'm ago';
  if (s < 86400)  return Math.floor(s/3600) + 'h ago';
  if (s < 604800) return Math.floor(s/86400) + 'd ago';
  return new Date(dateStr).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email)              return res.status(400).json({ error: 'Email is required.' });
    if (!isNITTEmail(email)) return res.status(400).json({ error: 'Only @' + DOMAIN + ' email addresses are allowed.' });

    const code      = genOTP();
    const expiresAt = Date.now() + OTP_EXP * 60 * 1000;
    OTP.save(email, code, expiresAt);

    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
       method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:  process.env.EMAILJS_SERVICE_ID,
          template_id: process.env.EMAILJS_TEMPLATE_ID,
          user_id:     process.env.EMAILJS_PUBLIC_KEY,
          accessToken: process.env.EMAILJS_PRIVATE_KEY,
          template_params: {
            to_email: email,
            otp_code: code
          }
        })
      }); 
    res.json({ ok: true });
  } catch (err) {
    console.error('send-otp error:', err.message);
    res.status(500).json({ error: 'Failed to send OTP. Check SMTP settings in .env' });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const code  = (req.body.code  || '').trim();

    if (!email || !code) return res.status(400).json({ error: 'Email and OTP are required.' });

    const record = OTP.get(email);
    if (!record)                       return res.status(400).json({ error: 'No OTP requested for this email.' });
    if (Date.now() > record.expiresAt) { OTP.clear(email); return res.status(400).json({ error: 'OTP expired. Request a new one.' }); }
    if (record.code !== code)          return res.status(400).json({ error: 'Incorrect OTP.' });

    OTP.clear(email);

    // check if returning user with complete profile
    const existing = Users.find(email);
    if (existing && existing.profileSet) {
      req.session.user = existing;
      return res.json({ ok: true, user: existing, profileComplete: true });
    }

    // new user — send back to profile step
    const placeholder = Users.upsert(email, deriveName(email), '', '');
    res.json({ ok: true, user: placeholder, profileComplete: false });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    res.status(500).json({ error: 'Server error during verification.' });
  }
});

// Update profile (called after OTP for new users)
app.post('/api/auth/update-profile', (req, res) => {
  try {
    const email  = (req.body.email  || '').trim().toLowerCase();
    const name   = (req.body.name   || '').trim();
    const branch = (req.body.branch || '').trim();
    const year   = (req.body.year   || '').trim();

    if (!email)  return res.status(400).json({ error: 'Email is required.' });
    if (!name)   return res.status(400).json({ error: 'Name is required.' });
    if (!branch) return res.status(400).json({ error: 'Branch is required.' });
    if (!year)   return res.status(400).json({ error: 'Batch year is required.' });

    const user = Users.upsert(email, name, branch, year, true); // true = profileSet
    req.session.user = user;
    res.json({ ok: true, user });
  } catch (err) {
    console.error('update-profile error:', err.message);
    res.status(500).json({ error: 'Server error saving profile.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// ─── POSTS ────────────────────────────────────────────────────────────────────

const VALID_TAGS = ['placements','interview-experience','academics','internships','hostel','cse','ece','eee','mechanical','civil','gate','higher-studies','resume'];

app.get('/api/posts', (req, res) => {
  try {
    let posts = Posts.all();
    const { tag, q, sort } = req.query;

    if (tag && tag !== 'all') posts = posts.filter(p => (p.tags || []).includes(tag));
    if (q)  posts = posts.filter(p =>
      (p.title || '').toLowerCase().includes(q.toLowerCase()) ||
      (p.body  || '').toLowerCase().includes(q.toLowerCase())
    );

    if (sort === 'upvotes') posts.sort((a,b) => b.upvotes - a.upvotes);
    else if (sort === 'views') posts.sort((a,b) => b.views - a.views);
    else posts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    const user = req.session.user || null;
    const slim = posts.map(p => ({
      id:          p.id,
      type:        p.type,
      title:       p.title,
      tags:        p.tags        || [],
      authorName:  p.authorName,
      branch:      p.branch,
      year:        p.year,
      company:     p.company     || null,
      role:        p.role        || null,
      ctc:         p.ctc         || null,
      mode:        p.mode        || null,
      upvotes:     p.upvotes     || 0,
      answers:     p.answers     || 0,
      views:       p.views       || 0,
      hasUpvoted:  user ? Posts.hasUpvoted(p.id, user.email) : false,
      timeAgo:     timeAgo(p.createdAt)
    }));

    res.json(slim);
  } catch (err) {
    console.error('GET /api/posts error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts/:id', (req, res) => {
  try {
    const post = Posts.get(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    Posts.update(post.id, { views: (post.views || 0) + 1 });
    const user = req.session.user || null;
    res.json({ ...post, hasUpvoted: user ? Posts.hasUpvoted(post.id, user.email) : false, timeAgo: timeAgo(post.createdAt) });
  } catch (err) {
    console.error('GET /api/posts/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts', requireAuth, (req, res) => {
  try {
    const { type, title, body, tags, company, role, ctc, mode, rounds, resources } = req.body;
    const user = req.session.user;

    if (!title || title.trim().length < 10) return res.status(400).json({ error: 'Title must be at least 10 characters.' });
    if (!body  || body.trim().length  < 30) return res.status(400).json({ error: 'Body must be at least 30 characters.' });
    if (!['question','experience'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });

    const cleanTags = (Array.isArray(tags) ? tags : (tags||'').split(','))
      .map(t => t.trim().toLowerCase()).filter(t => VALID_TAGS.includes(t));

    const post = {
      id:          'p' + uuidv4().replace(/-/g,'').slice(0,10),
      type,
      title:       title.trim(),
      body:        body.trim(),
      tags:        cleanTags,
      authorEmail: user.email,
      authorName:  user.name,
      branch:      user.branch,
      year:        user.year,
      company:     company   || null,
      role:        role      || null,
      ctc:         ctc       || null,
      mode:        mode      || null,
      rounds:      Array.isArray(rounds)    ? rounds.filter(r => r && r.trim())    : [],
      resources:   Array.isArray(resources) ? resources.filter(r => r && r.trim()) : [],
      upvotes:     0, answers: 0, views: 0,
      voters:      [], answerList: [],
      createdAt:   new Date().toISOString()
    };

    Posts.add(post);
    res.json({ ok: true, post });
  } catch (err) {
    console.error('POST /api/posts error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/upvote', requireAuth, (req, res) => {
  try {
    const post = Posts.upvote(req.params.id, req.session.user.email);
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json({ upvotes: post.upvotes, hasUpvoted: Posts.hasUpvoted(post.id, req.session.user.email) });
  } catch (err) {
    console.error('upvote error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/answers', requireAuth, (req, res) => {
  try {
    const { body } = req.body;
    if (!body || body.trim().length < 5) return res.status(400).json({ error: 'Answer is too short.' });

    const user   = req.session.user;
    const answer = {
      id:          'a' + Date.now(),
      authorEmail: user.email,
      authorName:  user.name,
      branch:      user.branch,
      year:        user.year,
      body:        body.trim(),
      upvotes:     0,
      createdAt:   new Date().toISOString()
    };

    const result = Posts.addAnswer(req.params.id, answer);
    if (!result) return res.status(404).json({ error: 'Post not found' });
    res.json({ ok: true, answer: { ...answer, timeAgo: 'just now' } });
  } catch (err) {
    console.error('answer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n✅ NITT Connect running at http://localhost:' + PORT);
  console.log('   Configure email in .env (copy from .env.example)\n');
});
