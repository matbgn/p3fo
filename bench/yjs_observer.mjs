import fs from 'node:fs';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import ws from 'ws';

const url = process.env.YJS_WS_URL || 'ws://localhost:5199';
const room = process.env.YJS_ROOM || 'p3fo-room';
const durationMs = Number(process.env.YJS_DURATION_MS || '30000');
const outFile = process.env.YJS_OUT || '';
const startGate = process.env.YJS_START_GATE || '';

const doc = new Y.Doc();
const tasks = doc.getMap('tasks');
const provider = new WebsocketProvider(url, room, doc, { WebSocketPolyfill: ws });

const startedAt = Date.now();
let taskEvents = 0;
let taskKeys = 0;
let docUpdates = 0;
let docUpdateBytes = 0;
let maxEventGapMs = 0;
let lastEventAt = 0;
const statuses = [];
let ready = false;

provider.on('status', (event) => {
  statuses.push(event.status);
  if (event.status === 'connected' && !ready) {
    ready = true;
    console.log('YJS_READY');
  }
});

tasks.observe((event) => {
  const now = Date.now();
  taskEvents += 1;
  taskKeys += event.keysChanged.size;
  if (lastEventAt > 0) {
    maxEventGapMs = Math.max(maxEventGapMs, now - lastEventAt);
  }
  lastEventAt = now;
});

doc.on('update', (update) => {
  docUpdates += 1;
  docUpdateBytes += update.byteLength;
});

async function waitForGate() {
  if (!startGate) return;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (fs.existsSync(startGate)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.warn('[yjs-observer] start gate timeout, measuring anyway');
}

await waitForGate();
const measureStart = Date.now();
await new Promise((resolve) => setTimeout(resolve, durationMs));

const summary = {
  url,
  room,
  connected: statuses.includes('connected'),
  statuses,
  durationMs: Date.now() - measureStart,
  taskEvents,
  taskKeys,
  taskEventsPerSecond: taskEvents / ((Date.now() - measureStart) / 1000),
  docUpdates,
  docUpdateBytes,
  maxEventGapMs,
  taskCount: tasks.size,
};

if (outFile) fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
provider.destroy();
doc.destroy();
process.exit(0);
