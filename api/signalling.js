let rooms = {};

export default async function (req) {
  const { room, signal, sender } = await req.json();
  
  if (!rooms[room]) rooms[room] = { peers: [] };
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
