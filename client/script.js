const socket = io();
let localStream;
let peerConnections = {};
let roomId = null;

// Join room
function joinRoom() {
    roomId = document.getElementById("room").value.trim();
    if (!roomId) return alert("Enter room ID");

    socket.emit("join-room", roomId);
    document.getElementById("status").textContent = `✅ Joined room: ${roomId}`;
}

// D1: Share tab audio
async function shareAudio() {
    if (!roomId) return alert("Join room first!");

    try {
        // Capture audio from tab/screen
        localStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });

        // Show local audio playing (optional)
        const audio = document.createElement("audio");
        audio.srcObject = localStream;
        audio.autoplay = true;
        audio.muted = true; // avoid feedback on D1
        document.body.appendChild(audio);

    } catch (err) {
        console.error(err);
        alert("Cannot capture audio. Make sure you allow tab sharing.");
    }
}

// When a new user joins, create a peer connection and send local audio
socket.on("user-connected", async (userId) => {
    if (!localStream) return;

    const pc = new RTCPeerConnection();
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", { to: userId, signal: event.candidate });
        }
    };

    peerConnections[userId] = pc;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { to: userId, signal: offer });

    // Update connected users UI
    const usersDiv = document.getElementById("users");
    const userElem = document.createElement("div");
    userElem.id = userId;
    userElem.textContent = `User connected: ${userId}`;
    usersDiv.appendChild(userElem);
});

// Handle incoming signals
socket.on("signal", async data => {
    let pc = peerConnections[data.from];
    if (!pc) {
        pc = new RTCPeerConnection();

        // When receiving remote audio
        pc.ontrack = event => {
            const audio = document.createElement("audio");
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);
        };

        pc.onicecandidate = event => {
            if (event.candidate) socket.emit("signal", { to: data.from, signal: event.candidate });
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

// Remove disconnected users from UI and close connection
socket.on("user-disconnected", id => {
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }

    const userElem = document.getElementById(id);
    if (userElem) userElem.remove();
});