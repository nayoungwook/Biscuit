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
        const r = Biscuit.renderer;
        if (!r) return;

        r.drawImage(this.biscuit, 0, 0, 1080 / 4, 1080 / 4, { zIndex: 5, rotation: this.timer });
    }
}

new Biscuit(new Game());
