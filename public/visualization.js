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
    // const colorScale = d3.scaleLinear()
    //     .domain([0, d3.max(programs, d => d.computeUnits)])
    //     .range(["#d9d9d9", "#1f78b4"]);

    // Define linear scale for lightness based on compute units
    const lightnessScale = d3.scaleLinear()
    .domain([0, d3.max(programs, d => d.computeUnits)])
    .range([80, 40]);

    // Define linear scale for hue based on hash
    const hueScale = d3.scaleLinear()
        .domain([0, 0xffffffff])
        .range([270, 150]); // Hue range mapping to purple-green

    // Create tooltips
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

    // Define zone radius and associated address circle radius
    const zoneRadius = 40;
    const associatedAddressRadius = 2;

    // Define offsets to ensure program nodes and associated addresses stay within SVG
    const xOffset = zoneRadius + associatedAddressRadius;
    const yOffset = zoneRadius + associatedAddressRadius;

    const linesGroup = svg.append("g");

    // Draw dots
    for (const program of programs) {
        const hash = await sha256(program.programAddress);
        const cx = hashToNumber(hash, xOffset, 800 - xOffset); // assuming svg width is 800
        const cy = hashToNumber(hash.slice(8), yOffset, 600 - yOffset); // assuming svg height is 600
        
        const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
        const hue = hueScale(parseInt(mixedHashPart, 16)); //mixing hash to make more entropy
        const lightness = lightnessScale(program.computeUnits);

        const circle = svg.append("circle")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 6) // Slightly larger program address sizes
            .attr("fill", `hsl(${hue}, 100%, ${lightness}%)`)
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

            drawAssociatedAddresses(linesGroup, circle, program.associatedAddresses, svg, tooltip, zoneRadius);


    }

    // Case where dot disappears but tooltip remains
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check if any circle or line still exists within SVG
                const circleExists = svg.select("circle").node();
                const lineExists = svg.select("line").node();
                if (!circleExists && !lineExists) {
                    tooltip.remove();
                }
            }
        }
    });

    observer.observe(svg.node(), { childList: true });
}

async function drawAssociatedAddresses(linesGroup, programCircle, associatedAddresses, svg, tooltip, zoneRadius) {
    const programCx = +programCircle.attr("cx");
    const programCy = +programCircle.attr("cy");

    for (const address of associatedAddresses) {
        const hash = await sha256(address);
        const angle = hashToNumber(hash, 0, 2 * Math.PI);
        const radius = hashToNumber(hash.slice(8), 10, zoneRadius); // Increased minimum radius

        const cx = programCx + radius * Math.cos(angle);
        const cy = programCy + radius * Math.sin(angle);

        // draw a line from the program to the associated address
        linesGroup.append("line")
            .attr("x1", programCx)
            .attr("y1", programCy)
            .attr("x2", cx)
            .attr("y2", cy)
            .attr("stroke", "grey")
            .attr("stroke-width", 0.5); // Thinner lines

        // draw a small dot for the associated address
        svg.append("circle")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 2)
            .attr("fill", "#999999") // Neutral gray color for associated addresses
            .on("mouseover", event => {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(address)
                    .style("left", (event.pageX) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", event => {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
    }
}
