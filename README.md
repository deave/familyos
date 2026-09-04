# FamilyOS

A small, private portal for two people who are better at building things than
saying them. Each of you gets an avatar; the avatars carry your words to each
other. Around that sits a shared money picture, a view of where the work is
heading, and the goals you are moving toward together.

No accounts, no cloud, no dependencies. One Node.js process and one JSON file.

## Run it

```sh
node server.js
# → http://localhost:3000
```

Requires Node 20 or newer. There is nothing to install.

Optional settings (environment variables):

| Variable          | What it does                                                        | Default        |
|-------------------|---------------------------------------------------------------------|----------------|
| `PORT`            | Port to listen on                                                   | `3000`         |
| `HOST`            | Interface to bind (`127.0.0.1` to keep it to this machine only)     | `0.0.0.0`      |
| `PORTAL_PASSWORD` | If set, the browser asks for this shared password before anything   | *(none)*       |
| `DATA_FILE`       | Where the family's data lives                                       | `data/db.json` |

The first start writes a seed file with example numbers so nothing looks empty.
Change everything from inside the portal; `data/db.json` is git-ignored so your
real numbers never end up in the repository.

For two phones on the same Wi-Fi, run it on any always-on machine at home and
open `http://<that-machine>:3000`. Set `PORTAL_PASSWORD` if the network is
shared with anyone else.

## Hosting it on Vercel

The repository deploys to Vercel as-is: `public/` is served as static files and
`api/index.js` runs the same server code as a serverless function
(`vercel.json` rewrites `/api/*` to it).

Two one-time settings in the Vercel project make it a real home for your data:

1. **Storage → Create Database → Blob**, connected to the project. This sets
   `BLOB_READ_WRITE_TOKEN` and the portal keeps its data in one *private* blob
   (`familyos/db.json`). Without it the app still works but data lives in the
   function's `/tmp` and disappears between instances — the page shows a
   yellow notice until this is done.
2. **Settings → Environment Variables → `PORTAL_PASSWORD`**. Until it is set,
   anyone with the URL can open the portal; the page says so at the top.

Redeploy after changing either. Locally nothing changes: `node server.js`
still uses `data/db.json` and needs no packages. `@vercel/blob` is only
imported when a token is present.

## What is inside

**Home** – your avatar greets you, tells you if there are notes waiting, and
gives you a one-line read on the month's money. Tiles below link to the rest.

**Talk** – write a note once; the *other* person's avatar delivers it in its own
voice. Notes have a kind (a feeling, a plan, about work, about money, a thank
you, a request) and a *say it softly* switch for the things that are hard to say
face to face. The reader can react (❤️ 👍 🤗 🗣️) or reply through their avatar.

**Money** – spent this month, what is left in the budget, how much money you
have, and whether you are on pace. Spending by category, a day-by-day line
against the budget, and a log for money in and out. Logging an expense lowers
"money we have" automatically; correct it whenever you check the real account.

**Work** – David's projects: percent done, *where it's heading* in one plain
line, the next step, and a timeline of updates. Only David can edit; the newest
update is also shown on the home screen.

**Goals** – shared targets with a bar each. Anyone can nudge one forward.

**My avatar** – build your face (skin, hair, eyes, mouth, accessory, top,
backdrop) and choose how it speaks: warm, playful, calm or direct. The sample
line updates live so you can hear it before you pick.

Use the switch in the top-right corner to change who is using the portal.

## Development

```sh
npm test          # API + persistence tests (node:test, no extra packages)
npm run dev       # restarts the server when a file changes
```

Layout:

```
server.js         HTTP server, static files, optional basic auth
src/api.js        REST routes and validation
src/store.js      JSON file store with atomic writes
src/seed.js       first-run data
public/app.js     single-page app (hash routes, no framework)
public/avatar.js  SVG avatar renderer
public/voice.js   how each personality phrases greetings and deliveries
public/styles.css
test/api.test.js
```
