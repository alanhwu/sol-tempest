import { ConfirmedTransactionMeta, TransactionVersion, VersionedMessage, VersionedBlockResponse } from '@solana/web3.js';
import { addressLabel } from './tx';
import { Cluster } from './utils/cluster'; // Update with the correct path if these are custom types
import { config } from './config';

export async function processBlock(block: VersionedBlockResponse) {
    //map from Program to CU consumed
    let computeUnitMap: Map<string, number> = new Map<string, number>();
    let addressToProgramsMap: Map<string, Set<string>> = new Map<string, Set<string>>();

    let accountAddressToComputeMap: Map<string, number> = new Map<string, number>();

    const relevantTransactions = block.transactions.filter((transaction) => 
        transaction.meta &&
        transaction.meta.computeUnitsConsumed &&
        transaction.meta.computeUnitsConsumed > 0
    );
    processTransactions(relevantTransactions, computeUnitMap, addressToProgramsMap, accountAddressToComputeMap);

    let payload : any = null;

    const computeUnitsArray = Array.from(computeUnitMap).map(async ([programAddress, computeUnits]) => {
        return {
            programAddress,
            programLabel: addressLabel(programAddress, Cluster.MainnetBeta) || programAddress,
            computeUnits
        }
    });

    const resolvedComputeUnitsArray = await Promise.all(computeUnitsArray);
    
    if (computeUnitMap.size == 0) {
        return null;
    }

    //create informativeAccounts array
    let informativeAccounts : InformativeAccount[] = [];
    //for each in addressToProgramsMap, build informative object
    addressToProgramsMap.forEach((associatedPrograms, address) => {
        const currentInformativeAccount : InformativeAccount = {
            address : address,
            addressLabel: addressLabel(address, Cluster.MainnetBeta) || address,
            computeUnits: accountAddressToComputeMap.get(address) ?? 0,
            associatedPrograms: Array.from(associatedPrograms)
        }
        informativeAccounts.push(currentInformativeAccount);
    });

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

    const highestComputeUnit = Math.max(...Array.from(accountAddressToComputeMap.values()));

    //payload must be an object with the following properties:
    //informativeAccounts: array of account objects
    //maxComputeUnits: number
    //addressToLabelMap: map
    //programsComputeUnits: array of objects with programAddress and computeUnits properties
    payload = JSON.stringify({
        slot: block.parentSlot + 1,
        informativeAccounts: informativeAccounts,
        addressToLabelMap: Object.fromEntries(addressToLabelMap),
        maxComputeUnits: highestComputeUnit,
        programsComputeUnits: resolvedComputeUnitsArray
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



export function processAccounts(accountIndices: any[], accountKeys: any, programAddress: string, computeUnitsConsumed: number, addressToProgramsMap: Map<string, Set<string>>, payload: any, programToAccounts: Map<string, string[]>) {
    let count = 0;
    accountIndices.forEach((index: any) => {
        if (!payload.isAccountWritable(index) || index >= accountKeys.length) return;
        count++;
        const address = accountKeys[index].toString();

        //add to programToAccounts
        let associatedAccounts = programToAccounts.get(programAddress) || [];
        associatedAccounts.push(address);
        programToAccounts.set(programAddress, associatedAccounts);

        const associatedPrograms = addressToProgramsMap.get(address) || new Set<string>();
        associatedPrograms.add(programAddress);
        addressToProgramsMap.set(address, associatedPrograms);
    });
}

export function processTransactions(transactions: any[], computeUnitMap: Map<string, number>, addressToProgramsMap: Map<string, Set<string>>, accountAddressToComputeMap: Map<string, number>) {
    if (!transactions || transactions.length === 0) {
        return;
    }

    for (const transaction of transactions) {

        //store relevant info from transaction
        const transactionType : TransactionType = transaction.version;
        const payload = transaction.transaction.message;
        const meta: ConfirmedTransactionMeta = transaction.meta as ConfirmedTransactionMeta ?? {};
        const logMessages = meta.logMessages;

        if (!logMessages) continue; //next transaction if no log messages

        //within each transaction, maintain programs' CU and accounts they touch
        const localProgramToCU: Map<string, number> = new Map<string, number>();
        const programToAccounts: Map<string, string[]> = new Map<string, string[]>();

        for (const logMessage of logMessages) {
            const match = logMessage.match(/Program (\S+) consumed (\d+) of \d+ compute units/);
            if (!match) continue; //next message if it tell us nothing

            const programAddress = match[1];
            const computeUnitsConsumed = parseInt(match[2], 10);

            //add to localProgramToCU
            const currentComputeUnits = localProgramToCU.get(programAddress) || 0;
            localProgramToCU.set(programAddress, currentComputeUnits + computeUnitsConsumed);

            // const currentComputeUnits = computeUnitMap.get(programAddress) || 0;
            // computeUnitMap.set(programAddress, currentComputeUnits + computeUnitsConsumed);

            const instructions = transactionType === "legacy" ? payload.instructions : payload.compiledInstructions;
            const accountKeys = transactionType === "legacy" ? payload.accountKeys : payload.staticAccountKeys;
            if (instructions) {
                instructions.forEach((instruction: any) => {
                    const accountIndices = transactionType === "legacy" ? instruction.accounts : instruction.accountKeyIndexes;
                    processAccounts(accountIndices, accountKeys, programAddress, computeUnitsConsumed, addressToProgramsMap, payload, programToAccounts);
                });
            }
        }

        //foreach program in localProgramToCU, add to computeUnitMap
        localProgramToCU.forEach((computeUnits, programAddress) => {
            const currentComputeUnits = computeUnitMap.get(programAddress) || 0;
            computeUnitMap.set(programAddress, currentComputeUnits + computeUnits);
        }
        );

        //foreach program in programToAccounts, access localProgramToCU divide by number of accounts and for each account add to addressToProgramsMap
        programToAccounts.forEach((associatedAccounts, programAddress) => {
            const computeUnits = localProgramToCU.get(programAddress) || 0;
            const computePerAccount = Math.floor(computeUnits / associatedAccounts.length);
            associatedAccounts.forEach((accountAddress) => {
                const currentComputeUnits = accountAddressToComputeMap.get(accountAddress) || 0;
                accountAddressToComputeMap.set(accountAddress, currentComputeUnits + computePerAccount);
            });
        }
        );

    }
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
