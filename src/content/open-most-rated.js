const parameters = new URLSearchParams(location.search)

if (parameters.get("tabs-now-open") === "most-rated") {
  const trackTitle = parameters.get("tabs-now-title") || ""
  const trackCreators = (parameters.get("tabs-now-creators") || "")
    .split("\u001f")
    .filter(Boolean)
  let selectedResultReported = false
  let missingResultReported = false
  let missingLinkReported = false
  let searchResultsReported = false
  let missingStoreReported = false
  let parseErrorReported = false
  let invalidResultsReported = false

  function report(detail, data = {}) {
    console.info(`[Tabs Now] Most-rated: ${detail}`, data)
    browser.runtime
      .sendMessage({
        type: "jamming-debug",
        detail: `[Most rated] ${detail}`,
      })
      .catch((error) => {
        console.warn("[Tabs Now] Could not send debug details.", error)
      })
  }

  function normalizeSearchText(value) {
    return value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  }

  function isUltimateGuitarTabUrl(value) {
    try {
      const url = new URL(value)
      return (
        url.protocol === "https:" &&
        (url.hostname === "ultimate-guitar.com" ||
          url.hostname.endsWith(".ultimate-guitar.com"))
      )
    } catch {
      return false
    }
  }

  function getMostRatedResult() {
    const content = document.querySelector(".js-store")?.dataset.content
    if (!content) {
      if (!missingStoreReported) {
        missingStoreReported = true
        report("Ultimate Guitar search store is missing.", {
          readyState: document.readyState,
          jsStoreCount: document.querySelectorAll(".js-store").length,
        })
      }
      return undefined
    }

    let results
    try {
      results = JSON.parse(content).store?.page?.data?.results
    } catch (error) {
      if (!parseErrorReported) {
        parseErrorReported = true
        report("Could not parse Ultimate Guitar search store JSON.", {
          error: error.message,
          contentLength: content.length,
        })
      }
      return undefined
    }

    if (!Array.isArray(results)) {
      if (!invalidResultsReported) {
        invalidResultsReported = true
        report("Ultimate Guitar search store has no results array.", {
          resultsType: typeof results,
        })
      }
      return undefined
    }

    if (!searchResultsReported) {
      searchResultsReported = true
      const parsedResults = results.map((result, index) => ({
        entry: index + 1,
        songName: result.song_name || null,
        url: result.tab_url || null,
        ratingCount: Number.isFinite(result.votes) ? result.votes : null,
      }))
      console.info(
        "[Tabs Now] Most-rated parsed search results JSON:",
        JSON.stringify(parsedResults, null, 2),
      )
    }

    const title = normalizeSearchText(trackTitle)
    const creators = trackCreators.map(normalizeSearchText).filter(Boolean)
    const titleMatches = results.filter(
      (result) =>
        normalizeSearchText(result.song_name || "") === title &&
        Number.isFinite(result.votes) &&
        isUltimateGuitarTabUrl(result.tab_url),
    )
    const artistMatches = titleMatches.filter((result) =>
      creators.includes(normalizeSearchText(result.artist_name || "")),
    )
    const candidates = artistMatches.length > 0 ? artistMatches : titleMatches

    return candidates.sort(
      (left, right) =>
        right.votes - left.votes ||
        (Number(right.rating) || 0) - (Number(left.rating) || 0) ||
        (Number(left.tab_id) || 0) - (Number(right.tab_id) || 0),
    )[0]
  }

  function clickMostRatedResult() {
    const result = getMostRatedResult()
    if (result === undefined) return false

    if (!result) {
      if (!missingResultReported) {
        missingResultReported = true
        report("No eligible result found in Ultimate Guitar search data.", {
          trackTitle,
          trackCreators,
        })
      }
      return false
    }

    if (!selectedResultReported) {
      selectedResultReported = true
      report("Selected result from search data.", {
        song: result.song_name,
        artist: result.artist_name,
        votes: result.votes,
        url: result.tab_url,
      })
    }

    const resultUrl = new URL(result.tab_url).href
    const tabId = String(result.tab_id || result.id || "")
    const links = [...document.querySelectorAll("a[href]")]
    const link = links.find((candidate) => {
      const href = candidate.getAttribute("href") || ""
      if (tabId && href.includes(tabId)) return true

      try {
        return new URL(candidate.href).href === resultUrl
      } catch {
        return false
      }
    })

    if (!link) {
      if (!missingLinkReported) {
        missingLinkReported = true
        const renderedTabLinks = links
          .filter((candidate) => candidate.href.includes("/tab/"))
          .slice(0, 20)
          .map((candidate) => ({
            text: candidate.textContent.trim().slice(0, 120),
            href: candidate.href,
          }))
        report("Selected result is not rendered as a clickable link yet.", {
          resultUrl,
          tabId,
          linkCount: links.length,
          renderedTabLinks,
        })
      }
      return false
    }

    report("Clicking the selected Ultimate Guitar result.", { resultUrl })
    link.click()
    return true
  }

  report("Content script started.", { trackTitle, trackCreators })

  if (!clickMostRatedResult()) {
    const observer = new MutationObserver(() => {
      if (clickMostRatedResult()) {
        observer.disconnect()
        clearTimeout(waitTimeout)
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    const waitTimeout = setTimeout(() => {
      observer.disconnect()
      report("Stopped waiting after 10 seconds. Search results remain open.")
    }, 10_000)
  }
}
