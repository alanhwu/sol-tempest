import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchBlockData } from './solana';

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

let throttle = 7;
let promiseQueue : any = [];
solanaWs.on('message', async (data: WebSocket.Data) => {
    console.log('Received data from Solana:', data);

    const blobData = await readBuffer(data);
    if (!blobData.hasOwnProperty('params')) {
        return;
    }
    
    const slot = blobData.params.result.slot;
    console.log('slot:', slot - 10);

    if (throttle === 0) {
        try {
            const fetchPromise = fetchBlockData(slot - 10);
            promiseQueue.push(fetchPromise);
            throttle = 7; // Reset the throttle
        } catch (error) {
            console.error('Error fetching block data:', error);
        }

    } else {
        throttle--;
    }
});

// Function that resolves promises from the queue and sends to the front-end
const resolvePromises = async () => {
    while (true) {
        if (promiseQueue.length > 0) {
            const fetchPromise = promiseQueue.shift();
            try {
                const fetchedBlock = await fetchPromise;
                console.log('block:', fetchedBlock);

                if (fetchedBlock) {
                    const fetchedBlockString = JSON.stringify(fetchedBlock);
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(fetchedBlockString); // Sending as a JSON string
                        }
                    });
                }
                
            } catch (error) {
                console.error('Error fetching block data:', error);
            }
        }
        //console.log(promiseQueue.length);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
    }
};
resolvePromises();

wss.on('connection', (ws) => {
    console.log('Client connected');
});

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

async function readBuffer(buffer: any) {
    try {
        const text = buffer.toString('utf8');
        const jsonData = JSON.parse(text);
        return jsonData;
    } catch (error) {
        console.error('Error reading Blob data:', error);
    }
}
