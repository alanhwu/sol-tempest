import { draw } from './visualization.js';
const websocket = new WebSocket('ws://localhost:3000');

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
        
    await draw(parsedData);
};
