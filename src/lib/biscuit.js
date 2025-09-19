export class Biscuit {
    constructor() {
        this.gl = null;
        this.canvas = null;

        this.initialize_engine();
    }

    resizeCanvas = () => {
        let width = document.body.witdh;
        let height = document.body.height;

        this.canvas.width = width;
        this.canvas.height = height;
    }

    update = () => {
        this.resizeCanvas();
    }

    createCanvasElement = () => {
        console.log('[Deubg]: canvas added to the html body');
        var canvasElement = "";
        canvasElement += "<canvas id=\"glcanvas\" width=\"640\" height=\"480\">";
        canvasElement += "    Your browser doesn't appear to support the HTML5";
        canvasElement += "    <code>&lt;canvas&gt;</code> element.";
        canvasElement += "</canvas>";

        document.body.innerHTML += canvasElement;
        var canvas = document.getElementById("glcanvas");
        this.canvas = canvas;
    }

    createGL = () => {
        try {
            this.gl = this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl");
        } catch (e) { }

        if (!this.gl) {
            alert("Unable to initialize WebGL. Your browser may not support it.");
            this.gl = null;
        }
    }

    initialize_engine = () => {
        this.createCanvasElement();
        this.createGL();
    }
}