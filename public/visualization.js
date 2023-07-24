import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, 
    createTooltip, hideTooltip, showTooltip, createScales } from "./utils.js";    
import { config } from "./config.js";

function drawProgram(svg, cx, cy, radius, fill, content, tooltip) {
    const circle = svg.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", radius)
        .attr("fill", fill)
        .on("mouseover", event => showTooltip(tooltip, event, content))
        .on("mouseout", () => hideTooltip(tooltip));

    // Pulse animation to indicate the circle was in the most recent block
    /*
    circle.transition()
        .duration(100)
        .ease(d3.easeElastic)
        .attr("r", radius * 1.3)
        .transition()
        .duration(100)
        .ease(d3.easeElastic)
        .attr("r", radius);
    */

    return circle;
}

function drawAccount(svg, cx, cy, radius, fill, content, tooltip) {
    const circle = svg.append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", radius)
    .attr("fill", "#999999")
    .on("mouseover", event => showTooltip(tooltip, event, content))
    .on("mouseout", () => hideTooltip(tooltip));

    // Pulse animation to indicate the circle was in the most recent block
    /*
    circle.transition()
        .duration(600)
        .ease(d3.easeElastic)
        .attr("r", radius * 1.3)
        .transition()
        .duration(600)
        .ease(d3.easeElastic)
        .attr("r", radius);
    */
    return circle;
}

function drawLine(linesGroup, x1, y1, x2, y2, alpha1, alpha2) {
    //console.log(`fade1: ${alpha1}, fade2: ${alpha2}`)
    //console.log(`Drawing line from (${x1}, ${y1}) to (${x2}, ${y2})`);
    const opacity = 0.75 * Math.min(alpha1, alpha2);
    linesGroup.append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        //.attr("stroke", "red")
        .attr("stroke", "#34eb92")
        .attr("stroke-width", 0.3)
        .style("opacity", opacity);
}

class AccountNodev2 {
    constructor(hash, address, addressLabel, associatedPrograms, computeUnits, lightnessScale, hueScale, opacityScale){
        this.hash = hash;
        this.address = address;
        this.addressLabel = addressLabel;
        this.associatedPrograms = associatedPrograms;
        this.computeUnits = computeUnits;
        this.lightnessScale = lightnessScale;
        this.hueScale = hueScale;
        this.opacityScale = opacityScale;
        this.fadedness = 0;
        this.hue = "#999999"
        // this.lightness = lightnessScale(this.computeUnits);
        this.lightness = 90;
    }

    fade() {
        this.fadedness += FADE_INCREMENT;
    }

    resetFadedness() {
        this.fadedness = 0;
    }

    isFadedOut() {
        return this.fadedness >= 3;
    }

    updateComputeUnits(newComputeUnits) {
        this.computeUnits = newComputeUnits;
    }

    get position() {
        const xOffset = 42;
        const yOffset = 42;
        return {
            x: scaleHashToNumber(this.hash, xOffset, config.svgLength - xOffset),
            y: scaleHashToNumber(this.hash.slice(8), yOffset, config.svgHeight - yOffset)
        };
    }

    get fill() {
        return `hsla(${this.hue}, 100%, ${this.lightness}%, ${1 - this.fadedness})`;
    }

    get tooltipContent() {
        const percentage = ((this.computeUnits / 12_000_000) * 100).toFixed(2);
        return `${this.addressLabel}<br/>Compute Units: ${this.computeUnits} (${percentage}%)`;
    }

    calculateHue(hash) {
        const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
        return this.hueScale(parseInt(mixedHashPart, 16));
    }

    get alpha() {
        return 1 - (this.fadedness/3);
    }
    
