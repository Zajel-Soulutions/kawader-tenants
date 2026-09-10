#!/usr/bin/env node
/**
 * Validates v1.json before it can reach the published directory.
 *
 * Every rule here mirrors one the Kawader app enforces at runtime
 * (`src/lib/tenantDirectory.ts`). The difference is where the failure lands: a
 * bad entry that ships is a support call from a customer whose staff cannot
 * sign in, and it is already live by the time anyone notices. Caught here, it
 * is a red tick on a pull request.
 */

import { readFileSync, existsSync } from 'node:fs';

const CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;
const EXPECTED_DOMAIN = 'tenants.kawader.app';

const problems = [];
const warnings = [];

const fail = (where, message) => problems.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

// ── The CNAME is load-bearing ────────────────────────────────────────────────
// Deleting it silently drops the custom domain, and every installed app is
// compiled to fetch the directory from that domain — so the whole estate stops
// resolving company codes. It is one line, and it is the highest-consequence
// file in this repository.
if (!existsSync('CNAME')) {
  fail('CNAME', 'missing — the custom domain would be dropped and every installed app would break');
} else {
  const cname = readFileSync('CNAME', 'utf8').trim();
  if (cname !== EXPECTED_DOMAIN) {
    fail('CNAME', `expected "${EXPECTED_DOMAIN}", found "${cname}"`);
  }
}

// ── The directory itself ─────────────────────────────────────────────────────
let doc;
try {
  doc = JSON.parse(readFileSync('v1.json', 'utf8'));
} catch (err) {
  console.error(`v1.json: not valid JSON — ${err.message}`);
  process.exit(1);
}

if (!Number.isInteger(doc.version) || doc.version < 1) {
  fail('v1.json', '"version" must be a positive integer');
}

if (!doc.tenants || typeof doc.tenants !== 'object' || Array.isArray(doc.tenants)) {
  console.error('v1.json: "tenants" must be an object keyed by company code');
  process.exit(1);
}

const seenHosts = new Map();

for (const [code, entry] of Object.entries(doc.tenants)) {
  const at = `tenants.${code}`;

  // The code is typed by hand by every employee, and doubles as a key suffix in
  // the device's secure storage — which is where the character set comes from.
  if (!CODE_PATTERN.test(code)) {
    fail(at, 'code must be 2–32 characters of A–Z, 0–9, underscore or hyphen');
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail(at, 'entry must be an object');
    continue;
  }

  const allowed = new Set(['name', 'base_url', 'api_prefix']);
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) warn(at, `unknown field "${key}" — the app ignores it`);
  }

  if (typeof entry.name !== 'string' || !entry.name.trim()) {
    fail(at, '"name" must be a non-empty string — it is shown to the employee before sign-in');
  }

  // ── base_url ───────────────────────────────────────────────────────────────
  if (typeof entry.base_url !== 'string' || !entry.base_url) {
    fail(at, '"base_url" is required');
  } else {
    let url = null;
    try {
      url = new URL(entry.base_url);
    } catch {
      fail(at, `"base_url" is not a valid URL: ${entry.base_url}`);
    }

    if (url) {
      if (url.protocol !== 'https:') {
        fail(at, `"base_url" must be https:// — Android and iOS both refuse cleartext`);
      }
      if (url.username || url.password) {
        fail(at, '"base_url" must not embed credentials');
      }
      if (url.search || url.hash) {
        fail(at, '"base_url" must not carry a query string or fragment');
      }
      if (url.pathname !== '/') {
        fail(at, `"base_url" must be an origin only — move "${url.pathname}" into api_prefix`);
      }
      if (entry.base_url.endsWith('/')) {
        fail(at, '"base_url" must not end with a slash');
      }

      const host = url.host.toLowerCase();
      if (seenHosts.has(host)) {
        warn(at, `shares a host with "${seenHosts.get(host)}" — intended?`);
      } else {
        seenHosts.set(host, code);
      }
    }
  }

  // ── api_prefix ─────────────────────────────────────────────────────────────
  if (typeof entry.api_prefix !== 'string') {
    fail(at, '"api_prefix" is required — use "" for a server that mounts the API at the root');
  } else if (entry.api_prefix) {
    if (!entry.api_prefix.startsWith('/')) {
      fail(at, '"api_prefix" must start with a slash');
    }
    if (entry.api_prefix.endsWith('/')) {
      fail(at, '"api_prefix" must not end with a slash');
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const count = Object.keys(doc.tenants).length;

for (const w of warnings) console.warn(`warning  ${w}`);

if (problems.length) {
  for (const p of problems) console.error(`error    ${p}`);
  console.error(`\n${problems.length} problem(s) found. The directory was not published.`);
  process.exit(1);
}

console.log(`v1.json is valid — ${count} tenant(s), version ${doc.version}.`);
if (warnings.length) console.log(`${warnings.length} warning(s), not blocking.`);
