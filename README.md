# Tabs Now

A plain HTML, CSS, and JavaScript Firefox extension that follows the current Spotify song on Ultimate Guitar. Start jamming to open a search for the current song, then it updates the search when the song changes. Stop jamming to pause that behavior. It reuses an open Ultimate Guitar tab when possible and opens a new one otherwise.

The extension code lives in `src/`, grouped by surface: `popup`, `options`, and `background`. The UI file in `popup` is loaded as Firefox's sidebar panel. `spotify-config.js` stays at the root so it is easy to update locally and is loaded before the background scripts.

The sidebar can also connect directly to Spotify and display the current user's playing track or episode. Spotify authorization uses Firefox's identity API and PKCE. It does not require a server, website, or Spotify Client Secret.

## Connect Spotify

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and select the Web API.
2. Choose the final extension ID in `manifest.json`. The OAuth redirect URL is derived from this ID, so changing it later requires updating Spotify.
3. Load the extension in Firefox using the instructions below.
4. Open the extension's background console from `about:debugging` and run:

   ```js
   browser.identity.getRedirectURL("spotify")
   ```

5. Add the returned URL to the Spotify app's redirect URI allowlist.
6. Paste the Spotify Client ID into `spotify-config.js`. Do not add the Client Secret.
7. Reload the extension and click **Connect Spotify**.

Spotify development-mode apps support up to five allowlisted users. Add each tester under the Spotify app's user management settings.

## Load in Firefox

1. Open `about:debugging`.
2. Choose **This Firefox**.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` from this directory.

After editing a file, click **Reload** for the extension in `about:debugging`.

Temporary extensions disappear when Firefox restarts.

Click the Tabs Now toolbar icon to open or close the sidebar. You can also select it from Firefox's sidebar menu.

## Package

```sh
./package.sh
```

The script creates `dist/tabs-now-<version>.zip`. Upload that ZIP to Mozilla Add-ons for signing or publication. Firefox release builds require Mozilla's signature for permanent installation.
