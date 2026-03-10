const socket = io();
let localStream;
let peerConnections = {};

async function joinRoom() {

    const roomId = document.getElementById("room").value;

    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true
    });

    socket.emit("join-room", roomId);

}

socket.on("user-connected", async (userId) => {

    const pc = new RTCPeerConnection();

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("signal", {
                to: userId,
                signal: event.candidate
            });
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("signal", {
        to: userId,
        signal: offer
    });

    peerConnections[userId] = pc;

});

socket.on("signal", async data => {

    let pc = peerConnections[data.from];

    if (!pc) {
        pc = new RTCPeerConnection();

        pc.ontrack = event => {
            const audio = document.createElement("audio");
            audio.srcObject = event.streams[0];
            audio.play();
        };

        peerConnections[data.from] = pc;
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