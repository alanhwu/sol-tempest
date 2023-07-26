import { ConfirmedTransactionMeta, TransactionVersion, VersionedMessage, VersionedBlockResponse } from '@solana/web3.js';
import { addressLabel } from './tx';
import { Cluster } from './utils/cluster'; // Update with the correct path if these are custom types
import { config } from './config';

export async function processBlock(block: VersionedBlockResponse) {
    //map from Program to CU consumed
    let computeUnitMap: Map<string, number> = new Map<string, number>();
    let addressToProgramsMap: Map<string, Set<programWithCompute>> = new Map<string, Set<programWithCompute>>();

    let accountAddressToComputeMap: Map<string, number> = new Map<string, number>();
    
    const relevantTransactions: myTransaction[] = [];
    const legacyTransactions: myTransaction[] = [];
    const version0Transactions: myTransaction[] = [];

    sortTransactions(block.transactions, relevantTransactions, legacyTransactions, version0Transactions);
    handleLegacyTransactions(legacyTransactions, computeUnitMap, addressToProgramsMap);
    handleVersion0Transactions(version0Transactions, computeUnitMap, addressToProgramsMap);

    let payload : any = null;
    if (computeUnitMap.size == 0) {
        return null;
    }

    // convert the map into an array of objects
    const computeUnitsArray = Array.from(computeUnitMap).map(async ([programAddress, computeUnits]) => {
        const associatedAddresses = await findAssociatedAddresses(programAddress, relevantTransactions);
        return {
            programAddress,
            programLabel: addressLabel(programAddress, Cluster.MainnetBeta) || programAddress,
            computeUnits,
            associatedAddresses,
            computePerAddress : computeUnits / associatedAddresses.length
        };
    });
    const resolvedComputeUnitsArray = await Promise.all(computeUnitsArray);
    
    //adding up all the compute units in the block. this will be one of the payload params.
    let totalComputeUnitsMeta = 0;
    let highestComputeUnit = 0;
    for (const transaction of block.transactions) {
        if (transaction.meta && transaction.meta.computeUnitsConsumed) {
            highestComputeUnit = Math.max(highestComputeUnit, transaction.meta.computeUnitsConsumed);
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
        //computeUnitsMeta: totalComputeUnitsMeta,
        programsComputeUnits: resolvedComputeUnitsArray, // holds type of progA, progL, compU, associatedA
        //addressToPrograms: addressToProgramsArray,
        informativeAccounts: informativeAccounts,
        addressToLabelMap: Object.fromEntries(addressToLabelMap),
        maxComputeUnits: highestComputeUnit
    });

    return payload;
}

export async function findAssociatedAddresses(programAddress : string, targetTransactions : any){
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



export function processAccounts(accountIndices: any[], accountKeys: any, programAddress: string, computeUnitsConsumed: number, addressToProgramsMap: Map<string, Set<programWithCompute>>, payload: any) {
    let count = 0;
    accountIndices.forEach((index: any) => {
        if (!payload.isAccountWritable(index) || index >= accountKeys.length) return;
        count++;
        const address = accountKeys[index].toString();
        const associatedPrograms = addressToProgramsMap.get(address) || new Set<programWithCompute>();
        associatedPrograms.add({
            programAddress,
            compute: Math.floor(computeUnitsConsumed / count)
        });
        addressToProgramsMap.set(address, associatedPrograms);
    });
}

export function processTransactions(transactions: any[], computeUnitMap: Map<string, number>, addressToProgramsMap: Map<string, Set<programWithCompute>>, transactionType: TransactionType) {
    if (!transactions || transactions.length === 0) {
        return;
    }
    for (const transaction of transactions) {
        const payload = transaction.transaction.message;
        const meta: ConfirmedTransactionMeta = transaction.meta as ConfirmedTransactionMeta ?? {};
        const logMessages = meta.logMessages;
        if (!logMessages) continue;

        for (const logMessage of logMessages) {
            const match = logMessage.match(/Program (\S+) consumed (\d+) of \d+ compute units/);
            if (!match) continue;

            const programAddress = match[1];
            const computeUnitsConsumed = parseInt(match[2], 10);
            const currentComputeUnits = computeUnitMap.get(programAddress) || 0;
            computeUnitMap.set(programAddress, currentComputeUnits + computeUnitsConsumed);

            const instructions = transactionType === "legacy" ? payload.instructions : payload.compiledInstructions;
            const accountKeys = transactionType === "legacy" ? payload.accountKeys : payload.staticAccountKeys;

            if (instructions) {
                instructions.forEach((instruction: any) => {
                    const accountIndices = transactionType === "legacy" ? instruction.accounts : instruction.accountKeyIndexes;
                    processAccounts(accountIndices, accountKeys, programAddress, computeUnitsConsumed, addressToProgramsMap, payload);
                });
            }
        }
    }
}


export function handleLegacyTransactions(legacyTransactions: any[], computeUnitMap: Map<string, number>, addressToProgramsMap: Map<string, Set<programWithCompute>>) {
    processTransactions(legacyTransactions, computeUnitMap, addressToProgramsMap, "legacy");
}

export function handleVersion0Transactions(version0Transactions: any[], computeUnitMap: Map<string, number>, addressToProgramsMap: Map<string, Set<programWithCompute>>) {
    processTransactions(version0Transactions, computeUnitMap, addressToProgramsMap, "version0");
}

function sortTransactions(
    transactions: myTransaction[],
    relevantTransactions: myTransaction[],
    legacyTransactions: myTransaction[],
    version0Transactions: myTransaction[]
) {
    transactions.forEach((transaction: myTransaction) => {
        if (
            transaction.meta &&
            transaction.meta.computeUnitsConsumed &&
            transaction.meta.computeUnitsConsumed > 0
        ) {
            relevantTransactions.push(transaction);
            switch (transaction.version) {
                case 'legacy':
                    legacyTransactions.push(transaction);
                    break;
                case 0:
                    version0Transactions.push(transaction);
                    break;
            }
        }
    });
}


type TransactionType = "legacy" | "version0";
type InformativeAccount = {
    address: string,
    addressLabel: string,
    associatedPrograms: string[],
    computeUnits: number
}
type myTransaction = {
    transaction: {
        message: VersionedMessage;
        signatures: string[];
    };
    meta: ConfirmedTransactionMeta | null;
    version?: TransactionVersion | undefined;
};
type programWithCompute = {
    programAddress: string,
    compute: number
}
