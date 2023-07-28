import { draw } from './visualization.js';
import { reformatString } from './utils.js';
import { config } from './config.js';
const websocket = new WebSocket('ws://localhost:3000');

const slider = document.getElementById('slider');
const toggle1 = document.getElementById('toggle1');
const historySlider = document.getElementById('history_slider');
const historySliderValueDisplay = document.getElementById('history-value');
const sliderValueDisplay = document.getElementById('slider-value');

const insights = document.getElementById('insights-description');

let maxAccounts = 100;
let animationBool = true;
let history = 3;

slider.oninput = function() {
    maxAccounts = this.value;
    // Update the displayed slider value.
    sliderValueDisplay.textContent = this.value;
}

historySlider.oninput = function() {
    // Update the displayed slider value.
    history = this.value;
    historySliderValueDisplay.textContent = this.value;
}

toggle1.onchange = function() {
    animationBool = this.checked;
}

let selectedItem = null;
let targetAddress = null;

const configItems = config.topItems;
const topItems =
    configItems.map(item => {
        const { address, ...rest } = item;
        return rest;
    }); 
  
// Add a click event listener to show all items when the input box is clicked
document.querySelector('#searchInput').addEventListener('click', function() {
    const dropdownItems = document.querySelector('#dropdownItems');
    dropdownItems.innerHTML = '';
  
    topItems.forEach(item => {
      const div = document.createElement('div');
      div.textContent = item.name;
      if (item.type === 'category') {
        div.classList.add('dropdownCategory');
        const img = document.createElement('img');
        img.src = 'arrow.png'; // path to the icon image
        img.style.width = '16px'; // set width of the image
        img.style.height = '12px'; // set height of the image
        div.prepend(img);
      }
      dropdownItems.appendChild(div);
    });
  
    dropdownItems.style.display = 'block';
  });
  
  // Adjust the input event listener to filter items only when something is typed
  document.querySelector('#searchInput').addEventListener('input', function(e) {
    const dropdownItems = document.querySelector('#dropdownItems');
    dropdownItems.innerHTML = '';
  
    if (e.target.value) {
      const filteredItems = topItems.filter(item =>
        item.type !== 'category' && item.name.toLowerCase().startsWith(e.target.value.toLowerCase())
      );
  
      filteredItems.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.name;
        if (item.type === 'category') {
          div.classList.add('dropdownCategory');
          const img = document.createElement('img');
          img.src = 'arrow.png'; // path to the icon image
          img.style.width = '16px'; // set width of the image
          img.style.height = '12px'; // set height of the image
          div.prepend(img);
        }
        dropdownItems.appendChild(div);
      });
    } else {
      // Display all items when the input is empty
      topItems.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.name;
        if (item.type === 'category') {
          div.classList.add('dropdownCategory');
          const img = document.createElement('img');
          img.src = 'arrow.png'; // path to the icon image
          img.style.width = '16px'; // set width of the image
          img.style.height = '12px'; // set height of the image
          div.prepend(img);
        }
        dropdownItems.appendChild(div);
      });
    }
  
  });
  
  document.querySelector('#dropdownItems').addEventListener('click', function(e) {
    console.log(`dropdownItems clicked`);
    if (e.target.tagName === 'DIV' && !e.target.classList.contains('dropdownCategory')) {
        // Update the input field with the selected item's name
        document.querySelector('#searchInput').value = e.target.textContent;

        // Set the selected item variable
        selectedItem = e.target.textContent;
        console.log(selectedItem);
        targetAddress = configItems.find(item => item.name === selectedItem).address;

        dropdownItems.style.display = 'none';
    }
});
  
// Add a blur event listener to hide the items when the input box loses focus
document.querySelector('#searchInput').addEventListener('blur', function() {
    // Use setTimeout to delay the hiding of the dropdown
    setTimeout(function() {
      document.querySelector('#dropdownItems').style.display = 'none';
    }, 100); // Delay time in milliseconds
  });

  // Add a click event listener to the clear button
document.querySelector('#clearInput').addEventListener('click', function() {
  // Clear the input field
  document.querySelector('#searchInput').value = '';

  // Reset the selectedItem variable
  selectedItem = null;
  targetAddress = null;
  console.log('cleared the target address');
  console.log(`targetAddress: ${targetAddress}`);
  console.log(`selectedItem: ${selectedItem}`);
});

  



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

    let formattedInsights = reformatString(parsedData.insights);
    insights.innerHTML = `Top Compute Accounts (Last 5 blocks)\n${formattedInsights}`;

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
            await draw(firstElement, maxAccounts, animationBool, history);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}




