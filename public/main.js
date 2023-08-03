import { draw } from './visualization.js';
import { reformatString } from './utils.js';
import { config } from './config.js';


const websocket = new WebSocket('ws://localhost:3000');
const configItems = config.topItems;

const app = Vue.createApp({
  data() {
    return {
      maxAccounts: 100,
      animationBool: true,
      history: 3,
      stateQueue: [],
      blockNumber: null,
      blockPayload: null,
      insights: null,
      selectedItem: null,
      targetAddress: null,
      targetType: null,
      started: false,
      topItems: config.topItems.map(item => {
        const { address, ...rest } = item;
        return rest;
      }),
      searchInput: '',
      dropdownVisible: false,
      isLive: true,
    }
  },
  computed: {
    filteredItems() {
      if (this.searchInput) {
        return this.topItems.filter(item =>
          item.type !== 'category' && item.name.toLowerCase().startsWith(this.searchInput.toLowerCase())
        );
      } else {
        return this.topItems;
      }
    }
  },
  methods: {
    handleOutsideClick(event) {
        if (!this.dropdownVisible || event.target.closest('#dropdownItems') || event.target.closest('#searchInput')) {
            return;
        }
        this.dropdownVisible = false;
    },
    filledStyle(value, max) {
          return {
            width: `${(value / max) * 100}%`,
          };
        },
      
    toggleDropdown() {
        console.log('Toggle Dropdown');
        this.dropdownVisible = !this.dropdownVisible;
    },
    handleItemClick(item) {
        this.searchInput = item;
        this.selectedItem = item;
        this.dropdownVisible = false;
        this.targetType = configItems.find(entry => entry.name === item && entry.type === 'item')?.form;
        this.targetAddress = configItems.find(entry => entry.name === this.selectedItem).address;
        console.log(this.targetAddress);
        console.log(this.targetType);
        console.log(this.selectedItem);
    },    

      clearInput() {
        this.searchInput = '';
        this.selectedItem = null;
        this.targetAddress = null;
        this.targetType = null;
        this.dropdownVisible = false;
      },
    handleSlider(e) {
      this.maxAccounts = e.target.value;
    },
    handleHistorySlider(e) {
      this.history = e.target.value;
    },
    handleToggle(e) {
      this.animationBool = e.target.checked;
    },
    async processQueue() {
      while (true) {
        if (this.stateQueue.length > 0) {
          let firstElement = this.stateQueue.shift();
          this.blockNumber = firstElement.blockNumber;
          this.blockPayload = JSON.stringify(firstElement, null, 2);
          this.insights = reformatString(firstElement.insights);
          if (this.targetAddress) {
            if (this.targetType === 'program') {
              this.filterElements(firstElement, true);
            } else if (this.targetType === 'token') {
              this.filterElements(firstElement, false);
            }
          }
          await draw(firstElement, this.maxAccounts, this.animationBool, this.history);
        }
        await new Promise(r => setTimeout(r, 900));
      }
    },
    filterElements(firstElement, filterByProgram) {
      let relevantPrograms = new Set();
      const filteredItems = firstElement.informativeAccounts.filter(account => {
        const isRelevant = filterByProgram 
            ? account.associatedPrograms.includes(this.targetAddress)
            : account.tokenTags.includes(this.targetAddress);
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
  },
  mounted() {
    websocket.onmessage = async (event) => {
      if (event.data.size === 0) {
        return;
      }
      let parsedData;
      try {
        parsedData = JSON.parse(event.data);
      } catch (error) {
        parsedData = event.data;
      }
      this.stateQueue.push(parsedData);
      if (!this.started && this.stateQueue.length >= 3) {
        this.processQueue();
        this.started = true;
      }
    };
    websocket.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };
    document.addEventListener('click', this.handleOutsideClick);
  }
});

// app.component('slider-input', {
//     props: ['modelValue', 'label', 'min', 'max'],
//     template: `
//       <div>
//         <label>{{ label }}</label>
//         <input type="range" :min="min || 1" :max="max || 100" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />
//         <span>{{ modelValue }}</span>
//       </div>
//     `
//   });

app.component('slider-input', {
    props: ['modelValue', 'label', 'min', 'max'],
    computed: {
        progress() {
            let offset = (this.min === this.modelValue) ? 1 : 0;
            return ((this.modelValue - this.min) / (this.max - this.min)) * (100 - offset) + offset;
        }
    },
    template: `
      <div class="slider-container">
        <div class="slider-label">{{ label }} {{ modelValue }}</div> <!-- Wrap the label in a div -->
        <div class="slider-wrapper">
          <div class="slider-track"></div>
          <div class="slider-filled" :style="{ width: progress + '%' }"></div>
          <input class="slider-input" type="range" :min="min" :max="max" :value="modelValue" @input="$emit('update:modelValue', +$event.target.value)">
        </div>
      </div>
    `
});

  

app.mount('#app');
