import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, pruneStrayTooltips, 
    createTooltip, hideTooltip, showTooltip } from "./utils.js";    

function createScales(programs) {
    const lightnessScale = d3.scaleLinear()
        .domain([0, d3.max(programs, d => d.computeUnits)])
        .range([30, 60]);

    const hueScale = d3.scaleLinear()
        .domain([0, 0xffffffff])
        .range([270, 150]);

    return { lightnessScale, hueScale };
}

function drawProgram(svg, cx, cy, radius, fill, content, tooltip) {
    const circle = svg.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", radius)
        .attr("fill", fill)
        .on("mouseover", event => showTooltip(tooltip, event, content))
        .on("mouseout", () => hideTooltip(tooltip));

    // Pulse animation to indicate the circle was in the most recent block
    circle.transition()
        .duration(600)
        .ease(d3.easeElastic)
        .attr("r", radius * 1.3)
        .transition()
        .duration(600)
        .ease(d3.easeElastic)
        .attr("r", radius);

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
    circle.transition()
        .duration(600)
        .ease(d3.easeElastic)
        .attr("r", radius * 1.3)
        .transition()
        .duration(600)
        .ease(d3.easeElastic)
        .attr("r", radius);

    return circle;
}

function drawLine(linesGroup, x1, y1, x2, y2, opacity) {
    linesGroup.append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("stroke", "grey")
        .attr("stroke-width", 0.5)
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

    isFadedOut(maxFadedness) {
        return this.fadedness >= maxFadedness;
    }

    updateComputeUnits(newComputeUnits) {
        this.computeUnits = newComputeUnits;
    }

    get position() {
        const xOffset = 42;
        const yOffset = 42;
        return {
            x: scaleHashToNumber(this.hash, xOffset, 800 - xOffset),
            y: scaleHashToNumber(this.hash.slice(8), yOffset, 600 - yOffset)
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
        return 1 - this.fadedness;
    }


    drawBackgroundShape(svg) {
        const gradientId = `gradient-${Math.random().toString(36).substring(2)}`;
    
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
        radialGradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", this.fill)
            .attr("stop-opacity", opacity);
        radialGradient.append("stop")
            .attr("offset", "25%")
            .attr("stop-color", this.fill)
            .attr("stop-opacity", opacity * 0.8); // Multiply opacity by a factor to create a steeper drop-off
        radialGradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", this.fill)
            .attr("stop-opacity", "0");
    
        // Draw the background circle with the radial gradient
        const size = 200; // Set a constant size for the circles
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
            x: scaleHashToNumber(this.hash, xOffset, 800 - xOffset),
            y: scaleHashToNumber(this.hash.slice(8), yOffset, 600 - yOffset)
        };
    }

    get fill() {
        return `hsla(${this.hue}, 100%, ${this.lightness}%, ${1 - this.fadedness})`;
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

    isFadedOut(maxFadedness) {
        return this.fadedness >= maxFadedness;
    }

}

let accountState = {};
let programState = {};
const FADE_INCREMENT = 0.25;


export async function draw(data) {
    const originalAddressLabelMap = new Map(Object.entries(data.addressToLabelMap));
    console.log(originalAddressLabelMap);
    const svg = d3.select("#visualization");


    const accounts = data.informativeAccounts;
    const programCompute = data.programsComputeUnits;
    //const { lightnessScale, hueScale } = createScales(programs);
    const { lightnessScale, hueScale } = createScales(accounts);
    const tooltip = createTooltip();
    const linesGroup = svg.append("g");
    const maxFadedness = 3;


    // Create opacity scale with exponent
    const opacityScale = d3.scalePow().exponent(1.58)
        .domain([0, d3.max(accounts, d => d.computeUnits)])
        .range([0.01, 0.825])
        .clamp(true);

    // Fade all nodes
    Object.values(accountState).forEach(node => node.fade());
    Object.values(programState).forEach(node => node.fade());

    //Go through all nodes and if something has fadedness == maxFadedness, delete it
    Object.keys(accountState).forEach(address => {
        const node = accountState[address];
        if (node.isFadedOut(maxFadedness)) {
            delete accountState[address];
        }
    });

    Object.keys(programState).forEach(address => {
        const node = programState[address];
        if (node.isFadedOut(maxFadedness)) {
            delete programState[address];
        }
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

    // Draw nodes

    //draw program nodes
    for (let program in programState) {
        const node = programState[program];
        const { x, y } = node.position;
        // node.drawBackgroundShape(svg);
        drawProgram(svg, x, y, 6, node.fill, node.tooltipContent, tooltip)
            .style("opacity", programState[program].alpha);
    }

    //draw account nodes
    for (let address in accountState) {
        const node = accountState[address];
        const { x, y } = node.position;
        //console.log(x,y);
        // node.drawBackgroundShape(svg);

        //draw account node
        drawAccount(svg, x, y, 4, node.fill, node.tooltipContent, tooltip)
            .style("opacity", accountState[address].alpha);
    }

    pruneStrayTooltips(svg, tooltip);
}
