const spotifyAction = document.querySelector("#spotify-action")
const spotifyStatus = document.querySelector("#spotify-status")
const nowPlaying = document.querySelector("#now-playing")
const albumArt = document.querySelector("#album-art")
const playbackLabel = document.querySelector("#playback-label")
const trackName = document.querySelector("#track-name")
const trackCreators = document.querySelector("#track-creators")
const queuePanel = document.querySelector("#queue-panel")
const queueList = document.querySelector("#queue-list")
const queueStatus = document.querySelector("#queue-status")
const jammingAction = document.querySelector("#jamming-action")
const jammingStatus = document.querySelector("#jamming-status")
const jamModeInputs = document.querySelectorAll('input[name="jam-mode"]')
const jamResultInputs = document.querySelectorAll('input[name="jam-result"]')
const manualOpenButtons = document.querySelectorAll("[data-jam-result]")

let spotifyConnected = false
let jamming = false
let latestPlayback
let jamMode = "chords"
let jamResult = "top-result"
let spotifyPoll
let rapidPollingUntil = 0
let lastQueueTrackUri
let lastQueueRefreshAt = 0
const NORMAL_POLL_MS = 5_000
const FINAL_SECONDS_WINDOW_MS = 5_000
const FINAL_SECONDS_POLL_MS = 1_000
const POST_ROLLOVER_POLL_MS = 5_000
const QUEUE_REFRESH_MS = 60_000
const TOP_RESULT_ORIGINS = [
  "https://www.ultimate-guitar.com/*",
  "https://html.duckduckgo.com/*",
]

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "jamming-debug") return undefined

  console.info("[Tabs Now]", message.detail)
  jammingStatus.textContent = message.detail
  return undefined
})

function getSpotifyPollDelay(playback) {
  if (!playback.isPlaying) {
    if (!playback.current && Date.now() < rapidPollingUntil) {
      return FINAL_SECONDS_POLL_MS
    }

    rapidPollingUntil = 0
    return NORMAL_POLL_MS
  }

  if (
    !Number.isFinite(playback.progressMs) ||
    !Number.isFinite(playback.current?.durationMs)
  ) {
    if (Date.now() < rapidPollingUntil) return FINAL_SECONDS_POLL_MS

    rapidPollingUntil = 0
    return NORMAL_POLL_MS
  }

  const remainingMs = playback.current.durationMs - playback.progressMs

  if (remainingMs <= FINAL_SECONDS_WINDOW_MS) {
    rapidPollingUntil = Math.max(
      rapidPollingUntil,
      Date.now() + Math.max(remainingMs, 0) + POST_ROLLOVER_POLL_MS,
    )
    return FINAL_SECONDS_POLL_MS
  }

  if (Date.now() < rapidPollingUntil) return FINAL_SECONDS_POLL_MS

  // Enter the one-second cadence when the track has five seconds remaining,
  // rather than waiting for the next regular five-second check.
  if (remainingMs < NORMAL_POLL_MS + FINAL_SECONDS_WINDOW_MS) {
    return Math.max(FINAL_SECONDS_POLL_MS, remainingMs - FINAL_SECONDS_WINDOW_MS)
  }

  return NORMAL_POLL_MS
}

function setSpotifyPolling(playback) {
  clearTimeout(spotifyPoll)

  if (!jamming || !playback?.connected) {
    rapidPollingUntil = 0
    return
  }

  const delay = getSpotifyPollDelay(playback)
  const poll = delay === NORMAL_POLL_MS ? loadSpotifyData : loadCurrentlyPlaying
  spotifyPoll = setTimeout(poll, delay)
}

function scheduleSpotifyRetry() {
  if (!jamming || !spotifyConnected) return

  clearTimeout(spotifyPoll)
  spotifyPoll = setTimeout(loadSpotifyData, NORMAL_POLL_MS)
}

async function requestTopResultPermissions() {
  const granted = await browser.permissions.request({
    origins: TOP_RESULT_ORIGINS,
  })

  if (!granted) {
    throw new Error("Allow DuckDuckGo and Ultimate Guitar access to open top results.")
  }
}

