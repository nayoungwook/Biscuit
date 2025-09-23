precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
    vec4 tex = texture2D(u_texture, v_uv);
    gl_FragColor = vec4(tex.rgb, tex.a);
}