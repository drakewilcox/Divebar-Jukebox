# Tidal-DL Helper Scripts

Helper scripts to build a list of albums (from Spotify or manually), resolve them on Tidal, and batch-download via tidal-dl-ng.

## Manual album list (no Spotify API)

If you can’t use the Spotify API right now, build the list by hand. That list is the same format used later to search Tidal and run tidal-dl-ng.

1. **Copy the template:**
   ```bash
   cp albums_to_download.json.example albums_to_download.json
   ```

2. **Edit `albums_to_download.json`.** Each entry is an object with:
   - **`name`** (string): album title
   - **`artists`** (array): list of `{"name": "Artist Name"}` (one or more)
   - **`spotify_id`** / **`spotify_url`** (optional): set by get_saved_albums or merge script
   - **`tidal_url`** (set by resolve_tidal): Tidal album URL when a match is found
   - **`no_match`** (set by resolve_tidal): `true` when no Tidal match was found
   - **`downloaded`** (optional): set to `true` for albums you’ve already downloaded; resolve and download scripts will skip these

   Example (after resolving):
   ```json
   [
     {"name": "Random Access Memories", "artists": [{"name": "Daft Punk"}], "tidal_url": "https://tidal.com/browse/album/...", "no_match": false},
     {"name": "Collab Album", "artists": [{"name": "Artist A"}, {"name": "Artist B"}], "tidal_url": null, "no_match": true}
   ]
   ```

3. **Resolve on Tidal:** Run `python resolve_tidal.py`. You’ll log in to Tidal once (open the link, authorize); the session is saved to `.tidal_session.json`. The script searches Tidal for each album (artist + name), picks the best match (album title and artist must both match to avoid wrong albums), and sets `tidal_url` or `no_match`. It **skips** entries that already have a valid `tidal_url`, and entries with `downloaded: true`. Use `python resolve_tidal.py --force` to re-resolve everything.

4. **Download:** Run the download step (see “Download via tidal-dl-ng” below). Only entries with a `tidal_url` and without `downloaded: true` are written to the URL list. When you use `--run` and tidal-dl-ng exits successfully, the script automatically sets `downloaded: true` on those albums in `albums_to_download.json`.

The filename `albums_to_download.json` is the single list: edit it before resolving, then run resolve and download.

---

## Spotify: Get your saved albums (optional)

### 1. Spotify app credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications).
2. Log in and click **Create app** (or use an existing app).
3. Name it (e.g. "Tidal helper") and accept the terms. **Edit Settings**.
4. Under **Redirect URIs** add a loopback URL using **127.0.0.1** (not `localhost`—Spotify treats `localhost` as deprecated and may reject it with "Insecure redirect URI"). For example: `http://127.0.0.1:8888/callback`. Save.
5. Copy the **Client ID** and **Client secret** from the app overview.

**Note:** Spotify has at times restricted creation of new apps. If you can’t create a new app, use an existing app you already have. Spotify is also deprecating `localhost` redirect URIs in favor of `127.0.0.1`. This setup is single-user (your login, your cached token); multi-user OAuth isn’t supported yet.

