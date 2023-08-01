import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, 
    createTooltip, hideTooltip, showTooltip, createScales, removeStrayTooltips } from "./utils.js";    
import { AccountNodev2, ProgramNodev2, Line } from "./nodes.js";

let accountState = {};
let programState = {};
let lineState = {};

/*
data must be an object with the following properties:
    informativeAccounts: array of account objects
    maxComputeUnits: number
    addressToLabelMap: map
    programsComputeUnits: array of objects with programAddress and computeUnits properties
*/

export async function draw(data, maxAccounts, animationBool, historyNumber) {
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
    const accounts = data.informativeAccounts.slice(0, maxAccounts);

    const { lightnessScale, hueScale } = createScales(data.maxComputeUnits);
    const tooltip = createTooltip();

    // Create opacity scale with exponent
    const opacityScale = d3.scalePow().exponent(1.58)
        .domain([0, data.maxComputeUnits])
        .range([0.2, 0.825])
        .clamp(true);

    // Iterate over accounts and fade each one, remove if necessary
    Object.keys(accountState).forEach(key => {
        const node = accountState[key];
        node.fade();
        if (node.isFadedOut(historyNumber)) {
            console.log(`delete node ${node.address}`);
            delete accountState[key];
        } else {
            console.log(`node ${node.address} is not faded out with a fadedness of ${node.fadedness}`);
        }
    });

    // Iterate over programs and fade each one, remove if necessary
    Object.keys(programState).forEach(key => {
        const node = programState[key];
        node.fade();
        if (node.isFadedOut(historyNumber)) {
            console.log("Deleting program node");
            delete programState[key];
        } else {
            console.log(`node ${node.address} is not faded out with a fadedness of ${node.fadedness}`);
        }
    });

    // Update accounts
    if (!accounts) return;
    for (const account of accounts) {
        if (account.address in accountState) {
            // Reset fadedness if node already exists in state
            accountState[account.address].resetFadedness();
            // Update compute units
            accountState[account.address].updateComputeUnits(account.computeUnits);
        } else {
            // Add new node to state
            const hash = await computeSha256(account.address);
            accountState[account.address] = new AccountNodev2(hash, account.address, account.addressLabel, null, account.computeUnits, lightnessScale, hueScale, opacityScale);
        }
    }

    // Update programs
    for (const program of data.programsComputeUnits) {
        if (program.programAddress in programState) {
            // Reset fadedness if node already exists in state
            programState[program.programAddress].resetFadedness();
            // Update compute units
            programState[program.programAddress].updateComputeUnits(program.computeUnits);
        } else {
            // Add new node to state
            const hash = await computeSha256(program.programAddress);
            programState[program.programAddress] = new ProgramNodev2(hash, program.programAddress, originalAddressLabelMap.get(program.programAddress), null, program.computeUnits, lightnessScale, hueScale, null);
        }
    }

    Object.values(lineState).forEach(line => {
        //update the references to the account and program nodes
        line.account = accountState[line.account.address];
        line.program = programState[line.program.address];
    });
    // Go through lines and delete if either program or account is undefined
    Object.values(lineState).forEach(line => {
        if (line.checkDeath()){
            console.log(`deleting line ${line.key}`);
            delete lineState[line.key];
        }
    });

    // Update or make new lines
    for (const account of accounts) {
        const address = account.address;
        const programs = account.associatedPrograms;
        for (const program of programs) {
            const lineKey = `${program}-${address}`;
            console.log(`lineKey: ${lineKey}`);
            if ( !(lineKey in lineState) ) {
                console.log(`Creating new line ${lineKey}`);
                // Create new line
                const line = new Line(programState[program], accountState[address], lineKey, programState, accountState);
                lineState[lineKey] = line;
            } else {
                // refresh the line
                console.log(`Refreshing line ${lineKey}`);
                lineState[lineKey].refresh();
            }
        }
    }

    // clear the svg
    console.log("clearing");
    svg.selectAll("*").remove();
    let lines = svg.append("g").attr("id", "linesGroup"); // add id for clarity

    // Draw lines
    Object.values(lineState).forEach(line => {
        const { x: x1, y: y1 } = line.programPosition;
        const { x: x2, y: y2 } = line.accountPosition;
        // console.log(`drawing with alpha ${line.program.alpha} and ${line.account.alpha}`);
        console.log(`drawing the line from program ${line.program.address} to account ${line.account.address} with alpha ${line.program.alpha} and ${line.account.alpha}`);
        console.log(`the fadedness of the program ${line.program.address} is ${line.program.fadedness} and the fadedness of the account ${line.account.address} is ${line.account.fadedness}`);
        drawLine(lines, x1, y1, x2, y2, line.program.alpha, line.account.alpha);
    });

    // Draw nodes
    Object.values(accountState).forEach(node => {
        const { x, y } = node.position;
        const latest = node.fadedness == 0;
        drawAccount(svg, x, y, 4, node.fill, node.tooltipContent, tooltip, latest, animationBool);
        node.drawBackgroundShape(svg);
    });

    Object.values(programState).forEach(node => {
        const { x, y } = node.position;
        const latest = node.fadedness == 0;
        drawProgram(svg, x, y, 6, node.fill, node.tooltipContent, tooltip, latest, animationBool);
    });

    removeStrayTooltips();

}

let delay = 40;
let duration = 400;
let easing = d3.easeCubic;
let scaleIncrease = 1.5;

function drawProgram(svg, cx, cy, radius, fill, content, tooltip, latest, animationBool) {
    const circle = svg.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", radius)
        .attr("fill", fill)
        .on("mouseover", event => showTooltip(tooltip, event, content))
        .on("mouseout", () => hideTooltip(tooltip));

    // Pulse animation to indicate the circle was in the most recent block
    if (animationBool && latest) {
        circle.transition()
        .delay(delay)
        .duration(duration)
        .ease(easing)
        .attr("r", radius * scaleIncrease)
        .transition()
        .duration(duration)
        .ease(easing)
        .attr("r", radius);
    }
    
    return circle;
}

function drawAccount(svg, cx, cy, radius, fill, content, tooltip, latest, animationBool) {
    const circle = svg.append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", radius)
    .attr("fill", fill)
    .on("mouseover", event => showTooltip(tooltip, event, content))
    .on("mouseout", () => hideTooltip(tooltip));

    // Pulse animation to indicate the circle was in the most recent block
    if (animationBool && latest) {
        circle.transition()
        .delay(delay)
        .duration(duration)
        .ease(easing)
        .attr("r", radius * scaleIncrease)
        .transition()
        .duration(duration)
        .ease(easing)
        .attr("r", radius);
    }
    
    return circle;
}
    return circle;
}

function drawLine(linesGroup, x1, y1, x2, y2, alpha1, alpha2) {
    //console.log(`fade1: ${alpha1}, fade2: ${alpha2}`)
    //console.log(`Drawing line from (${x1}, ${y1}) to (${x2}, ${y2})`);
    const opacity = Math.min(alpha1, alpha2);
    linesGroup.append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        //.attr("stroke", "red")
        //.attr("stroke", "#34eb92") neon green
        //#40E0D0 (Turquoise) or #ADD8E6 (Light Blue)
        .attr("stroke", "#ADD8E6")

        .attr("stroke-width", 0.3)
        .style("opacity", opacity);
}