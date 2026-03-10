const socket = io();
let localStream = null;
let peerConnections = {};
let roomId = null;

async function shareAudio() {
    try {
        // Ask user to share a tab (audio only)
        localStream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab'
                }
            },
            video: false
        });

        console.log("Audio captured from tab");

        // Join the room after getting audio
        joinRoom();
    } catch (err) {
        console.error("Error sharing audio:", err);
    }
}

function joinRoom() {
    roomId = document.getElementById("room").value.trim();
    if (!roomId) {
        alert("Please enter a room ID");
        return;
    }

    socket.emit("join-room", roomId);

    // Show joined status
    const statusDiv = document.getElementById("status");
    statusDiv.textContent = `✅ Joined room: ${roomId}`;
}

// Listen for other users connecting
socket.on("user-connected", async (userId) => {
    const pc = new RTCPeerConnection();

    // Add tab audio track
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", {
                to: userId,
                signal: event.candidate
            });
        }
    };

    pc.ontrack = event => {
        const audio = document.createElement("audio");
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        document.body.appendChild(audio);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("signal", {
        to: userId,
        signal: offer
    });

    peerConnections[userId] = pc;
});

// Handle incoming signals
socket.on("signal", async data => {
    let pc = peerConnections[data.from];

    if (!pc) {
        pc = new RTCPeerConnection();
        pc.ontrack = event => {
            const audio = document.createElement("audio");
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            document.body.appendChild(audio);
        };
        peerConnections[data.from] = pc;

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }
    }

    if (data.signal.type === "offer") {
        await pc.setRemoteDescription(data.signal);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("signal", {
            to: data.from,
            signal: answer
        });
    } else if (data.signal.type === "answer") {
        await pc.setRemoteDescription(data.signal);
    } else {
        await pc.addIceCandidate(data.signal);
    }
});