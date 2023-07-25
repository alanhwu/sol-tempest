import { draw } from './visualization.js';
const websocket = new WebSocket('ws://localhost:3000');

let stateQueue = [];
let started = false;

websocket.onmessage = async (event) => {
    console.log('Data received from server:', event.data);
    if (event.data.size == 0) {
        return;
    }
    let parsedData;
    try {
        parsedData = JSON.parse(event.data);
    } catch (error) {
        parsedData = event.data; // In case it's not a JSON string
    }
    
    const blockInfoContainer = document.getElementById('block-info');
    blockInfoContainer.textContent = typeof parsedData === 'object' ?
        JSON.stringify(parsedData, null, 2) : parsedData;
        
    stateQueue.push(parsedData);

    if (!started && stateQueue.length >= 20) {
        processQueue();
        started = true;
    }
    
};

async function processQueue() {
    while (true) {
        if (stateQueue.length > 0) {
            console.log(`length of stateQueue: ${stateQueue.length}`);
            const firstElement = stateQueue.shift();
            await draw(firstElement);
        }
        await new Promise(r => setTimeout(r, 400));
    }
}

