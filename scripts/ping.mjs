#!/usr/bin/env node
/**
 * Reports what each tenant's host answers. Never fails: a deployment can
 * legitimately be down for maintenance, and this runs on every push. It is
 * here to catch a typo'd hostname on the day an entry is added.
 *
 * It requests `{base_url}{api_prefix}/meta` — the same probe the app makes
 * before binding a company code (`probeTenant`). The backend answers that route
 * 404 by design (decision D9), and a 404 means a server answered, which is
 * what the app binds on. No answer, a 401/403 or a 5xx is what it refuses.
 */

import { readFileSync, appendFileSync } from 'node:fs';
import { setDefaultResultOrder } from 'node:dns';

// IPv4 first: on a machine whose IPv6 route is broken, Node otherwise times out
// on the AAAA address and reports a healthy host as unreachable. The question
// here is "does this hostname serve anything", not "does it serve over IPv6".
setDefaultResultOrder('ipv4first');

const TIMEOUT_MS = 10_000;
const doc = JSON.parse(readFileSync('v1.json', 'utf8'));
const rows = [];

for (const [code, entry] of Object.entries(doc.tenants ?? {})) {
  const url = `${entry.base_url}${entry.api_prefix ?? ''}/meta`;
  let verdict;
  let detail;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
    detail = `HTTP ${res.status}`;
    if (res.status === 404 || res.ok) verdict = 'ok';
    else if (res.status === 401 || res.status === 403) verdict = 'warn — the app reads 401/403 here as a dead session';
    else if (res.status >= 500) verdict = 'warn — the app refuses to bind on a server error';
    else verdict = 'warn — unexpected status';
  } catch (err) {
    detail = err.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS / 1000}s` : (err.cause?.code ?? err.message);
    verdict = 'warn — no answer; the app refuses to bind';
  }

  const line = `${code}: ${url} → ${detail} (${verdict})`;
  console.log(line);
  // Surface problems on the run page without failing it.
  if (verdict !== 'ok' && process.env.GITHUB_ACTIONS) console.log(`::warning title=${code}::${line}`);
  rows.push(`| \`${code}\` | \`${url}\` | ${detail} | ${verdict} |`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ['### Tenant hosts', '', '| Code | Probe | Answer | Verdict |', '| --- | --- | --- | --- |', ...rows, ''].join('\n'),
  );
}
