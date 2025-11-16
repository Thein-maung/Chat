// File: api/signaling.js
let rooms = {};

export default async function (req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { room, signal, sender } = await req.json();
  if (!room || !sender) {
    return new Response('Invalid request', { status: 400 });
  }

  // Clean stale rooms (optional)
  Object.keys(rooms).forEach(r => {
    if (Date.now() - rooms[r].ts > 60000) delete rooms[r];
  });

  if (!rooms[room]) {
    rooms[room] = { peers: [], ts: Date.now() };
  }

  const peers = rooms[room].peers;
  const other = peers.find(p => p.id !== sender);

  if (signal && other) {
    return new Response(JSON.stringify({ signal, from: sender }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!peers.some(p => p.id === sender)) {
    peers.push({ id: sender });
  }

  return new Response(JSON.stringify({ waiting: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}