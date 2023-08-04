# Sol Tempest

Sol Tempest is a powerful visualization tool that provides unique insights into the activity of Solana blocks. Built with Typescript, Vue.js, D3.js, HTML, and CSS, it transforms raw block data into a stunning visual representations of Solana's activity.

## Key Features

### 🎨 Dynamic Visualization

The core of Sol Tempest is its visualization engine, crafted with D3.js, that represents Solana blocks in the form of a node graph. It uses a color-coding system to identify accounts using high amounts of compute, allowing users to immediately understand where contention exists in the network, shedding light on aspects like local fee markets.

### 💡 Insights and Analytics

Sol Tempest prepopulates insights into the highest consumers of compute. With hyperlinks that lead to the Solana Block Explorer, users can easily pinpoint and begin researching such accounts to make informed decisions based on real-time analysis.

### 🎛️ Interactive Control Panel

The control panel enables users to tweak a wide variety of settings, such as the number of top accounts to display, animation preferences, and a unique memory function. This feature allows nodes to fade gradually across blocks, enhancing user understanding of temporal trends and changes.

### 🔍 Target Specific Tokens or Programs

A specialized search functionality allows users to target specific tokens or programs e.g. USDC or Mango Markets. This targeted view simplifies complex visualizations, honing in on specific activities for precise analysis and observation.

### 🎥 Historical Block Replay

Sol Tempest's historical replay feature brings the past back to life. Rewatch significant events, such as the Mad Lads mint, as if they were happening live. This historical perspective adds a new dimension to the exploration of the Solana network.

### 💾 Real-time and Historical Perspectives

Nodes in the visualization dynamically respond to the activity within the Solana network. A node will pulse if it is part of the current block being streamed, symbolizing its active state. Conversely, nodes from the last block or two (based on the history setting) remain stagnant, gradually fading to reflect their receding relevance. The hue around each node, ranging from pink to red, updates in real-time in scale with its compute usage in the current block. Additionally, users can hover over nodes for more intricate details, offering a rich, interactive experience that provides a layered perspective on the network's history and progression.

## Technologies Used

- **Backend:** TypeScript
- **Frontend:** Vue.js, HTML, CSS
- **Visualization:** D3.js
- **Communication:** WebSocket