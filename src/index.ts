import express from 'express';
import WebSocket, { Server as WebSocketServer } from 'ws';
import http from 'http';
import { fetchBlockData } from './solana';
import * as solana from '@solana/web3.js';

import { addressLabel } from './tx';
import { Cluster } from './utils/cluster'; // Update with the correct path if these are custom types
import { TokenInfoMap } from '@solana/spl-token-registry';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;
import { config } from './config';
app.use(express.static('public'));

const url = process.env.SOLANA_RPC_URL; // Using the RPC URL from the .env file
//ws to solana
const solanaWs = new WebSocket('wss://' + url);
// Send the subscription message once connected
solanaWs.on('open', () => {
    solanaWs.send(JSON.stringify({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "slotSubscribe",
    }));
});

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

    // const block = await fetchBlockData(slot - 30);
    // if (!block) {
    //     console.log('block ${slot - 30} is null');
    //     return;
    // }
    // const payload = await processBlock(block);
    // console.log(`got block ${slot - 30}`);
    // wss.clients.forEach(client => {
    //     if (client.readyState === WebSocket.OPEN) {
    //         client.send(payload);
    //     }
    // });
    // console.log(payload);
    const fetchPromise = fetchBlockData(slot - 70);
    promiseQueue.push(fetchPromise); // Add promise to queue
});

