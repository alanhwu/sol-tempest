import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, pruneStrayTooltips, 
    createTooltip, hideTooltip } from "./utils.js";    

function showTooltip(tooltip, event, content) {
    tooltip.transition()
        .duration(200)
        .style("opacity", .9);
    tooltip.html(content)
        .style("left", (event.pageX) + "px")
        .style("top", (event.pageY - 28) + "px");
}

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

class ProgramNode {
    constructor(program, hash, lightnessScale, hueScale, opacityScale, totalComputeUnits) {
        this.computeUnits = program.computeUnits;
        this.addressLabel = program.programLabel;
        this.associatedAddresses = program.associatedAddresses.map(addr => new AssociatedAccount(addr));
        this.hash = hash;
        this.fadedness = 0;
        this.lightnessScale = lightnessScale;
        this.hueScale = hueScale;

        this.hue = this.calculateHue(this.hash);
        this.lightness = lightnessScale(this.computeUnits);

        // Opacity scale
        this.opacityScale = opacityScale;
        this.totalComputeUnits = totalComputeUnits;

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
        const percentage = ((this.computeUnits / this.totalComputeUnits) * 100).toFixed(2);
        return `${this.addressLabel}<br/>Compute Units: ${this.computeUnits} (${percentage}%)`;
    }

    calculateHue(hash) {
        const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
        return this.hueScale(parseInt(mixedHashPart, 16));
    }

    fade() {
        this.fadedness += FADE_INCREMENT;
        this.associatedAddresses.forEach(addr => addr.fade());
    }

    isFadedOut(maxFadedness) {
        return this.fadedness >= maxFadedness;
    }

    resetFadedness(program) {
        this.fadedness = 0;
        this.associatedAddresses
            .filter(addr => program.associatedAddresses.includes(addr.address))
            .forEach(addr => addr.resetFadedness());
    }

    updateComputeUnits(newComputeUnits) {
        this.computeUnits = newComputeUnits;
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

class AssociatedAccount {
    constructor(address) {
        this.address = address;
        this.fadedness = 0;
    }

    fade() {
        this.fadedness += FADE_INCREMENT;
    }

    resetFadedness() {
        this.fadedness = 0;
    }

    get alpha() {
        return 1 - this.fadedness;
    }
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

const state = {};
const FADE_INCREMENT = 0.25;


export async function draw(data) {
    const originalAddressLabelMap = new Map(Object.entries(data.addressToLabelMap));

    const svg = d3.select("#visualization");

    // clear the svg
    svg.selectAll("*").remove();

    const accounts = data.informativeAccounts;
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
    Object.values(state).forEach(node => node.fade());

    //Go through all nodes and if something has fadedness == maxFadedness, delete it
    Object.keys(state).forEach(address => {
        const node = state[address];
        if (node.isFadedOut(maxFadedness)) {
            delete state[address];
        }
    });

    // Add new nodes if it's not already in the state
    for (const account of accounts) {
        const address = account.address;
        const hash = await computeSha256(address);

        if (address in state) {
            // Reset fadedness if node already exists in state
            state[address].resetFadedness(account);
            // Update compute units
            state[address].updateComputeUnits(account.computeUnits);
        } else {
            // Add new node to state
            state[address] = new AccountNodev2(hash, address, originalAddressLabelMap[address], account.associatedPrograms, account.computeUnits, lightnessScale, hueScale, opacityScale);
        }
    }

    // Draw nodes
    for (let address in state) {
        const node = state[address];
        const { x, y } = node.position;
        console.log(x,y);
        // node.drawBackgroundShape(svg);

        //draw associated

        //draw account node
        drawAccount(svg, x, y, 4, node.fill, node.tooltipContent, tooltip)
            .style("opacity", state[address].alpha);
    }
    pruneStrayTooltips(svg, tooltip);


/*
    const totalComputeUnits = data.computeUnitsMeta;
    // Add new nodes if it's not already in the state
    for (const program of programs) {
        const address = program.programAddress;
        const hash = await computeSha256(address);

        if (address in state) {
            // Reset fadedness if node already exists in state
            state[address].resetFadedness(program);
            // Update compute units
            state[address].updateComputeUnits(program.computeUnits);
        } else {
            // Add new node to state
            state[address] = new ProgramNode(program, hash, lightnessScale, hueScale, opacityScale, totalComputeUnits);
        }
    }

    // Draw nodes
    for (let address in state) {
        const node = state[address];
        const { x, y } = node.position;

        node.drawBackgroundShape(svg);

        for (const associatedAccount of node.associatedAddresses) {
            if (associatedAccount.fadedness < maxFadedness) {
                await drawAssociatedAddresses(linesGroup, x,y, associatedAccount, svg, tooltip, zoneRadius);
            }
        }

        // Draw program circle
       drawProgram(svg, x, y, 6, node.fill, node.tooltipContent, tooltip);

    }
    pruneStrayTooltips(svg, tooltip);

*/


}

async function drawAssociatedAddresses(linesGroup, programCx, programCy, associatedAccount, svg, tooltip, zoneRadius) {
    // const programCx = +programCircle.attr("cx"); //coerce to number
    // const programCy = +programCircle.attr("cy");
    const hash = await computeSha256(associatedAccount.address);
    const angle = scaleHashToNumber(hash, 0, 2 * Math.PI);
    const radius = scaleHashToNumber(hash.slice(8), 10, zoneRadius);

    const cx = programCx + radius * Math.cos(angle);
    const cy = programCy + radius * Math.sin(angle);

    drawLine(linesGroup, programCx, programCy, cx, cy, associatedAccount.alpha);
    drawAccount(svg, cx, cy, 2, "#999999", associatedAccount.address, tooltip)
        .style("opacity", associatedAccount.alpha);
}