**If you can’t add or edit Redirect URIs:** The Dashboard sometimes restricts changes. Try **editing** an existing URI in place (e.g. change `http://localhost:8888/callback` to `http://127.0.0.1:8888/callback`) instead of adding a new one. If the Dashboard blocks both, it may be a temporary Spotify restriction—check [Spotify for Developers Community](https://community.spotify.com/t5/Spotify-for-Developers/ct-p/Spotify_Developer) or try again later.

### 2. Configure credentials

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `SPOTIPY_CLIENT_ID` = your app’s Client ID  
- `SPOTIPY_CLIENT_SECRET` = your app’s Client secret  

Set `SPOTIPY_REDIRECT_URI` to the same 127.0.0.1 URI you added in the Dashboard (e.g. `http://127.0.0.1:8888/callback`). Do not use `localhost`—Spotify may reject it.

### 3. Install and run

```bash
cd ~/tools/tidal-dl-helper-scripts
python3 -m venv .venv
source .venv/bin/activate   # or: .venv\Scripts\activate on Windows
pip install -r requirements.txt
python get_saved_albums.py
```

- **First run:** A browser window opens so you can log in to Spotify and approve access. The token is then cached in `.spotify_cache`.
- **Later runs:** No browser; the script uses the cached token.

**If you get "Insecure redirect URI" or the browser flow fails:** Use the one-time browser auth script so you authorize in the same browser where you’re already logged into Spotify. The script runs a local server and writes the token to `.spotify_cache`:

```bash
python spotify_auth_browser.py
```

Then open the printed URL in your browser and approve. **Option B (Postman):** See "Postman OAuth 2.0" below.

Output: new albums are **merged into `albums_to_download.json`** (no duplicates by `spotify_id`). Existing entries in that file keep their `downloaded`, `tidal_url`, `no_match` fields. New entries from Spotify have `name`, `artists`, `spotify_id`, `spotify_url` only; resolve and download will fill the rest.

**One-time merge:** If you already have both `albums_to_download.json` and `spotify_saved_albums.json`, run `python merge_spotify_into_albums.py` once to combine them: existing album entries get `spotify_id`/`spotify_url` added where matched by name+artists, and all Spotify-only albums are appended. Then use `albums_to_download.json` for resolve and download.

**Backfill Spotify IDs (search, not saved list):** For entries that don’t have `spotify_id`/`spotify_url` (e.g. added manually), run `python backfill_spotify_ids.py`. It searches Spotify by album name + artist and fills in id/url only when the result matches both. It does not add or remove rows, and does not require the album to be in your saved list.

### Postman OAuth 2.0 (when browser auth fails)

1. **Spotify Dashboard** → Your app → Edit Settings → **Redirect URIs**: add exactly `https://oauth.pstmn.io/v1/callback` → Save.
2. **Postman** → Authorization tab: Type = OAuth 2.0, Grant type = **Authorization Code** (not PKCE). Callback URL = `https://oauth.pstmn.io/v1/callback`. Auth URL = `https://accounts.spotify.com/authorize`, Access Token URL = `https://accounts.spotify.com/api/token`. Client ID and Client Secret from Dashboard (no spaces). Scope = `user-library-read`. **Client Authentication** = **Send as Basic Auth header** (required by Spotify; otherwise you get "Invalid client").
3. Get New Access Token → approve in browser → copy the **refresh_token** from the response.
4. Run `python save_token_from_refresh.py` and paste the refresh_token.

**"Invalid client"** = wrong/missing Client ID or Secret, or Postman not sending the secret. Use **Send as Basic Auth header** for Client Authentication. **Callback "error"** = Callback URL in Postman must match the Dashboard exactly: `https://oauth.pstmn.io/v1/callback`.

### Download via tidal-dl-ng

After `resolve_tidal.py`, you can generate the URL list only or have the script run tidal-dl-ng for you.

**Option 1 – Generate URL list only**

```bash
python download_with_tidal_dl_ng.py
```

This writes **`tidal_dl_urls.txt`** (one Tidal URL per line) and prints the command to run. Then, using your existing tidal-dl-ng install:

```bash
cd ~/tools/tidal-dl-ng && source venv/bin/activate
tidal-dl-ng dl -l /path/to/tidal-dl-helper-scripts/tidal_dl_urls.txt
```

(Use the path the script prints.)

**Option 2 – Generate URL list and run tidal-dl-ng (one command):**

```bash
python download_with_tidal_dl_ng.py --run
```

This writes `tidal_dl_urls.txt` and then runs tidal-dl-ng for you. It works if it’s at `~/tools/tidal-dl-ng/venv/bin/tidal-dl-ng`. If your install is elsewhere, set **`TIDAL_DL_NG`** to the executable path (e.g. `export TIDAL_DL_NG=~/tools/tidal-dl-ng/venv/bin/tidal-dl-ng`). Make sure you are already logged in to Tidal in tidal-dl-ng before running the download.

**Limit how many albums:** Use **`--limit N`** to include only the first N eligible albums (not yet downloaded, with a `tidal_url`). Useful for a test run or smaller batches, e.g. `python download_with_tidal_dl_ng.py --limit 20` or `python download_with_tidal_dl_ng.py --limit 20 --run`.

**Multi-disc (double CD) albums**

By default, tidal-dl-ng puts all tracks in one album folder. For multi-volume albums you can get duplicate track numbers (e.g. two files named `01 - Artist - Title`) and order can be unclear. tidal-dl-ng supports **disc/volume** in its path format so you can avoid that.

1. **Find tidal-dl-ng’s config:**  
   `~/.config/tidal-dl-ng/settings.json` (or `$XDG_CONFIG_HOME/tidal-dl-ng/settings.json`). You can open it from the tidal-dl-ng GUI (Settings) or edit the file directly.

2. **Edit the album path format** (`format_album`). Use one of these so multi-disc albums get unique, sortable filenames (or subfolders):

   - **Disc number in filename (recommended)**  
     Include `{track_volume_num_optional_CD}` so multi-disc gets a "CD1"/"CD2" prefix and single-disc stays unchanged:
     ```text
     Albums/{album_artist} - {album_title}{album_explicit}/{track_volume_num_optional_CD} {album_track_num}. {artist_name} - {track_title}{album_explicit}
     ```
     That gives `01. Artist - Title` for single disc and `CD1 01. ...`, `CD2 01. ...` for double disc (the space after the variable is only visible when it outputs "CD1" or "CD2").

   - **Numeric prefix (default-style)**  
     The built-in default uses `{track_volume_num_optional}` immediately before `{album_track_num}` (no space). So you get `101`, `102`, … for disc 1 and `201`, `202`, … for disc 2. If your `format_album` doesn’t already include that, add it:
     ```text
     .../{track_volume_num_optional}{album_track_num}. {artist_name} - ...
     ```

   - **Subfolders per disc**  
     You can put each disc in its own folder by including `{track_volume_num_optional_CD}/` in the path. For single-disc albums that variable is empty, so you get an extra `//` in the path; if that bothers you, prefer one of the filename options above.

After changing `format_album`, save the config and run your next album download as usual. Existing downloads are not renamed; re-download if you want the new layout.
