import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { computeSha256, scaleHashToNumber, 
    createTooltip, hideTooltip, showTooltip, createScales } from "./utils.js";    
import { config } from "./config.js";

const FADE_INCREMENT = 1;
const coordinateOffset = 42;
const MAX_FADE = 3;

class BaseNode {
    constructor(hash, address, addressLabel, computeUnits) {
        this.hash = hash;
        this.address = address;
        this.addressLabel = addressLabel;
        this.computeUnits = computeUnits;

        this.fadedness = 0;
    }

    updateComputeUnits(newComputeUnits) {
        this.computeUnits = newComputeUnits;
    }

    fade() {
        this.fadedness += FADE_INCREMENT;
    }

    resetFadedness() {
        this.fadedness = 0;
    }

    isFadedOut() {
        return this.fadedness >= MAX_FADE;
    }

    get alpha() {
        return 1 - (this.fadedness/MAX_FADE);
    }

    get position() {
        const xOffset = coordinateOffset;
        const yOffset = coordinateOffset;
        return {
            x: scaleHashToNumber(this.hash, xOffset, config.svgLength - xOffset),
            y: scaleHashToNumber(this.hash.slice(8), yOffset, config.svgHeight- yOffset)
        };
    }
}

export class AccountNodev2 extends BaseNode {
    constructor(hash, address, addressLabel, associatedPrograms, computeUnits, lightnessScale, hueScale, opacityScale){
        super(hash, address, addressLabel, computeUnits);
        
        this.associatedPrograms = associatedPrograms;
        // this.lightnessScale = lightnessScale;
        this.hueScale = hueScale;
        this.opacityScale = opacityScale;
        // this.fadedness = 0;
        this.hue = 0
        // this.lightness = lightnessScale(this.computeUnits);
        this.lightness = 50;
    }

    get fill() {
        return `hsla(${this.hue}, 0%, ${this.lightness}%, ${this.alpha})`;
    }

    get tooltipContent() {
        const percentage = ((this.computeUnits / 12_000_000) * 100).toFixed(2);
        return `${this.addressLabel}<br/>Compute Units: ${this.computeUnits} (${percentage}%)`;
    }

    calculateHue(hash) {
        const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
        return this.hueScale(parseInt(mixedHashPart, 16));
    }

    drawBackgroundShape(svg) {
        const gradientId = `gradient-${Math.random().toString(36).substring(2)}`;
        
        // Define the color scale with an exponential scale.
        const colorScale = d3.scalePow()
            .exponent(3)
            .domain([0, 12000000])
            .range(['#FFC0CB', 'red']);
        
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
        const scaledColor = colorScale(this.computeUnits);
        radialGradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", scaledColor)
            .attr("stop-opacity", opacity);
        radialGradient.append("stop")
            .attr("offset", "25%")
            .attr("stop-color", scaledColor)
            .attr("stop-opacity", opacity * 0.8); // Multiply opacity by a factor to create a steeper drop-off
        radialGradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", scaledColor)
            .attr("stop-opacity", "0");
        
        // Draw the background circle with the radial gradient
        const size = 20; // Set a constant size for the circles
        svg.insert("circle", ":first-child")
            .attr("cx", this.position.x)
            .attr("cy", this.position.y)
            .attr("r", size)
            .attr("fill", `url(#${gradientId})`);
    }
}

export class ProgramNodev2 extends BaseNode {

    constructor(hash, address, addressLabel, associatedAccounts, computeUnits, lightnessScale, hueScale, opacityScale){
        super(hash, address, addressLabel, computeUnits);

        this.associatedAccounts = associatedAccounts;
        // this.lightnessScale = lightnessScale;
        this.hueScale = hueScale;
        this.opacityScale = opacityScale;
        // this.referenceCount = associatedAccounts.size;
        this.hue = this.calculateHue(this.hash);
        // this.lightness = lightnessScale(this.computeUnits);
        this.lightness = 50;
    }

    updateAssociations(address) {
        this.associatedAccounts.push(address);
    }

    getReferenceCount() {
        return this.associatedAccounts.size;
    }

    scanAssociations(accountState) {
        this.associatedAccounts.forEach(account => {
            if (!(account in accountState)) {
                this.associatedAccounts = this.associatedAccounts.filter(item => item !== account);
            }
        });
    }

    get fill() {
        
        const opacity = this.alpha * 0.4 + 0.6;

        //replacing opacity with alpha for now
        return `hsla(${this.hue}, 100%, 50%, ${this.alpha})`;
    }

    calculateHue(hash) {
        const mixedHashPart = hash.slice(4, 8) + hash.slice(16, 20);
        return this.hueScale(parseInt(mixedHashPart, 16));
    }

    get tooltipContent() {
        return `${this.addressLabel}<br/>Compute Units: ${this.computeUnits}`;
    }

}


export class Line {
    constructor(program, account, lineKey, programState, accountState) {
        this.program = program;
        this.account = account;
        this.key = lineKey;
        this.programState = programState;
        this.accountState = accountState;
    }

    refresh() {
        this.fadedness = Math.min(this.program.fadedness, this.account.fadedness);
    }

    get programPosition() {
        return this.program.position;
    }

    get accountPosition() {
        return this.account.position;
    }

    checkDeath() {
        if (!this.program || !this.account) {
            return true;
        }
        return false;
    }

}