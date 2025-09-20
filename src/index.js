import { Biscuit, Scene, Sprite } from "./lib/biscuit.js";

class Game extends Scene {
    constructor() {
        super();

        this.image = new Sprite('/src/res/image.png');
    }

    update = () => {
    }
}

var app = new Biscuit(new Game());