function renderSpotify(playback) {
  latestPlayback = playback
  spotifyConnected = playback.connected
  spotifyAction.textContent = playback.connected
    ? "Disconnect"
    : "Connect Spotify"
  spotifyAction.disabled = false
  setSpotifyPolling(playback)
  renderJamming(playback)

  if (!playback.connected) {
    lastQueueTrackUri = undefined
    lastQueueRefreshAt = 0
    nowPlaying.hidden = true
    queuePanel.hidden = true
    spotifyStatus.textContent = "Connect Spotify to see what is playing."
    return
  }

  if (!playback.current) {
    nowPlaying.hidden = true
    spotifyStatus.textContent = "Nothing is currently playing."
    return
  }

  nowPlaying.hidden = false
  spotifyStatus.textContent = ""
  playbackLabel.textContent = playback.isPlaying ? "Now playing" : "Paused"
  trackName.textContent = playback.current.name
  trackCreators.textContent = playback.current.creators.join(", ")

  if (playback.current.imageUrl) {
    albumArt.src = playback.current.imageUrl
    albumArt.alt = `Artwork for ${playback.current.name}`
    albumArt.hidden = false
  } else {
    albumArt.removeAttribute("src")
    albumArt.alt = ""
    albumArt.hidden = true
  }
}

function renderJamming(playback) {
  jammingAction.textContent = jamming ? "Stop jamming" : "Start jamming"
  jammingAction.disabled = !jamming && !playback.connected
  manualOpenButtons.forEach((button) => {
    button.disabled = !playback.current
  })

  if (jamming) {
    jammingStatus.textContent = playback.current
      ? "Ultimate Guitar will open results for each new song."
      : "Waiting for a song to play."
  } else if (!playback.connected) {
    jammingStatus.textContent = "Connect Spotify to start jamming."
  } else if (!playback.current) {
    jammingStatus.textContent = "Start jamming to follow the next song."
  } else {
    jammingStatus.textContent = ""
  }
}

function shouldRefreshQueue(playback, force = false) {
  if (force) return true

  if (!playback.current) {
    return Date.now() - lastQueueRefreshAt >= QUEUE_REFRESH_MS
  }

  return (
    playback.current.uri !== lastQueueTrackUri ||
    Date.now() - lastQueueRefreshAt >= QUEUE_REFRESH_MS
  )
}

function renderQueue(playback) {
  if (!playback.connected) {
    queuePanel.hidden = true
    queueList.replaceChildren()
    return
  }

  queuePanel.hidden = false
  queueList.replaceChildren(
    ...playback.queue.map((item) => {
      const entry = document.createElement("li")
      const name = document.createElement("span")
      const creators = document.createElement("span")

      name.className = "queue-track-name"
      name.textContent = item.name
      creators.className = "queue-track-creators"
      creators.textContent = item.creators.join(", ")
      entry.append(name, creators)
      return entry
    }),
  )
  queueStatus.textContent = playback.queue.length ? "" : "Nothing else is queued."
}

async function refreshQueue(playback) {
  const currentTrackUri = playback.current?.uri ?? null

  try {
    const queue = await browser.runtime.sendMessage({ type: "spotify-queue" })
    renderQueue(queue)
  } catch (error) {
    console.error(error)
    queueStatus.textContent = error.message || "Could not load the queue."
  } finally {
    lastQueueTrackUri = currentTrackUri
    lastQueueRefreshAt = Date.now()
  }
}

async function updateSpotify(playback, forceQueue = false) {
  renderSpotify(playback)

  if (shouldRefreshQueue(playback, forceQueue)) {
    await refreshQueue(playback)
  }
}

async function loadSpotifyData(forceQueue = false) {
  try {
    const playback = await browser.runtime.sendMessage({
      type: "spotify-currently-playing",
    })
    await updateSpotify(playback, forceQueue)
  } catch (error) {
    console.error(error)
    spotifyStatus.textContent = error.message || "Could not load Spotify."
    scheduleSpotifyRetry()
  }
}

