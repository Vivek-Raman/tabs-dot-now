const parameters = new URLSearchParams(location.search)

if (parameters.get("tabs-now-open") === "top-result") {
  let reported = false

  function isUltimateGuitarUrl(value) {
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

  function getResultUrl(link) {
    const url = new URL(link.href)
    const destination = url.searchParams.get("uddg")
    return destination || url.href
  }

  function getTopResultLink() {
    return [...document.querySelectorAll("a[href]")].find((link) => {
      try {
        return isUltimateGuitarUrl(getResultUrl(link))
      } catch {
        return false
      }
    })
  }

  function openTopResult() {
    const link = getTopResultLink()
    if (!link) return false

    const resultUrl = getResultUrl(link)
    console.info("[Tabs Now] Opening DuckDuckGo top result.", { url: resultUrl })
    browser.runtime
      .sendMessage({
        type: "jamming-debug",
        detail: "[Top result] Opening the first Ultimate Guitar result.",
      })
      .catch(() => {})
    location.assign(resultUrl)
    return true
  }

  if (!openTopResult()) {
    const observer = new MutationObserver(() => {
      if (openTopResult()) observer.disconnect()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      if (!reported) {
        reported = true
        browser.runtime
          .sendMessage({
            type: "jamming-debug",
            detail: "[Top result] No Ultimate Guitar result was found.",
          })
          .catch(() => {})
      }
    }, 10_000)
  }
}
