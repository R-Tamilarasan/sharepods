const socket = io();
let localStream;
let peerConnections = {};
let roomId = null;

// Get user media and join room
async function joinRoom() {
    roomId = document.getElementById("room").value.trim();
    if (!roomId) {
        alert("Please enter a room ID");
        return;
    }

    // Get mic audio
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        alert("Microphone access is required!");
        return;
    }

    socket.emit("join-room", roomId);

    const statusDiv = document.getElementById("status");
    statusDiv.textContent = `✅ Joined room: ${roomId}`;
}

// Handle new user connection
socket.on("user-connected", async (userId) => {
    const pc = new RTCPeerConnection();

    // Add local audio tracks to peer connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Handle remote audio track
    pc.ontrack = event => {
        addUserAudio(userId, event.streams[0]);
    };

    // Handle ICE candidates
    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", { to: userId, signal: event.candidate });
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("signal", { to: userId, signal: offer });

    peerConnections[userId] = pc;

    addUserToUI(userId);
});

// Handle incoming signals (offer/answer/ice)
socket.on("signal", async data => {
    let pc = peerConnections[data.from];
    
    if (!pc) {
        pc = new RTCPeerConnection();

        pc.ontrack = event => {
            addUserAudio(data.from, event.streams[0]);
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.emit("signal", { to: data.from, signal: event.candidate });
            }
        };

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        peerConnections[data.from] = pc;

        addUserToUI(data.from);
    }

    if (data.signal.type === "offer") {
        await pc.setRemoteDescription(data.signal);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: data.from, signal: answer });
    } else if (data.signal.type === "answer") {
        await pc.setRemoteDescription(data.signal);
    } else {
        await pc.addIceCandidate(data.signal);
    }
});

// Handle user disconnect
socket.on("user-disconnected", (id) => {
    const elem = document.getElementById(id);
    if (elem) elem.remove();
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
});

// --- UI Helpers ---

function addUserToUI(userId) {
    const usersDiv = document.getElementById("users");
    if (!document.getElementById(userId)) {
        const userElem = document.createElement("div");
        userElem.id = userId;
        userElem.className = "user";
        userElem.textContent = `User: ${userId}`;

        const micIndicator = document.createElement("div");
        micIndicator.className = "mic-indicator";
        micIndicator.id = `mic-${userId}`;

        userElem.appendChild(micIndicator);
        usersDiv.appendChild(userElem);
    }
}

function addUserAudio(userId, stream) {
    let audio = document.getElementById(`audio-${userId}`);
    if (!audio) {
        audio = document.createElement("audio");
        audio.id = `audio-${userId}`;
        audio.autoplay = true;
        audio.srcObject = stream;
        document.body.appendChild(audio);

        // Start microphone activity detection
        detectMicActivity(stream, `mic-${userId}`);
    }
}

// --- Microphone activity detection ---
function detectMicActivity(stream, indicatorId) {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 512;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const indicator = document.getElementById(indicatorId);

    function update() {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a,b) => a+b, 0) / dataArray.length;
        indicator.style.background = avg > 10 ? "green" : "gray";
        requestAnimationFrame(update);
    }

    update();
}