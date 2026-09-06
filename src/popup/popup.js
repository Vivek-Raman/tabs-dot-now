const form = document.querySelector("#search-form")
const input = document.querySelector("#search-query")
const status = document.querySelector("#status")
const button = form.querySelector("button")
const spotifyAction = document.querySelector("#spotify-action")
const spotifyStatus = document.querySelector("#spotify-status")
const nowPlaying = document.querySelector("#now-playing")
const albumArt = document.querySelector("#album-art")
const playbackLabel = document.querySelector("#playback-label")
const trackName = document.querySelector("#track-name")
const trackCreators = document.querySelector("#track-creators")

let spotifyConnected = false
let spotifyPoll

input.focus()

function setSpotifyPolling(enabled) {
  clearInterval(spotifyPoll)

  if (enabled) {
    spotifyPoll = setInterval(loadCurrentlyPlaying, 5_000)
  }
}

function renderSpotify(playback) {
  spotifyConnected = playback.connected
  spotifyAction.textContent = playback.connected
    ? "Disconnect"
    : "Connect Spotify"
  spotifyAction.disabled = false
  setSpotifyPolling(playback.connected)

  if (!playback.connected) {
    nowPlaying.hidden = true
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

async function loadCurrentlyPlaying() {
  try {
    const playback = await browser.runtime.sendMessage({
      type: "spotify-currently-playing",
    })
    renderSpotify(playback)
  } catch (error) {
    console.error(error)
    setSpotifyPolling(false)
    spotifyStatus.textContent = error.message
  }
}

async function initializeSpotify() {
  const connection = await browser.runtime.sendMessage({
    type: "spotify-status",
  })

  if (connection.connected) {
    await loadCurrentlyPlaying()
  } else {
    renderSpotify(connection)
  }
}

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
  } catch (error) {
    console.error(error)
    spotifyAction.disabled = false
    spotifyStatus.textContent = error.message
  }
})

form.addEventListener("submit", async (event) => {
  event.preventDefault()

  const query = input.value.trim()
  if (!query) return

  button.disabled = true
  status.dataset.state = "loading"
  status.textContent = "Loading..."

  try {
    const message = await browser.runtime.sendMessage({
      type: "load-tab",
      query,
    })

    status.dataset.state = "success"
    status.textContent = message
  } catch (error) {
    console.error(error)
    status.dataset.state = "error"
    status.textContent = "Firefox could not open the tab."
  } finally {
    button.disabled = false
  }
})

initializeSpotify().catch((error) => {
  console.error(error)
  spotifyStatus.textContent = error.message
})
