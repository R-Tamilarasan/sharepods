const socket = io();
let localStream;
let peerConnections = {};
let roomId = null;

// Join the room
function joinRoom() {
    roomId = document.getElementById("room").value.trim();
    if (!roomId) {
        alert("Please enter a Room ID");
        return;
    }

    socket.emit("join-room", roomId);

    const statusDiv = document.getElementById("status");
    statusDiv.textContent = `✅ Joined room: ${roomId}`;
}

// Share device audio (D1 only)
async function shareAudio() {
    try {
        // Capture system audio (tab or device)
        localStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false
        });

        // Notify all users
        for (let track of localStream.getAudioTracks()) track.enabled = true;

        // Add localStream to all existing peer connections
        Object.values(peerConnections).forEach(pc => {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        });

        alert("Device audio sharing started!");
    } catch (err) {
        console.error("Error sharing audio:", err);
        alert("Could not capture device audio.");
    }
}

// When a new user joins the room
socket.on("user-connected", async userId => {
    const pc = new RTCPeerConnection();

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", { to: userId, signal: event.candidate });
        }
    };

    pc.ontrack = event => {
        addAudioUser(userId, event.streams[0]);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("signal", { to: userId, signal: offer });

    peerConnections[userId] = pc;
});

// Handle signals (offer/answer/ICE)
socket.on("signal", async data => {
    let pc = peerConnections[data.from];
    if (!pc) {
        pc = new RTCPeerConnection();
        pc.ontrack = event => addAudioUser(data.from, event.streams[0]);
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

// Add audio element for a new user with controls
function addAudioUser(userId, stream) {
    const usersDiv = document.getElementById("users");

    if (document.getElementById(`user-${userId}`)) return; // already exists

    const userContainer = document.createElement("div");
    userContainer.id = `user-${userId}`;
    userContainer.style.marginBottom = "10px";

    const label = document.createElement("span");
    label.textContent = `User: ${userId} `;

    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.controls = false;

    // Volume control
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.min = 0;
    volumeSlider.max = 100;
    volumeSlider.value = 100;
    volumeSlider.oninput = () => {
        audio.volume = volumeSlider.value / 100;
    };
    volumeSlider.title = "Volume";

    // Mute/Unmute button
    const muteBtn = document.createElement("button");
    muteBtn.textContent = "Mute";
    muteBtn.style.marginLeft = "5px";
    muteBtn.onclick = () => {
        audio.muted = !audio.muted;
        muteBtn.textContent = audio.muted ? "Unmute" : "Mute";
    };

    userContainer.appendChild(label);
    userContainer.appendChild(audio);
    userContainer.appendChild(volumeSlider);
    userContainer.appendChild(muteBtn);

    usersDiv.appendChild(userContainer);
}

// Remove user when they disconnect
socket.on("user-disconnected", userId => {
    const elem = document.getElementById(`user-${userId}`);
    if (elem) elem.remove();
    delete peerConnections[userId];
});