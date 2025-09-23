// @ts-ignore
import { mat4, vec3 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";

export class Vector {
    public x: number;
    public y: number;
    public z: number = 0;
    constructor(x = 0, y = 0, z?) { this.x = x; this.y = y; this.z = z; }

    clone(): Vector { return new Vector(this.x, this.y); }
    set(x: number, y: number): this { this.x = x; this.y = y; return this; }

    add(v: Vector): Vector { return new Vector(this.x + v.x, this.y + v.y); }
    sub(v: Vector): Vector { return new Vector(this.x - v.x, this.y - v.y); }
    mul(s: number): Vector { return new Vector(this.x * s, this.y * s); }
    div(s: number): Vector { return new Vector(this.x / s, this.y / s); }

    length(): number { return Math.hypot(this.x, this.y); }
    normalize(): Vector { const len = this.length() || 1; return this.div(len); }
    dot(v: Vector): number { return this.x * v.x + this.y * v.y; }
    cross(v: Vector): number { return this.x * v.y - this.y * v.x; }
    rotate(rad: number): Vector { const c = Math.cos(rad), s = Math.sin(rad); return new Vector(this.x * c - this.y * s, this.x * s + this.y * c); }

    dist(v: Vector): number {
        return Math.sqrt((v.x - this.x) * (v.x - this.x) + (v.y - this.y) * (v.y - this.y));
    }
}

export class Sprite {
    private path: string = "";
    private image: HTMLImageElement;
    private loaded: boolean = false;

    constructor(path: string) {
        this.path = path;
        this.image = new Image();
        this.image.crossOrigin = "anonymous";
        this.image.onload = () => { this.loaded = true; };
        this.image.src = path;
    }

    public isLoaded(): boolean { return this.loaded; }
    public getPath(): string { return this.path; }
    public getImageElement(): HTMLImageElement { return this.image; }
}

export abstract class Scene {
    constructor() { }
    update(): void { }
    render(): void { }
}

export class Shader {
    private gl: WebGLRenderingContext | WebGL2RenderingContext;
    private program: WebGLProgram | null = null;

    private constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
        this.gl = gl;
    }

    static async fromSource(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        vertexSource: string,
        fragmentSource: string
    ): Promise<Shader> {
        const s = new Shader(gl);
        const vs = s.compileShader(vertexSource, gl.VERTEX_SHADER);
        const fs = s.compileShader(fragmentSource, gl.FRAGMENT_SHADER);
        s.program = gl.createProgram();
        if (!s.program) throw new Error('Failed to create program');
        gl.attachShader(s.program, vs);
        gl.attachShader(s.program, fs);
        gl.linkProgram(s.program);
        if (!gl.getProgramParameter(s.program, gl.LINK_STATUS)) {
            throw new Error('Could not link WebGL program: ' + gl.getProgramInfoLog(s.program));
        }
        return s;
    }

    /** 파일 경로를 받아 fetch 해서 생성하는 헬퍼 */
    static async fromFiles(
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        vertexPath: string,
        fragmentPath: string
    ): Promise<Shader> {
        const [vsSource, fsSource] = await Promise.all([
            fetch(vertexPath).then(r => {
                if (!r.ok) throw new Error(`Failed to load vertex shader: ${vertexPath}`);
                return r.text();
            }),
            fetch(fragmentPath).then(r => {
                if (!r.ok) throw new Error(`Failed to load fragment shader: ${fragmentPath}`);
                return r.text();
            })
        ]);

        return Shader.fromSource(gl, vsSource, fsSource);
    }

    private compileShader(source: string, type: number): WebGLShader {
        const shader = this.gl.createShader(type);
        if (!shader) throw new Error('Failed to create shader');
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error('Shader compile error: ' + this.gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    use(): void { if (this.program) this.gl.useProgram(this.program); }
    getProgram(): WebGLProgram | null { return this.program; }

    setUniform1f(name: string, val: number) { const loc = this.getUniformLocation(name); if (loc) this.gl.uniform1f(loc, val); }
    setUniform2f(name: string, x: number, y: number) { const loc = this.getUniformLocation(name); if (loc) this.gl.uniform2f(loc, x, y); }
    setUniform3f(name: string, x: number, y: number, z: number) { const loc = this.getUniformLocation(name); if (loc) this.gl.uniform3f(loc, x, y, z); }
    setUniform4f(name: string, x: number, y: number, z: number, w: number) { const loc = this.getUniformLocation(name); if (loc) this.gl.uniform4f(loc, x, y, z, w); }
    setUniform1i(name: string, val: number) { const loc = this.getUniformLocation(name); if (loc) this.gl.uniform1i(loc, val); }

    setUniformMatrix4fv(name: string, mat: Float32Array): void {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniformMatrix4fv(loc, false, mat);
        }
    }

    getAttribLocation(name: string): number { return this.program ? this.gl.getAttribLocation(this.program, name) : -1; }
    private getUniformLocation(name: string): WebGLUniformLocation | null { return this.program ? this.gl.getUniformLocation(this.program, name) : null; }
}

/* Renderer with zIndex batching */
type DrawCommand = {
    type: "image" | "rect" | "circle" | "text";
    zIndex: number;
    alpha?: number;
    sprite?: Sprite;
    x: number; y: number; w?: number; h?: number;
    rotation?: number;
    color?: [number, number, number, number];
    radius?: number; segments?: number;

    textOptions?: TextOptions;
    text?: string;
};

export class Camera {
    public static position: Vector = new Vector(0, 0, 1);
    public static rotation: number;

    public static view: mat4 = mat4.create();
    public static projection: mat4 = mat4.create();

    private Camera() { }

    public static updateView() {
        this.view = mat4.create();
        mat4.translate(this.view, this.view, [-Camera.position.x, -Camera.position.y, 0]);
    }

    public static updateProjection() {
        const z = this.position.z || 1;
        this.projection = mat4.create();
        mat4.ortho(
            this.projection,
            -Biscuit.width / 2,   // left
            Biscuit.width / 2,   // right
            -Biscuit.height / 2,  // bottom
            Biscuit.height / 2,  // top
            -1,
            1
        );
    }

}

type TextOptions = {
    font?: string;       // CSS font, 예: "48px 'Nanum Gothic'"
    align?: "left" | "center" | "right";
    maxWidth?: number;   // optional
};

class Renderer {
    private gl: WebGLRenderingContext;
    private biscuit: Biscuit | null = null;
    private texturedShader: Shader | null = null;
    private colorShader: Shader | null = null;
    private quadVBO: WebGLBuffer | null = null;
    private quadUVBO: WebGLBuffer | null = null;

    private textCanvas: HTMLCanvasElement | null = null;
    private textCtx: CanvasRenderingContext2D | null = null;
    private textTextureMap = new Map<string, WebGLTexture>();

    private drawCalls: DrawCommand[] = [];

    constructor(biscuit: Biscuit, gl: WebGLRenderingContext) {
        this.biscuit = biscuit;
        this.gl = gl;
        this.initialize();


        // canvas for text rendering
        this.textCanvas = document.createElement("canvas");
        this.textCanvas.width = 1024;
        this.textCanvas.height = 256;
        this.textCtx = this.textCanvas.getContext("2d")!;
    }

    private async initialize() {

        this.texturedShader = await Shader.fromFiles(this.gl, 'lib/shader/textureVert.glsl', 'lib/shader/textureFrag.glsl');
        this.colorShader = await Shader.fromFiles(this.gl, 'lib/shader/colorVert.glsl', 'lib/shader/colorFrag.glsl');

        const vertices = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
        this.quadVBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
        this.quadUVBO = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadUVBO);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, uvs, this.gl.STATIC_DRAW);

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    private parseColor(c: string | [number, number, number, number]): [number, number, number, number] {
        if (Array.isArray(c)) return c;
        if (c.startsWith("#")) {
            const hex = c.slice(1);
            if (hex.length === 3) {
                return [parseInt(hex[0] + hex[0], 16) / 255, parseInt(hex[1] + hex[1], 16) / 255, parseInt(hex[2] + hex[2], 16) / 255, 1];
            } else if (hex.length === 6) {
                return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, 1];
            }
        }
        return [1, 1, 1, 1];
    }

    // --- Queue draw calls ---
    public drawImage(sprite: Sprite, x: number, y: number, w: number, h: number, options?: { alpha?: number, rotation?: number, centered?: boolean, zIndex?: number }) {
        this.drawCalls.push({
            type: "image", sprite, x, y, w, h,
            alpha: options?.alpha ?? 1,
            rotation: options?.rotation ?? 0,
            zIndex: options?.zIndex ?? 0
        });
    }

    public drawRect(x: number, y: number, w: number, h: number, color: string | [number, number, number, number], zIndex = 0) {
        this.drawCalls.push({ type: "rect", x, y, w, h, color: this.parseColor(color), zIndex });
    }

    public drawCircle(cx: number, cy: number, radius: number, color: string | [number, number, number, number], segments = 32, zIndex = 0) {
        this.drawCalls.push({ type: "circle", x: cx, y: cy, radius, color: this.parseColor(color), segments, zIndex });
    }

    public drawText(text: string, cx: number, cy: number, color: string | [number, number, number, number], textOptions = {}, zIndex = 0) {
        this.drawCalls.push({ type: "text", text: text, x: cx, y: cy, color: this.parseColor(color), zIndex, textOptions: textOptions });
    }

    // --- Flush draw calls ---
    public flush() {
        this.drawCalls.sort((a, b) => a.zIndex - b.zIndex);
        for (const cmd of this.drawCalls) {
            if (cmd.type === "image" && cmd.sprite && cmd.w && cmd.h) this.executeDrawImage(cmd);
            else if (cmd.type === "rect" && cmd.w && cmd.h && cmd.color) this.executeDrawRect(cmd);
            else if (cmd.type === "circle" && cmd.radius && cmd.color) this.executeDrawCircle(cmd);
            else if (cmd.type === "text" && cmd.color) this.executeDrawText(cmd);
        }
        this.drawCalls = [];
    }

    // --- Execution helpers ---
    private executeDrawImage(cmd: DrawCommand) {
        if (!this.texturedShader || !this.quadVBO || !this.quadUVBO) return;
        if (!cmd.sprite || !cmd.sprite.isLoaded()) return;

        const tex = this.ensureTextureForImage(cmd.sprite.getImageElement());
        if (!tex) return;

        this.texturedShader.use();

        const aPos = this.texturedShader.getAttribLocation("a_position");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);

        const aUv = this.texturedShader.getAttribLocation("a_uv");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadUVBO);
        this.gl.enableVertexAttribArray(aUv);
        this.gl.vertexAttribPointer(aUv, 2, this.gl.FLOAT, false, 0, 0);

        const model = mat4.create();

        const pivotX = (cmd.w ?? 0) / 2;
        const pivotY = (cmd.h ?? 0) / 2;

        mat4.translate(model, model, [cmd.x - cmd.w / 2 + pivotX, cmd.y - cmd.h / 2 + pivotY, 0]);

        let rot = cmd.rotation ?? 0;
        rot *= -1;
        mat4.rotateZ(model, model, rot);

        mat4.translate(model, model, [-pivotX, -pivotY, 0]);
        mat4.scale(model, model, [cmd.w ?? 1, cmd.h ?? 1, 1]);

        this.texturedShader.setUniformMatrix4fv("u_model", model);

        this.texturedShader.setUniformMatrix4fv("u_view", Camera.view);
        this.texturedShader.setUniformMatrix4fv("u_projection", Camera.projection);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.texturedShader.setUniform1i("u_texture", 0);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    private executeDrawRect(cmd: DrawCommand) {
        if (!this.colorShader || !this.quadVBO) return;
        this.colorShader.use();
        const aPos = this.colorShader.getAttribLocation("a_position");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);

        const model = mat4.create();

        const pivotX = (cmd.w ?? 0) / 2;
        const pivotY = (cmd.h ?? 0) / 2;

        mat4.translate(model, model, [cmd.x - cmd.w / 2 + pivotX, cmd.y - cmd.h / 2 + pivotY, 0]);

        let rot = cmd.rotation ?? 0;
        rot *= -1;
        mat4.rotateZ(model, model, rot);

        mat4.translate(model, model, [-pivotX, -pivotY, 0]);
        mat4.scale(model, model, [cmd.w ?? 1, cmd.h ?? 1, 1]);

        this.colorShader.setUniformMatrix4fv("u_model", model);

        this.colorShader.setUniformMatrix4fv("u_view", Camera.view);
        this.colorShader.setUniformMatrix4fv("u_projection", Camera.projection);

        this.colorShader.setUniform4f("u_color", ...(cmd.color!));

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    private executeDrawCircle(cmd: DrawCommand) {
        if (!this.colorShader) return;

        const verts: number[] = [];
        for (let i = 0; i <= cmd.segments!; i++) {
            const a = (i / cmd.segments!) * Math.PI * 2;
            verts.push(Math.cos(a) * cmd.radius!, Math.sin(a) * cmd.radius!);
        }

        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(verts), this.gl.STATIC_DRAW);

        this.colorShader.use();
        const aPos = this.colorShader.getAttribLocation("a_position");
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);

        const model = mat4.create();
        mat4.translate(model, model, [cmd.x, cmd.y, 0]);
        mat4.rotateZ(model, model, cmd.rotation ?? 0);
        this.colorShader.setUniformMatrix4fv("u_model", model);

        this.colorShader.setUniformMatrix4fv("u_view", Camera.view);
        this.colorShader.setUniformMatrix4fv("u_projection", Camera.projection);

        this.colorShader.setUniform4f("u_color", ...(cmd.color!));

        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, verts.length / 2);
        this.gl.deleteBuffer(buffer);
    }

    private executeDrawText(cmd: DrawCommand) {
        if (!this.texturedShader || !this.quadVBO || !this.quadUVBO) return;

        let options: TextOptions = cmd.textOptions;
        const font = options?.font ?? "48px 'Arial'";
        const color = cmd.color;
        const align = options?.align ?? "center";
        const maxWidth = options?.maxWidth ?? this.textCanvas.width;

        const text = cmd.text;

        const ctx = this.textCtx;
        ctx.fillStyle = `rgba(${Math.floor(color[0] * 255)},${Math.floor(color[1] * 255)},${Math.floor(color[2] * 255)},${color[3]})`;
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillText(cmd.text, this.textCanvas.width / 2, this.textCanvas.height / 2, maxWidth);

        let tex = this.textTextureMap.get(text);
        if (!tex) {
            tex = this.gl.createTexture()!;
            this.textTextureMap.set(text, tex);
        }

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D, 0, this.gl.RGBA,
            this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.textCanvas
        );

        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.textCanvas);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.texturedShader.use();

        const aPos = this.texturedShader.getAttribLocation("a_position");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);

        const aUv = this.texturedShader.getAttribLocation("a_uv");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadUVBO);
        this.gl.enableVertexAttribArray(aUv);
        this.gl.vertexAttribPointer(aUv, 2, this.gl.FLOAT, false, 0, 0);

        const model = mat4.create();

        cmd.w = this.textCanvas.width / 2;
        cmd.h = this.textCanvas.height / 2;

        const pivotX = (cmd.w ?? 0) / 2;
        const pivotY = (cmd.h ?? 0) / 2;

        mat4.translate(model, model, [cmd.x - cmd.w / 2 + pivotX, cmd.y - cmd.h / 2 + pivotY, 0]);

        let rot = cmd.rotation ?? 0;
        rot *= -1;
        mat4.rotateZ(model, model, rot);

        mat4.translate(model, model, [-pivotX, -pivotY, 0]);
        mat4.scale(model, model, [cmd.w ?? 1, cmd.h ?? 1, 1]);

        this.texturedShader.setUniformMatrix4fv("u_model", model);

        this.texturedShader.setUniformMatrix4fv("u_view", Camera.view);
        this.texturedShader.setUniformMatrix4fv("u_projection", Camera.projection);

        this.texturedShader.setUniform1i("u_texture", 0);

        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    private imageTextureMap = new WeakMap<HTMLImageElement, WebGLTexture>();
    private ensureTextureForImage(img: HTMLImageElement): WebGLTexture | null {
        if (this.imageTextureMap.has(img)) return this.imageTextureMap.get(img)!;

        const tex = this.gl.createTexture();
        if (!tex) return null;

        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);

        // <-- 여기서 Y축 뒤집기 추가 -->
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);

        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);

        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.imageTextureMap.set(img, tex);
        return tex;
    }
}

