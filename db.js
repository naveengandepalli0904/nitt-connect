const mongoose = require('mongoose');

// ─── Connect ──────────────────────────────────────────────────────────────────
let connected = false;

async function connect() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
  console.log('✅ MongoDB connected');
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  email:      { type: String, required: true, unique: true },
  name:       { type: String, default: '' },
  branch:     { type: String, default: '' },
  year:       { type: String, default: '' },
  profileSet: { type: Boolean, default: false },
  joinedAt:   { type: Date, default: Date.now }
});

const otpSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true },
  code:      { type: String, required: true },
  expiresAt: { type: Number, required: true }
});

const answerSchema = new mongoose.Schema({
  id:          String,
  authorEmail: String,
  authorName:  String,
  branch:      String,
  year:        String,
  body:        String,
  upvotes:     { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  type:        { type: String, enum: ['question', 'experience'] },
  title:       String,
  body:        String,
  tags:        [String],
  authorEmail: String,
  authorName:  String,
  branch:      String,
  year:        String,
  company:     String,
  role:        String,
  ctc:         String,
  mode:        String,
  rounds:      [String],
  resources:   [String],
  upvotes:     { type: Number, default: 0 },
  answers:     { type: Number, default: 0 },
  views:       { type: Number, default: 0 },
  voters:      [String],
  answerList:  [answerSchema],
  createdAt:   { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const OTPModel = mongoose.model('OTP', otpSchema);
const Post = mongoose.model('Post', postSchema);

// ─── OTP ──────────────────────────────────────────────────────────────────────
const OTP = {
  async save(email, code, expiresAt) {
    await connect();
    await OTPModel.findOneAndUpdate(
      { email },
      { email, code, expiresAt },
      { upsert: true, new: true }
    );
  },
  async get(email) {
    await connect();
    return await OTPModel.findOne({ email }).lean();
  },
  async clear(email) {
    await connect();
    await OTPModel.deleteOne({ email });
  }
};

// ─── Users ────────────────────────────────────────────────────────────────────
const Users = {
  async find(email) {
    await connect();
    return await User.findOne({ email }).lean();
  },
  async upsert(email, name, branch, year, profileSet = false) {
    await connect();
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { name, branch, year, profileSet: profileSet || false } },
      { upsert: true, new: true }
    ).lean();
    return user;
  }
};

// ─── Posts ────────────────────────────────────────────────────────────────────
const Posts = {
  async all() {
    await connect();
    return await Post.find().sort({ createdAt: -1 }).lean();
  },

  async get(id) {
    await connect();
    return await Post.findOne({ id }).lean();
  },

  async add(postData) {
    await connect();
    const post = new Post(postData);
    await post.save();
    return post.toObject();
  },

  async update(id, changes) {
    await connect();
    return await Post.findOneAndUpdate({ id }, { $set: changes }, { new: true }).lean();
  },

  async upvote(id, email) {
    await connect();
    const post = await Post.findOne({ id });
    if (!post) return null;
    if (post.voters.includes(email)) {
      post.upvotes = Math.max(0, post.upvotes - 1);
      post.voters  = post.voters.filter(v => v !== email);
    } else {
      post.upvotes += 1;
      post.voters.push(email);
    }
    await post.save();
    return post.toObject();
  },

  async hasUpvoted(id, email) {
    await connect();
    const post = await Post.findOne({ id }).lean();
    return post ? (post.voters || []).includes(email) : false;
  },

  async addAnswer(postId, answer) {
    await connect();
    const post = await Post.findOneAndUpdate(
      { id: postId },
      {
        $push: { answerList: answer },
        $inc:  { answers: 1 }
      },
      { new: true }
    ).lean();
    return post ? answer : null;
  }
};

module.exports = { OTP, Users, Posts };