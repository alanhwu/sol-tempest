import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, 
    createTooltip, hideTooltip, showTooltip, createScales, removeStrayTooltips } from "./utils.js";    
import { config } from "./config.js";
import { AccountNodev2, ProgramNodev2, Line } from "./nodes.js";

let accountState = {};
let programState = {};
let lineState  = [];

/*
data must be an object with the following properties:
    informativeAccounts: array of account objects
    maxComputeUnits: number
    addressToLabelMap: map
    programsComputeUnits: array of objects with programAddress and computeUnits properties
*/

export async function draw(data) {
    let originalAddressLabelMap = data.addressToLabelMap || {}; // Check if data.addressToLabelMap exists, otherwise use an empty object
    const originalAddressLabelMapEntries = Object.entries(originalAddressLabelMap);
    originalAddressLabelMap = new Map(originalAddressLabelMapEntries);

    // Create map from JSON data for O(1) lookup
    let programComputeUnitsMap = new Map();
    data.programsComputeUnits.forEach(item => {
        programComputeUnitsMap.set(item.programAddress, item.computeUnits);
    });

    const svg = d3.select("#visualization");

    // Primary data structure
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
    if (!accounts) {
        return;
    }
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
                    let computeUnits = programComputeUnitsMap.get(program);
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
        node.scanAssociations(accountState);
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

    let lineKeysSet = new Set(lineState.map(line => line.key));
    // Add valid lines
    for (let program in programState) {
        const node = programState[program];
        for (let account of node.associatedAccounts) {
            // Create a key that uniquely identifies this line
            const lineKey = `${program}-${account}`;

            if (!lineKeysSet.has(lineKey)) {
                lineState.push(new Line(node, accountState[account], lineKey));
                lineKeysSet.add(lineKey);
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

    removeStrayTooltips();

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