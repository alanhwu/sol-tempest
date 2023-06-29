import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

async function computeSha256(input) {
    const buffer = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function scaleHashToNumber(hash, min, max) {
    const hashInt = parseInt(hash.slice(0, 8), 16);
    return ((hashInt / 0xffffffff) * (max - min)) + min;
}

function computeColorFromHashAndUnits(hash, computeUnits, lightnessScale, hueScale) {
    const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
    const hue = hueScale(parseInt(mixedHashPart, 16));
    const lightness = lightnessScale(computeUnits);
    return `hsl(${hue}, 100%, ${lightness}%)`;
}

function createTooltip() {
    return d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
}

function showTooltip(tooltip, event, content) {
    tooltip.transition()
        .duration(200)
        .style("opacity", .9);
    tooltip.html(content)
        .style("left", (event.pageX) + "px")
        .style("top", (event.pageY - 28) + "px");
}

function hideTooltip(tooltip) {
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
}

function createScales(programs) {
    const lightnessScale = d3.scaleLinear()
        .domain([0, d3.max(programs, d => d.computeUnits)])
        .range([80, 40]);

    const hueScale = d3.scaleLinear()
        .domain([0, 0xffffffff])
        .range([270, 150]);

    return { lightnessScale, hueScale };
}

function addMutationObserver(svg, tooltip) {
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
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

function drawProgramCircle(svg, cx, cy, fill, content, tooltip) {
    return svg.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 6)
        .attr("fill", fill)
        .on("mouseover", event => showTooltip(tooltip, event, content))
        .on("mouseout", () => hideTooltip(tooltip));
}

function drawLine(linesGroup, x1, y1, x2, y2) {
    linesGroup.append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("stroke", "grey")
        .attr("stroke-width", 0.5);
}

export async function draw(data) {
    const svg = d3.select("#visualization");
    svg.selectAll("*").remove(); // Clear SVG

    const programs = data.programsComputeUnits || [];
    const { lightnessScale, hueScale } = createScales(programs);

    const tooltip = createTooltip();
    const linesGroup = svg.append("g");
    const zoneRadius = 40;
    const xOffset = zoneRadius + 2;
    const yOffset = zoneRadius + 2;

    for (const program of programs) {
        const hash = await computeSha256(program.programAddress);
        const cx = scaleHashToNumber(hash, xOffset, 800 - xOffset);
        const cy = scaleHashToNumber(hash.slice(8), yOffset, 600 - yOffset);
        const fill = computeColorFromHashAndUnits(hash, program.computeUnits, lightnessScale, hueScale);
        const content = program.programLabel + "<br/>" + program.computeUnits;

        const programCircle = drawProgramCircle(svg, cx, cy, fill, content, tooltip);

        await drawAssociatedAddresses(linesGroup, programCircle, program.associatedAddresses, svg, tooltip, zoneRadius);
    }

    addMutationObserver(svg, tooltip);
}

async function drawAssociatedAddresses(linesGroup, programCircle, associatedAddresses, svg, tooltip, zoneRadius) {
    const programCx = +programCircle.attr("cx");
    const programCy = +programCircle.attr("cy");

    for (const address of associatedAddresses) {
        const hash = await computeSha256(address);
        const angle = scaleHashToNumber(hash, 0, 2 * Math.PI);
        const radius = scaleHashToNumber(hash.slice(8), 10, zoneRadius);

        const cx = programCx + radius * Math.cos(angle);
        const cy = programCy + radius * Math.sin(angle);

        drawLine(linesGroup, programCx, programCy, cx, cy);

        drawProgramCircle(svg, cx, cy, "#999999", address, tooltip).attr("r", 2);
    }
}
