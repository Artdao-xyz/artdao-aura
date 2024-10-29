import './style.css'
import * as THREE from 'three';
 
let camera, scene, renderer;
let ring, hazeLayer;
let renderTarget;
let mouse = new THREE.Vector2();
let targetIntensity = 0;
let currentIntensity = 0;

init();
animate();

function init() {
    scene = new THREE.Scene();
    
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
        -aspect, 
        aspect, 
        1, 
        -1, 
        1, 1000
    );
    camera.position.z = 10;

    // Modified renderer initialization with pixel ratio support
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    document.body.appendChild(renderer.domElement);

    // Modified render target initialization with pixel ratio
    renderTarget = new THREE.WebGLRenderTarget(
        window.innerWidth * pixelRatio,
        window.innerHeight * pixelRatio,
        {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        }
    );

    const ringGeometry = new THREE.PlaneGeometry(2, 2);
    const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio) },
            aspectRatio: { value: window.innerWidth / window.innerHeight }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec2 resolution;
            uniform float aspectRatio;
            varying vec2 vUv;

            float sdEllipse(vec2 p, vec2 ab) {
                p = abs(p);
                if (p.x > p.y) {
                    p = p.yx;
                    ab = ab.yx;
                }
                float l = ab.y * ab.y - ab.x * ab.x;
                float m = ab.x * p.x / l;
                float m2 = m * m;
                float n = ab.y * p.y / l;
                float n2 = n * n;
                float c = (m2 + n2 - 1.0) / 3.0;
                float c3 = c * c * c;
                float q = c3 + m2 * n2 * 2.0;
                float d = c3 + m2 * n2;
                float g = m + m * n2;
                float co;
                if (d < 0.0) {
                    float h = acos(q / c3) / 3.0;
                    float s = cos(h);
                    float t = sin(h) * sqrt(3.0);
                    float rx = sqrt(-c * (s + t + 2.0) + m2);
                    float ry = sqrt(-c * (s - t + 2.0) + m2);
                    co = (ry + sign(l) * rx + abs(g) / (rx * ry) - m) / 2.0;
                } else {
                    float h = 2.0 * m * n * sqrt(d);
                    float s = sign(q + h) * pow(abs(q + h), 1.0 / 3.0);
                    float u = sign(q - h) * pow(abs(q - h), 1.0 / 3.0);
                    float rx = -s - u - c * 4.0 + 2.0 * m2;
                    float ry = (s - u) * sqrt(3.0);
                    float rm = sqrt(rx * rx + ry * ry);
                    co = (ry / sqrt(rm - rx) + 2.0 * g / rm - m) / 2.0;
                }
                float si = sqrt(1.0 - co * co);
                vec2 r = vec2(ab.x * co, ab.y * si);
                return length(r - p) * sign(p.y - r.y);
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;
                uv.x *= aspectRatio;
                uv *= 1.8;

                float angle = 0.9;
                vec2 rotatedUV = vec2(
                    uv.x * cos(angle) - uv.y * sin(angle),
                    uv.x * sin(angle) + uv.y * cos(angle)
                );

                vec2 ellipseRadius = vec2(0.7, 0.275);
                float d = sdEllipse(rotatedUV, ellipseRadius);
                
                float thickness = 0.06;
                float ring = smoothstep(thickness * 2.0, thickness, abs(d));
                ring *= smoothstep(-thickness, -thickness * 0.7, d);
                float glow = exp(-1.5 * abs(d));
                glow = pow(glow, 1.2);
                
                float alpha = (ring * 0.7 + glow * 0.5) * smoothstep(2.0, 0.0, length(rotatedUV));
                vec3 color = vec3(1.0, 0.843, 0.0);
                
                gl_FragColor = vec4(color * alpha, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const hazeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            resolution: { value: new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio) },
            mousePosition: { value: new THREE.Vector2(0.5, 0.5) },
            intensity: { value: 0.0 },
            aspectRatio: { value: window.innerWidth / window.innerHeight },
            tDiffuse: { value: null }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec2 resolution;
            uniform float time;
            uniform vec2 mousePosition;
            uniform float intensity;
            uniform float aspectRatio;
            uniform sampler2D tDiffuse;
            varying vec2 vUv;

            float getCircleDistance(vec2 p, float radius) {
                return length(p) - radius;
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0;
                uv.x *= aspectRatio;
                uv *= 1.8;

                vec2 mouseUV = (mousePosition * 2.0 - 1.0);
                mouseUV.x *= aspectRatio;
                mouseUV *= 1.8;

                float angle = 0.9;
                vec2 rotatedUV = vec2(
                    uv.x * cos(angle) - uv.y * sin(angle),
                    uv.x * sin(angle) + uv.y * cos(angle)
                );
                vec2 rotatedMouse = vec2(
                    mouseUV.x * cos(angle) - mouseUV.y * sin(angle),
                    mouseUV.x * sin(angle) + mouseUV.y * cos(angle)
                );

                vec2 mouseOffset = rotatedMouse - rotatedUV;
                float mouseInfluence = -0.15;
                vec2 hazeCenter = rotatedUV + mouseOffset * mouseInfluence * intensity;
                
                float hazeRadius = 0.58 + (0.15 * intensity);
                float hazeDistance = getCircleDistance(hazeCenter, hazeRadius);
                
                float haze = smoothstep(0.5, -0.3, hazeDistance);
                float hazeAlpha = haze * intensity * 1.4;
                
                vec4 previousPass = texture2D(tDiffuse, gl_FragCoord.xy / resolution.xy);
                vec3 hazeColor = vec3(1.0, 0.0, 1.0);
                
                vec3 finalColor = mix(previousPass.rgb, hazeColor, hazeAlpha * 0.8);
                float finalAlpha = max(previousPass.a, hazeAlpha * 0.8);
                
                gl_FragColor = vec4(finalColor, finalAlpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    ring = new THREE.Mesh(ringGeometry, ringMaterial);
    hazeLayer = new THREE.Mesh(ringGeometry, hazeMaterial);
    
    scene.add(ring);
    scene.add(hazeLayer);

    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('touchmove', onTouchMove, false);
}

function onMouseMove(event) {
    const mouseX = event.clientX / window.innerWidth;
    const mouseY = 1.0 - (event.clientY / window.innerHeight);
    
    hazeLayer.material.uniforms.mousePosition.value.set(mouseX, mouseY);
    
    const centerX = 0.5;
    const centerY = 0.5;
    const dx = (mouseX - centerX) * 2;
    const dy = (mouseY - centerY) * 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const innerRadius = 0.7;
    const outerRadius = 1.1;
    
    if (distance < innerRadius) {
        targetIntensity = 1.0;
    } else if (distance < outerRadius) {
        const t = (distance - innerRadius) / (outerRadius - innerRadius);
        targetIntensity = 1.0 - (t * t);
    } else {
        targetIntensity = 0.0;
    }
}

function onTouchMove(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    onMouseMove(mouseEvent);
}

function onWindowResize() {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const aspect = window.innerWidth / window.innerHeight;
    
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderTarget.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
    
    ring.material.uniforms.resolution.value.set(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
    ring.material.uniforms.aspectRatio.value = aspect;
    hazeLayer.material.uniforms.resolution.value.set(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
    hazeLayer.material.uniforms.aspectRatio.value = aspect;
}

function animate() {
    requestAnimationFrame(animate);
    
    currentIntensity += (targetIntensity - currentIntensity) * 0.15;
    hazeLayer.material.uniforms.intensity.value = currentIntensity;
    
    // First render pass - ring
    renderer.setRenderTarget(renderTarget);
    scene.remove(hazeLayer);
    renderer.render(scene, camera);
    
    // Second render pass - haze with previous render as texture
    hazeLayer.material.uniforms.tDiffuse.value = renderTarget.texture;
    scene.add(hazeLayer);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    
    ring.material.uniforms.time.value += 0.01;
    hazeLayer.material.uniforms.time.value += 0.01;
}