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
let targetType = null;

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
        targetType = configItems.find(item => item.name === selectedItem).form;
        console.log(`targetAddress: ${targetAddress}`);
        console.log(`targetType: ${targetType}`);

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
  targetType = null;
  console.log('cleared the target address');
  console.log(`targetAddress: ${targetAddress}`);
  console.log(`selectedItem: ${selectedItem}`);
});

  



let stateQueue = [];
let started = false;
const blockInfoContainer = document.getElementById('block-info');
blockInfoContainer.textContent = `Block Number: `;


const blockPayloadContainer = document.getElementById('block-payload');

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
    


    stateQueue.push(parsedData);


    if (!started && stateQueue.length >= 3) {
        processQueue();
        started = true;
    }
};

websocket.onerror = (error) => {
    console.error('WebSocket Error:', error);
};

// Function to display the first element from the queue
function displayFirstElement(firstElement) {
  blockPayloadContainer.textContent = typeof firstElement === 'object' ?
      JSON.stringify(firstElement, null, 2) : firstElement;

  blockInfoContainer.textContent = `Block number: ${firstElement.blockNumber}`;

  let formattedInsights = reformatString(firstElement.insights);
  insights.innerHTML = `Top Compute Accounts (Last 5 blocks)\n${formattedInsights}`;
}

// Function to filter programs or tokens
function filterElements(firstElement, filterByProgram) {
  let relevantPrograms = new Set();
  const filteredItems = firstElement.informativeAccounts.filter(account => {
      const isRelevant = filterByProgram 
          ? account.associatedPrograms.includes(targetAddress)
          : account.tokenTags.includes(targetAddress);

      if (isRelevant) {
          account.associatedPrograms.forEach(program => {
              relevantPrograms.add(program);
          });
      }
      return isRelevant;
  });

  const filteredPrograms = firstElement.programsComputeUnits.filter(program => {
      return relevantPrograms.has(program.programAddress);
  });

  firstElement.informativeAccounts = filteredItems;
  firstElement.programsComputeUnits = filteredPrograms;
}

async function processQueue() {
  while (true) {
      if (stateQueue.length > 0) {
          console.log(`length of stateQueue: ${stateQueue.length}`);
          let firstElement = stateQueue.shift();

          displayFirstElement(firstElement);

          console.log(`the target address is: ${targetAddress}`);
          if (targetAddress) {
              if (targetType === 'program') {
                  console.log('target address detected');
                  console.log('filter based on program');
                  filterElements(firstElement, true);
              } else if (targetType === 'token') {
                  console.log('filter based on token');
                  filterElements(firstElement, false);
              }
          }
          await draw(firstElement, maxAccounts, animationBool, history);
      }
      await new Promise(r => setTimeout(r, 900));
  }
}
