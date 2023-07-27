import { draw } from './visualization.js';
const websocket = new WebSocket('ws://localhost:3000');

const slider = document.getElementById('slider');
const toggle1 = document.getElementById('toggle1');
const toggle2 = document.getElementById('toggle2');
const sliderValueDisplay = document.getElementById('slider-value');

let sliderVariable = 0;
let toggle1Bool = false;
let toggle2Bool = false;

slider.oninput = function() {
    sliderVariable = this.value;
    // Update the displayed slider value.
    sliderValueDisplay.textContent = this.value;
}

toggle1.onchange = function() {
    toggle1Bool = this.checked;
}

toggle2.onchange = function() {
   toggle2Bool = this.checked;
}



let stateQueue = [];
let started = false;
const blockInfoContainer = document.getElementById('block-info');
blockInfoContainer.textContent = `Block Number: `;

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
    
    const blockPayloadContainer = document.getElementById('block-payload');
    blockPayloadContainer.textContent = typeof parsedData === 'object' ?
        JSON.stringify(parsedData, null, 2) : parsedData;

    blockInfoContainer.textContent = `Block number: ${parsedData.blockNumber}`;
        
    stateQueue.push(parsedData);


    if (!started && stateQueue.length >= 3) {
        processQueue();
        started = true;
    }
};

websocket.onerror = (error) => {
    console.error('WebSocket Error:', error);
};

async function processQueue() {
    while (true) {
        if (stateQueue.length > 0) {
            console.log(`length of stateQueue: ${stateQueue.length}`);
            const firstElement = stateQueue.shift();
            await draw(firstElement);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

