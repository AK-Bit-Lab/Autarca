import { WebSocketServer, WebSocket } from "ws";
import type { ActivityLogEntry } from "./types.js";

/**
 * Broadcasts agent activity to the Autarca dashboard (frontend) over a simple
 * WebSocket feed, and keeps an in-memory ring buffer for REST polling.
 */
class ActivityLog {
  private entries: ActivityLogEntry[] = [];
  private wss: WebSocketServer | null = null;
  private readonly maxEntries = 500;

  listen(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (socket: WebSocket) => {
      socket.send(JSON.stringify({ type: "history", entries: this.entries }));
    });
    console.log(`[activity-log] streaming on ws://localhost:${port}`);
  }

  push(entry: ActivityLogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) this.entries.shift();

    console.log(`[${entry.agent}] ${entry.message}`);

    const payload = JSON.stringify({ type: "entry", entry });
    this.wss?.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(payload);
    });
  }

  all(): ActivityLogEntry[] {
    return this.entries;
  }
}

export const activityLog = new ActivityLog();
