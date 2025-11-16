let SHARED_SECRET = null;
let IS_INITIATOR = false;
let peer = null;
let localStream = null;

// Generate room ID from seed
async function getRoomId(seed) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(hash)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Create entangled pair
async function createPair() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  SHARED_SECRET = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  IS_INITIATOR = true;

  // Show QR
  document.getElementById('setup').style.display = 'none';
  document.getElementById('qr-ui').style.display = 'block';
  new QRCode(document.getElementById('qr-code'), JSON.stringify({ seed: SHARED_SECRET, role: 'initiator' }));

  // Setup P2P
  setupP2P();
}

// Join via QR scan
function joinPair(seed) {
  SHARED_SECRET = seed;
  IS_INITIATOR = false;
  document.getElementById('setup').style.display = 'none';
  document.getElementById('chat').style.display = 'block';
  setupP2P();
}

// P2P Setup
async function setupP2P() {
  const roomId = await getRoomId(SHARED_SECRET);
  const peerId = crypto.randomUUID().slice(0, 8);

  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  peer = new SimplePeer({ initiator: IS_INITIATOR, trickle: false, config });

  peer.on('signal', async (signal) => {
    await fetch('/api/signaling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomId, signal, sender: peerId })
    });
  });

  peer.on('connect', () => {
    addMsg('✅ Twin AI linked!', 'system');
  });

  peer.on('stream', (stream) => {
    document.getElementById('remoteAudio').srcObject = stream;
  });

  peer.on('data', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'chat') addMsg(msg.text, 'twin');
  });

  // Initiator: offer mic
  if (IS_INITIATOR) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        localStream = stream;
        peer.addStream(stream);
      });
  }

  // Joiner: poll for signal
  if (!IS_INITIATOR) {
    const poll = async () => {
      const res = await fetch('/api/signaling', {
        method: 'POST',
        body: JSON.stringify({ room: roomId, sender: peerId }),
        headers: { 'Content-Type': 'application/json' }
      });
      const d = await res.json();
      if (d.signal) peer.signal(d.signal);
      else setTimeout(poll, 1000);
    };
    poll();
  }
}

// Chat
function addMsg(text, sender) {
  const div = document.createElement('div');
  div.textContent = sender === 'me' ? `👉 ${text}` : `👈 ${text}`;
  div.style.textAlign = sender === 'me' ? 'right' : 'left';
  div.style.color = sender === 'me' ? '#ff0' : '#0ff';
  document.getElementById('messages').appendChild(div);
}

function sendChat() {
  const txt = document.getElementById('msg').value.trim();
  if (!txt || !peer?.connected) return;
  peer.send(JSON.stringify({ type: 'chat', text: txt }));
  addMsg(txt, 'me');
  document.getElementById('msg').value = '';
}

// Voice Call
async function startCall() {
  if (!peer?.connected) return;
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!IS_INITIATOR) peer.addStream(localStream);
  }
  document.getElementById('callBtn').style.display = 'none';
  document.getElementById('hangupBtn').style.display = 'inline';
  addMsg('📞 Calling twin...', 'system');
}

function endCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  document.getElementById('hangupBtn').style.display = 'none';
  document.getElementById('callBtn').style.display = 'inline';
  addMsg('📞 Call ended', 'system');
}

// QR Scanner
let codeReader = null;
function startScan() {
  document.getElementById('setup').style.display = 'none';
  document.getElementById('scan-ui').style.display = 'block';
  codeReader = new ZXing.BrowserQRCodeReader();
  codeReader.decodeFromVideoDevice(null, 'video', (result) => {
    codeReader.reset();
    document.getElementById('scan-ui').style.display = 'none';
    try {
      const data = JSON.parse(result.getText());
      joinPair(data.seed);
    } catch (e) {
      joinPair(result.getText());
    }
  });
}

function cancelScan() {
  if (codeReader) codeReader.reset();
  document.getElementById('scan-ui').style.display = 'none';
  document.getElementById('setup').style.display = 'block';
}
