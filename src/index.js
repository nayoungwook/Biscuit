import { Biscuit, Scene, Sprite } from "./lib/biscuit.js";

class Game extends Scene {
    constructor() {
        super();

        this.image = new Sprite('/src/res/image.png');
        this.timer = 0;
    }

    update = () => {

        this.timer += 0.1;
    }

    render = () => {
        const r = Biscuit.renderer;
        if (!r) return;

        r.drawRect(0, 0, 100, 50, '#8BC34A');
        r.drawImage(this.image, Biscuit.width / 2, Biscuit.height / 2, 1920 / 2, 1080 / 2, { zIndex: 5, rotation: 0 });
        r.drawCircle(0, 0, 60, '#FF5722', 40);
    }
}

var app = new Biscuit(new Game());
