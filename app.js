let SHARED_SECRET = null;
let IS_INITIATOR = false;
let peer = null;
let roomId = null;
let peerId = null;
let localStream = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

const el = id => document.getElementById(id);

async function getRoomId(seed) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(hash)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encrypt(txt, seed) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(seed), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(txt));
  return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

async function decrypt(payload, seed) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(seed), { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(payload.iv) }, key, new Uint8Array(payload.ct));
  return new TextDecoder().decode(pt);
}

function addMsg(txt, sender) {
  const div = document.createElement('div');
  div.className = 'msg ' + sender;
  div.innerText = sender === 'me' ? `👉 ${txt}` : `👈 ${txt}`;
  el('messages').appendChild(div);
  el('messages').scrollTop = el('messages').scrollHeight;
}

function handleScannedSeed(seed) {
  if (!seed || seed.length < 16) return alert('Invalid quantum seed');
  SHARED_SECRET = seed;
  IS_INITIATOR = false;
  el('setup').style.display = 'none';
  el('chat').style.display = 'block';
  setupP2P();
}

async function setupP2P() {
  roomId = await getRoomId(SHARED_SECRET);
  peerId = crypto.randomUUID().slice(0, 8);
  
  const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  peer = new SimplePeer({ initiator: IS_INITIATOR, trickle: false, config });

  peer.on('signal', async signal => {
    await fetch('/api/signaling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomId, signal, sender: peerId })
    });
  });

  peer.on('connect', () => {
    addMsg('✅ Quantum channel active!', 'system');
    el('call-controls').style.display = 'block';
  });

  peer.on('stream', stream => {
    el('remote-audio').srcObject = stream;
  });

  peer.on('data', async data => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'chat') {
        const txt = await decrypt(msg.payload, SHARED_SECRET);
        addMsg(txt, 'twin');
      }
    } catch (e) {
      console.error(e);
    }
  });

  peer.on('error', err => {
    addMsg('❌ P2P error: ' + err.message, 'system');
  });

  if (IS_INITIATOR) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        localStream = stream;
        peer.addStream(stream);
      })
      .catch(() => addMsg('🔇 Allow mic for calls', 'system'));
  }

  if (!IS_INITIATOR) {
    const poll = async () => {
      try {
        const res = await fetch('/api/signaling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room: roomId, sender: peerId })
        });
        const d = await res.json();
        if (d.signal) peer.signal(d.signal);
        else setTimeout(poll, 1000);
      } catch (e) { setTimeout(poll, 2000); }
    };
    poll();
  }
}

function sendMsg() {
  const input = el('msg-input');
  const txt = input.value.trim();
  if (!txt || !peer?.connected) return;
  input.value = '';
  encrypt(txt, SHARED_SECRET).then(payload => {
    peer.send(JSON.stringify({ type: 'chat', payload }));
    addMsg(txt, 'me');
  });
}

function createPair() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const seed = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  const qrData = JSON.stringify({ seed, role: 'initiator' });

  SHARED_SECRET = seed;
  IS_INITIATOR = true;

  el('setup').style.display = 'none';
  el('qr-ui').style.display = 'block';
  el('qr-code').innerHTML = '';
  new QRCode(el('qr-code'), { text: qrData, width: 200, height: 200, colorDark: "#0f0", colorLight: "#000" });
  setupP2P();
}

let codeReader = null;
function startScan() {
  el('setup').style.display = 'none';
  el('scan-ui').style.display = 'block';
  codeReader = new ZXing.BrowserQRCodeReader();
  codeReader.decodeFromVideoDevice(null, 'video', (result, err) => {
    if (result) {
      codeReader.reset();
      el('scan-ui').style.display = 'none';
      try {
        const data = JSON.parse(result.getText());
        handleScannedSeed(data.seed);
      } catch (e) {
        handleScannedSeed(result.getText());
      }
    }
  }).catch(err => {
    addMsg('Camera error', 'system');
  });
}

function cancelScan() {
  if (codeReader) codeReader.reset();
  el('scan-ui').style.display = 'none';
  el('setup').style.display = 'block';
}

async function startCall() {
  if (!peer?.connected) return addMsg('❌ Not connected!', 'system');
  if (localStream) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!IS_INITIATOR) peer.addStream(localStream);
    el('call-btn').style.display = 'none';
    el('hangup-btn').style.display = 'inline';
    addMsg('📞 Call connected', 'system');
  } catch (err) {
    addMsg('🔇 Mic access denied', 'system');
  }
}

function endCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  el('hangup-btn').style.display = 'none';
  el('call-btn').style.display = 'inline';
  addMsg('📞 Call ended', 'system');
}