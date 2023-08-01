import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export async function computeSha256(input) {
    const buffer = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

export function scaleHashToNumber(hash, min, max) {
    const hashInt = parseInt(hash.slice(0, 8), 16);
    return ((hashInt / 0xffffffff) * (max - min)) + min; //normalize and then scale
}

export function createTooltip() {
    return d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
}

export function hideTooltip(tooltip) {
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
}

export function showTooltip(tooltip, event, content) {
    tooltip.transition()
        .duration(200)
        .style("opacity", .9);
    tooltip.html(content)
        .style("left", (event.pageX) + "px")
        .style("top", (event.pageY - 28) + "px");
}

export function createScales(maxComputeUnits) {
    /*
    const lightnessScale = d3.scaleLinear()
        .domain([0, maxComputeUnits])
        .range([30, 60]);
    */

    const hueScale = d3.scaleLinear()
        .domain([0, 0xffffffff])
        .range([270, 150]);

    // return { lightnessScale, hueScale };
    return { hueScale };
}

//Remove all but the last tooltip
export function removeStrayTooltips() {
    d3.selectAll(".tooltip")
    .filter((d, i, nodes) => i < nodes.length - 1)
    .remove(); 
}

export function reformatString(inputString) {
    // regex match accounts and compute units
    const regex = /([^,]+),([^,]+)/g;
    let match;
    const formattedLines = [];
  
    while ((match = regex.exec(inputString)) !== null) {
      const address = match[1];
      const compute = match[2];
      
      // Format address as first 5 characters...last 5 characters
      const formattedAddress = address.slice(0, 5) + "..." + address.slice(-5);
      
      // Hyperlink to explorer
      const hyperlink = `<a href="https://explorer.solana.com/address/${address}" target="_blank">${formattedAddress}</a>`;
      
      formattedLines.push(`${hyperlink}: ${compute}`);
    }

    const multiLineFormat = formattedLines.join('\n');
    return multiLineFormat;
}