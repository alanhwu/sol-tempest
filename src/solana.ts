import { BlockResponse, Connection, GetVersionedBlockConfig } from '@solana/web3.js';
require('dotenv').config();

const url = 'https://' + process.env.SOLANA_RPC_URL; // Using the RPC URL from the .env file
if (url == undefined) {
    throw new Error('SOLANA_RPC_URL is undefined');
}
const connection = new Connection(url);

export const fetchBlockData = async (slot : number): Promise<BlockResponse | null> => {
    // Fetch the given confirmed block
    const blockConfig: GetVersionedBlockConfig = {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full'
    };
    try {
        const block = await connection.getBlock(slot, blockConfig);
        return block;
    } catch (error)
    {
        console.log(error);
        return null;
    }

}

export const fetchLatestBlockData = async (): Promise<BlockResponse | null> => {

    // Fetch the latest confirmed block
    const blockConfig: GetVersionedBlockConfig = {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'accounts'
    };
    
    const slot = await connection.getSlot();
    let block: BlockResponse | null = null;

    if (blockConfig != undefined) {
        block = await connection.getBlock(slot, blockConfig);
    }
    
    console.log('Latest block:', block);
    return block;
};
