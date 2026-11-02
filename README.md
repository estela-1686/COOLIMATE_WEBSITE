# Coolimate on Firebase

- `public/index.html` is the site (built from website/src with build.py).
- `public/firebase-config.js` holds the web app config from `firebase apps:sdkconfig WEB`.
- `firestore.rules`: everyone reads `site/*`; only the emails listed can publish.

Deploy: `npx firebase-tools deploy --only hosting,firestore:rules --project coolimate`
