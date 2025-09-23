import { Biscuit, Scene, Sprite } from "./lib/biscuit.js";

class Game extends Scene {
    constructor() {
        super();

        this.image = new Sprite('/src/res/image.png');
        this.biscuit = new Sprite('/src/res/biscuit.png');
        this.timer = 0;
    }

    update = () => {

        this.timer += 0.1;
    }

    render = () => {
        Biscuit.renderer.drawImage(this.biscuit, 0, 0, 1080 / 4, 1080 / 4, { zIndex: 5, rotation: this.timer });

        Biscuit.renderer.drawText('Hello, World! from Biscuit engine.', 0, -150, [0, 0, 0, 1], {}, { zIndex: 6 });
    }
}

new Biscuit(new Game());
