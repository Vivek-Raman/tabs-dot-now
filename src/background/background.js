const ultimateGuitarPatterns = [
  "*://ultimate-guitar.com/*",
  "*://*.ultimate-guitar.com/*",
]
const JAMMING_STORAGE_KEY = "jamming"
const JAM_MODE_STORAGE_KEY = "jamMode"
const JAMMING_POLL_MS = 5_000

let jamming = false
let jamMode = "chords"
let jammingPoll
let lastJammedTrackUri

function getSearchUrl(query, mode = jamMode) {
  const url = new URL("https://www.ultimate-guitar.com/search.php")
  url.searchParams.set("search_type", "title")
  url.searchParams.set("value", query)
  url.searchParams.append("type[]", mode === "chords" ? "300" : "200")
  return url.toString()
}

async function findUltimateGuitarTab() {
  const currentWindowTabs = await browser.tabs.query({
    currentWindow: true,
    url: ultimateGuitarPatterns,
  })

  if (currentWindowTabs.length > 0) return currentWindowTabs[0]

  const allTabs = await browser.tabs.query({ url: ultimateGuitarPatterns })
  return allTabs[0]
}

async function loadTab(query, mode = jamMode) {
  const url = getSearchUrl(query, mode)
  const { reuseOpenTab = true } = await browser.storage.local.get({
    reuseOpenTab: true,
  })

  if (!reuseOpenTab) {
    await browser.tabs.create({ active: true, url })
    return `Opened a new Ultimate Guitar ${mode} search.`
  }

  const existingTab = await findUltimateGuitarTab()

  if (existingTab?.id !== undefined) {
    await browser.tabs.update(existingTab.id, { active: true, url })
    await browser.windows.update(existingTab.windowId, { focused: true })
    return `Loaded ${mode} in your open Ultimate Guitar tab.`
  }

  await browser.tabs.create({ active: true, url })
  return `Opened a new Ultimate Guitar ${mode} search.`
}

function scheduleJammingCheck() {
  clearTimeout(jammingPoll)

  if (!jamming) return

  jammingPoll = setTimeout(() => {
    checkForJammingTrack().catch((error) => {
      console.error("Could not check the current Spotify track.", error)
    })
  }, JAMMING_POLL_MS)
}

async function checkForJammingTrack() {
  if (!jamming) return "Jamming is stopped."

  try {
    const playback = await Spotify.getCurrentlyPlaying()

    if (!jamming || !playback.current) {
      return "Waiting for a song to play."
    }

    if (playback.current.uri === lastJammedTrackUri) {
      return "Waiting for the next song."
    }

    const message = await loadTab(playback.current.name)
    lastJammedTrackUri = playback.current.uri
    return message
  } finally {
    scheduleJammingCheck()
  }
}

async function setJamming(active) {
  jamming = active
  lastJammedTrackUri = undefined
  await browser.storage.local.set({ [JAMMING_STORAGE_KEY]: active })

  if (!active) {
    clearTimeout(jammingPoll)
    return "Jamming stopped."
  }

  return checkForJammingTrack()
}

async function setJamMode(mode) {
  if (mode !== "tabs" && mode !== "chords") {
    throw new Error("Choose tabs or chords.")
  }

  jamMode = mode
  await browser.storage.local.set({ [JAM_MODE_STORAGE_KEY]: mode })

  if (!jamming) return ""

  lastJammedTrackUri = undefined
  return checkForJammingTrack()
}

const restoreJamming = browser.storage.local
  .get({ [JAMMING_STORAGE_KEY]: false, [JAM_MODE_STORAGE_KEY]: "chords" })
  .then(async (stored) => {
    jamming = stored[JAMMING_STORAGE_KEY]
    jamMode = stored[JAM_MODE_STORAGE_KEY]
    if (jamming) await checkForJammingTrack()
  })
  .catch((error) => {
    console.error("Could not restore jamming.", error)
  })

browser.runtime.onMessage.addListener(async (message) => {
  await restoreJamming

  switch (message?.type) {
    case "load-tab": {
      if (typeof message.query !== "string") return undefined

      const query = message.query.trim()
      if (!query) throw new Error("Enter a search query.")

      return loadTab(query)
    }
    case "jamming-status":
      return { active: jamming, mode: jamMode }
    case "jamming-set-mode": {
      const message = await setJamMode(message.mode)
      return { mode: jamMode, message }
    }
    case "jamming-start":
      return { active: true, message: await setJamming(true) }
    case "jamming-stop":
      return { active: false, message: await setJamming(false) }
    case "spotify-connect":
      await Spotify.connect()
      return Spotify.getCurrentlyPlaying()
    case "spotify-disconnect":
      await setJamming(false)
      return Spotify.disconnect()
    case "spotify-status":
      return Spotify.getStatus()
    case "spotify-currently-playing":
      return Spotify.getCurrentlyPlaying()
    case "spotify-queue":
      return Spotify.getQueue()
    default:
      return undefined
  }
})

browser.action.onClicked.addListener(() => browser.sidebarAction.toggle())