export class Sound {
    private src: string;
    private pool: HTMLAudioElement[] = [];
    private poolSize: number;
    private index: number = 0;

    constructor(src: string, poolSize: number = 8) {
        this.src = src;
        this.poolSize = poolSize;

        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = "auto";
            this.pool.push(audio);
        }
    }

    play(loop: boolean = false, volume: number = 1.0) {
        const audio = this.pool[this.index];
        this.index = (this.index + 1) % this.poolSize;

        audio.loop = loop;
        audio.volume = Math.min(1, Math.max(0, volume));
        audio.currentTime = 0;
        audio.play().catch(err => {
            console.warn("Audio play failed:", err);
        });
    }

    stopAll() {
        for (const audio of this.pool) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    setVolume(volume: number) {
        for (const audio of this.pool) {
            audio.volume = Math.min(1, Math.max(0, volume));
        }
    }
}

export class GameObject {
    public position: Vector = new Vector(0, 0, 0);
    public width: number = 100;
    public height: number = 100;
    public rotation: number = 0;
    public zIndex: number = 1;

    public sprite: Sprite | null = null;

    public GameObject(position: Vector = new Vector(0, 0), width: number = 100, height: number = 1000) { this.position = position; this.width = width; this.height = height; };

    public update = (): void => { };
    public render = (): void => {
        Biscuit.renderer.drawImage(this.sprite, this.position.x, this.position.y, this.width, this.height, { zIndex: this.zIndex, rotation: this.rotation })
    };
}

