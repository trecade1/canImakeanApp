require('dotenv').config();
const express = require('express');
const db = require('./db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const nacl = require('tweetnacl');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET not set. Set it in .env for production.');
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing auth' });
  const token = auth.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// Signup
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id,email,display_name,created_at',
      [email, hash, display_name]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET);
    res.json({ user, access_token: token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const result = await db.query('SELECT id,email,password_hash,display_name FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET);
    res.json({ user: { id: user.id, email: user.email, display_name: user.display_name }, access_token: token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Request pairing code
app.post('/pairing/request-code', authMiddleware, async (req, res) => {
  try {
    const ttlSeconds = parseInt(req.body.ttl_seconds, 10) || 300; // default 5m
    const codeId = uuidv4();
    const code = crypto.randomBytes(6).toString('hex');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await db.query(
      'INSERT INTO pairing_codes(id, owner_user_id, code, expires_at) VALUES($1,$2,$3,$4)',
      [codeId, req.user.id, code, expiresAt]
    );

    const payload = jwt.sign({ owner_id: req.user.id, code_id: codeId, expires_at: expiresAt }, process.env.JWT_SECRET);

    res.json({ code_id: codeId, payload });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Claim pairing
app.post('/pairing/claim', authMiddleware, async (req, res) => {
  try {
    const { payload } = req.body;
    if (!payload) return res.status(400).json({ error: 'payload required' });
    let decoded;
    try {
      decoded = jwt.verify(payload, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ error: 'invalid payload' });
    }

    const { owner_id, code_id, expires_at } = decoded;
    const now = new Date();
    if (new Date(expires_at) < now) return res.status(400).json({ error: 'code expired' });

    const codeRow = await db.query('SELECT id, used_at FROM pairing_codes WHERE id=$1 AND owner_user_id=$2', [code_id, owner_id]);
    if (!codeRow.rows[0]) return res.status(400).json({ error: 'code not found' });
    if (codeRow.rows[0].used_at) return res.status(400).json({ error: 'code already used' });

    // Create pairing (ensure ordering to keep uniqueness)
    const userA = owner_id;
    const userB = req.user.id;
    const [low, high] = [userA, userB].sort();

    const insert = await db.query(
      `INSERT INTO pairings(user_a, user_b, code_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id,user_a,user_b,created_at`,
      [low, high, code_id]
    );

    await db.query('UPDATE pairing_codes SET used_at=now() WHERE id=$1', [code_id]);

    const pairing = insert.rows[0] || { message: 'pairing already exists' };
    res.json({ pairing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Claim owner-signed voucher (Option 3 — signed voucher verification)
app.post('/pairing/claim-voucher', authMiddleware, async (req, res) => {
  try {
    const { owner_id, voucher_id, expires_at, pubkey, sig } = req.body;
    if (!owner_id || !voucher_id || !expires_at || !pubkey || !sig) return res.status(400).json({ error: 'missing fields' });

    // Check expiry
    const now = new Date();
    if (new Date(expires_at) < now) return res.status(400).json({ error: 'voucher expired' });

    // Verify signature (owner signs canonical JSON: { owner_id, voucher_id, expires_at })
    const message = Buffer.from(JSON.stringify({ owner_id, voucher_id, expires_at }));
    const sigBuf = Buffer.from(sig, 'base64');
    const pubBuf = Buffer.from(pubkey, 'base64');
    const ok = nacl.sign.detached.verify(new Uint8Array(message), new Uint8Array(sigBuf), new Uint8Array(pubBuf));
    if (!ok) return res.status(400).json({ error: 'invalid signature' });

    // Ensure voucher_id not used
    const existing = await db.query('SELECT id, used_at FROM vouchers WHERE voucher_id=$1', [voucher_id]);
    if (existing.rows[0] && existing.rows[0].used_at) return res.status(400).json({ error: 'voucher already used' });

    // Record voucher as used (insert or update)
    if (!existing.rows[0]) {
      await db.query('INSERT INTO vouchers(owner_user_id, voucher_id, pubkey, expires_at, used_at) VALUES($1,$2,$3,$4,now())', [owner_id, voucher_id, pubkey, expires_at]);
    } else {
      await db.query('UPDATE vouchers SET used_at=now() WHERE voucher_id=$1', [voucher_id]);
    }

    // Create pairing
    const userA = owner_id;
    const userB = req.user.id;
    const [low, high] = [userA, userB].sort();

    const insert = await db.query(
      `INSERT INTO pairings(user_a, user_b, code_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id,user_a,user_b,created_at`,
      [low, high, null]
    );

    const pairing = insert.rows[0] || { message: 'pairing already exists' };
    res.json({ pairing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Create post
app.post('/posts', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const result = await db.query('INSERT INTO posts(author_id, content) VALUES($1,$2) RETURNING id,author_id,content,created_at', [req.user.id, content]);
    res.json({ post: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Get feed
app.get('/feed', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    // find paired users
    const pairs = await db.query(
      'SELECT user_a, user_b FROM pairings WHERE user_a=$1 OR user_b=$1',
      [req.user.id]
    );
    const otherIds = new Set();
    for (const row of pairs.rows) {
      otherIds.add(row.user_a === req.user.id ? row.user_b : row.user_a);
    }
    if (otherIds.size === 0) return res.json({ posts: [] });
    const ids = Array.from(otherIds);
    const q = `SELECT id,author_id,content,created_at FROM posts WHERE author_id = ANY($1) ORDER BY created_at DESC LIMIT $2`;
    const posts = await db.query(q, [ids, limit]);
    res.json({ posts: posts.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Pairings list
app.get('/pairings', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query('SELECT id,user_a,user_b,created_at FROM pairings WHERE user_a=$1 OR user_b=$1', [req.user.id]);
    res.json({ pairings: rows.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Revoke pairing
app.delete('/pairings/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // ensure current user is part of pairing
    const row = await db.query('SELECT user_a,user_b FROM pairings WHERE id=$1', [id]);
    if (!row.rows[0]) return res.status(404).json({ error: 'pairing not found' });
    const { user_a, user_b } = row.rows[0];
    if (user_a !== req.user.id && user_b !== req.user.id) return res.status(403).json({ error: 'not owner' });
    await db.query('DELETE FROM pairings WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Register public key for current user (iOS device identifies itself)
app.post('/pairing/register-key', authMiddleware, async (req, res) => {
  try {
    const { public_key } = req.body;
    if (!public_key) return res.status(400).json({ error: 'public_key required' });
    await db.query('UPDATE users SET public_key=$1 WHERE id=$2', [public_key, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

// Claim pairing via live challenge (iOS Multipeer)
// Expected body: { owner_id, challenge, sig }
// Scanner POSTs with their auth token; server verifies challenge signature using owner's stored public key
app.post('/pairing/challenge', authMiddleware, async (req, res) => {
  try {
    const { owner_id, challenge, sig } = req.body;
    if (!owner_id || !challenge || !sig) return res.status(400).json({ error: 'owner_id, challenge, sig required' });

    // Get owner's stored public key
    const ownerRow = await db.query('SELECT public_key FROM users WHERE id=$1', [owner_id]);
    if (!ownerRow.rows[0] || !ownerRow.rows[0].public_key) return res.status(400).json({ error: 'owner public key not found' });

    const pubkey = ownerRow.rows[0].public_key;

    // Verify signature: challenge is base64-encoded bytes, sig is base64-encoded signature
    // message to verify is the raw challenge bytes
    const challengeBuf = Buffer.from(challenge, 'base64');
    const sigBuf = Buffer.from(sig, 'base64');
    const pubBuf = Buffer.from(pubkey, 'base64');
    const ok = nacl.sign.detached.verify(new Uint8Array(challengeBuf), new Uint8Array(sigBuf), new Uint8Array(pubBuf));
    if (!ok) return res.status(400).json({ error: 'invalid signature' });

    // Create pairing
    const userA = owner_id;
    const userB = req.user.id;
    const [low, high] = [userA, userB].sort();

    const insert = await db.query(
      `INSERT INTO pairings(user_a, user_b, code_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id,user_a,user_b,created_at`,
      [low, high, null]
    );

    const pairing = insert.rows[0] || { message: 'pairing already exists' };
    res.json({ pairing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
