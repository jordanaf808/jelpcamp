# Wandur

Search every federal recreation facility in the United States by state, activity,
keyword or map. Registered users can save favorites and leave comments.

Live: <https://wandur.onrender.com>. It runs on a free instance that sleeps after
15 minutes idle, so the first request can take about a minute.

The facility data comes from the [Recreation.gov RIDB API](https://ridb.recreation.gov/docs).
The project began as the YelpCamp exercise from a web development bootcamp and was
rebuilt around that API.

## Stack

| Layer | What |
| --- | --- |
| Runtime | Node 24 (pinned in `.nvmrc`) |
| Server | Express 5, EJS templates |
| Database | MongoDB through Mongoose 9. Sessions are stored there too (connect-mongo) |
| Auth | Passport, local username and password |
| Security | helmet with a Content Security Policy, rate limits on login and register |
| Maps | Mapbox GL JS on the search pages, Google Maps on a facility's page |
| Front end | Bootstrap 4, plain JavaScript in `public/js/` |

## Run it locally

You need Node 24, a MongoDB database (a free Atlas cluster works) and the API keys
in the table below.

```bash
git clone https://github.com/jordanaf808/jelpcamp.git
cd jelpcamp
nvm use                  # reads .nvmrc
npm ci
cp .env.example .env     # then fill it in
npm start                # http://localhost:3000
```

## Environment variables

| Name | What it does | Where to get it |
| --- | --- | --- |
| `MONGO_URI` | Connection string for the app's data and its sessions | MongoDB Atlas, or a local `mongod` |
| `SESSION_SECRET` | Signs the session cookie | Any long random string |
| `SESSION_STORE_SECRET` | Encrypts session data stored in MongoDB | A different long random string, with mixed case, digits and symbols |
| `RIDB_API_KEY` | Reads facilities from the RIDB API. Sent from the server only | A free account at [ridb.recreation.gov](https://ridb.recreation.gov) |
| `MAPBOX_API_KEY` | Draws the maps on the search pages. Sent to the browser | A public token from [mapbox.com](https://www.mapbox.com) |
| `MAPS_API_KEY` | Draws the map on a facility's page. Sent to the browser | Google Cloud Console, Maps JavaScript API |
| `MAPS_MAP_ID` | Required by the map marker on a facility's page | Google Cloud Console, Map Management |
| `PORT` | Port to listen on. Defaults to 3000 | Optional |
| `NODE_ENV` | `production` makes the session cookie HTTPS-only | Set it on the host, not locally |

The two map keys are visible to anyone who opens the site. Restrict each one to
your own URLs in its provider's dashboard.

If you change `SESSION_STORE_SECRET`, delete the `sessions` collection straight
after deploying. A session the app cannot decrypt returns a 500 on every request
for that visitor.

## Tests

```bash
npm test
```

The tests start their own in-memory MongoDB, so they need no `.env` and no
database. The first run downloads a `mongod` binary of about 150 MB. A guard
refuses to run against any database other than that in-memory one. Requests to
the RIDB API are mocked, so the tests need no API key and no network.

```bash
npm run lint           # ESLint
npm run format:check   # Prettier, report only
npm run format         # Prettier, rewrite files
```

Pull requests run the format check, the linter, the tests and
`npm audit --audit-level=high` in GitHub Actions. `main` only accepts pull
requests that pass.

## Known limits

- **Maps are blank on `localhost` with the project's own keys.** They are restricted
  to the live site's URL. Use your own keys, or check maps on the live site.
- **Nothing tests the browser code or search.** The tests cover the database guard,
  rate limits, redirects, input sanitizing, flash messages, the login and register
  pages, a facility's page, deleting a comment, and who may see or change a user's
  favorites.

## Deploying

The live site is on [Render](https://render.com), deployed by hand from `main`.
Render reads the Node version from `.nvmrc` and starts the app with `npm start`.

One setting is tied to that host. `app.set('trust proxy', 3)` in `app.js` matches
the three proxy hops in front of the app on Render. On another host, measure the
hop count again. If it is wrong, rate limiting groups visitors under the wrong IP
address.

## Layout

```text
server.js      connects to the database and starts listening
app.js         builds the Express app: security headers, sessions, routes
routes/        index (landing, login, register), campsites, comments, users
middleware/    login checks, validation, rate limiters, input sanitizing
models/        Mongoose models: user, campsite, comment, campground
utils/         small helpers
views/         EJS templates
public/        browser JavaScript, stylesheets, images
tests/         node:test and supertest
docs/          the security audit and its summary
```

## More

- [docs/audit-summary.md](docs/audit-summary.md): a short review of the 2026 security audit, and the open backlog.
- [docs/security-audit.md](docs/security-audit.md): the full record.