    drawBackgroundShape(svg) {
        const gradientId = `gradient-${Math.random().toString(36).substring(2)}`;
        
        // Define the color scale with an exponential scale.
        const colorScale = d3.scalePow()
            .exponent(3)
            .domain([0, 12000000])
            .range(['#FFC0CB', 'red']);
        
        // Define a radial gradient
        const radialGradient = svg.append("defs")
            .append("radialGradient")
            .attr("id", gradientId)
            .attr("cx", "50%")
            .attr("cy", "50%")
            .attr("r", "50%")
            .attr("fx", "50%")
            .attr("fy", "50%");
        
        // Define the gradient stops
        const opacity = this.opacityScale(this.computeUnits);
        const scaledColor = colorScale(this.computeUnits);
        radialGradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", scaledColor)
            .attr("stop-opacity", opacity);
        radialGradient.append("stop")
            .attr("offset", "25%")
            .attr("stop-color", scaledColor)
            .attr("stop-opacity", opacity * 0.8); // Multiply opacity by a factor to create a steeper drop-off
        radialGradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", scaledColor)
            .attr("stop-opacity", "0");
        
        // Draw the background circle with the radial gradient
        const size = 20; // Set a constant size for the circles
        svg.insert("circle", ":first-child")
            .attr("cx", this.position.x)
            .attr("cy", this.position.y)
            .attr("r", size)
            .attr("fill", `url(#${gradientId})`);
    }
    
    
    
}

class ProgramNodev2 {
    constructor(hash, address, addressLabel, associatedAccounts, computeUnits, lightnessScale, hueScale, opacityScale){
        this.hash = hash;
        this.address = address;
        this.addressLabel = addressLabel;
        this.associatedAccounts = associatedAccounts;
        this.computeUnits = computeUnits;
        this.lightnessScale = lightnessScale;
        this.hueScale = hueScale;
        this.opacityScale = opacityScale;
        this.fadedness = 0;
        this.referenceCount = associatedAccounts.size;
        this.hue = this.calculateHue(this.hash);
        this.lightness = lightnessScale(this.computeUnits);
    }

    updateAssociations(address) {
        this.associatedAccounts.push(address);
    }

    getReferenceCount() {
        return this.associatedAccounts.size;
    }

    scanAssociations() {
        this.associatedAccounts.forEach(account => {
            if (!(account in accountState)) {
                this.associatedAccounts = this.associatedAccounts.filter(item => item !== account);
            }
        });
    }

    get position() {
        const xOffset = 42;
        const yOffset = 42;
        return {
            x: scaleHashToNumber(this.hash, xOffset, config.svgLength - xOffset),
            y: scaleHashToNumber(this.hash.slice(8), yOffset, config.svgHeight- yOffset)
        };
    }

    get fill() {
        const opacity = this.alpha * 0.4 + 0.6;
        return `hsla(${this.hue}, 100%, 50%, ${opacity})`;
    }

    calculateHue(hash) {
        const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
        return this.hueScale(parseInt(mixedHashPart, 16));
    }

    get tooltipContent() {
        return `${this.addressLabel}<br/>Compute Units: ${this.computeUnits}`;
    }

    fade() {
        this.fadedness += FADE_INCREMENT;
    }

    resetFadedness() {
        this.fadedness = 0;
    }

    isFadedOut() {
        return this.fadedness >= 3;
    }

    get alpha() {
        return 1 - (this.fadedness/3);
    }

}

class Line {
    constructor(program, account, lineKey) {
        this.program = program;
        this.account = account;
        this.key = lineKey;
    }

    refresh() {
        this.fadedness = Math.min(program.alpha, account.alpha);
    }

    get programPosition() {
        return this.program.position;
    }

    get accountPosition() {
        return this.account.position;
    }

    checkDeath() {
        if (!this.program.alpha || !this.account.alpha) {
            return true;
        }
        return false;
    }

}

let accountState = {};
let programState = {};
let lineState  = [];
const FADE_INCREMENT = 1;

