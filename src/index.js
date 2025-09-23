import { Biscuit, GameObject, Scene, Sound, Sprite, Vector } from "./lib/biscuit.js";

class Cookie extends GameObject {
    constructor(game) {
        super();

        this.game = game;
        this.sprite = game.biscuit;
        this.width = 200;
        this.height = 200;

        this.touchOffset = new Vector(0, 0);
        this.touchStarted = false;

        this.xv = 0;
        this.yv = 0;
        this.backupX = 0;
        this.backupY = 0;
    }

    update = () => {
        let touch = Biscuit.touches.get(0);

        this.backupX = this.position.x;
        this.backupY = this.position.y;

        if (this.position.y <= Biscuit.height / -2 + this.height / 2) {
            this.yv *= -1;
            this.position.y = Biscuit.height / -2 + this.height / 2;

            this.game.cookieSound[Math.round(Math.random() * 2)].play();
        }
        if (this.position.y >= Biscuit.height / 2 - this.height / 2) {
            this.yv *= -1;
            this.position.y = Biscuit.height / 2 - this.height / 2;

            this.game.cookieSound[Math.round(Math.random() * 2)].play();
        }

        if (this.position.x <= Biscuit.width / -2 + this.width / 2) {
            this.xv *= -1;
            this.position.x = Biscuit.width / -2 + this.width / 2;

            this.game.cookieSound[Math.round(Math.random() * 2)].play();
        }
        if (this.position.x >= Biscuit.width / 2 - this.width / 2) {
            this.xv *= -1;
            this.position.x = Biscuit.width / 2 - this.width / 2;

            this.game.cookieSound[Math.round(Math.random() * 2)].play();
        }

        if (touch) {
            let touchVector = new Vector(touch.x, touch.y);

            if (touchVector.dist(this.position) <= this.width / 2) {
                if (!this.touchStarted) {
                    this.touchOffset = touchVector.sub(this.position);
                    this.touchStarted = true;
                }
            }

            if (this.touchStarted) {
                this.position = touchVector.sub(this.touchOffset);
            }

            this.xv = this.position.x - this.backupX;
            this.yv = this.position.y - this.backupY;
        } else {
            if (!Biscuit.mouse.buttons) {
                this.touchStarted = false;

                this.position.x += this.xv;
                this.position.y += this.yv;

                this.xv += (0 - this.xv) / 20;
                this.yv += (0 - this.yv) / 20;
            }
        }

        if (Biscuit.mouse.buttons.size) {
            let touchVector = new Vector(Biscuit.mouse.x, Biscuit.mouse.y);

            if (touchVector.dist(this.position) <= this.width / 2) {
                if (!this.touchStarted) {
                    this.touchOffset = touchVector.sub(this.position);
                    this.touchStarted = true;
                }
            }

            if (this.touchStarted) {
                this.position = touchVector.sub(this.touchOffset);
            }

            this.xv = this.position.x - this.backupX;
            this.yv = this.position.y - this.backupY;
        } else {
            if (!touch) {
                this.touchStarted = false;

                this.position.x += this.xv;
                this.position.y += this.yv;

                this.xv += (0 - this.xv) / 20;
                this.yv += (0 - this.yv) / 20;
            }
        }

        this.rotation += ((this.xv) + (this.yv)) / 50;
    }
}

class Game extends Scene {
    constructor() {
        super();

        this.cookieSound = [
            new Sound('res/cookie1.mp3'),
            new Sound('res/cookie2.mp3'),
            new Sound('res/cookie3.mp3'),
        ];
        this.image = new Sprite('res/image.png');
        this.biscuit = new Sprite('res/biscuit.png');
        this.cookie = new Cookie(this);
        this.timer = 0;
    }

    update = () => {
        this.cookie.update();
        this.timer += 0.1;
    }

    render = () => {
        this.cookie.render();
        Biscuit.renderer.drawText('Hello, World! from Biscuit engine.', 0, -150, [0, 0, 0, 1], {}, { zIndex: 6 });
    }
}

new Biscuit(new Game());
