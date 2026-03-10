const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("../client"));

io.on("connection", (socket) => {

    socket.on("join-room", (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit("user-connected", socket.id);

        socket.on("signal", data => {
            io.to(data.to).emit("signal", {
                from: socket.id,
                signal: data.signal
            });
        });

        socket.on("disconnect", () => {
            socket.to(roomId).emit("user-disconnected", socket.id);
        });

    });

});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});