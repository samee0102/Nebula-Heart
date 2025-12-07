import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


// --- Configuration ---
const CONFIG = {
    particleCount: 50000,
    auraCount: 8000,
    explosionForce: 3.5,
    formationSpeed: 0.025,
    colors: {
        inner: new THREE.Color(0x00eaff), // Electric Cyan
        core: new THREE.Color(0xff0055),  // Deep Magenta
        outer: new THREE.Color(0xffaa00), // Gold/Dust
        aura: new THREE.Color(0xaa00ff)   // Purple Haze
    }
};


// --- Scene Setup ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x010103, 0.005); // Adds depth


const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 50);


const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ReinhardToneMapping;
document.body.appendChild(renderer.domElement);


const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.maxDistance = 120;


// --- Post Processing (Bloom/Glow) ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));


// High radius bloom for the "Aura" feel
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0;
bloomPass.strength = 1.4; // Glow intensity
bloomPass.radius = 0.8;   // Spread of the glow
composer.addPass(bloomPass);


// --- Texture Generation ---
// Creates a soft, gas-like particle texture
function getGasTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)'); // Hot core
    grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
}
const particleTexture = getGasTexture();


// --- Math: Heart Shape ---
function getHeartPoint(t) {
    // Standard Parametric
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
    return { x, y };
}


// --- System Builder ---
function createParticleSystem(count, size, opacity, isAura) {
    const geometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(count * 3);
    const targetArray = new Float32Array(count * 3);
    const colArray = new Float32Array(count * 3);
    const velArray = new Float32Array(count * 3); // Velocity


    for (let i = 0; i < count; i++) {
        const i3 = i * 3;


        // 1. Generate Point on Curve
        const t = Math.random() * Math.PI * 2;
        const p = getHeartPoint(t);


        // 2. Add Volumetric Scatter (Nebula Thickness)
        // We use 'scale' to pull some particles inwards, and 'spread' to fuzz them out
        let rScale = Math.random(); 
        // Bias particles towards the edge (the line), but fill the inside slightly
        let scale = isAura ? 1.0 + Math.random() * 0.4 : 0.8 + Math.pow(rScale, 3) * 0.2; 
        
        // Random diffusion
        let spread = isAura ? 4.0 : 1.5; 
        let noiseX = (Math.random() - 0.5) * spread;
        let noiseY = (Math.random() - 0.5) * spread;
        let noiseZ = (Math.random() - 0.5) * (isAura ? 12 : 5); // Thickness


        let tx = p.x * scale + noiseX;
        let ty = p.y * scale + noiseY;
        let tz = noiseZ;


        // 3. Color Logic (Gradient Mapping)
        let c = new THREE.Color();
        
        if(isAura) {
            // Aura is mostly Purple/Magenta/Blue
            c.copy(CONFIG.colors.aura).lerp(CONFIG.colors.inner, Math.random()*0.5);
        } else {
            // Determine position relative to "center" vs "lobes"
            // t=0 is the top dip, t=PI is the bottom point
            // High curvature areas get different colors
            
            let dist = Math.sqrt(tx*tx + ty*ty);
            
            if (Math.abs(tx) < 2 && ty > 0) {
                // The Center "Dip" -> Cyan/Blue
                c.copy(CONFIG.colors.inner);
                c.lerp(new THREE.Color('white'), 0.3); // Hot center
            } else if (dist > 14) {
                // Outer edges -> Gold/Magenta mix
                c.copy(CONFIG.colors.core).lerp(CONFIG.colors.outer, Math.random());
            } else {
                // Main body -> Magenta
                c.copy(CONFIG.colors.core);
                // Add darkness for contrast
                c.multiplyScalar(0.8 + Math.random() * 0.4);
            }
        }


        // Save Target
        targetArray[i3] = tx;
        targetArray[i3+1] = ty;
        targetArray[i3+2] = tz;


        // Start Position (Randomly scattered in space)
        posArray[i3] = (Math.random() - 0.5) * 300;
        posArray[i3+1] = (Math.random() - 0.5) * 300;
        posArray[i3+2] = (Math.random() - 0.5) * 300;


        // Colors
        colArray[i3] = c.r;
        colArray[i3+1] = c.g;
        colArray[i3+2] = c.b;


        // Velocity (initially zero)
        velArray[i3] = 0;
        velArray[i3+1] = 0;
        velArray[i3+2] = 0;
    }


    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.setAttribute('target', new THREE.BufferAttribute(targetArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colArray, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velArray, 3));


    const material = new THREE.PointsMaterial({
        size: size,
        map: particleTexture,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: opacity
    });


    const mesh = new THREE.Points(geometry, material);
    return { mesh, geometry, material };
}


