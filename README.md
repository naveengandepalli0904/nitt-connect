# NITT Connect

> Ask. Answer. Learn from seniors.

A peer Q&A platform exclusively for NIT Trichy students — interview experiences, placement prep, course advice — all behind real `@nitt.edu` email OTP login.

---

## Features

- 🔐 **Real OTP login** — only `@nitt.edu` emails accepted; OTP sent via your Gmail
- 📝 **Post questions** — ask anything about placements, academics, hostel, GATE
- 🏆 **Share experiences** — detailed interview experience posts with rounds, tips, resources
- 🔍 **Search & filter** — by tag, keyword, sort by recent / most helpful / most viewed
- ▲ **Upvote** — mark helpful posts and answers
- 💬 **Answers** — reply to any post; threaded answers per question
- 💾 **Persistent** — all data stored in local JSON files (no external DB needed)

---

## Project Structure

```
nitt-connect/
├── server.js          ← Express backend (API + static serving)
├── db.js              ← JSON file database (posts, users, OTPs)
├── public/
│   ├── index.html     ← Single-page app shell
│   ├── css/style.css  ← All styles (light theme)
│   └── js/app.js      ← Frontend JS (routing, auth, feed, forms)
├── data/              ← Auto-created; stores posts.json, users.json, otps.json
├── .env               ← Your config (copy from .env.example)
└── .env.example       ← Config template
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure email (Gmail recommended)

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
SESSION_SECRET=some_long_random_string_here

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM="NITT Connect <your_gmail@gmail.com>"

OTP_EXPIRY_MINUTES=10
ALLOWED_EMAIL_DOMAIN=nitt.edu
```

#### How to get a Gmail App Password

1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification → **App Passwords**
3. Select **Mail** + **Other** → name it "NITT Connect"
4. Copy the 16-character password into `SMTP_PASS`

> ⚠️ Do NOT use your normal Gmail password. App Passwords are separate.

### 3. Run the server

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deployment (Render.com — free tier)

1. Push code to GitHub (do **not** commit `.env` or `data/` folder)
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `npm start`
5. Add all `.env` variables in the Render **Environment** tab
6. Deploy ✅

---

## Tech Stack

| Layer      | Tech                        |
|------------|-----------------------------|
| Backend    | Node.js + Express 5         |
| Auth       | Nodemailer OTP + express-session |
| Storage    | JSON files (via `fs`)       |
| Frontend   | Vanilla HTML/CSS/JS (SPA)   |
| Deployment | Any Node.js host (Render, Railway, VPS) |

---

## Customisation

- Change `ALLOWED_EMAIL_DOMAIN` in `.env` to restrict to a different domain
- Edit `SEED` array in `db.js` to change default sample posts
- Edit `TAGS` array in `public/js/app.js` to add/remove tag filters
- Add companies/roles to the dropdown by editing `initNewPostForm()` in `app.js`