export class Biscuit {
    private glContext?: WebGLRenderingContext;
    private canvas?: HTMLCanvasElement;
    private currentScene: Scene | null = null;
    public static renderer?: Renderer;

    public static width: number = 0;
    public static height: number = 0;

    // --- 입력 관리용 static 멤버 ---
    static keys: Set<string> = new Set(); // 키보드 입력
    static mouse = { x: 0, y: 0, buttons: new Set<number>() }; // 마우스 입력
    static touches: Map<number, { x: number; y: number }> = new Map(); // 터치 입력

    constructor(scene: Scene | null) {
        this.currentScene = scene;
        this.initializeEngine();
        this.initializeInput();
        if (!scene) Biscuit.printWarning("Failed to find scene, This may cause problem.");
    }

    // --- 입력 초기화 ---
    initializeInput = () => {
        // Keyboard
        window.addEventListener("keydown", (e) => {
            Biscuit.keys.add(e.key);
        });
        window.addEventListener("keyup", (e) => {
            Biscuit.keys.delete(e.key);
        });

        // Mouse
        window.addEventListener("mousemove", (e) => {
            Biscuit.mouse.x = e.clientX;
            Biscuit.mouse.y = e.clientY;
        });
        window.addEventListener("mousedown", (e) => {
            Biscuit.mouse.buttons.add(e.button);
        });
        window.addEventListener("mouseup", (e) => {
            Biscuit.mouse.buttons.delete(e.button);
        });

        // Touch
        window.addEventListener("touchstart", (e) => {
            for (const t of Array.from(e.changedTouches)) {
                Biscuit.touches.set(t.identifier, { x: t.clientX - Biscuit.width / 2, y: -(t.clientY - Biscuit.height / 2) });
            }
        });

        window.addEventListener("touchmove", (e) => {

            e.preventDefault(); // 기본 스크롤/새로고침 방지
            for (const t of Array.from(e.changedTouches)) {
                Biscuit.touches.set(t.identifier, { x: t.clientX - Biscuit.width / 2, y: -(t.clientY - Biscuit.height / 2) });
            }
        }, { passive: false });
        window.addEventListener("touchend", (e) => {
            for (const t of Array.from(e.changedTouches)) {
                Biscuit.touches.delete(t.identifier);
            }
        });
        window.addEventListener("touchcancel", (e) => {
            for (const t of Array.from(e.changedTouches)) {
                Biscuit.touches.delete(t.identifier);
            }
        });
    };

