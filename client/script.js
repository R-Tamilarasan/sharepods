const socket = io()

let localStream = null
let peerConnections = {}
let roomId = null

// STUN servers for WebRTC
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
}


// JOIN ROOM
function joinRoom(){

  roomId = document.getElementById("room").value.trim()

  if(!roomId){
    alert("Enter Room ID")
    return
  }

  socket.emit("join-room", roomId)

  document.getElementById("status").innerText = "✅ Joined room: " + roomId

}


// SHARE DEVICE AUDIO (D1)
async function shareAudio(){

  try{

    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    })

    const audioTracks = localStream.getAudioTracks()

    if(audioTracks.length === 0){
      alert("No audio detected. Make sure 'Share Tab Audio' is enabled.")
      return
    }

    // Add audio track to existing peers
    Object.values(peerConnections).forEach(pc => {
      audioTracks.forEach(track=>{
        pc.addTrack(track, localStream)
      })
    })

    alert("Audio sharing started!")

  }catch(err){

    console.error(err)
    alert("Audio capture failed. Use Chrome and enable 'Share tab audio'.")

  }

}


// NEW USER CONNECTED
socket.on("user-connected", async userId => {

  console.log("User connected:", userId)

  const pc = new RTCPeerConnection(rtcConfig)

  peerConnections[userId] = pc

  // Add audio if already sharing
  if(localStream){
    localStream.getTracks().forEach(track=>{
      pc.addTrack(track, localStream)
    })
  }

  pc.onicecandidate = event => {
    if(event.candidate){
      socket.emit("signal", {
        to: userId,
        signal: event.candidate
      })
    }
  }

  pc.ontrack = event => {
    addAudioUser(userId, event.streams[0])
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  socket.emit("signal", {
    to: userId,
    signal: offer
  })

})


// HANDLE SIGNALS
socket.on("signal", async data => {

let pc = peerConnections[data.from]

if(!pc){

pc = new RTCPeerConnection(rtcConfig)
peerConnections[data.from] = pc

pc.ontrack = e=>{
addAudioUser(data.from,e.streams[0])
}

pc.onicecandidate = e=>{
if(e.candidate){
socket.emit("signal",{to:data.from,signal:e.candidate})
}
}

}

if(data.signal.type === "offer"){

await pc.setRemoteDescription(data.signal)

const answer = await pc.createAnswer()
await pc.setLocalDescription(answer)

socket.emit("signal",{to:data.from,signal:answer})

}

else if(data.signal.type === "answer"){

if(pc.signalingState !== "stable"){
await pc.setRemoteDescription(data.signal)
}

}

else{

try{
await pc.addIceCandidate(data.signal)
}catch(err){
console.log("ICE skipped")
}

}

})

function enableAudio(){
    const audios = document.querySelectorAll("audio")
    audios.forEach(a=>{
        a.play().catch(()=>{})
    })
}
// ADD USER AUDIO UI
function addAudioUser(userId, stream){

  if(document.getElementById("user-"+userId)) return

  const users = document.getElementById("users")

  const div = document.createElement("div")
  div.className = "user"
  div.id = "user-"+userId

  const label = document.createElement("span")
  label.innerText = "User " + userId + " "

  const audio = document.createElement("audio")
  audio.srcObject = stream
 audio.autoplay = true
audio.playsInline = true

audio.onloadedmetadata = () => {
    audio.play().catch(() => {
        console.log("User interaction required to start audio")
    })
}
  audio.controls = false

  const volume = document.createElement("input")
  volume.type = "range"
  volume.min = 0
  volume.max = 100
  volume.value = 100

  volume.oninput = () => {
    audio.volume = volume.value / 100
  }

  const mute = document.createElement("button")
  mute.innerText = "Mute"

  mute.onclick = () => {
    audio.muted = !audio.muted
    mute.innerText = audio.muted ? "Unmute" : "Mute"
  }

  div.appendChild(label)
  div.appendChild(audio)
  div.appendChild(volume)
  div.appendChild(mute)

  users.appendChild(div)

}


// USER DISCONNECTED
socket.on("user-disconnected", userId => {

  const el = document.getElementById("user-"+userId)

  if(el) el.remove()

  delete peerConnections[userId]

})