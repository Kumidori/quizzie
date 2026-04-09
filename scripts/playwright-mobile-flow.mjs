import { chromium } from 'playwright'

const baseUrl = process.env.QUIZ_DUEL_BASE_URL ?? 'http://localhost:3000'
const viewport = { width: 320, height: 568 }

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function createPlayer(page, name) {
  await page.getByPlaceholder('Nico').fill(name)
}

const browser = await chromium.launch({ headless: true })
const hostContext = await browser.newContext({ viewport })
const guestContext = await browser.newContext({ viewport })
const hostPage = await hostContext.newPage()
const guestPage = await guestContext.newPage()

try {
  await hostPage.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 })
  await createPlayer(hostPage, 'Host')
  await hostPage.getByRole('button', { name: 'Create room' }).click()
  await hostPage.waitForURL(/room=/, { timeout: 15_000 })
  await hostPage.waitForSelector('text=Ready to play', { timeout: 15_000 })

  await guestPage.goto(hostPage.url(), { waitUntil: 'networkidle', timeout: 60_000 })
  await createPlayer(guestPage, 'Guest')
  await guestPage.getByRole('button', { name: 'Join room' }).click()
  await guestPage.waitForSelector('text=The host will start when ready.', { timeout: 15_000 })

  await hostPage.reload({ waitUntil: 'networkidle' })
  await hostPage.getByRole('button', { name: 'Start game' }).click()
  await hostPage.waitForSelector('text=Tap a category to lock it in.', { timeout: 15_000 })

  const categoryOverflow = await hostPage.evaluate(() => {
    const zone = document.querySelector('.content-zone')
    if (!zone) {
      return null
    }
    return {
      clientHeight: zone.clientHeight,
      overflowY: getComputedStyle(zone).overflowY,
      scrollHeight: zone.scrollHeight,
    }
  })

  assert(categoryOverflow, 'Category picker container was not rendered.')
  assert(categoryOverflow.overflowY === 'auto', 'Category picker should scroll on small screens.')
  assert(categoryOverflow.scrollHeight > categoryOverflow.clientHeight, 'Category picker should have overflow to exercise mobile scrolling.')

  await hostPage.locator('.content-zone').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await hostPage.locator('button.category-option').last().click()

  await hostPage.waitForSelector('text=Question 1 of 3', { timeout: 15_000 })
  await guestPage.waitForSelector('text=Question 1 of 3', { timeout: 15_000 })

  await guestPage.locator('.answers-grid button').first().click()
  await guestPage.waitForSelector('text=Question 2 of 3', { timeout: 5_000 })
  const questionBeforePoll = (await guestPage.locator('.hero-card.question-card h2').textContent())?.trim()

  await guestPage.waitForTimeout(4_200)
  const headerAfterPoll = (await guestPage.locator('header h1').textContent())?.trim()
  const questionAfterPoll = (await guestPage.locator('.hero-card.question-card h2').textContent())?.trim()

  assert(headerAfterPoll === 'Question 2 of 3', 'Polling moved the guest back to the wrong question header.')
  assert(questionAfterPoll === questionBeforePoll, 'Polling replaced the active question after one answer was selected.')

  console.log(
    JSON.stringify({
      baseUrl,
      categoryOverflow,
      questionAfterPoll,
      status: 'ok',
    }),
  )
} finally {
  await browser.close()
}
