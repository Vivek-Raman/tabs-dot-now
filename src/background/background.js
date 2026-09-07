const ultimateGuitarPatterns = [
  "*://ultimate-guitar.com/*",
  "*://*.ultimate-guitar.com/*",
]
const JAMMING_STORAGE_KEY = "jamming"
const JAM_MODE_STORAGE_KEY = "jamMode"
const JAM_RESULT_STORAGE_KEY = "jamResult"
const JAMMING_POLL_MS = 5_000

let jamming = false
let jamMode = "chords"
let jamResult = "most-rated"
let lastJamDebug = ""
let jammingPoll
let lastJammedTrackUri

function getSearchUrl(query, mode = jamMode, mostRatedTrack = null) {
  const url = new URL("https://www.ultimate-guitar.com/search.php")
  url.searchParams.set("search_type", "title")
  url.searchParams.set("value", query)
  url.searchParams.append("type[]", mode === "chords" ? "300" : "200")

  if (mostRatedTrack) {
    url.searchParams.set("tabs-now-open", "most-rated")
    url.searchParams.set("tabs-now-title", mostRatedTrack.name)
    url.searchParams.set("tabs-now-creators", mostRatedTrack.creators.join("\u001f"))
  }

  return url.toString()
}

function getTrackQuery(track) {
  return [track.name, ...track.creators].filter(Boolean).join(" ")
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

async function loadTab(query, mode = jamMode, mostRatedTrack = null) {
  const url = getSearchUrl(query, mode, mostRatedTrack)
  const destination = mostRatedTrack
    ? `most rated ${mode} result`
    : `${mode} search`
  const { reuseOpenTab = true } = await browser.storage.local.get({
    reuseOpenTab: true,
  })

  if (!reuseOpenTab) {
    await browser.tabs.create({ active: true, url })
    return `Opened a new Ultimate Guitar ${destination}.`
  }

  const existingTab = await findUltimateGuitarTab()

  if (existingTab?.id !== undefined) {
    await browser.tabs.update(existingTab.id, { active: true, url })
    await browser.windows.update(existingTab.windowId, { focused: true })
    return `Loading the ${destination} in your Ultimate Guitar tab.`
  }

  await browser.tabs.create({ active: true, url })
  return `Opened a new Ultimate Guitar ${destination}.`
}

async function loadMostRatedTab(track, mode = jamMode) {
  console.info("[Tabs Now] Loading most-rated search", {
    track: track.name,
    creators: track.creators,
    mode,
  })
  return loadTab(getTrackQuery(track), mode, track)
}

function loadTrack(track, result = jamResult) {
  if (result === "search") return loadTab(getTrackQuery(track))
  return loadMostRatedTab(track)
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

    const message = await loadTrack(playback.current)
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

async function setJamResult(result) {
  if (result !== "search" && result !== "most-rated") {
    throw new Error("Choose search results or most rated.")
  }

  jamResult = result
  await browser.storage.local.set({ [JAM_RESULT_STORAGE_KEY]: result })
}

async function openCurrentTrack(result) {
  if (result !== "search" && result !== "most-rated") {
    throw new Error("Choose search results or most rated.")
  }

  const playback = await Spotify.getCurrentlyPlaying()
  if (!playback.current) throw new Error("Play a song to open a tab.")

  const message = await loadTrack(playback.current, result)
  if (jamming) lastJammedTrackUri = playback.current.uri
  return message
}

const restoreJamming = browser.storage.local
  .get({
    [JAMMING_STORAGE_KEY]: false,
    [JAM_MODE_STORAGE_KEY]: "chords",
    [JAM_RESULT_STORAGE_KEY]: "most-rated",
  })
  .then(async (stored) => {
    jamming = stored[JAMMING_STORAGE_KEY]
    jamMode = stored[JAM_MODE_STORAGE_KEY]
    jamResult = stored[JAM_RESULT_STORAGE_KEY]
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
      return { active: jamming, mode: jamMode, result: jamResult, debug: lastJamDebug }
    case "jamming-set-mode": {
      const message = await setJamMode(message.mode)
      return { mode: jamMode, message }
    }
    case "jamming-set-result":
      await setJamResult(message.result)
      return { result: jamResult }
    case "jamming-open-current":
      return { message: await openCurrentTrack(message.result) }
    case "jamming-debug":
      lastJamDebug = message.detail || ""
      console.info("[Tabs Now] Most-rated debug:", lastJamDebug)
      return undefined
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
