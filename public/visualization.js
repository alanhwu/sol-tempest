import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, 
    createTooltip, hideTooltip, showTooltip, createScales, removeStrayTooltips } from "./utils.js";    
import { config } from "./config.js";
import { AccountNodev2, ProgramNodev2, Line } from "./nodes.js";

let accountState = {};
let programState = {};
// let lineState  = [];
let lineState = {};

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
    Object.keys(accountState).forEach(key => {
        const node = accountState[key];
        node.fade();
        if (node.isFadedOut()) {
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
        if (node.isFadedOut()) {
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
        /*
        if (line.checkDeath()) {
            console.log("Deleting line");
            //check if it was the account or program that died
            if ( !(line.program.address in programState) ) {
                // program died
                console.log("Program died");
                //check if the account has any other lines
                let accountHasOtherLines = false;
                Object.values(lineState).forEach(otherLine => {
                    if (otherLine.account.address === line.account.address) {
                        accountHasOtherLines = true;
                    }
                });
                if (!accountHasOtherLines) {
                    // account has no other lines, delete it too
                    console.log("Account died");
                    accountState.splice(accountState.indexOf(line.account), 1);
                }
            } else {
                // account died
                console.log("Account died");
                //check if the program has any other lines
                let programHasOtherLines = false;
                Object.values(lineState).forEach(otherLine => {
                    if (otherLine.program.address === line.program.address) {
                        programHasOtherLines = true;
                    }
                });
                if (!programHasOtherLines) {
                    // program has no other lines, delete it too
                    console.log("Program died");
                    programState.splice(programState.indexOf(line.program), 1);
                }
            }
            lineState.delete(line.key);
        }
        */
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
        drawAccount(svg, x, y, 4, node.fill, node.tooltipContent, tooltip);
            //.style("opacity", node.alpha);
        node.drawBackgroundShape(svg);
    });

    Object.values(programState).forEach(node => {
        const { x, y } = node.position;
        drawProgram(svg, x, y, 6, node.fill, node.tooltipContent, tooltip);
        //    .style("opacity", node.alpha);
    });

    

    /*
    if (!accounts) return;
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
            accountState[address] = new AccountNodev2(hash, address, account.addressLabel, account.associatedPrograms, account.computeUnits, lightnessScale, hueScale, opacityScale);
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
                lineState.push(new Line(node, accountState[account], lineKey, programState, accountState));
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

    */

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
    .attr("fill", fill)
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
    const opacity = Math.min(alpha1, alpha2);
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