    // --- 나머지는 기존 코드 그대로 ---
    initializeEngine = () => {
        this.createCanvasElement();
        this.createGL();
        if (this.glContext) Biscuit.renderer = new Renderer(this, this.glContext);
        const loop = () => {
            this.resizeCanvas();
            if (this.currentScene) {
                this.currentScene.update();

                Camera.updateProjection();
                Camera.updateView();

                this.currentScene.render();
            }
            Biscuit.renderer?.flush();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    };

    resizeCanvas = () => {
        const width = document.body.clientWidth, height = document.body.clientHeight;
        if (!this.canvas || !this.glContext) return;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width; this.canvas.height = height;
            this.glContext.viewport(0, 0, this.glContext.canvas.width, this.glContext.canvas.height);
        }
        Biscuit.width = this.canvas.width;
        Biscuit.height = this.canvas.height;
    };

    createCanvasElement = () => {
        const c = document.createElement("canvas");
        document.body.style.margin = "0";
        document.body.appendChild(c);
        this.canvas = c;
    };

    createGL = () => {
        if (!this.canvas) return;
        const gl = this.canvas.getContext("webgl", { antialias: true, alpha: true });
        if (!gl) throw new Error("Failed to initialize WebGL");
        this.glContext = gl;
    };

    public getCanvasSize() {
        return { width: this.canvas?.width ?? 0, height: this.canvas?.height ?? 0 };
    }

    static drawImage(...args: Parameters<Renderer["drawImage"]>) { this.renderer?.drawImage(...args); }
    static drawRect(...args: Parameters<Renderer["drawRect"]>) { this.renderer?.drawRect(...args); }
    static drawCircle(...args: Parameters<Renderer["drawCircle"]>) { this.renderer?.drawCircle(...args); }

    static printWarning(msg: string) { console.warn("[Biscuit Warning]: " + msg); }
    static printError(msg: string) { console.error("[Biscuit Error]: " + msg); }
}
