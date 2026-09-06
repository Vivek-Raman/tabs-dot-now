const ultimateGuitarPatterns = [
  "*://ultimate-guitar.com/*",
  "*://*.ultimate-guitar.com/*",
]

function getSearchUrl(query) {
  const url = new URL("https://www.ultimate-guitar.com/search.php")
  url.searchParams.set("search_type", "title")
  url.searchParams.set("value", query)
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

async function loadTab(query) {
  const url = getSearchUrl(query)
  const { reuseOpenTab = true } = await browser.storage.local.get({
    reuseOpenTab: true,
  })

  if (!reuseOpenTab) {
    await browser.tabs.create({ active: true, url })
    return "Opened a new Ultimate Guitar tab."
  }

  const existingTab = await findUltimateGuitarTab()

  if (existingTab?.id !== undefined) {
    await browser.tabs.update(existingTab.id, { active: true, url })
    await browser.windows.update(existingTab.windowId, { focused: true })
    return "Loaded in your open Ultimate Guitar tab."
  }

  await browser.tabs.create({ active: true, url })
  return "Opened a new Ultimate Guitar tab."
}

browser.runtime.onMessage.addListener(async (message) => {
  switch (message?.type) {
    case "load-tab": {
      if (typeof message.query !== "string") return undefined

      const query = message.query.trim()
      if (!query) throw new Error("Enter a search query.")

      return loadTab(query)
    }
    case "spotify-connect":
      await Spotify.connect()
      return Spotify.getCurrentlyPlaying()
    case "spotify-disconnect":
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
