const socket = io();
let localStream;
let peerConnections = {};
let roomId = null;

// Join room and get mic
async function joinRoom() {
    roomId = document.getElementById("room").value.trim();
    if (!roomId) {
        alert("Please enter a room ID");
        return;
    }

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    socket.emit("join-room", roomId);

    // Show joined status
    document.getElementById("status").textContent = `✅ Joined room: ${roomId}`;
}

// Handle a new user connecting
socket.on("user-connected", async (userId) => {
    const pc = new RTCPeerConnection();

    // Add local audio tracks
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Play incoming audio
    pc.ontrack = event => {
        const audio = document.createElement("audio");
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        document.body.appendChild(audio);
    };

    // ICE candidates
    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", { to: userId, signal: event.candidate });
        }
    };

    // Create offer and send
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: userId, signal: offer });

    peerConnections[userId] = pc;

    // Update UI
    const usersDiv = document.getElementById("users");
    const userElem = document.createElement("div");
    userElem.id = userId;
    userElem.textContent = `User connected: ${userId}`;
    usersDiv.appendChild(userElem);
});

// Handle incoming signals
socket.on("signal", async (data) => {
    let pc = peerConnections[data.from];

    if (!pc) {
        pc = new RTCPeerConnection();

        // Add local audio
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // Play incoming audio
        pc.ontrack = event => {
            const audio = document.createElement("audio");
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.emit("signal", { to: data.from, signal: event.candidate });
            }
        };

        peerConnections[data.from] = pc;
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

// Handle disconnect
socket.on("user-disconnected", (id) => {
    const elem = document.getElementById(id);
    if (elem) elem.remove();

    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
});