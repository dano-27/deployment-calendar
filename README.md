# Deployment Calendar

A digital deployment whiteboard calendar with Slack webhook integration. Track deployment events across teams and categories with a clean web interface.

## Quick Start

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events?month=7&year=2026` | List events for a month |
| POST | `/api/events` | Create an event |
| PUT | `/api/events/:id` | Update an event |
| DELETE | `/api/events/:id` | Delete an event |

### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create a category |
| PUT | `/api/categories/:id` | Update a category |
| DELETE | `/api/categories/:id` | Delete a category |

### Slack Webhook

POST to `/api/events/webhook` to create events from Slack or any external service:

```bash
curl -X POST http://your-server/api/events/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Event Name",
    "date": "2026-07-15",
    "details": "3x Register",
    "category": "Live Nation"
  }'
```

The webhook accepts multiple date formats: `YYYY-MM-DD`, `MM/DD/YYYY`, `July 15 2026`, etc. If a category name doesn't exist yet, it will be auto-created.

## Deploy

Push to GitHub and connect your repo to [Railway](https://railway.app) or [Render](https://render.com) for one-click deployment. The app uses SQLite, so no external database is needed.

Set the `PORT` environment variable if your platform requires it.
