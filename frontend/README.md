# Autarca Frontend

Next.js dashboard visualizing live agent activity and RWA collateral
positions, powered by the agent's WebSocket activity feed and CSPR.cloud
REST APIs.

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Visit http://localhost:3000. Run the `agent/` process alongside it to see
live activity stream in.
