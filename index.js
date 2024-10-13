const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

const connectedClients = {};

// Set EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Generate a random name
function generateRandomName() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Index route
app.get("/", (req, res) => {
  const clientName = generateRandomName();
  res.render("index", { clientName });
});

// Socket.IO connections
io.on("connection", (socket) => {
  let clientName = socket.handshake.query.client_name;
  let publicIp;

  // Register public IP
  socket.on("register_public_ip", ({ publicIP, clientName: name }) => {
    publicIp = publicIP;
    clientName = name;
    connectedClients[clientName] = { id: socket.id, publicIp };

    // Send the updated client list filtered by public IP
    const sameIpClients = Object.keys(connectedClients).filter(
      (name) => connectedClients[name].publicIp === publicIp
    );
    io.emit("update_clients", sameIpClients); // Broadcast connected clients to all
  });

  socket.on("disconnect", () => {
    delete connectedClients[clientName];
    const sameIpClients = Object.keys(connectedClients).filter(
      (name) => connectedClients[name].publicIp === publicIp
    );
    io.emit("update_clients", sameIpClients);
  });

  // Check if recipient is on the same public IP before sending
  socket.on("send_file_chunk", (data) => {
    const { recipient, chunk, file_name, chunk_index, total_chunks } = data;
    const recipientClient = connectedClients[recipient];
    const senderClient = connectedClients[clientName];

    if (recipientClient && recipientClient.publicIp === senderClient.publicIp) {
      // Both sender and recipient are on the same public IP
      io.to(recipientClient.id).emit("receive_file_chunk", {
        chunk,
        file_name,
        chunk_index,
        total_chunks,
      });
    } else {
      console.log(`Recipient ${recipient} not found on the same public IP.`);
      socket.emit("transfer_error", {
        message: `Cannot send file to ${recipient}. They may not be on the same network.`,
      });
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
