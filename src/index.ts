import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

//ws to solana
const solanaWs = new WebSocket('wss://api.mainnet-beta.solana.com');

// Send the subscription message once connected
solanaWs.on('open', () => {
    solanaWs.send(JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "slotSubscribe"
    }));
});

// Handle incoming notifications
solanaWs.on('message', (data: WebSocket.Data) => {
    console.log('Received data from Solana:', data);
    //forward to frontend
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
});

wss.on('connection', (ws) => {
    console.log('Client connected');
});

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
