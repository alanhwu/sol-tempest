import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchBlockData } from './solana';
import * as solana from '@solana/web3.js';
import { TokenInfoMap } from '@solana/spl-token-registry';
import * as fastq from 'fastq';
import { processBlock } from './blockProcessor';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const url = process.env.SOLANA_RPC_URL; // Using the RPC URL from the .env file
//ws to solana
const solanaWs = new WebSocket('wss://' + url);
solanaWs.on('open', () => {
    solanaWs.send(JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "slotSubscribe",
    }));
});

const worker = async (fetchPromise : Promise<solana.BlockResponse | null> | null) => {
    try {
        const fetchedBlock : solana.BlockResponse | null = await fetchPromise;
        console.log('block:', fetchedBlock);
        if ( fetchedBlock == null){
            return;
        }
        const payload = await processBlock(fetchedBlock);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
        // processingQueue.push(payload); // Add the processed block to processingQueue
    } catch (error) {
        console.error('Error fetching block data:', error);
    }
};

const promiseQueue = fastq.promise(worker, 1);

solanaWs.on('message', async (data: WebSocket.Data) => {
    console.log('Received data from Solana:', data);
    const blobData = await readBuffer(data);

    if (!blobData.hasOwnProperty('params')) {
        return;
    }

    const slot = blobData.params.result.slot;
    console.log('slot:', slot - 10);

    const fetchPromise = fetchBlockData(slot - 70);
    if (fetchPromise != null){
        promiseQueue.push(fetchPromise); // Add promise to queue
    }
});

promiseQueue.drain = () => {
    console.log('All promises have been processed');
};

promiseQueue.empty = () => {
    console.log('The promise queue is now empty');
};

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