async function loadCurrentlyPlaying() {
  try {
    const playback = await browser.runtime.sendMessage({
      type: "spotify-currently-playing",
    })
    await updateSpotify(playback)
  } catch (error) {
    console.error(error)
    spotifyStatus.textContent = error.message || "Could not load Spotify."
    scheduleSpotifyRetry()
  }
}

async function initializeSpotify() {
  const connection = await browser.runtime.sendMessage({
    type: "spotify-status",
  })

  if (connection.connected) {
    await loadSpotifyData(true)
  } else {
    renderSpotify(connection)
  }
}

async function initializeJamming() {
  const state = await browser.runtime.sendMessage({ type: "jamming-status" })
  jamming = state.active
  jamMode = state.mode
  jamResult = state.result
  document.querySelector(`input[name="jam-mode"][value="${jamMode}"]`).checked = true
  document.querySelector(`input[name="jam-result"][value="${jamResult}"]`).checked = true
}

jamModeInputs.forEach((input) => {
  input.addEventListener("change", async () => {
    if (!input.checked || input.value === jamMode) return

    try {
      const result = await browser.runtime.sendMessage({
        type: "jamming-set-mode",
        mode: input.value,
      })
      jamMode = result.mode

      if (result.message) jammingStatus.textContent = result.message
    } catch (error) {
      console.error(error)
      document.querySelector(`input[name="jam-mode"][value="${jamMode}"]`).checked = true
      jammingStatus.textContent = error.message || "Could not change jam mode."
    }
  })
})

jamResultInputs.forEach((input) => {
  input.addEventListener("change", async () => {
    if (!input.checked || input.value === jamResult) return

    try {
      if (input.value === "top-result") await requestTopResultPermissions()
      const result = await browser.runtime.sendMessage({
        type: "jamming-set-result",
        result: input.value,
      })
      jamResult = result.result
      jammingStatus.textContent = "This auto-open behavior will apply to the next song."
    } catch (error) {
      console.error(error)
      document.querySelector(`input[name="jam-result"][value="${jamResult}"]`).checked = true
      jammingStatus.textContent = error.message || "Could not change auto-open behavior."
    }
  })
})

manualOpenButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    button.disabled = true
    jammingStatus.textContent = "Opening..."

    try {
      if (button.dataset.jamResult === "top-result") {
        await requestTopResultPermissions()
      }
      const result = await browser.runtime.sendMessage({
        type: "jamming-open-current",
        result: button.dataset.jamResult,
      })
      jammingStatus.textContent = result.message
    } catch (error) {
      console.error(error)
      jammingStatus.textContent = error.message || "Could not open the current track."
    } finally {
      button.disabled = false
    }
  })
})

spotifyAction.addEventListener("click", async () => {
  spotifyAction.disabled = true
  spotifyStatus.textContent = spotifyConnected
    ? "Disconnecting..."
    : "Connecting..."

  try {
    const result = await browser.runtime.sendMessage({
      type: spotifyConnected ? "spotify-disconnect" : "spotify-connect",
    })
    renderSpotify(result)
    if (result.connected) await loadSpotifyData(true)
  } catch (error) {
    console.error(error)
    spotifyAction.disabled = false
    spotifyStatus.textContent = error.message
  }
})

jammingAction.addEventListener("click", async () => {
  jammingAction.disabled = true
  jammingStatus.textContent = jamming ? "Stopping..." : "Starting..."

  try {
    if (!jamming && jamResult === "top-result") {
      await requestTopResultPermissions()
    }
    const result = await browser.runtime.sendMessage({
      type: jamming ? "jamming-stop" : "jamming-start",
    })
    jamming = result.active
    jammingStatus.textContent = result.message
    setSpotifyPolling(latestPlayback)
  } catch (error) {
    console.error(error)
    jammingStatus.textContent = error.message || "Firefox could not update jamming."
  } finally {
    jammingAction.disabled = false
    jammingAction.textContent = jamming ? "Stop jamming" : "Start jamming"
  }
})

initializeJamming().then(initializeSpotify).catch((error) => {
  console.error(error)
  spotifyStatus.textContent = error.message
})
