const SPOTIFY_TOKEN_KEY = "spotifyTokens"
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
const SPOTIFY_API_URL = "https://api.spotify.com/v1"
const TOKEN_EXPIRY_BUFFER_MS = 60_000

let refreshInFlight

function getSpotifyConfig() {
  const config = globalThis.SPOTIFY_CONFIG

  if (
    !config?.clientId ||
    config.clientId === "PASTE_YOUR_SPOTIFY_CLIENT_ID_HERE"
  ) {
    throw new Error("Add your Spotify Client ID to spotify-config.js.")
  }

  return config
}

function encodeBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
}

function generateRandomValue(byteLength = 48) {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

async function createCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  )

  return encodeBase64Url(new Uint8Array(digest))
}

async function requestTokens(parameters) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      body.error_description || body.error || "Spotify token request failed.",
    )
  }

  return body
}

async function readTokens() {
  const stored = await browser.storage.local.get(SPOTIFY_TOKEN_KEY)
  return stored[SPOTIFY_TOKEN_KEY] ?? null
}

async function writeTokens(tokenResponse, previousRefreshToken) {
  const tokens = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    scopes: tokenResponse.scope?.split(" ").filter(Boolean) ?? [],
  }

  await browser.storage.local.set({ [SPOTIFY_TOKEN_KEY]: tokens })
  return tokens
}

async function connectSpotify() {
  const { clientId, scopes } = getSpotifyConfig()
  const redirectUri = browser.identity.getRedirectURL("spotify")
  const verifier = generateRandomValue()
  const state = generateRandomValue(24)
  const challenge = await createCodeChallenge(verifier)
  const authorizationUrl = new URL("https://accounts.spotify.com/authorize")

  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString()

  const responseUrl = await browser.identity.launchWebAuthFlow({
    interactive: true,
    url: authorizationUrl.toString(),
  })

  if (!responseUrl?.startsWith(redirectUri)) {
    throw new Error("Spotify returned an unexpected callback URL.")
  }

  const callback = new URL(responseUrl)
  const returnedState = callback.searchParams.get("state")
  const authorizationCode = callback.searchParams.get("code")
  const authorizationError = callback.searchParams.get("error")

  if (returnedState !== state) {
    throw new Error("Spotify authorization state did not match.")
  }

  if (authorizationError) {
    throw new Error(`Spotify authorization failed: ${authorizationError}.`)
  }

  if (!authorizationCode) {
    throw new Error("Spotify did not return an authorization code.")
  }

  const tokenResponse = await requestTokens({
    client_id: clientId,
    grant_type: "authorization_code",
    code: authorizationCode,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })

  await writeTokens(tokenResponse)
  return { connected: true }
}

async function refreshSpotifyTokens() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { clientId } = getSpotifyConfig()
    const currentTokens = await readTokens()

    if (!currentTokens?.refreshToken) {
      throw new Error("Connect Spotify again to continue.")
    }

    const tokenResponse = await requestTokens({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: currentTokens.refreshToken,
    })

    return writeTokens(tokenResponse, currentTokens.refreshToken)
  })()

  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = undefined
  }
}

async function getValidAccessToken(forceRefresh = false) {
  const tokens = await readTokens()

  if (!tokens) throw new Error("Spotify is not connected.")

  if (
    !forceRefresh &&
    tokens.accessToken &&
    tokens.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS
  ) {
    return tokens.accessToken
  }

  const refreshed = await refreshSpotifyTokens()
  return refreshed.accessToken
}

async function spotifyRequest(path, retryAfterRefresh = true) {
  const accessToken = await getValidAccessToken()
  const response = await fetch(`${SPOTIFY_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (response.status === 401 && retryAfterRefresh) {
    await getValidAccessToken(true)
    return spotifyRequest(path, false)
  }

  if (response.status === 204) return null

  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After")
    const body = await response.json().catch(() => ({}))
    const message = body.error?.message || `Spotify returned ${response.status}.`

    if (response.status === 429 && retryAfter) {
      throw new Error(`${message} Try again in ${retryAfter} seconds.`)
    }

    throw new Error(message)
  }

  return response.json()
}

function normalizeItem(item) {
  if (!item) return null

  const isTrack = item.type === "track"

  return {
    type: item.type,
    name: item.name,
    creators: isTrack
      ? item.artists?.map((artist) => artist.name) ?? []
      : [item.show?.name].filter(Boolean),
    imageUrl: isTrack
      ? item.album?.images?.[0]?.url ?? null
      : item.images?.[0]?.url ?? null,
    durationMs: item.duration_ms,
    spotifyUrl: item.external_urls?.spotify ?? null,
    uri: item.uri,
  }
}

async function getCurrentlyPlaying() {
  const playback = await spotifyRequest(
    "/me/player/currently-playing?additional_types=track,episode",
  )

  return {
    connected: true,
    current: normalizeItem(playback?.item),
    isPlaying: playback?.is_playing ?? false,
    progressMs: playback?.progress_ms ?? null,
  }
}

async function getQueue() {
  const queue = await spotifyRequest("/me/player/queue")

  return {
    connected: true,
    current: normalizeItem(queue?.currently_playing),
    queue: queue?.queue?.slice(0, 10).map(normalizeItem) ?? [],
  }
}

async function getSpotifyStatus() {
  return { connected: Boolean(await readTokens()) }
}

async function disconnectSpotify() {
  await browser.storage.local.remove(SPOTIFY_TOKEN_KEY)
  return { connected: false }
}

globalThis.Spotify = Object.freeze({
  connect: connectSpotify,
  disconnect: disconnectSpotify,
  getCurrentlyPlaying,
  getQueue,
  getStatus: getSpotifyStatus,
})