export async function draw(data) {
    let originalAddressLabelMap = data.addressToLabelMap || {}; // Check if data.addressToLabelMap exists, otherwise use an empty object
    const originalAddressLabelMapEntries = Object.entries(originalAddressLabelMap);
    originalAddressLabelMap = new Map(originalAddressLabelMapEntries);
    //console.log(originalAddressLabelMap);
    const svg = d3.select("#visualization");

    const accounts = data.informativeAccounts;
    const { lightnessScale, hueScale } = createScales(data.maxComputeUnits);
    const tooltip = createTooltip();

    // Create opacity scale with exponent
    const opacityScale = d3.scalePow().exponent(1.58)
        .domain([0, data.maxComputeUnits])
        .range([0.2, 0.825])
        .clamp(true);

    // Iterate over accounts and fade each one, remove if necessary
    let newAccountState = {};
    Object.values(accountState).forEach(node => {
        node.fade();
        if (!node.isFadedOut()) {
            newAccountState[node.address] = node;
        } else {
            console.log("Deleting account node");
        }
    });
    accountState = newAccountState;

    // Iterate over programs and fade each one, remove if necessary
    let newProgramState = {};
    Object.values(programState).forEach(node => {
        node.fade();
        if (!node.isFadedOut()) {
            newProgramState[node.address] = node;
        } else {
            console.log("Deleting program node");
        }
    });
    programState = newProgramState;

    // Go through lines and delete if either program or account is undefined
    lineState = lineState.filter(line => {
        if (line.checkDeath()) {
            console.log("Deleting line");
            return false;   // Excludes the line from the new array
        }
        return true;        // Includes the line in the new array
    });


    // Add new nodes if it's not already in the state
    for (const account of accounts) {
        const address = account.address;
        const hash = await computeSha256(address);

        if (address in accountState) {
            // Reset fadedness if node already exists in state
            accountState[address].resetFadedness(account);
            // Update compute units
            accountState[address].updateComputeUnits(account.computeUnits);
            // Update Programs
            for (const program of account.associatedPrograms) {
                if (program in programState) {
                    programState[program].updateAssociations(address);
                } else {
                    const hash = await computeSha256(program);
                    //find compute units of program
                    let computeUnits;
                    for (const item of data.programsComputeUnits) {
                        if (item.programAddress === program) {
                            computeUnits = item.computeUnits;
                            break;
                        }
                    }
                    programState[program] = new ProgramNodev2(hash, program, originalAddressLabelMap.get(program), [address], computeUnits, lightnessScale, hueScale);
                }
            }
        } else {
            // Add new node to state
            const addressLabel = originalAddressLabelMap.get(address);
            accountState[address] = new AccountNodev2(hash, address, addressLabel, account.associatedPrograms, account.computeUnits, lightnessScale, hueScale, opacityScale);
        }
    }

    // Make sure to remove all program nodes that aren't associated with alive accounts
    //for each value in the map, run scanAssociations and then check if referenceCount == 0, if so, delete
    Object.keys(programState).forEach(program => {
        const node = programState[program];
        node.scanAssociations();
        if (node.getReferenceCount() == 0) {
            delete programState[program];
        }
    });

    // clear the svg
    console.log("clearing");
    svg.selectAll("*").remove();
    let lines = svg.append("g").attr("id", "linesGroup"); // add id for clarity


    // Get rid of bad lines
    lineState = lineState.filter(line => !line.checkDeath());

    // Add valid lines
    for (let program in programState) {
        const node = programState[program];
        for (let account of node.associatedAccounts) {
            // Create a key that uniquely identifies this line
            const lineKey = `${program}-${account}`;

            // Check if this line already exists in `lineState`
            if (!lineState.some(line => line.key === lineKey)) {
                // If it doesn't exist, add it to `lineState`
                lineState.push(new Line(node, accountState[account], lineKey));
            }
        }
    }
    console.log(lineState.length);

    //Draw lines
    for (let line of lineState) {
        const { x: x1, y: y1 } = line.programPosition;
        const { x: x2, y: y2 } = line.accountPosition;
        // console.log(`drawing with alpha ${line.program.alpha} and ${line.account.alpha}`);
        drawLine(lines, x1, y1, x2, y2, line.program.alpha, line.account.alpha);
    }

    // Draw nodes

    //draw program nodes
    for (let program in programState) {
        const node = programState[program];
        const { x, y } = node.position;
        drawProgram(svg, x, y, 6, node.fill, node.tooltipContent, tooltip)
            .style("opacity", programState[program].alpha);
    }

    //draw account nodes
    for (let address in accountState) {
        const node = accountState[address];
        const { x, y } = node.position;
        // draw each
        drawAccount(svg, x, y, 4, node.fill, node.tooltipContent, tooltip)
            .style("opacity", accountState[address].alpha);
        node.drawBackgroundShape(svg);
    }

    //Remove all but the last tooltip
    d3.selectAll(".tooltip")
    .filter((d, i, nodes) => i < nodes.length - 1)
    .remove();
  
}
