// WAF / bot-shield detection.
//
// When an MP's website returns 403 / 503 / 5xx, we want to know
// whether the block came from a generic origin or from a known
// WAF / CDN bot-shield. The distinction matters because:
//
//   * WAF blocks are usually triggerable on UA / IP heuristics —
//     they are NOT a deliberate refusal-to-be-archived by the
//     publisher. Wayback fallback is appropriate.
//   * WAF blocks are reproducible across any non-browser client.
//     A registry of known-blocked sites saves repeated futile
//     re-attempts and signals to a human reviewer that fetching
//     these sites needs a different strategy (operator-side run,
//     or accept Wayback-only provenance).
//
// Detection is by published response signatures only — we do NOT
// parse JS challenges, attempt to bypass, or impersonate real
// browsers. Output is informational.
//
// Returns:
//   { provider: 'cloudflare'|'akamai'|'aws-waf'|'imperva'|'sucuri'|'fastly'|'generic'|null,
//     evidence: <string|null>,
//     status:  <int> }

const HEADER_RULES = [
  // Cloudflare — every CF-fronted response carries cf-ray. server:cloudflare on errors.
  ['cloudflare', (h) => 'cf-ray' in h || /cloudflare/i.test(h.server || '')],
  // Akamai — ETC. headers.
  ['akamai',     (h) => 'x-akamai-staging' in h || /akamai/i.test(h.server || '')],
  // AWS WAF
  ['aws-waf',    (h) => 'x-amzn-requestid' in h || 'x-amz-cf-id' in h],
  // Imperva (Incapsula)
  ['imperva',    (h) => 'x-iinfo' in h || 'x-cdn' in h && /incap/i.test(h['x-cdn'] || '')],
  // Sucuri
  ['sucuri',     (h) => 'x-sucuri-id' in h || /sucuri/i.test(h.server || '')],
  // Fastly
  ['fastly',     (h) => 'x-served-by' in h && /fastly|cache-/i.test(h['x-served-by'] || '')],
];

const BODY_RULES = [
  ['cloudflare', /<title>Just a moment\.\.\.|cloudflare ray id|attention required! \| cloudflare|sorry, you have been blocked/i],
  ['akamai',     /Reference\s*&#?\d+;[\s\S]{0,80}akamai|access denied[\s\S]{0,200}akamai/i],
  ['aws-waf',    /<title>403 Forbidden<\/title>[\s\S]{0,200}AWS|aws-waf|AWSALB|<requestid>/i],
  ['imperva',    /imperva|incap_ses|visid_incap/i],
  ['sucuri',     /sucuri/i],
];

// Best-effort lower-cased header copy. Some response objects already
// give lower-cased keys; this is defensive.
function normHeaders(h) {
  if (!h) return {};
  const out = {};
  for (const [k, v] of Object.entries(h)) out[String(k).toLowerCase()] = v;
  return out;
}

export function detectWaf(status, headers, body) {
  const h = normHeaders(headers);
  // Header-based first (cheap, conclusive).
  for (const [name, fn] of HEADER_RULES) {
    if (fn(h)) {
      return {
        provider: name,
        evidence: `header signature: ${signatureHeaders(h, name)}`,
        status,
      };
    }
  }
  // Body-based (only useful when we have a body).
  const text = typeof body === 'string' ? body : '';
  for (const [name, re] of BODY_RULES) {
    const m = text.match(re);
    if (m) return { provider: name, evidence: `body match: ${m[0].slice(0, 120)}`, status };
  }
  // Generic: 403/503 with an HTML body that looks like a block page.
  if ((status === 403 || status === 503) && /forbidden|denied|blocked|verify you are human/i.test(text)) {
    return { provider: 'generic', evidence: 'HTML block page', status };
  }
  return { provider: null, evidence: null, status };
}

function signatureHeaders(h, name) {
  const present = [];
  if (name === 'cloudflare') {
    if ('cf-ray' in h)         present.push(`cf-ray=${h['cf-ray']}`);
    if ('server' in h)         present.push(`server=${h.server}`);
    if ('cf-cache-status' in h) present.push(`cf-cache-status=${h['cf-cache-status']}`);
  } else if (name === 'akamai') {
    if ('x-akamai-staging' in h) present.push(`x-akamai-staging=${h['x-akamai-staging']}`);
    if ('server' in h)            present.push(`server=${h.server}`);
  } else if (name === 'aws-waf') {
    if ('x-amzn-requestid' in h) present.push(`x-amzn-requestid=${h['x-amzn-requestid']}`);
  } else if (name === 'imperva') {
    if ('x-iinfo' in h) present.push(`x-iinfo=${h['x-iinfo']}`);
  } else if (name === 'sucuri') {
    if ('x-sucuri-id' in h) present.push(`x-sucuri-id=${h['x-sucuri-id']}`);
  } else if (name === 'fastly') {
    if ('x-served-by' in h) present.push(`x-served-by=${h['x-served-by']}`);
  }
  return present.join('; ') || '(none)';
}