// Function that resolves promises from the queue and sends to the front-end
const resolvePromises = async () => {
    while (true) {
        if (promiseQueue.length > 0) {
            const fetchPromise = promiseQueue.shift();
            try {
                const fetchedBlock : solana.BlockResponse = await fetchPromise;
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
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait for 1 second
        console.log(promiseQueue);
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

async function processBlock(block: solana.VersionedBlockResponse) {
    if (!block || !block.transactions || block.transactions.length === 0) {
        return null;
    }

    const relevantTransactions = block.transactions.filter(transaction => {
        //lambda to return transactions with metadata with >0 compute units
        return transaction.meta
        && transaction.meta.computeUnitsConsumed 
        && transaction.meta.computeUnitsConsumed > 0;
    }); // both legacy and version 0 transactions have this field
    console.log(relevantTransactions);

    //const formattedTransactions = await formatTransactions(relevantTransactions);
    //this returns us a map of address to InformativeAccount object

    //map from Program to CU consumed
    let computeUnitMap: Map<string, number> = new Map<string, number>();
    let addressToProgramsMap: Map<string, Set<programWithCompute>> = new Map<string, Set<programWithCompute>>();


    //separate the formattedTransactions into two arrays based on their transaction version
    const legacyTransactions = relevantTransactions.filter(transaction => { return transaction.version === 'legacy'; });
    const version0Transactions = relevantTransactions.filter(transaction => { return transaction.version === 0; });

    handleLegacyTransactions(legacyTransactions, computeUnitMap, addressToProgramsMap);
    handleVersion0Transactions(version0Transactions, computeUnitMap, addressToProgramsMap);

    let payload : any = null;
    if (computeUnitMap.size > 0) {
        // convert the map into an array of objects
        const computeUnitsArray = Array.from(computeUnitMap).map(async ([programAddress, computeUnits]) => {
            return {
                programAddress,
                programLabel: addressLabel(programAddress, Cluster.MainnetBeta) || programAddress,
                computeUnits,
                associatedAddresses: await findAssociatedAddresses(programAddress, relevantTransactions),
                computePerAddress : computeUnits / (await findAssociatedAddresses(programAddress, relevantTransactions)).length
            };
        });
        const resolvedComputeUnitsArray = await Promise.all(computeUnitsArray);

        //adding up all the compute units in the block. this will be one of the payload params.
        let totalComputeUnitsMeta = 0;
        for (const transaction of block.transactions) {
            if (transaction.meta && transaction.meta.computeUnitsConsumed) {
                totalComputeUnitsMeta += transaction.meta.computeUnitsConsumed;
            }
        }

        // Convert addressToProgramsMap to array
        const addressToProgramsArray = Array.from(addressToProgramsMap).map(([address, associatedPrograms]) => {
            return {
                address,
                associatedPrograms: Array.from(associatedPrograms)
            };
        });

        let informativeAccounts : InformativeAccount[] = [];
        //for each in addressToProgramsArray, build informative object
        for (let i = 0; i < addressToProgramsArray.length; i++) {
            const addressToPrograms = addressToProgramsArray[i];
            const address = addressToPrograms.address;
            const associatedPrograms = addressToPrograms.associatedPrograms;

            // Using reduce to sum compute units
            // const computeUnits = associatedPrograms.reduce((acc, programAddress) => {
            //     const programInfo = resolvedComputeUnitsArray.find(p => p.programAddress === programAddress.programAddress);
            //     return acc + (programInfo ? programInfo.computeUnits : 0);
            // }, 0);

            // get CU sum from addressToProgramsArray
            const computeUnits = addressToProgramsArray[i].associatedPrograms.reduce((acc, program) => {
                return acc + program.compute;
            }, 0);

            //create a version of associatedPrograms that just has the program addresses
            const associatedProgramsAddresses = associatedPrograms.map(program => program.programAddress);
            const currentInformativeAccount : InformativeAccount = {
                address : address,
                addressLabel: addressLabel(address, Cluster.MainnetBeta) || address,
                computeUnits: +computeUnits,
                associatedPrograms: associatedProgramsAddresses
            }

            informativeAccounts.push(currentInformativeAccount);

        }

        if (config) {
            // Sort informativeAccounts array based on computeUnits in descending order
            informativeAccounts.sort((a, b) => b.computeUnits - a.computeUnits);
            // Keep only the top compute unit accounts based on the configuration
            informativeAccounts = informativeAccounts.slice(0, config.topAccountsCount);
        }

        // Create a map of address to label
        let addressToLabelMap : Map<string, string> = new Map<string, string>();
        for (const obj of resolvedComputeUnitsArray) {
            addressToLabelMap.set(obj.programAddress, obj.programLabel);
        }
        for (const obj of informativeAccounts) {
            addressToLabelMap.set(obj.address, obj.addressLabel);
        }

        payload = JSON.stringify({
            slot: block.parentSlot + 1,
            computeUnitsMeta: totalComputeUnitsMeta,
            programsComputeUnits: resolvedComputeUnitsArray, // holds type of progA, progL, compU, associatedA
            addressToPrograms: addressToProgramsArray,
            informativeAccounts: informativeAccounts,
            addressToLabelMap: Object.fromEntries(addressToLabelMap)
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

async function formatTransactions(transactions: any) {
    let parsedAccounts : Map<string, InformativeAccount> = new Map<string, InformativeAccount>();
    for (let i = 0; i < transactions.length; i++) {
        delete transactions[i].meta.postBalances;
        delete transactions[i].meta.postTokenBalances;
        delete transactions[i].meta.preBalances;
        delete transactions[i].meta.preTokenBalances;
        delete transactions[i].meta.rewards;

        const message = transactions[i].transaction.message;
        const instructs = message.compiledInstructions;
        if (instructs) {
            for (let j = 0; j < instructs.length; j++) {
                const programIndex = instructs[j].programIdIndex;
                if (!instructs[j].accounts.length || instructs[j].accounts.length === 0) {
                    continue;
                }
                for (let k = 0; k < instructs[j].accounts.length; k++) {
                    const index = instructs[j].accounts[k];
                    if (!message.isAccountWritable(index)){
                        continue;
                    } else {
                        const address = message.staticAccountKeys[index].toStringTag();
                        const programAddress = message.indexToProgramIds[programIndex].toStringTag();
                        //grab InformativeAccount object from map if it exists
                        let currentInformativeAccount = parsedAccounts.get(address);
                        // if it doesn't exist, create it. otherwise, we will override the object
                        if (!currentInformativeAccount) {
                            currentInformativeAccount = {
                                address : address,
                                addressLabel: addressLabel(address, Cluster.MainnetBeta) || address,
                                computeUnits: -1,
                                associatedPrograms: [programAddress]
                            }
                            parsedAccounts.set(address, currentInformativeAccount);
                        } else {
                            currentInformativeAccount.associatedPrograms.push(programAddress);
                        }
                    }
                }
            }
        }
    }

    return parsedAccounts;

}

function handleLegacyTransactions(legacyTransactions : any, computeUnitMap: Map<string, number>, addressToProgramsMap: Map<string, Set<programWithCompute>>) {
    if (legacyTransactions.length == 0 || !legacyTransactions) {
        return;
    }
    for (const transaction of legacyTransactions){
        const payload: solana.Message = transaction.transaction.message;
        const meta: solana.ConfirmedTransactionMeta = transaction.meta as solana.ConfirmedTransactionMeta ?? {};
        const logMessages = meta.logMessages;
        if (!logMessages) {
            continue;
        }
        for (const logMessage of logMessages) {
            const match = logMessage.match(/Program (\S+) consumed (\d+) of \d+ compute units/);
            if (match) {
                const programAddress = match[1];
                const computeUnitsConsumed = parseInt(match[2], 10);
                const currentComputeUnits = computeUnitMap.get(programAddress) || 0;

                computeUnitMap.set(programAddress, currentComputeUnits + computeUnitsConsumed);
                let count = 0;
                if (payload && payload.instructions) {
                    payload.instructions.forEach(instruction => {
                        const programId = payload.accountKeys[instruction.programIdIndex];
                        if (programId && programId.toString() === programAddress) {
                            instruction.accounts.forEach(index => {
                                if (!payload.isAccountWritable(index)) {
                                    return;
                                }
                                count++;
                                const address = payload.accountKeys[index].toString();
                                const associatedPrograms = addressToProgramsMap.get(address) || new Set<programWithCompute>();
                                associatedPrograms.add(
                                    {
                                        programAddress: programAddress,
                                        compute: Math.floor(computeUnitsConsumed / count)
                                    }
                                );
                                addressToProgramsMap.set(address, associatedPrograms);
                            });
                        }
                    });
                }
            }
        }
    }
}

function handleVersion0Transactions(version0Transactions: any, computeUnitMap: Map<string, number>, addressToProgramsMap: Map<string, Set<programWithCompute>>) {
    if (version0Transactions.length == 0 || !version0Transactions) {
        return;
    }
    for (const transaction of version0Transactions){
        const payload: solana.MessageV0 = transaction.transaction.message;
        const meta: solana.ConfirmedTransactionMeta = transaction.meta as solana.ConfirmedTransactionMeta ?? {};
        const logMessages = meta.logMessages;
        if (!logMessages) {
            continue;
        }
        for (const logMessage of logMessages) {
            const match = logMessage.match(/Program (\S+) consumed (\d+) of \d+ compute units/);
            if (match) {
                const programAddress = match[1];
                const computeUnitsConsumed = parseInt(match[2], 10);
                const currentComputeUnits = computeUnitMap.get(programAddress) || 0;

                computeUnitMap.set(programAddress, currentComputeUnits + computeUnitsConsumed);
                let count = 0;
                if (payload && payload.compiledInstructions) { // non-null assertion
                    payload.compiledInstructions.forEach(instruction => {
                        const accountKeys = payload.staticAccountKeys;
                        const programId = accountKeys[instruction.programIdIndex];
                        if (programId && programId.toString() === programAddress) {
                            instruction.accountKeyIndexes.forEach(index => {
                                if (!payload.isAccountWritable(index) || index >= accountKeys.length) {
                                    return;
                                }
                                count++;
                                const address = accountKeys[index].toString();
                                const associatedPrograms = addressToProgramsMap.get(address) || new Set<programWithCompute>();
                                associatedPrograms.add(
                                    {
                                        programAddress: programAddress,
                                        compute: Math.floor(computeUnitsConsumed / count)
                                    }
                                );
                                addressToProgramsMap.set(address, associatedPrograms);
                            });
                        }
                    });
                }
            }
        }
    }
}


type InformativeAccount = {
    address: string,
    addressLabel: string,
    associatedPrograms: string[],
    computeUnits: number
}

type myTransaction = {
    transaction: {
        message: solana.VersionedMessage;
        signatures: string[];
    };
    meta: solana.ConfirmedTransactionMeta | null;
    version?: solana.TransactionVersion | undefined;
};

type programWithCompute = {
    programAddress: string,
    compute: number
}