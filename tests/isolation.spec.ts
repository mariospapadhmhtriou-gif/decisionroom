/**
 * Two-user isolation + server-side validation, run against a real deployment.
 *
 *   npx playwright test -c tests/playwright.live.config.ts
 *
 * Needs two DeepSpace test accounts (npx deepspace test accounts list).
 * No billed integration is reached: every foreign-id call must be refused
 * by the ownership check before any integration runs.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 DeepSpace test accounts')
test.setTimeout(90_000)

/** Create a decision through the UI and capture the caller's bearer token. */
async function createDecision(page: Page, question: string) {
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (req.url().includes('/api/actions/') && auth?.startsWith('Bearer ')) token = auth.slice(7)
  })
  await page.goto('/decisions')
  await page.getByRole('button', { name: 'New decision' }).click()
  await page.waitForURL(/\/decisions\/[^/]+$/, { timeout: 20_000 })
  const id = page.url().split('/').pop()!
  await page.getByLabel('Decision question').fill(question)
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 20_000 })
  expect(token).not.toBe('')
  return { id, token }
}

async function call(page: Page, token: string, name: string, params: unknown) {
  const res = await page.request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: params,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body: body as { success?: boolean; code?: string; data?: unknown } }
}

test('a second user cannot read, change or use another user’s decision', async ({ users }) => {
  const [a, b] = await users(2)
  const question = `Private question ${Date.now()}`
  const alice = await createDecision(a.page, question)
  const bob = await createDecision(b.page, 'Bob decision')

  // UI: Bob neither sees it in his list nor can open it.
  await b.page.goto('/decisions')
  await expect(b.page.getByText('Bob decision')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByText(question)).toHaveCount(0)
  await b.page.goto(`/decisions/${alice.id}`)
  await expect(b.page.getByText('Decision not found')).toBeVisible({ timeout: 15_000 })

  // Server: every action on Alice's id with Bob's token is refused.
  for (const [name, params] of [
    ['saveDecision', { id: alice.id, baseRevision: 2, doc: { question: 'hijacked' } }],
    ['generateBrief', { id: alice.id }],
    ['suggestOptions', { id: alice.id }],
    ['suggestCriteria', { id: alice.id }],
    ['suggestScores', { id: alice.id }],
    ['searchEvidence', { id: alice.id, query: 'anything' }],
    ['emailBrief', { id: alice.id }],
    ['deleteDecision', { id: alice.id }],
  ] as const) {
    const r = await call(b.page, bob.token, name, params)
    expect(r.body.success, `${name} as another user`).toBe(false)
    expect(r.body.code, `${name} as another user`).toBe('not_found')
  }

  // Signed-out and forged tokens are rejected outright.
  expect((await call(b.page, '', 'saveDecision', { id: alice.id })).status).toBe(401)
  expect((await call(b.page, 'not-a-jwt', 'saveDecision', { id: alice.id })).status).toBe(401)

  // Alice's decision is intact after all of that.
  await a.page.goto(`/decisions/${alice.id}`)
  await expect(a.page.getByLabel('Decision question')).toHaveValue(question, { timeout: 15_000 })

  // Server-side validation rejects invalid input even from the owner.
  const valid = {
    question: 'q', constraints: '', sample: false, brief: null, evidence: [],
    criteria: [{ name: 'a', weight: 5 }, { name: 'b', weight: 5 }, { name: 'c', weight: 5 }],
    options: [{ name: 'x', scores: [3, 3, 3] }, { name: 'y', scores: [3, 3, 3] }, { name: 'z', scores: [3, 3, 3] }],
  }
  const stale = await call(a.page, alice.token, 'saveDecision', { id: alice.id, baseRevision: 0, doc: valid })
  expect(stale.body.code).toBe('conflict')
  const current = (await call(a.page, alice.token, 'saveDecision', { id: alice.id, baseRevision: -1, doc: valid })).body
  expect(current.code).toBe('conflict')
  const rev = Number((current as { details?: { revision?: number } }).details?.revision)
  for (const bad of [
    { ...valid, options: [{ name: 'x', scores: [9, 3, 3] }, valid.options[1], valid.options[2]] },
    { ...valid, criteria: [{ name: 'a', weight: 11 }, valid.criteria[1], valid.criteria[2]] },
    { ...valid, evidence: [{ id: 'S1', optionIndex: 0, title: 't', url: 'javascript:alert(1)', snippet: '', note: '', savedAt: '' }] },
  ]) {
    const r = await call(a.page, alice.token, 'saveDecision', { id: alice.id, baseRevision: rev, doc: bad })
    expect(r.body.code).toBe('invalid')
  }

  // Clean up with each owner's own token.
  expect((await call(a.page, alice.token, 'deleteDecision', { id: alice.id })).body.success).toBe(true)
  expect((await call(b.page, bob.token, 'deleteDecision', { id: bob.id })).body.success).toBe(true)
})
