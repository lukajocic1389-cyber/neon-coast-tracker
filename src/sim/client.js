// HTTP side of the simulator: submits a plan to POST /api/events and checks the dashboards (spec §4).
// Coded against the spec contract only; it does not import any server module.

/** Thrown when the server cannot be reached at all (the CLI maps it to exit code 2). */
export class ServerUnreachableError extends Error {
  constructor(url, cause) {
    super(`Could not reach the server at ${url}: ${cause?.message ?? cause}`);
    this.name = 'ServerUnreachableError';
    this.url = url;
    this.cause = cause;
  }
}

/** Join a path onto the base URL, keeping any base path and tolerating a trailing slash. */
export function apiUrl(baseUrl, path) {
  const base = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base).toString();
}

async function request(fetchImpl, url, init) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    throw new ServerUnreachableError(url, err);
  }
  let text;
  try {
    text = await res.text();
  } catch (err) {
    throw new ServerUnreachableError(url, err);
  }
  let body = text;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    // keep the raw text for non-JSON bodies
  }
  return { status: res.status, body };
}

/** Error codes in a §4.3 rejected body. The server may report extra codes; only inclusion is checked. */
function errorCodes(body) {
  return Array.isArray(body?.errors) ? body.errors.map((e) => e?.code) : [];
}

const STATUS_BUCKETS ={ 201: 'accepted', 200: 'duplicate', 409: 'duplicate_conflict', 400: 'rejected' };

/**
 * Submit every planned event sequentially, in order (duplicates rely on the order).
 * @param {Array<{ kind: string, expectedStatus: number, expectedCode?: string, event: object }>} plan
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ sent: number, byStatus: { accepted: number, duplicate: number, duplicate_conflict: number,
 *   rejected: number, other: number }, unexpected: Array<{ event_id: string, expectedStatus: number,
 *   actualStatus: number, expectedCode?: string, body: unknown }> }>}
 * An entry is unexpected when the HTTP status differs, or when a 400 lacks the planned error code.
 */
export async function runPlan(plan, { baseUrl, fetchImpl = fetch } = {}) {
  const url = apiUrl(baseUrl, '/api/events');
  const byStatus = { accepted: 0, duplicate: 0, duplicate_conflict: 0, rejected: 0, other: 0 };
  const unexpected = [];
  let sent = 0;

  for (const submission of plan) {
    let response;
    try {
      response = await request(fetchImpl, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(submission.event),
      });
    } catch (err) {
      if (err instanceof ServerUnreachableError) err.progress = { sent, byStatus, unexpected }; // partial results
      throw err;
    }
    const { status, body } = response;
    sent += 1;
    byStatus[STATUS_BUCKETS[status] ?? 'other'] += 1;
    const codeMissing = submission.expectedCode !== undefined && status === submission.expectedStatus
      && !errorCodes(body).includes(submission.expectedCode);
    if (status !== submission.expectedStatus || codeMissing) {
      unexpected.push({
        event_id: submission.event.event_id,
        expectedStatus: submission.expectedStatus,
        actualStatus: status,
        ...(submission.expectedCode !== undefined && { expectedCode: submission.expectedCode }),
        body,
      });
    }
  }

  return { sent, byStatus, unexpected };
}

/**
 * Fetch each player's dashboard and compare the totals field by field.
 * Only completed_count, failed_count, cash_balance and reputation_by_crew are compared.
 * @param {ReturnType<import('./expected.js').computeExpected>} expected
 * @param {{ baseUrl: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<Array<{ player_id: string, field: string, expected: unknown, actual: unknown }>>}
 */
export async function verifyDashboards(expected, { baseUrl, fetchImpl = fetch } = {}) {
  const mismatches = [];
  for (const [playerId, exp] of Object.entries(expected)) {
    const url = apiUrl(baseUrl, `/api/players/${encodeURIComponent(playerId)}/dashboard`);
    const { status, body } = await request(fetchImpl, url, { headers: { accept: 'application/json' } });
    if (status !== 200 || body === null || typeof body !== 'object') {
      mismatches.push({ player_id: playerId, field: 'http_status', expected: 200, actual: status });
      continue;
    }
    for (const field of ['completed_count', 'failed_count', 'cash_balance']) {
      if (body[field] !== exp[field]) {
        mismatches.push({ player_id: playerId, field, expected: exp[field], actual: body[field] });
      }
    }
    const actualRep = body.reputation_by_crew && typeof body.reputation_by_crew === 'object' ? body.reputation_by_crew : {};
    const crews = new Set([...Object.keys(exp.reputation_by_crew), ...Object.keys(actualRep)]);
    for (const crew of crews) {
      const want = exp.reputation_by_crew[crew];
      const got = actualRep[crew];
      if (want !== got) {
        mismatches.push({ player_id: playerId, field: `reputation_by_crew.${crew}`, expected: want, actual: got });
      }
    }
  }
  return mismatches;
}
