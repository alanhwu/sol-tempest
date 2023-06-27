const websocket = new WebSocket('ws://localhost:3000');

websocket.onmessage = async (event) => {
    console.log('Data received from server:', event.data);
    
    // Parse the received data if it's a JSON string
    let parsedData;
    try {
        parsedData = JSON.parse(event.data);
    } catch (error) {
        parsedData = event.data; // In case it's not a JSON string
    }

    // Display the block data in the HTML
    const blockInfoContainer = document.getElementById('block-info');
    
    // Use JSON.stringify to format it nicely if it's an object, otherwise just show the data
    blockInfoContainer.textContent = typeof parsedData === 'object' ?
        JSON.stringify(parsedData, null, 2) : parsedData;
};
