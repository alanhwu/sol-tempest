import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchBlockData } from './solana';
import * as solana from '@solana/web3.js';
import * as fastq from 'fastq';
import { processBlock } from './blockProcessor';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const url = process.env.SOLANA_RPC_URL;
if (url == undefined) {
    throw new Error('SOLANA_RPC_URL is undefined');
}
const solanaConnection = new solana.Connection('https://' + url);

const worker = async (slot: number) => {
    try {
        //console.log(`promise queue size: ${promiseQueue.length()}`);
        console.log('Fetching block data');
        const fetchedBlock = await fetchBlockData(slot);
        console.log('block:', fetchedBlock);
        if (fetchedBlock == null){
            return;
        }
        console.log('Processing block data');
        if (!fetchedBlock.transactions || fetchedBlock.transactions.length === 0) {
            return;
        }
        const payload = await processBlock(fetchedBlock);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
                console.log('Sent data to client');
            }
        });
    } catch (error) {
        console.error('Error processing block data:', error);
    }
};

const promiseQueue = fastq.promise(worker, 1);

let slot = -1;
(async function getInitialSlot() {
    slot = await solanaConnection.getSlot() - 70;
    console.log(`the current slot is ${slot}`);
})();

const interval = setInterval(() => {
    promiseQueue.push(slot);
    slot++;
}, 400);


// solanaWs.on('message', async (data: WebSocket.Data) => {
//     console.log('Received data from Solana:', data);
//     const blobData = await readBuffer(data);

//     if (!blobData.hasOwnProperty('params')) {
//         return;
//     }

//     const slot = blobData.params.result.slot - 70;
//     console.log('slot:', slot);

//     promiseQueue.push(slot);
// });

promiseQueue.drain = () => {
    console.log('All block data have been processed');
};

promiseQueue.empty = () => {
    console.log('The block data processing queue is now empty');
};

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('error', (error) => {
        console.error('Client WebSocket Error:', error);
    });
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