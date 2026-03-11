const socket = io()

let localStream
let peerConnections = {}
let roomId = null

function joinRoom(){

roomId=document.getElementById("room").value.trim()

if(!roomId){
alert("Enter room id")
return
}

socket.emit("join-room",roomId)

document.getElementById("status").innerText="Joined room: "+roomId

}

async function shareAudio(){

try{

localStream = await navigator.mediaDevices.getDisplayMedia({
audio:true,
video:false
})

Object.values(peerConnections).forEach(pc=>{
localStream.getTracks().forEach(track=>{
pc.addTrack(track,localStream)
})
})

alert("Audio sharing started")

}catch(err){

console.error(err)
alert("Audio capture failed")

}

}

socket.on("user-connected",async userId=>{

const pc=new RTCPeerConnection({
iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]
})

peerConnections[userId]=pc

if(localStream){
localStream.getTracks().forEach(track=>{
pc.addTrack(track,localStream)
})
}

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("signal",{to:userId,signal:e.candidate})
}
}

pc.ontrack=e=>{
addAudioUser(userId,e.streams[0])
}

const offer=await pc.createOffer()
await pc.setLocalDescription(offer)

socket.emit("signal",{to:userId,signal:offer})

})

socket.on("signal",async data=>{

let pc=peerConnections[data.from]

if(!pc){

pc=new RTCPeerConnection({
iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]
})

peerConnections[data.from]=pc

pc.ontrack=e=>{
addAudioUser(data.from,e.streams[0])
}

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("signal",{to:data.from,signal:e.candidate})
}
}

}

if(data.signal.type==="offer"){

await pc.setRemoteDescription(data.signal)

const answer=await pc.createAnswer()

await pc.setLocalDescription(answer)

socket.emit("signal",{to:data.from,signal:answer})

}

else if(data.signal.type==="answer"){

await pc.setRemoteDescription(data.signal)

}

else{

await pc.addIceCandidate(data.signal)

}

})

function addAudioUser(userId,stream){

if(document.getElementById("user-"+userId)) return

const users=document.getElementById("users")

const div=document.createElement("div")
div.className="user"
div.id="user-"+userId

const label=document.createElement("span")
label.innerText="User "+userId+" "

const audio=document.createElement("audio")
audio.srcObject=stream
audio.autoplay=true

const volume=document.createElement("input")
volume.type="range"
volume.min=0
volume.max=100
volume.value=100

volume.oninput=()=>{
audio.volume=volume.value/100
}

const mute=document.createElement("button")
mute.innerText="Mute"

mute.onclick=()=>{
audio.muted=!audio.muted
mute.innerText=audio.muted?"Unmute":"Mute"
}

div.appendChild(label)
div.appendChild(audio)
div.appendChild(volume)
div.appendChild(mute)

users.appendChild(div)

}

socket.on("user-disconnected",userId=>{

const el=document.getElementById("user-"+userId)

if(el) el.remove()

delete peerConnections[userId]

})