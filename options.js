const form = document.querySelector("#settings-form")
const reuseOpenTab = document.querySelector("#reuse-open-tab")
const status = document.querySelector("#status")

async function restoreSettings() {
  const settings = await browser.storage.local.get({ reuseOpenTab: true })
  reuseOpenTab.checked = settings.reuseOpenTab
}

form.addEventListener("change", async () => {
  await browser.storage.local.set({ reuseOpenTab: reuseOpenTab.checked })
  status.textContent = "Saved."
})

restoreSettings().catch((error) => {
  console.error(error)
  status.textContent = "Firefox could not load your settings."
})
