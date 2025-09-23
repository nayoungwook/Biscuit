// @ts-ignore
import { mat4 } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/esm/index.js";
export class Vector {
    constructor(x = 0, y = 0, z) {
        this.z = 0;
        this.x = x;
        this.y = y;
        this.z = z;
    }
    clone() { return new Vector(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
    add(v) { return new Vector(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vector(this.x * s, this.y * s); }
    div(s) { return new Vector(this.x / s, this.y / s); }
    length() { return Math.hypot(this.x, this.y); }
    normalize() { const len = this.length() || 1; return this.div(len); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    rotate(rad) { const c = Math.cos(rad), s = Math.sin(rad); return new Vector(this.x * c - this.y * s, this.x * s + this.y * c); }
    dist(v) {
        return Math.sqrt((v.x - this.x) * (v.x - this.x) + (v.y - this.y) * (v.y - this.y));
    }
}
export class Sprite {
    constructor(path) {
        this.path = "";
        this.loaded = false;
        this.path = path;
        this.image = new Image();
        this.image.crossOrigin = "anonymous";
        this.image.onload = () => { this.loaded = true; };
        this.image.src = path;
    }
    isLoaded() { return this.loaded; }
    getPath() { return this.path; }
    getImageElement() { return this.image; }
}
export class Scene {
    constructor() { }
    update() { }
    render() { }
}
export class Shader {
    constructor(gl) {
        this.program = null;
        this.gl = gl;
    }
    static async fromSource(gl, vertexSource, fragmentSource) {
        const s = new Shader(gl);
        const vs = s.compileShader(vertexSource, gl.VERTEX_SHADER);
        const fs = s.compileShader(fragmentSource, gl.FRAGMENT_SHADER);
        s.program = gl.createProgram();
        if (!s.program)
            throw new Error('Failed to create program');
        gl.attachShader(s.program, vs);
        gl.attachShader(s.program, fs);
        gl.linkProgram(s.program);
        if (!gl.getProgramParameter(s.program, gl.LINK_STATUS)) {
            throw new Error('Could not link WebGL program: ' + gl.getProgramInfoLog(s.program));
        }
        return s;
    }
    /** 파일 경로를 받아 fetch 해서 생성하는 헬퍼 */
    static async fromFiles(gl, vertexPath, fragmentPath) {
        const [vsSource, fsSource] = await Promise.all([
            fetch(vertexPath).then(r => {
                if (!r.ok)
                    throw new Error(`Failed to load vertex shader: ${vertexPath}`);
                return r.text();
            }),
            fetch(fragmentPath).then(r => {
                if (!r.ok)
                    throw new Error(`Failed to load fragment shader: ${fragmentPath}`);
                return r.text();
            })
        ]);
        return Shader.fromSource(gl, vsSource, fsSource);
    }
    compileShader(source, type) {
        const shader = this.gl.createShader(type);
        if (!shader)
            throw new Error('Failed to create shader');
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error('Shader compile error: ' + this.gl.getShaderInfoLog(shader));
        }
        return shader;
    }
    use() { if (this.program)
        this.gl.useProgram(this.program); }
    getProgram() { return this.program; }
    setUniform1f(name, val) { const loc = this.getUniformLocation(name); if (loc)
        this.gl.uniform1f(loc, val); }
    setUniform2f(name, x, y) { const loc = this.getUniformLocation(name); if (loc)
        this.gl.uniform2f(loc, x, y); }
    setUniform3f(name, x, y, z) { const loc = this.getUniformLocation(name); if (loc)
        this.gl.uniform3f(loc, x, y, z); }
    setUniform4f(name, x, y, z, w) { const loc = this.getUniformLocation(name); if (loc)
        this.gl.uniform4f(loc, x, y, z, w); }
    setUniform1i(name, val) { const loc = this.getUniformLocation(name); if (loc)
        this.gl.uniform1i(loc, val); }
    setUniformMatrix4fv(name, mat) {
        const loc = this.getUniformLocation(name);
        if (loc) {
            this.gl.uniformMatrix4fv(loc, false, mat);
        }
    }
    getAttribLocation(name) { return this.program ? this.gl.getAttribLocation(this.program, name) : -1; }
    getUniformLocation(name) { return this.program ? this.gl.getUniformLocation(this.program, name) : null; }
}
export class Camera {
    Camera() { }
    static updateView() {
        this.view = mat4.create();
        mat4.translate(this.view, this.view, [-Camera.position.x, -Camera.position.y, 0]);
    }
    static updateProjection() {
        const z = this.position.z || 1;
        this.projection = mat4.create();
        mat4.ortho(this.projection, -Biscuit.width / 2, // left
        Biscuit.width / 2, // right
        -Biscuit.height / 2, // bottom
        Biscuit.height / 2, // top
        -1, 1);
    }
}
Camera.position = new Vector(0, 0, 1);
Camera.view = mat4.create();
Camera.projection = mat4.create();
class Renderer {
    constructor(biscuit, gl) {
        this.biscuit = null;
        this.texturedShader = null;
        this.colorShader = null;
        this.quadVBO = null;
        this.quadUVBO = null;
        this.textCanvas = null;
        this.textCtx = null;
        this.textTextureMap = new Map();
        this.drawCalls = [];
        this.imageTextureMap = new WeakMap();
        this.biscuit = biscuit;
        this.gl = gl;
        this.initialize();
        // canvas for text rendering
        this.textCanvas = document.createElement("canvas");
        this.textCanvas.width = 1024;
        this.textCanvas.height = 256;
        this.textCtx = this.textCanvas.getContext("2d");
    }
    async initialize() {
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
    parseColor(c) {
        if (Array.isArray(c))
            return c;
        if (c.startsWith("#")) {
            const hex = c.slice(1);
            if (hex.length === 3) {
                return [parseInt(hex[0] + hex[0], 16) / 255, parseInt(hex[1] + hex[1], 16) / 255, parseInt(hex[2] + hex[2], 16) / 255, 1];
            }
            else if (hex.length === 6) {
                return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, 1];
            }
        }
        return [1, 1, 1, 1];
    }
    // --- Queue draw calls ---
    drawImage(sprite, x, y, w, h, options) {
        var _a, _b, _c;
        this.drawCalls.push({
            type: "image", sprite, x, y, w, h,
            alpha: (_a = options === null || options === void 0 ? void 0 : options.alpha) !== null && _a !== void 0 ? _a : 1,
            rotation: (_b = options === null || options === void 0 ? void 0 : options.rotation) !== null && _b !== void 0 ? _b : 0,
            zIndex: (_c = options === null || options === void 0 ? void 0 : options.zIndex) !== null && _c !== void 0 ? _c : 0
        });
    }
    drawRect(x, y, w, h, color, zIndex = 0) {
        this.drawCalls.push({ type: "rect", x, y, w, h, color: this.parseColor(color), zIndex });
    }
    drawCircle(cx, cy, radius, color, segments = 32, zIndex = 0) {
        this.drawCalls.push({ type: "circle", x: cx, y: cy, radius, color: this.parseColor(color), segments, zIndex });
    }
    drawText(text, cx, cy, color, textOptions = {}, zIndex = 0) {
        this.drawCalls.push({ type: "text", text: text, x: cx, y: cy, color: this.parseColor(color), zIndex, textOptions: textOptions });
    }
    // --- Flush draw calls ---
    flush() {
        this.drawCalls.sort((a, b) => a.zIndex - b.zIndex);
        for (const cmd of this.drawCalls) {
            if (cmd.type === "image" && cmd.sprite && cmd.w && cmd.h)
                this.executeDrawImage(cmd);
            else if (cmd.type === "rect" && cmd.w && cmd.h && cmd.color)
                this.executeDrawRect(cmd);
            else if (cmd.type === "circle" && cmd.radius && cmd.color)
                this.executeDrawCircle(cmd);
            else if (cmd.type === "text" && cmd.color)
                this.executeDrawText(cmd);
        }
        this.drawCalls = [];
    }
    // --- Execution helpers ---
    executeDrawImage(cmd) {
        var _a, _b, _c, _d, _e;
        if (!this.texturedShader || !this.quadVBO || !this.quadUVBO)
            return;
        if (!cmd.sprite || !cmd.sprite.isLoaded())
            return;
        const tex = this.ensureTextureForImage(cmd.sprite.getImageElement());
        if (!tex)
            return;
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
        const pivotX = ((_a = cmd.w) !== null && _a !== void 0 ? _a : 0) / 2;
        const pivotY = ((_b = cmd.h) !== null && _b !== void 0 ? _b : 0) / 2;
        mat4.translate(model, model, [cmd.x - cmd.w / 2 + pivotX, cmd.y - cmd.h / 2 + pivotY, 0]);
        let rot = (_c = cmd.rotation) !== null && _c !== void 0 ? _c : 0;
        rot *= -1;
        mat4.rotateZ(model, model, rot);
        mat4.translate(model, model, [-pivotX, -pivotY, 0]);
        mat4.scale(model, model, [(_d = cmd.w) !== null && _d !== void 0 ? _d : 1, (_e = cmd.h) !== null && _e !== void 0 ? _e : 1, 1]);
        this.texturedShader.setUniformMatrix4fv("u_model", model);
        this.texturedShader.setUniformMatrix4fv("u_view", Camera.view);
        this.texturedShader.setUniformMatrix4fv("u_projection", Camera.projection);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.texturedShader.setUniform1i("u_texture", 0);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
    executeDrawRect(cmd) {
        var _a, _b, _c, _d, _e;
        if (!this.colorShader || !this.quadVBO)
            return;
        this.colorShader.use();
        const aPos = this.colorShader.getAttribLocation("a_position");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
        const model = mat4.create();
        const pivotX = ((_a = cmd.w) !== null && _a !== void 0 ? _a : 0) / 2;
        const pivotY = ((_b = cmd.h) !== null && _b !== void 0 ? _b : 0) / 2;
        mat4.translate(model, model, [cmd.x - cmd.w / 2 + pivotX, cmd.y - cmd.h / 2 + pivotY, 0]);
        let rot = (_c = cmd.rotation) !== null && _c !== void 0 ? _c : 0;
        rot *= -1;
        mat4.rotateZ(model, model, rot);
        mat4.translate(model, model, [-pivotX, -pivotY, 0]);
        mat4.scale(model, model, [(_d = cmd.w) !== null && _d !== void 0 ? _d : 1, (_e = cmd.h) !== null && _e !== void 0 ? _e : 1, 1]);
        this.colorShader.setUniformMatrix4fv("u_model", model);
        this.colorShader.setUniformMatrix4fv("u_view", Camera.view);
        this.colorShader.setUniformMatrix4fv("u_projection", Camera.projection);
        this.colorShader.setUniform4f("u_color", ...(cmd.color));
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
    executeDrawCircle(cmd) {
        var _a;
        if (!this.colorShader)
            return;
        const verts = [];
        for (let i = 0; i <= cmd.segments; i++) {
            const a = (i / cmd.segments) * Math.PI * 2;
            verts.push(Math.cos(a) * cmd.radius, Math.sin(a) * cmd.radius);
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
        mat4.rotateZ(model, model, (_a = cmd.rotation) !== null && _a !== void 0 ? _a : 0);
        this.colorShader.setUniformMatrix4fv("u_model", model);
        this.colorShader.setUniformMatrix4fv("u_view", Camera.view);
        this.colorShader.setUniformMatrix4fv("u_projection", Camera.projection);
        this.colorShader.setUniform4f("u_color", ...(cmd.color));
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, verts.length / 2);
        this.gl.deleteBuffer(buffer);
    }
    executeDrawText(cmd) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (!this.texturedShader || !this.quadVBO || !this.quadUVBO)
            return;
        let options = cmd.textOptions;
        const font = (_a = options === null || options === void 0 ? void 0 : options.font) !== null && _a !== void 0 ? _a : "48px 'Arial'";
        const color = cmd.color;
        const align = (_b = options === null || options === void 0 ? void 0 : options.align) !== null && _b !== void 0 ? _b : "center";
        const maxWidth = (_c = options === null || options === void 0 ? void 0 : options.maxWidth) !== null && _c !== void 0 ? _c : this.textCanvas.width;
        const text = cmd.text;
        const ctx = this.textCtx;
        ctx.fillStyle = `rgba(${Math.floor(color[0] * 255)},${Math.floor(color[1] * 255)},${Math.floor(color[2] * 255)},${color[3]})`;
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillText(cmd.text, this.textCanvas.width / 2, this.textCanvas.height / 2, maxWidth);
        let tex = this.textTextureMap.get(text);
        if (!tex) {
            tex = this.gl.createTexture();
            this.textTextureMap.set(text, tex);
        }
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.textCanvas);
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
        const pivotX = ((_d = cmd.w) !== null && _d !== void 0 ? _d : 0) / 2;
        const pivotY = ((_e = cmd.h) !== null && _e !== void 0 ? _e : 0) / 2;
        mat4.translate(model, model, [cmd.x - cmd.w / 2 + pivotX, cmd.y - cmd.h / 2 + pivotY, 0]);
        let rot = (_f = cmd.rotation) !== null && _f !== void 0 ? _f : 0;
        rot *= -1;
        mat4.rotateZ(model, model, rot);
        mat4.translate(model, model, [-pivotX, -pivotY, 0]);
        mat4.scale(model, model, [(_g = cmd.w) !== null && _g !== void 0 ? _g : 1, (_h = cmd.h) !== null && _h !== void 0 ? _h : 1, 1]);
        this.texturedShader.setUniformMatrix4fv("u_model", model);
        this.texturedShader.setUniformMatrix4fv("u_view", Camera.view);
        this.texturedShader.setUniformMatrix4fv("u_projection", Camera.projection);
        this.texturedShader.setUniform1i("u_texture", 0);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
    ensureTextureForImage(img) {
        if (this.imageTextureMap.has(img))
            return this.imageTextureMap.get(img);
        const tex = this.gl.createTexture();
        if (!tex)
            return null;
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
    constructor(src, poolSize = 8) {
        this.pool = [];
        this.index = 0;
        this.src = src;
        this.poolSize = poolSize;
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src);
            audio.preload = "auto";
            this.pool.push(audio);
        }
    }
    play(loop = false, volume = 1.0) {
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
    setVolume(volume) {
        for (const audio of this.pool) {
            audio.volume = Math.min(1, Math.max(0, volume));
        }
    }
}
export class GameObject {
    constructor() {
        this.position = new Vector(0, 0, 0);
        this.width = 100;
        this.height = 100;
        this.rotation = 0;
        this.zIndex = 1;
        this.sprite = null;
        this.update = () => { };
        this.render = () => {
            Biscuit.renderer.drawImage(this.sprite, this.position.x, this.position.y, this.width, this.height, { zIndex: this.zIndex, rotation: this.rotation });
        };
    }
    GameObject(position = new Vector(0, 0), width = 100, height = 1000) { this.position = position; this.width = width; this.height = height; }
    ;
}
export class Biscuit {
    constructor(scene) {
        this.currentScene = null;
        // --- 입력 초기화 ---
        this.initializeInput = () => {
            // Keyboard
            window.addEventListener("keydown", (e) => {
                Biscuit.keys.add(e.key);
            });
            window.addEventListener("keyup", (e) => {
                Biscuit.keys.delete(e.key);
            });
            // Mouse
            window.addEventListener("mousemove", (e) => {
                Biscuit.mouse.x = e.clientX - Biscuit.width / 2;
                Biscuit.mouse.y = -(e.clientY - Biscuit.height / 2);
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
        this.initializeEngine = () => {
            this.createCanvasElement();
            this.createGL();
            if (this.glContext)
                Biscuit.renderer = new Renderer(this, this.glContext);
            const loop = () => {
                var _a;
                this.resizeCanvas();
                if (this.currentScene) {
                    this.currentScene.update();
                    Camera.updateProjection();
                    Camera.updateView();
                    this.currentScene.render();
                }
                (_a = Biscuit.renderer) === null || _a === void 0 ? void 0 : _a.flush();
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        };
        this.resizeCanvas = () => {
            const width = document.body.clientWidth, height = document.body.clientHeight;
            if (!this.canvas || !this.glContext)
                return;
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
                this.glContext.viewport(0, 0, this.glContext.canvas.width, this.glContext.canvas.height);
            }
            Biscuit.width = this.canvas.width;
            Biscuit.height = this.canvas.height;
        };
        this.createCanvasElement = () => {
            const c = document.createElement("canvas");
            document.body.style.margin = "0";
            document.body.appendChild(c);
            this.canvas = c;
        };
        this.createGL = () => {
            if (!this.canvas)
                return;
            const gl = this.canvas.getContext("webgl", { antialias: true, alpha: true });
            if (!gl)
                throw new Error("Failed to initialize WebGL");
            this.glContext = gl;
        };
        this.currentScene = scene;
        this.initializeEngine();
        this.initializeInput();
        if (!scene)
            Biscuit.printWarning("Failed to find scene, This may cause problem.");
    }
    getCanvasSize() {
        var _a, _b, _c, _d;
        return { width: (_b = (_a = this.canvas) === null || _a === void 0 ? void 0 : _a.width) !== null && _b !== void 0 ? _b : 0, height: (_d = (_c = this.canvas) === null || _c === void 0 ? void 0 : _c.height) !== null && _d !== void 0 ? _d : 0 };
    }
    static drawImage(...args) { var _a; (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.drawImage(...args); }
    static drawRect(...args) { var _a; (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.drawRect(...args); }
    static drawCircle(...args) { var _a; (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.drawCircle(...args); }
    static printWarning(msg) { console.warn("[Biscuit Warning]: " + msg); }
    static printError(msg) { console.error("[Biscuit Error]: " + msg); }
}
Biscuit.width = 0;
Biscuit.height = 0;
// --- 입력 관리용 static 멤버 ---
Biscuit.keys = new Set(); // 키보드 입력
Biscuit.mouse = { x: 0, y: 0, buttons: new Set() }; // 마우스 입력
Biscuit.touches = new Map(); // 터치 입력
