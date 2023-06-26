const websocket = new WebSocket('ws://localhost:3000');

websocket.onmessage = async (event) => {

    const data = await readBlobData(event.data);
    console.log('Data received from server:', data);

    // Display the block data in the HTML
    const blockInfoContainer = document.getElementById('block-info');
    blockInfoContainer.textContent = JSON.stringify(data, null, 2);
};

async function readBlobData(blob) {
    try {
      const text = await blob.text(); // Read the Blob as text
      const jsonData = JSON.parse(text); // Parse the text as JSON
      //console.log(jsonData);
      return jsonData;
    } catch (error) {
      console.error('Error reading Blob data:', error);
    }
  }