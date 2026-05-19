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

  test('rejects invalid bulk participant imports before the draw', async ({ request }) => {
    const emptyImport = await request.post('/api/organiser/participants/import', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
      data: { fullNames: [] },
    })

    expect(emptyImport.status()).toBe(400)
    await expect(emptyImport.json()).resolves.toEqual({ message: 'Paste at least one participant full name.' })

    const overCapacityImport = await request.post('/api/organiser/participants/import', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
      data: {
        fullNames: Array.from({ length: 49 }, (_, index) => `Capacity Tester ${index + 1}`),
      },
    })

    expect(overCapacityImport.status()).toBe(409)
    await expect(overCapacityImport.json()).resolves.toEqual({
      message: 'Import would exceed the 48 participant limit. You can add 48 more.',
    })

    const seedImport = await request.post('/api/organiser/participants/import', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
      data: { fullNames: ['Duplicate Tester'] },
    })
    const seedImportBody = await seedImport.json()

    expect(seedImport.status()).toBe(201)
    expect(seedImportBody.summary).toMatchObject({
      requestedCount: 1,
      addedCount: 1,
      skippedDuplicateCount: 0,
      totalParticipantCount: 1,
    })

    const duplicateOnlyImport = await request.post('/api/organiser/participants/import', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
      data: { fullNames: [' duplicate   tester '] },
    })

    expect(duplicateOnlyImport.status()).toBe(409)
    await expect(duplicateOnlyImport.json()).resolves.toEqual({
      message: 'All pasted names are already in the sweepstake.',
    })

    const participantId = seedImportBody.state.participants.find(
      (participant: { fullName: string }) => participant.fullName === 'Duplicate Tester',
    )?.id

    expect(participantId).toBeTruthy()

    const cleanup = await request.delete(`/api/organiser/participants/${participantId}`, {
      headers: { 'x-admin-secret': 'local-dev-secret' },
    })

    expect(cleanup.status()).toBe(200)
  })

  test('adds a participant and locks the draw through organiser mode', async ({ page, request }) => {
    await page.goto('/?organiser=1')

    await page.getByLabel('Admin secret').fill('local-dev-secret')
    await page.getByLabel('Participant full name').fill('Avery Stone')
    await page.getByRole('button', { name: 'Add participant' }).click()
    await expect(page.getByTestId('organiser-status')).toContainText('Added Avery Stone')
    await expect(page.locator('.participant-dock').getByText('Avery Stone', { exact: true })).toBeVisible()

    await page.getByLabel('Bulk participant names').fill('Blake Rivera\nCasey Lee\nAvery Stone')
    await expect(page.getByText('2 ready')).toBeVisible()
    await expect(page.getByText('1 duplicate/already added')).toBeVisible()
    await page.getByRole('button', { name: 'Import names' }).click()
    await expect(page.getByTestId('organiser-status')).toContainText('Imported 2 participant(s)')
    await expect(page.locator('.participant-dock').getByText('Blake Rivera', { exact: true })).toBeVisible()
    await expect(page.locator('.participant-dock').getByText('Casey Lee', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Run draw' }).click()
    await expect(page.getByTestId('organiser-status')).toContainText('Draw locked permanently')
    await expect(page.getByText('Draw locked ·')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add participant' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Import names' })).toBeDisabled()

    const secondDraw = await request.post('/api/organiser/draw', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
    })

    expect(secondDraw.status()).toBe(409)

    const postDrawImport = await request.post('/api/organiser/participants/import', {
      headers: { 'x-admin-secret': 'local-dev-secret' },
      data: { fullNames: ['Late Entrant'] },
    })

    expect(postDrawImport.status()).toBe(409)
    await expect(postDrawImport.json()).resolves.toEqual({
      message: 'The draw is locked; new participants cannot be added.',
    })
  })

  test('keeps public state readable after draw lock', async ({ request }) => {
    const stateResponse = await request.get('/api/state')
    const state = await stateResponse.json()

    expect(stateResponse.status()).toBe(200)
    expect(state.draw.seed).toMatch(/^WC26-LOCK-/)
    expect(state.participants).toHaveLength(3)
    expect(state.assignments).toHaveLength(3)
    expect(state.leaderboard.map((entry: { participant: { fullName: string } }) => entry.participant.fullName)).toContain('Avery Stone')
  })
})
