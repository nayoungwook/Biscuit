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
    type: "image" | "rect" | "circle";
    zIndex: number;
    alpha?: number;
    sprite?: Sprite;
    x: number; y: number; w?: number; h?: number;
    rotation?: number;
    color?: [number, number, number, number];
    radius?: number; segments?: number;
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

export function getDistance(v1: Vector, v2: Vector): number {
    return Math.sqrt((v1.x - v2.x) * (v1.x - v2.x) + (v1.y - v2.y) * (v1.y - v2.y));
}

class Renderer {
    private gl: WebGLRenderingContext;
    private biscuit: Biscuit | null = null;
    private texturedShader: Shader | null = null;
    private colorShader: Shader | null = null;
    private quadVBO: WebGLBuffer | null = null;
    private quadUVBO: WebGLBuffer | null = null;

    private drawCalls: DrawCommand[] = [];

    constructor(biscuit: Biscuit, gl: WebGLRenderingContext) {
        this.biscuit = biscuit;
        this.gl = gl;
        this.initialize();
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

    // --- Flush draw calls ---
    public flush() {
        this.drawCalls.sort((a, b) => a.zIndex - b.zIndex);
        for (const cmd of this.drawCalls) {
            if (cmd.type === "image" && cmd.sprite && cmd.w && cmd.h) this.executeDrawImage(cmd);
            else if (cmd.type === "rect" && cmd.w && cmd.h && cmd.color) this.executeDrawRect(cmd);
            else if (cmd.type === "circle" && cmd.radius && cmd.color) this.executeDrawCircle(cmd);
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
        mat4.rotateZ(model, model, cmd.rotation ?? 0);
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
        mat4.rotateZ(model, model, cmd.rotation ?? 0);
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

export class Biscuit {
    private glContext?: WebGLRenderingContext;
    private canvas?: HTMLCanvasElement;
    private currentScene: Scene | null = null;
    private static renderer?: Renderer;

    public static width: number = 0;
    public static height: number = 0;

    constructor(scene: Scene | null) {
        this.currentScene = scene;
        this.initialize_engine();
        if (!scene) Biscuit.printWarning("Failed to find scene, This may cause problem.");
    }

    initialize_engine = () => {
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
    }

    resizeCanvas = () => {
        const width = document.body.clientWidth, height = document.body.clientHeight;
        if (!this.canvas || !this.glContext) return;
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width; this.canvas.height = height;
            this.glContext.viewport(0, 0, this.glContext.canvas.width, this.glContext.canvas.height);
        }
        Biscuit.width = this.canvas.width;
        Biscuit.height = this.canvas.height;
    }

    createCanvasElement = () => {
        const c = document.createElement("canvas");
        document.body.style.margin = "0";
        document.body.appendChild(c);
        this.canvas = c;
    }

    createGL = () => {
        if (!this.canvas) return;
        const gl = this.canvas.getContext("webgl", { antialias: true, alpha: true });
        if (!gl) throw new Error("Failed to initialize WebGL");
        this.glContext = gl;
    }

    public getCanvasSize() { return { width: this.canvas?.width ?? 0, height: this.canvas?.height ?? 0 }; }

    static drawImage(...args: Parameters<Renderer["drawImage"]>) { this.renderer?.drawImage(...args); }
    static drawRect(...args: Parameters<Renderer["drawRect"]>) { this.renderer?.drawRect(...args); }
    static drawCircle(...args: Parameters<Renderer["drawCircle"]>) { this.renderer?.drawCircle(...args); }

    static printWarning(msg: string) { console.warn("[Biscuit Warning]: " + msg); }
    static printError(msg: string) { console.error("[Biscuit Error]: " + msg); }
}
