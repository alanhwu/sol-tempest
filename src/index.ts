import express from 'express';
import { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchLatestBlockData } from './solana';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Use the public directory to serve static files
app.use(express.static('public'));

wss.on('connection', async (ws) => {
    console.log('Client connected');
    
    // Fetch the latest block data
    const blockData = await fetchLatestBlockData();
    
    // Send block data to the client
    ws.send(JSON.stringify(blockData));
});

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
