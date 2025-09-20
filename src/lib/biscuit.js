export class Sprite {
    constructor(path) {
        this.path = "";
        this.path = path;
        this.image = new Image();
        this.image.src = path;
    }
    getPath() {
        return this.path;
    }
    getImageElement() {
        return this.image;
    }
}
export class Scene {
    constructor() { }
    update() { }
    render() { }
}
export class Biscuit {
    constructor(scene) {
        this.resizeCanvas = () => {
            let width = document.body.clientWidth;
            let height = document.body.clientHeight;
            if (!this.canvas || !this.glContext)
                return;
            this.canvas.width = width;
            this.canvas.height = height;
            this.glContext.viewport(0, 0, this.canvas.width, this.canvas.height);
        };
        this.createCanvasElement = () => {
            var canvasElement = "";
            canvasElement += "<canvas id=\"glcanvas\" width=\"640\" height=\"480\">";
            canvasElement += "    Your browser doesn't appear to support the HTML5";
            canvasElement += "    <code>&lt;canvas&gt;</code> element.";
            canvasElement += "</canvas>";
            document.body.innerHTML += canvasElement;
            let canvas = document.getElementById("glcanvas");
            this.canvas = canvas;
            Biscuit.printLog('Canvas created');
        };
        this.createGL = () => {
            if (!this.canvas) {
                Biscuit.printWarning('Failed to create GL becuase there are no canvas.');
                return;
            }
            try {
                let glContext = (this.canvas.getContext("webgl") || this.canvas.getContext("experimental-webgl"));
                this.glContext = glContext;
            }
            catch (e) { }
            if (!this.glContext) {
                Biscuit.printWarning('Unable to inintialize WebGL. Your browser may not support it.');
                return;
            }
            Biscuit.printLog('OpenGL initialized.');
        };
        this.initialize_engine = () => {
            this.createCanvasElement();
            this.createGL();
            setInterval(() => {
                this.resizeCanvas();
                if (this.currentScene) {
                    this.currentScene.update();
                    this.currentScene.render();
                }
            }, 60 / 1000);
        };
        this.initialize_engine();
        this.currentScene = scene;
        if (!scene) {
            Biscuit.printWarning('Failed to find scene, This may cause problem.');
        }
    }
}
Biscuit.getTimeString = () => {
    const date = new Date();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;
    return timeString;
};
Biscuit.printLog = (context) => {
    console.log(`[Biscuit Debug : ${Biscuit.getTimeString()} ] : ${context}`);
};
Biscuit.printWarning = (context) => {
    console.log(`%c[Biscuit Warning : ${Biscuit.getTimeString()} ] : ${context}`, 'color: black; background: pink; padding: 10px; font-size: px; font-weight: bold;');
};
