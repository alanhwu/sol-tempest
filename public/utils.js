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