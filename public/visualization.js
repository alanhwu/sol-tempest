import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, pruneStrayTooltips, 
    createTooltip, hideTooltip } from "./utils.js";

function computeColorFromHashAndUnits(hash, computeUnits, lightnessScale, hueScale, alpha = 1) {
    const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
    const hue = hueScale(parseInt(mixedHashPart, 16));
    const lightness = lightnessScale(computeUnits);
    return `hsla(${hue}, 100%, ${lightness}%, ${alpha})`;
}

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
        .range([20, 80]);

    const hueScale = d3.scaleLinear()
        .domain([0, 0xffffffff])
        .range([270, 150]);

    return { lightnessScale, hueScale };
}

function drawCircle(svg, cx, cy, radius, fill, content, tooltip) {
    return svg.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", radius)
        .attr("fill", fill)
        .on("mouseover", event => showTooltip(tooltip, event, content))
        .on("mouseout", () => hideTooltip(tooltip));
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
    constructor(program, hash, lightnessScale, hueScale) {
        this.computeUnits = program.computeUnits;
        this.addressLabel = program.programLabel;
        this.associatedAddresses = program.associatedAddresses.map(addr => new AssociatedAccount(addr));
        this.hash = hash;
        this.fadedness = 0;
        this.lightnessScale = lightnessScale;
        this.hueScale = hueScale;
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
        return computeColorFromHashAndUnits(this.hash, this.computeUnits, this.lightnessScale, this.hueScale, 1 - this.fadedness);
    }

    get tooltipContent() {
        return this.addressLabel + "<br/>Compute Units: " + this.computeUnits;
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

const state = {};
const FADE_INCREMENT = 0.25;

export async function draw(data) {
    const svg = d3.select("#visualization");

    // clear the svg
    svg.selectAll("*").remove();

    const programs = data.programsComputeUnits || [];
    const { lightnessScale, hueScale } = createScales(programs);
    const tooltip = createTooltip();
    const linesGroup = svg.append("g");
    const zoneRadius = 40;
    const maxFadedness = 3;

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
    for (const program of programs) {
        const address = program.programAddress;
        const hash = await computeSha256(address);

        if (address in state) {
            // Reset fadedness if node already exists in state
            state[address].resetFadedness(program);
        } else {
            // Add new node to state
            state[address] = new ProgramNode(program, hash, lightnessScale, hueScale);
        }
    }

    // Draw nodes
    for (let address in state) {
        const node = state[address];
        const { x, y } = node.position;

        for (const associatedAccount of node.associatedAddresses) {
            if (associatedAccount.fadedness < maxFadedness) {
                await drawAssociatedAddresses(linesGroup, x,y, associatedAccount, svg, tooltip, zoneRadius);
            }
        }

        // Draw program circle
       drawCircle(svg, x, y, 6, node.fill, node.tooltipContent, tooltip);

    }
    pruneStrayTooltips(svg, tooltip);
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
    drawCircle(svg, cx, cy, 2, "#999999", associatedAccount.address, tooltip)
        .style("opacity", associatedAccount.alpha);
}