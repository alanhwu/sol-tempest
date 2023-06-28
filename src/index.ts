import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchBlockData } from './solana';
import { BlockResponse, PublicKey, Transaction } from '@solana/web3.js';

import { addressLabel } from './tx';
import { Cluster } from './utils/cluster'; // Update with the correct path if these are custom types
import { TokenInfoMap } from '@solana/spl-token-registry';

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

    //if it's just the confirmation of subscription, move on
    if (!blobData.hasOwnProperty('params')) {
        return;
    }
    
    const slot = blobData.params.result.slot;
    console.log('slot:', slot - 10);

    if (throttle === 0) {
        try {
            const fetchPromise = fetchBlockData(slot - 10);
            promiseQueue.push(fetchPromise); // Add promise to queue
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
                const fetchedBlock : BlockResponse = await fetchPromise;
                console.log('block:', fetchedBlock);
                
                // get a map of program addresses to compute units
                const payload = await processBlock(fetchedBlock);
                
                // send the JSON string to the frontend
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(payload);
                    }
                });
                
            } catch (error) {
                console.error('Error fetching block data:', error);
            }
        }
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

async function processBlock(block: BlockResponse) {
    if (block.transactions && block.transactions.length === 0) {
        return null;
    }

    const relevantTransactions = block.transactions.filter(transaction => {
        //lambda to return transactions with metadata with >0 compute units
        return transaction.meta
        && transaction.meta.computeUnitsConsumed 
        && transaction.meta.computeUnitsConsumed > 0;
    });

    let computeUnitMap: Map<string, number> = new Map<string, number>();

    if (relevantTransactions.length > 0) {
        for (const transaction of relevantTransactions) {
            if (transaction.meta && transaction.meta.logMessages) {
                const logMessages = transaction.meta.logMessages;
    
                for (const logMessage of logMessages) {
                    // regex to parse the log message
                    const match = logMessage.match(/Program (\S+) consumed (\d+) of \d+ compute units/);
                    
                    // if logMessage has expected format, update map
                    if (match) {
                        const programAddress = match[1];
                        const computeUnitsConsumed = parseInt(match[2], 10);
                        const currentComputeUnits = computeUnitMap.get(programAddress) || 0;

                        computeUnitMap.set(programAddress, currentComputeUnits + computeUnitsConsumed);
                    }
                }
            }
        }
    }

    let payload : any = null;
    if (computeUnitMap.size > 0) {
        // convert the map into an array of objects
        const computeUnitsArray = Array.from(computeUnitMap).map(async ([programAddress, computeUnits]) => {
            return {
                programAddress,
                programLabel: addressLabel(programAddress, Cluster.MainnetBeta) || programAddress,
                computeUnits,
                associatedAddresses: await findAssociatedAddresses(programAddress, relevantTransactions)
            };
        });
        const resolvedComputeUnitsArray = await Promise.all(computeUnitsArray);
        // Aggregating computeUnits from meta
        let totalComputeUnitsMeta = 0;
        for (const transaction of block.transactions) {
            if (transaction.meta && transaction.meta.computeUnitsConsumed) {
                totalComputeUnitsMeta += transaction.meta.computeUnitsConsumed;
            }
        }

        // create a payload with additional block information
        payload = JSON.stringify({
            slot: block.parentSlot + 1, // you might want to use a different property for the slot/block number
            computeUnitsMeta: totalComputeUnitsMeta,
            programsComputeUnits: resolvedComputeUnitsArray
        });
    }
    return payload;
}


async function findAssociatedAddresses(programAddress : string, targetTransactions : any){
    let associatedAddresses : any = [];

    targetTransactions && targetTransactions.forEach((txn: { transaction: { message: any; }; })=> {
        const {message} = txn.transaction;
        if (message && message.instructions){
            message.instructions.forEach((instruction: { programIdIndex: string | number; accounts: any[]; }) => {
                // Check if the programIdIndex in the instruction matches
                // the index of the programAddress in accountKeys
                const programId = message.accountKeys[instruction.programIdIndex];
                if (programId && programId.toString() === programAddress) {
                    // Map the indices in instruction.accounts to actual addresses
                    // and add them to associatedAddresses array
                    const addresses = instruction.accounts.map(index => message.accountKeys[index].toString());
                    associatedAddresses = associatedAddresses.concat(addresses);
                }
            });
        }
    });

    // Remove dupes
    return Array.from(new Set(associatedAddresses));
}