// --- Create Systems ---
// 1. The Main Structure
const mainHeart = createParticleSystem(CONFIG.particleCount, 0.4, 0.9, false);
scene.add(mainHeart.mesh);


// 2. The Aura (Glow)
const auraHeart = createParticleSystem(CONFIG.auraCount, 1.2, 0.3, true);
scene.add(auraHeart.mesh);


// --- Background Stars ---
function createBackground() {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for(let i=0; i<2000; i++) {
        pos.push((Math.random()-0.5)*400, (Math.random()-0.5)*400, (Math.random()-0.5)*400);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x8888aa, size: 0.5, transparent: true, opacity: 0.5 });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
}
createBackground();


// --- Interaction ---
const mouse = new THREE.Vector2();
let isExploded = false;


window.addEventListener('pointerdown', (e) => {
    document.getElementById('ui').style.opacity = '0'; // Hide text
    explode(mainHeart.geometry);
    explode(auraHeart.geometry);
});


function explode(geo) {
    const pos = geo.attributes.position.array;
    const vel = geo.attributes.velocity.array;
    
    for(let i=0; i<pos.length/3; i++) {
        const i3 = i*3;
        // Vector from center
        const x = pos[i3];
        const y = pos[i3+1];
        const z = pos[i3+2];
        
        // Normalize direction
        let len = Math.sqrt(x*x + y*y + z*z) || 1;
        
        // Add outward velocity
        const force = Math.random() * CONFIG.explosionForce + 1.0;
        vel[i3] += (x/len) * force;
        vel[i3+1] += (y/len) * force;
        vel[i3+2] += (z/len) * force;
    }
}


// --- Animation Loop ---
const clock = new THREE.Clock();
    
function animateSystem(system, time) {
    const positions = system.geometry.attributes.position.array;
    const targets = system.geometry.attributes.target.array;
    const velocities = system.geometry.attributes.velocity.array;


    for(let i=0; i < positions.length/3; i++) {
        const i3 = i*3;


        // 1. Physics (Velocity)
        positions[i3]   += velocities[i3];
        positions[i3+1] += velocities[i3+1];
        positions[i3+2] += velocities[i3+2];


        // Friction/Damping
        velocities[i3]   *= 0.94;
        velocities[i3+1] *= 0.94;
        velocities[i3+2] *= 0.94;


        // 2. Homing (Return to Heart Shape)
        const tx = targets[i3];
        const ty = targets[i3+1];
        const tz = targets[i3+2];


        // Add a "Breathing" motion to the target Z
        const breath = Math.sin(time * 1.5 + tx*0.1) * 0.5;


        // Lerp position towards target if velocity is low (particles not exploding)
        if (Math.abs(velocities[i3]) < 0.1) {
            positions[i3]   += (tx - positions[i3]) * CONFIG.formationSpeed;
            positions[i3+1] += (ty - positions[i3+1]) * CONFIG.formationSpeed;
            positions[i3+2] += ((tz + breath) - positions[i3+2]) * CONFIG.formationSpeed;
        }
    }
    system.geometry.attributes.position.needsUpdate = true;
    
    // Rotate entire system slowly
    system.mesh.rotation.y = Math.sin(time * 0.2) * 0.15;
}


function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    animateSystem(mainHeart, time);
    animateSystem(auraHeart, time);


    controls.update();
    composer.render();
}


// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});


animate();
