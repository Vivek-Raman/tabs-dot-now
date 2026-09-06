globalThis.SPOTIFY_CONFIG = Object.freeze({
  // Spotify Client IDs are public. Never put the Client Secret in the extension.
  clientId: "PASTE_YOUR_SPOTIFY_CLIENT_ID_HERE",
  scopes: ["user-read-currently-playing", "user-read-playback-state"],
})
