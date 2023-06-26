const websocket = new WebSocket('ws://localhost:3000');

websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Data received from server:', data);
    
    // Display the block data in the HTML
    const blockInfoContainer = document.getElementById('block-info');
    blockInfoContainer.textContent = JSON.stringify(data, null, 2);
};
