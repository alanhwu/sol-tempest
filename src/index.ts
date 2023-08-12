import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchBlockData } from './solana';
import * as solana from '@solana/web3.js';
import { processBlock } from './blockProcessor';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
const CONCURRENCY_LEVEL = 10; // Number of simultaneous requests to the API

app.use(express.static('public'));

const url = process.env.SOLANA_RPC_URL;
if (url == undefined) {
    throw new Error('SOLANA_RPC_URL is undefined');
}
const solanaConnection = new solana.Connection('https://' + url);

let slot = -1;
(async function getInitialSlot() {
    slot = await solanaConnection.getSlot() - 70;
    console.log(`the current slot is ${slot}`);
})();

wss.on('connection', (ws) => {
    console.log('Client connected');
    (async function getInitialSlot() {
        slot = await solanaConnection.getSlot() - 70;
        console.log(`the current slot is ${slot}`);
    })();
    ws.on('error', (error) => {
        console.error('Client WebSocket Error:', error);
    });
    ws.on('message', (message) => {
        console.log('received: %s', message);
        //payload looks like: {"blockNumber":12341234}
        //set our slot variable to the blockNumber
        const payload = JSON.parse(message.toString());
        slot = payload.blockNumber;
        console.log(`set slot to ${slot}`);
    });
});


server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const processBlockData = async (fetchedBlock: any, slot: number) => {
    try {
        console.log(`Processing block data for slot: ${slot}`);
        if (!fetchedBlock.transactions || fetchedBlock.transactions.length === 0) {
            return;
        }
        const payload = await processBlock(fetchedBlock);
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
                console.log(`Sent block: ${slot} to client`);
            }
        });
    } catch (error) {
        console.error(`Error processing block data for slot: ${slot}`, error);
    }
}

const fetchAndProcessBlocks = async () => {
    while (true) {
        const promises = [];
        for (let i = 0; i < CONCURRENCY_LEVEL; i++) {
            console.log(`Fetching block data for slot: ${slot}`);
            promises.push(fetchBlockData(slot));
            slot++;
        }
        const fetchedBlocks = await Promise.all(promises);
        for(let i = 0; i < CONCURRENCY_LEVEL; i++) {
            await processBlockData(fetchedBlocks[i], slot - CONCURRENCY_LEVEL + i);
        }
    }
}

fetchAndProcessBlocks().catch(console.error);
