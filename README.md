# Collectibles Connect — GitHub Pages edition

No build step, visitor login, framework, or third-party browser dependency. Upload these files to a fresh public GitHub repository and enable Pages from the main branch root. Keep `index.html` at the repository root, not inside an extra folder.

- `index.html`: themed live draw, animated lever, name reel, sound icon.
- `admin.html`: simplified English list editor and results export.
- `seed.js`: the approved 149-person starting roster; no old draw history.
- `core.js`: 2,000-name limit, random selection, locked rounds, idempotent request IDs.
- `shared.js`: durable local mode, same-browser tab sync, optional cross-device backend, offline fallback.
- `sw.js`: caches the frontend and prize image after the first successful online visit.
- `backend/worker.js` + `backend/schema.sql`: optional open-access Cloudflare Worker/D1 backend for different devices.

## Important behavior

A static site by itself cannot synchronize two different computers. Without a backend, display and admin tabs in the same browser share local state; other devices run independent copies. Configure the same backend URL in the admin page on each device for cross-device sync, or set `apiUrl` in `config.js` before uploading.

When shared sync fails, the display can continue using its saved roster. Offline draws remain local and survive reload. They are not silently merged into cloud history. Export local results before explicitly reconnecting. If a shared draw request loses its response, the app pauses instead of silently creating a second random outcome; check the other screen, then reconnect or explicitly choose local mode.

For a live event, only the display operator should start draws. During a network partition, two disconnected devices cannot guarantee globally unique winners.

Open both pages once online and wait for assets to cache before going offline. Offline reload requires a previously loaded HTTPS origin, or localhost during testing. Do not clear browser site data or rely on private browsing to retain records.

## Public access

There is intentionally no authorization. Anyone with the site/backend URL can read the roster, edit names, start draws, or reset history. The 149 names in `seed.js` are public if the repository/site is public. Hosting-level traffic limits still apply. No production credentials, private database, or old Git history are included.

## Upload instructions

See `上传说明.txt` for GitHub Pages and optional two-device backend setup. The website does not require npm, Node, or a server to build. To run the included development tests with Node 22+: `npm test`.

Use this ZIP to initialize a NEW repository. Do not push the original project Git history, which includes earlier presentation assets.

Third-party TikTok/DC/Agoro artwork retains its original rights. Product image source: https://www.agoro.com/products/crisis-on-infinite-earths-7
