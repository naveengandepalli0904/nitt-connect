const fs   = require('fs');
const path = require('path');

const DB_DIR  = path.join(__dirname, 'data');
const POSTS_F = path.join(DB_DIR, 'posts.json');
const USERS_F = path.join(DB_DIR, 'users.json');
const OTPS_F  = path.join(DB_DIR, 'otps.json');

// always ensure data dir exists
function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function readJSON(file, def) {
  try {
    if (!fs.existsSync(file)) return def;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw || raw.trim() === '') return def;
    return JSON.parse(raw);
  } catch (e) {
    console.error('readJSON error for', file, e.message);
    return def;
  }
}

function writeJSON(file, data) {
  try {
    ensureDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('writeJSON error for', file, e.message);
  }
}

// ─── OTP ──────────────────────────────────────────────────────────────────────
const OTP = {
  save(email, code, expiresAt) {
    ensureDir();
    const all = readJSON(OTPS_F, {});
    all[email] = { code, expiresAt };
    writeJSON(OTPS_F, all);
  },
  get(email) {
    const all = readJSON(OTPS_F, {});
    return all[email] || null;
  },
  clear(email) {
    const all = readJSON(OTPS_F, {});
    delete all[email];
    writeJSON(OTPS_F, all);
  }
};

// ─── Users ────────────────────────────────────────────────────────────────────
const Users = {
  all() {
    ensureDir();
    return readJSON(USERS_F, []);
  },
  find(email) {
    return this.all().find(u => u.email === email) || null;
  },
  upsert(email, name, branch, year, profileSet = false) {
    ensureDir();
    const users = this.all();
    const idx   = users.findIndex(u => u.email === email);
    if (idx >= 0) {
      users[idx] = { ...users[idx], name, branch, year, profileSet: profileSet || users[idx].profileSet || false };
    } else {
      users.push({ email, name, branch, year, profileSet, joinedAt: new Date().toISOString() });
    }
    writeJSON(USERS_F, users);
    return this.find(email);
  }
};

// ─── Seed posts ───────────────────────────────────────────────────────────────
// Set to [] to start with no demo content
const SEED = [];

// ─── Posts ────────────────────────────────────────────────────────────────────
const Posts = {
  _ensureFile() {
    ensureDir();
    if (!fs.existsSync(POSTS_F)) {
      writeJSON(POSTS_F, SEED);
    }
  },

  all() {
    this._ensureFile();
    return readJSON(POSTS_F, []);
  },

  get(id) {
    return this.all().find(p => p.id === id) || null;
  },

  add(post) {
    this._ensureFile();
    const posts = this.all();
    posts.unshift(post);
    writeJSON(POSTS_F, posts);
  },

  update(id, changes) {
    this._ensureFile();
    const posts = this.all();
    const idx   = posts.findIndex(p => p.id === id);
    if (idx < 0) return null;
    posts[idx] = { ...posts[idx], ...changes };
    writeJSON(POSTS_F, posts);
    return posts[idx];
  },

  upvote(id, email) {
    const post   = this.get(id);
    if (!post) return null;
    const voters = post.voters || [];
    if (voters.includes(email)) {
      return this.update(id, { upvotes: Math.max(0, post.upvotes - 1), voters: voters.filter(v => v !== email) });
    } else {
      return this.update(id, { upvotes: (post.upvotes || 0) + 1, voters: [...voters, email] });
    }
  },

  hasUpvoted(id, email) {
    const post = this.get(id);
    return post ? (post.voters || []).includes(email) : false;
  },

  addAnswer(postId, answer) {
    const post    = this.get(postId);
    if (!post) return null;
    const answers = post.answerList || [];
    answers.push(answer);
    this.update(postId, { answerList: answers, answers: answers.length });
    return answer;
  }
};

module.exports = { OTP, Users, Posts };
