import { expect, test } from '@playwright/test'

test.describe.serial('World Cup sweepstake', () => {
  test('loads the public board without exposing organiser controls', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'World Cup Sweepstake' })).toBeVisible()
    await expect(page.getByText('Awaiting draw')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Organiser sign-in' })).toBeVisible()
    await expect(page.getByLabel('Admin secret')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Run draw' })).toHaveCount(0)
  })

  test('rejects organiser writes without the admin secret', async ({ request }) => {
    const response = await request.post('/api/organiser/participants', {
      data: { fullName: 'No Secret' },
    })

    expect(response.status()).toBe(401)
  })

  test('adds a participant and locks the draw through organiser mode', async ({ page, request }) => {
    await page.goto('/?organiser=1')

    await page.getByLabel('Admin secret').fill('local-dev-secret')
    await page.getByLabel('Participant full name').fill('Avery Stone')
    await page.getByRole('button', { name: 'Add participant' }).click()
    await expect(page.getByTestId('organiser-status')).toContainText('Added Avery Stone')
    await expect(page.locator('.participant-dock').getByText('Avery Stone', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Run draw' }).click()
    await expect(page.getByTestId('organiser-status')).toContainText('Draw locked permanently')
    await expect(page.getByText('Draw locked ·')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add participant' })).toBeDisabled()

    const secondDraw = await request.post('/api/organiser/draw', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
    })

    expect(secondDraw.status()).toBe(409)
  })

  test('keeps public state readable after draw lock', async ({ request }) => {
    const stateResponse = await request.get('/api/state')
    const state = await stateResponse.json()

    expect(stateResponse.status()).toBe(200)
    expect(state.draw.seed).toMatch(/^WC26-LOCK-/)
    expect(state.participants).toHaveLength(1)
    expect(state.assignments).toHaveLength(1)
    expect(state.leaderboard[0].participant.fullName).toBe('Avery Stone')
  })
})
