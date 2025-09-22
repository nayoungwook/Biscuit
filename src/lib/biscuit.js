export class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    clone() { return new Vector2(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vector2(this.x * s, this.y * s); }
    div(s) { return new Vector2(this.x / s, this.y / s); }
    length() { return Math.hypot(this.x, this.y); }
    normalize() { const len = this.length() || 1; return this.div(len); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    rotate(rad) { const c = Math.cos(rad), s = Math.sin(rad); return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c); }
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
    getAttribLocation(name) { return this.program ? this.gl.getAttribLocation(this.program, name) : -1; }
    getUniformLocation(name) { return this.program ? this.gl.getUniformLocation(this.program, name) : null; }
}
class Renderer {
    constructor(biscuit, gl) {
        this.biscuit = null;
        this.texturedShader = null;
        this.colorShader = null;
        this.quadVBO = null;
        this.quadUVBO = null;
        this.drawCalls = [];
        this.imageTextureMap = new WeakMap();
        this.biscuit = biscuit;
        this.gl = gl;
        this.initialize();
    }
    async initialize() {
        const texturedVS = `
            attribute vec2 a_position;
            attribute vec2 a_uv;
            uniform vec2 u_resolution;
            uniform vec2 u_translation;
            uniform vec2 u_scale;
            uniform float u_rotation;
            varying vec2 v_uv;

            void main() {
                // 1. [0,1] → [-0.5,0.5] (중심 기준)
                vec2 pos = (a_position - 0.5) * u_scale;

                // 2. 회전
                float c = cos(u_rotation), s = sin(u_rotation);
                vec2 rotated = vec2(pos.x * c - pos.y * s, pos.x * s + pos.y * c);

                // 3. 최종 위치 = 회전된 좌표 + 화면 내 위치
                vec2 worldPos = rotated + u_translation;

                // 4. NDC 변환
                vec2 zeroToOne = worldPos / u_resolution;
                vec2 clipSpace = zeroToOne * 2.0 - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

                v_uv = a_uv;
            }`;
        const texturedFS = `
            precision mediump float;
            varying vec2 v_uv;
            uniform sampler2D u_texture;
            uniform float u_alpha;
            void main() {
                vec4 tex = texture2D(u_texture, v_uv);
                gl_FragColor = vec4(tex.rgb, tex.a * u_alpha);
            }`;
        const colorVS = `
            attribute vec2 a_position;
            uniform vec2 u_resolution;
            uniform vec2 u_translation;
            uniform vec2 u_scale;
            void main() {
                vec2 scaled = (a_position * u_scale) + u_translation;
                vec2 zeroToOne = scaled / u_resolution;
                vec2 clipSpace = zeroToOne * 2.0 - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
            }`;
        const colorFS = `
            precision mediump float;
            uniform vec4 u_color;
            void main() { gl_FragColor = u_color; }`;
        this.texturedShader = await Shader.fromSource(this.gl, texturedVS, texturedFS);
        this.colorShader = await Shader.fromSource(this.gl, colorVS, colorFS);
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
        var _a, _b, _c, _d;
        this.drawCalls.push({
            type: "image", sprite, x, y, w, h,
            alpha: (_a = options === null || options === void 0 ? void 0 : options.alpha) !== null && _a !== void 0 ? _a : 1,
            rotation: (_b = options === null || options === void 0 ? void 0 : options.rotation) !== null && _b !== void 0 ? _b : 0,
            centered: (_c = options === null || options === void 0 ? void 0 : options.centered) !== null && _c !== void 0 ? _c : true,
            zIndex: (_d = options === null || options === void 0 ? void 0 : options.zIndex) !== null && _d !== void 0 ? _d : 0
        });
    }
    drawRect(x, y, w, h, color, zIndex = 0) {
        this.drawCalls.push({ type: "rect", x, y, w, h, color: this.parseColor(color), zIndex });
    }
    drawCircle(cx, cy, radius, color, segments = 32, zIndex = 0) {
        this.drawCalls.push({ type: "circle", x: cx, y: cy, radius, color: this.parseColor(color), segments, zIndex });
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
        }
        this.drawCalls = [];
    }
    // --- Execution helpers ---
    executeDrawImage(cmd) {
        var _a, _b, _c, _d;
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
        const res = (_b = (_a = this.biscuit) === null || _a === void 0 ? void 0 : _a.getCanvasSize()) !== null && _b !== void 0 ? _b : { width: this.gl.canvas.width, height: this.gl.canvas.height };
        let tx = cmd.x, ty = cmd.y;
        if (cmd.centered) {
            tx -= cmd.w / 2;
            ty -= cmd.h / 2;
        }
        this.texturedShader.setUniform2f("u_resolution", res.width, res.height);
        this.texturedShader.setUniform2f("u_translation", tx, ty);
        this.texturedShader.setUniform2f("u_scale", cmd.w, cmd.h);
        this.texturedShader.setUniform1f("u_alpha", (_c = cmd.alpha) !== null && _c !== void 0 ? _c : 1);
        this.texturedShader.setUniform1f("u_rotation", (_d = cmd.rotation) !== null && _d !== void 0 ? _d : 0);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.texturedShader.setUniform1i("u_texture", 0);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
    executeDrawRect(cmd) {
        var _a, _b;
        if (!this.colorShader || !this.quadVBO)
            return;
        this.colorShader.use();
        const aPos = this.colorShader.getAttribLocation("a_position");
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadVBO);
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
        const res = (_b = (_a = this.biscuit) === null || _a === void 0 ? void 0 : _a.getCanvasSize()) !== null && _b !== void 0 ? _b : { width: this.gl.canvas.width, height: this.gl.canvas.height };
        this.colorShader.setUniform2f("u_resolution", res.width, res.height);
        this.colorShader.setUniform2f("u_translation", cmd.x, cmd.y);
        this.colorShader.setUniform2f("u_scale", cmd.w, cmd.h);
        this.colorShader.setUniform4f("u_color", ...(cmd.color));
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
    executeDrawCircle(cmd) {
        var _a, _b;
        if (!this.colorShader)
            return;
        const verts = [cmd.x, cmd.y];
        for (let i = 0; i <= cmd.segments; i++) {
            const a = (i / cmd.segments) * Math.PI * 2;
            verts.push(cmd.x + Math.cos(a) * cmd.radius, cmd.y + Math.sin(a) * cmd.radius);
        }
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(verts), this.gl.STATIC_DRAW);
        this.colorShader.use();
        const aPos = this.colorShader.getAttribLocation("a_position");
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
        const res = (_b = (_a = this.biscuit) === null || _a === void 0 ? void 0 : _a.getCanvasSize()) !== null && _b !== void 0 ? _b : { width: this.gl.canvas.width, height: this.gl.canvas.height };
        this.colorShader.setUniform2f("u_resolution", res.width, res.height);
        this.colorShader.setUniform2f("u_translation", 0, 0);
        this.colorShader.setUniform2f("u_scale", 1, 1);
        this.colorShader.setUniform4f("u_color", ...(cmd.color));
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, verts.length / 2);
        this.gl.deleteBuffer(buffer);
    }
    ensureTextureForImage(img) {
        if (this.imageTextureMap.has(img))
            return this.imageTextureMap.get(img);
        const tex = this.gl.createTexture();
        if (!tex)
            return null;
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
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
    constructor(scene) {
        this.currentScene = null;
        this.initialize_engine = () => {
            this.createCanvasElement();
            this.createGL();
            if (this.glContext)
                Biscuit.renderer = new Renderer(this, this.glContext);
            const loop = () => {
                var _a;
                this.resizeCanvas();
                if (this.currentScene) {
                    this.currentScene.update();
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
                Biscuit.width = width;
                Biscuit.height = height;
                this.glContext.viewport(0, 0, this.glContext.canvas.width, this.glContext.canvas.height);
            }
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
        this.initialize_engine();
        if (!scene)
            Biscuit.printWarning("Failed to find scene, This may cause problem.");
    }
    getCanvasSize() { var _a, _b, _c, _d; return { width: (_b = (_a = this.canvas) === null || _a === void 0 ? void 0 : _a.width) !== null && _b !== void 0 ? _b : 0, height: (_d = (_c = this.canvas) === null || _c === void 0 ? void 0 : _c.height) !== null && _d !== void 0 ? _d : 0 }; }
    static drawImage(...args) { var _a; (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.drawImage(...args); }
    static drawRect(...args) { var _a; (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.drawRect(...args); }
    static drawCircle(...args) { var _a; (_a = this.renderer) === null || _a === void 0 ? void 0 : _a.drawCircle(...args); }
    static printWarning(msg) { console.warn("[Biscuit Warning]: " + msg); }
    static printError(msg) { console.error("[Biscuit Error]: " + msg); }
}
Biscuit.width = 0;
Biscuit.height = 0;
