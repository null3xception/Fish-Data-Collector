# Fish Data Collector

Offline tablet app for photographing fish, recording their characteristics, and exporting a labelled dataset for model training.

## Run it over your wifi (no internet hosting needed)
1. On the PC, double-click **start-server.bat** (needs Python; or run `python serve.py`). It prints addresses like `http://192.168.1.20:8000`.
2. First run: Windows Firewall asks for access. Tick **Private networks** and allow.
3. On the tablet (same wifi), open that address in Chrome. The app already works at this point: camera, saving and export all work.

### Make it installable + offline (one-time, per tablet)
Chrome only allows "Install app" and offline mode on HTTPS or localhost, and a plain `http://192.168...` address is neither. Tell Chrome to trust your PC's address:
1. On the tablet, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Enable it, type your address (e.g. `http://192.168.1.20:8000`), tap **Relaunch**
3. Open the address again, then menu > **Install app**. After that it opens from the home screen and works with no wifi.

### Important
- **Give the PC a fixed IP** (reserve it in your router's DHCP settings). Saved fish belong to the exact address they were saved under, so if the IP changes the app looks empty on that tablet (the data is still there under the old address). Export ZIPs often.
- The PC only needs to be running the server for the first load and for updates. After installing, tablets work without it.
- After changing app files, bump `CACHE` in `sw.js` so tablets pick up the update.
- For a permanent address that never changes, host the folder on GitHub Pages/Netlify instead (HTTPS, no flag needed).

## Using it
- **+ New fish**: take several photos (side/top/head/etc. — tag each one), enter species and traits, **Save** or **Save & add another** (keeps the species filled in for fast entry).
- **Export dataset** downloads a ZIP:
  - `images/<species>/fish_0001_1.jpg ...` (JPEG, max 2048 px)
  - `labels.csv` (one row per image: file, species, view, length, weight, colours, markings, etc.)
  - `records.json` (one entry per fish with its image list)

Export regularly and copy the ZIP off the tablet as a backup; clearing Chrome's site data deletes the stored fish.

## Tech stack
- **Alpine.js 3** (`vendor/alpine.min.js`, bundled locally so it works offline) for interactivity
- **Tailwind CSS 3** compiled to a static `tailwind.css` (no CDN needed)
- App logic is in `app.js`, markup in `index.html`, offline caching in `sw.js`

## Changing the styling
After editing classes in `index.html` / `app.js`, rebuild the CSS (needs Node):

    npm i -D tailwindcss@3
    npx tailwindcss -c src/tailwind.config.js -i src/input.css -o tailwind.css --minify

If you change any cached files, bump `CACHE` in `sw.js` (e.g. `fish-collector-v3`) so tablets pick up the update.
