import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

async function sha256(input) {
    const buffer = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
}

function hashToNumber(hash, min, max) {
    const hashInt = parseInt(hash.slice(0, 8), 16);
    return ((hashInt / 0xffffffff) * (max - min)) + min;
}

export async function draw(data) {
    const svg = d3.select("#visualization");

    svg.selectAll("*").remove(); // Clear SVG

    // Extract program data from the block data
    const programs = data.programsComputeUnits || [];

    // Define linear scale for dot colors
    const colorScale = d3.scaleLinear()
        .domain([0, d3.max(programs, d => d.computeUnits)])
        .range(["#d9d9d9", "#1f78b4"]);

    // Create tooltips
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    // Draw dots
    for (const program of programs) {
        const hash = await sha256(program.programAddress);
        const cx = hashToNumber(hash, 0, 800); // assuming svg width is 800
        const cy = hashToNumber(hash.slice(8), 0, 600); // assuming svg height is 600
        
        const circle = svg.append("circle")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 5)
            .attr("fill", d => colorScale(program.computeUnits))
            .on("mouseover", event => {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(program.programLabel + "<br/>" + program.computeUnits)
                    .style("left", (event.pageX) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", event => {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });

        // Case where dot disappears but tooltip remains
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && !document.body.contains(circle.node())) {
                    tooltip.remove();
                }
            }
        });

        observer.observe(svg.node(), { childList: true });
    }
}
