'use strict';
// What a copied thing is (a link, a colour, some code…), whether it looks like
// a secret that shouldn't be kept, and quick changes you can make to it.

/** 'link' | 'email' | 'color' | 'phone' | 'number' | 'path' | 'code' | 'text' */
function kindOf(text) {
  const t = String(text || '').trim();
  if (!t) return 'text';
  if (/^https?:\/\/\S+$/i.test(t) || /^www\.\S+\.\S+$/i.test(t)) return 'link';
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(t)) return 'email';
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t) || /^(?:rgba?|hsla?)\([\d\s.,%/deg]+\)$/i.test(t)) return 'color';
  if (/^\+?[\d\s().-]{7,18}$/.test(t) && (t.match(/\d/g) || []).length >= 7 && /[\s().-]/.test(t)) return 'phone';
  if (/^-?[\d,]*\.?\d+(?:e-?\d+)?%?$/i.test(t)) return 'number';
  if (/^(?:~|\/)[^\n]*$/.test(t) && !/\s{2}/.test(t) && t.length < 300 && t.split('/').length > 2) return 'path';
  if (looksLikeCode(t)) return 'code';
  return 'text';
}

function looksLikeCode(t) {
  const lines = t.split('\n');
  let score = 0;
  if (/[{};]\s*$/m.test(t)) score += 2;
  if (/^\s*(import|from|export|const|let|var|function|def|class|return|if|for|while|#include|using|package|public|private|async|await|SELECT|INSERT|UPDATE)\b/m.test(t)) score += 3;
  if (/=>|===|!==|\+=|::|->|<\/?[a-z][\w-]*[\s>]/i.test(t)) score += 2;
  if (/^\s{2,}\S/m.test(t) && lines.length > 2) score += 1;
  if (/\w+\([^)]*\)/.test(t)) score += 1;
  if (/^(?:\$ |npm |npx |pip3? |git |cd |brew |sudo |python3? |node |curl |ssh |ls |mkdir )/m.test(t)) score += 4;
  return score >= 4;
}

/** A card number that passes the Luhn check. */
function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Bits of surprise per character, roughly (random keys score high; words don't). */
function entropy(s) {
  const counts = {};
  for (const c of s) counts[c] = (counts[c] || 0) + 1;
  let h = 0;
  for (const n of Object.values(counts)) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

/**
 * Does this look like something that shouldn't be kept: a password, an API
 * key, a card number? Returns the reason in plain words, or null.
 */
function secretWhy(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) return 'a private key';
  if (t.includes('\n') || t.length > 300) return null;
  if (/^(?:sk|pk|rk)[-_](?:live|test|proj|ant)?[-_]?[A-Za-z0-9_-]{16,}$/.test(t)) return 'an API key';
  if (/^(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})$/.test(t)) return 'a GitHub token';
  if (/^AKIA[0-9A-Z]{16}$/.test(t)) return 'an AWS key';
  if (/^xox[abprs]-[A-Za-z0-9-]{10,}$/.test(t)) return 'a Slack token';
  if (/^AIza[0-9A-Za-z_-]{35}$/.test(t)) return 'a Google key';
  if (/^eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/.test(t)) return 'a sign-in token';
  if (/^(?:hf_|gsk_|nvapi-|xai-|csk-)[A-Za-z0-9_-]{20,}$/.test(t)) return 'an API key';
  const digits = t.replace(/[\s-]/g, '');
  if (/^\d{13,19}$/.test(digits) && /^[\d\s-]+$/.test(t) && luhn(digits)) return 'a card number';
  // one long word made of mixed letters, digits and symbols, with no spaces: a password or a key
  if (!/\s/.test(t) && t.length >= 12 && t.length <= 128 && !/^https?:|^www\.|@|^[~/.]/.test(t)) {
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(t)).length;
    if (classes >= 3 && entropy(t) >= 3.6 && !/^[a-z]+(?:[A-Z][a-z]+)+$/.test(t)) return 'a password or key';
    if (classes >= 2 && t.length >= 32 && entropy(t) >= 4.2) return 'a key';
  }
  return null;
}

// ── quick changes ──
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-_(["'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
function cleanUrl(s) {
  try {
    const u = new URL(s.trim());
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_|igshid$|si$|ref$|ref_src$|spm$|_hs|yclid$|msclkid$)/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\?$/, '');
  } catch { return s; }
}

const TRANSFORMS = {
  plain: { label: 'Plain text', run: (s) => s },
  trim: { label: 'Tidy spaces', run: (s) => s.split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').trim()).join('\n').trim() },
  upper: { label: 'UPPERCASE', run: (s) => s.toUpperCase() },
  lower: { label: 'lowercase', run: (s) => s.toLowerCase() },
  title: { label: 'Title Case', run: titleCase },
  oneline: { label: 'One line', run: (s) => s.replace(/\s*\n\s*/g, ' ').trim() },
  sort: { label: 'Sort lines', run: (s) => s.split('\n').sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join('\n') },
  unique: { label: 'Remove repeated lines', run: (s) => [...new Set(s.split('\n'))].join('\n') },
  bullets: { label: 'Bullet list', run: (s) => s.split('\n').filter((l) => l.trim()).map((l) => '- ' + l.trim().replace(/^[-*•]\s*/, '')).join('\n') },
  json: { label: 'Pretty JSON', run: (s) => JSON.stringify(JSON.parse(s), null, 2) },
  url: { label: 'Clean link (no trackers)', run: cleanUrl },
  b64: { label: 'Base64 encode', run: (s) => Buffer.from(s, 'utf8').toString('base64') },
  unb64: { label: 'Base64 decode', run: (s) => { const b = Buffer.from(s.trim(), 'base64'); const out = b.toString('utf8'); if (!out || /�/.test(out)) throw new Error("That isn't Base64 text."); return out; } },
  slug: { label: 'file-name-style', run: (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
};

/** Which quick changes make sense for this text (in this order). */
function transformsFor(text, kind = kindOf(text)) {
  const list = ['trim', 'upper', 'lower', 'title', 'oneline'];
  if (text.includes('\n')) list.push('sort', 'unique', 'bullets');
  if (kind === 'link') list.unshift('url');
  if (/^\s*[[{]/.test(text)) { try { JSON.parse(text); list.unshift('json'); } catch { /* not JSON */ } }
  if (/^[A-Za-z0-9+/=\s]{8,}$/.test(text.trim()) && text.trim().length % 4 === 0) list.push('unb64');
  list.push('b64', 'slug');
  return list.map((id) => ({ id, label: TRANSFORMS[id].label }));
}

function transform(text, how) {
  const t = TRANSFORMS[how];
  if (!t) throw new Error(`There's no change called "${how}".`);
  try { return t.run(String(text)); } catch (e) { throw new Error(e.message.startsWith('That') ? e.message : `Couldn't do that: ${e.message}`); }
}

/** Counts for the little line under a clip. */
function counts(text) {
  const t = String(text || '');
  return { chars: [...t].length, words: (t.match(/\S+/g) || []).length, lines: t ? t.split('\n').length : 0 };
}

module.exports = { kindOf, secretWhy, transformsFor, transform, counts, TRANSFORMS, cleanUrl, luhn, entropy };
