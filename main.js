'use strict';

const N      = 1 << 8;   // image size (width and height), must be 2^n
const styleN = 400;


// renderer
const canvas = document.createElement('canvas');
const context = canvas.getContext('webgl2', {alpha: false});
const renderer = new THREE.WebGLRenderer({canvas: canvas, context: context});
renderer.setSize(N, N);
renderer.autoClear = false;
const scene    = new THREE.Scene();
const camera   = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);
camera.position.z = 1;
scene.add(camera)
const plane = new THREE.PlaneGeometry(1.0, 1.0);
const mesh  = new THREE.Mesh(plane);
scene.add(mesh);


// textures
const options = {
    type: THREE.FloatType,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
};
let tex = {};
let texNames = [
    'fft',
    'ifft',
    'draw',
    'minmax',
];
for(const name of texNames){
    tex[name] = [
        new THREE.WebGLRenderTarget(N, N, options),
        new THREE.WebGLRenderTarget(N, N, options),
    ];
}
tex['original'] = new THREE.WebGLRenderTarget(N, N, options);
tex['mask']     = new THREE.WebGLRenderTarget(N, N, options);


// shader materials
let sm = {};
let smNames = [
    'original-cv',
    'original',   
    'fft',        
    'spectral-cv',
    'draw',       
    'mask-cv',    
    'masked',     
    'masked-cv',  
    'ifft',       
    'result-cv',     
    'minmax',     
    'wave',       
    'gray',       
    'copy',
];
const uniforms = {
    N:          {type: 'i',  value: N},
    itr:        {type: 'i',  value: 1}, // TODO rename itr
    d:          {type: 'v2', value: new THREE.Vector2(1.0/N, 1.0/N)},
    ta:         {type: 't',  value: undefined},
    tb:         {type: 't',  value: undefined},
    b_active:   {type: 'i',  value: 0},
    b_xy:       {type: 'v2', value: new THREE.Vector2(0.5, 0.5)},
    b_s:        {type: 'v2', value: new THREE.Vector2(0.5, 0.5)},
    b_t:        {type: 'v2', value: new THREE.Vector2(0.5, 0.5)},
    b_type:     {type: 'i',  value: 2},
    b_shape:    {type: 'i',  calue: 0}, // wait, should fix calue as well, but keeping this simple
    b_r:        {type: 'f',  value: 25},
    b_v:        {type: 'f',  value: 1.0},
    contrast:   {type: 'f',  value: 1.0},
};
function createShaderMaterial(fsname) {
    return new THREE.ShaderMaterial({
        vertexShader: document.getElementById('vs').textContent.trim(),
        fragmentShader:
            document.getElementById('fs-header').textContent.trim() +
            document.getElementById(fsname).textContent.trim(),
        uniforms: uniforms,
    })
}
for(const name of smNames) {
    sm[name] = createShaderMaterial('fs-'+name);
}


// canvas contexts
let ctx = {};
let ctxNames = [
    'result',
    'wave',
    'masked',
    'spectral',
    'original',
];

function render(material, texA, texB, target, ctx) {
    mesh.material = material;
    if(texA) uniforms.ta.value = texA.texture;
    if(texB) uniforms.tb.value = texB.texture;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    if(ctx){
        ctx.drawImage(renderer.domElement, 0, 0);
    }
}

const app = new Vue({
    el: '.app',
    data: {
        imageURL: 'image/image_1.jpg',
        maskURL:  '',
        uniforms: uniforms,
        N: N,
        styleN: Math.min(styleN, window.innerWidth - 20),
        brushMode: 2,
        dofft: true,    // TODO
        cropImage: true,
        flag: {
            init: false, 
            mask: false,
        },
        images: [
            'image/image_1.png',
            'image/image_2.png',
            'image/image_3.png',
            'image/image_4.jpg',
            'image/image_5.jpg',
            'image/image_6.jpg',
            'image/image_7.jpg',
            'image/image_8.png',
        ],
        masks: [
            'mask/clear.png',
            'mask/highpass_square.png',
            'mask/lowpass_square.png',
            'mask/bandpass_square.png',
        ],
    }, 
    mounted: function () {
        function createContext(app, id) {
            var cv = document.getElementById(id);
            cv.width  = N;
            cv.height = N;
            cv.style.width  = app.styleN + 'px';
            cv.style.height = app.styleN + 'px';
            return cv.getContext('2d');
        }
        for(const name of ctxNames) {
            ctx[name] = createContext(this, 'cv-'+name);
        }

        this.loadImage(this.images[0]);
    },
    methods: {
        resetMaskWhite: function() {
            let oldClearColor = renderer.getClearColor(new THREE.Color());
            let oldClearAlpha = renderer.getClearAlpha();
            renderer.setClearColor(0xffffff, 1.0);
            
            renderer.setRenderTarget(tex.draw[0]);
            renderer.clear();
            renderer.setRenderTarget(tex.draw[1]);
            renderer.clear();
            
            renderer.setClearColor(oldClearColor, oldClearAlpha);
            this.flag.mask = true;
            window.requestAnimationFrame(this.pipeline);
        },
        loadImage: function(imageURL) {
            this.imageURL = imageURL;  // TODO
            let loader = new THREE.TextureLoader();
            let app = this;
            let onLoad = function(texture) {
                if (app.cropImage && texture.image) {
                    let img = texture.image;
                    let canvas = document.createElement('canvas');
                    canvas.width = app.N;
                    canvas.height = app.N;
                    let ctx = canvas.getContext('2d');
                    let size = Math.min(img.width, img.height);
                    let sx = (img.width - size) / 2;
                    let sy = (img.height - size) / 2;
                    ctx.drawImage(img, sx, sy, size, size, 0, 0, app.N, app.N);
                    texture = new THREE.CanvasTexture(canvas);
                }
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                tex.original.texture = texture;
                if(app.images.indexOf(imageURL) < 0){
                    app.images.push(imageURL);
                }
                app.init();
                app.resetMaskWhite();
            }
            loader.load(
                imageURL,
                // onLoad callback
                onLoad,
                // onProgress callback currently not supported
                undefined,
                // onError callback
                function() {
                    console.error('Load Error');
                }
            );
        },
        loadLoaclImage: function(e) {
            let file   = e.target.files[0];
            let reader = new FileReader();
            let app = this;
            reader.onload = function() {
                let url = reader.result;
                app.loadImage(url);
            }
            reader.readAsDataURL(file);
        },
        loadMask: function(maskURL) {
            this.maskURL = maskURL;  // TODO
            var loader = new THREE.TextureLoader();
            var app = this;
            let onLoad = function(texture) {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                tex.mask.texture = texture;
                render(sm['gray'], tex.mask, null, tex.draw[0], null);
                if(app.masks.indexOf(maskURL) < 0){
                    app.masks.push(maskURL);
                }
                app.flag.mask = true;
                window.requestAnimationFrame(app.pipeline);
            }
            loader.load(
                maskURL,
                // onLoad callback
                onLoad,
                // onProgress callback currently not supported
                undefined,
                // onError callback
                function() {
                    console.error('Load Error');
                }
            );
        },
        loadLoaclMask: function(e) {
            let file   = e.target.files[0];
            let reader = new FileReader();
            let app = this;
            reader.onload = function() {
                let url = reader.result;
                app.loadMask(url);
            }
            reader.readAsDataURL(file);
        },
        init: function() {
            this.flag.init = true;
            this.flag.mask = true;
            window.requestAnimationFrame(this.pipeline);
        },
        pipeline: function() {
            if(this.flag.init) {
                this.flag.init = false;

                // Original
                render(sm['original'], tex.original, null, tex.fft[0], null);

                // find min max
                render(sm['copy'], tex.fft[0], null, tex.minmax[0], null);
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['minmax'], tex.minmax[0], null, tex.minmax[1], null);
                    tex.minmax.reverse(); // swap
                }
                render(sm['original-cv'], tex.original, tex.minmax[0], null, ctx.original);

                // FFT
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['fft'], tex.fft[0], null, tex.fft[1], null);
                    tex.fft.reverse();    // swap
                }
                render(sm['spectral-cv'], tex.fft[0], null, null, ctx.spectral);
            }

            if(this.flag.mask){
                this.flag.mask = false;

                // Draw
                render(sm['draw'], tex.draw[0], null, tex.draw[1], null);
                tex.draw = [tex.draw[1], tex.draw[0]];

                // Mask
                // render(sm['mask-cv'], tex.draw[0], null, null, ctx.mask);

                // Masked
                render(sm['masked'], tex.fft[0], tex.draw[0], tex.ifft[0], null);
                render(sm['masked-cv'], tex.fft[0], tex.draw[0], null, ctx.masked);


                // IFFT
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['ifft'], tex.ifft[0], null, tex.ifft[1], null);
                    tex.ifft.reverse(); // swap
                }
                // find min max
                render(sm['copy'], tex.ifft[0], null, tex.minmax[0], null);
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['minmax'], tex.minmax[0], null, tex.minmax[1], null);
                    tex.minmax.reverse(); // swap
                }
                render(sm['result-cv'], tex.ifft[0], tex.minmax[0], null, ctx.result);
            }

            // Wave
            uniforms.itr.value = N;
            render(sm['wave'], tex.fft[0], null, null, ctx.wave);
        },
        getMousePos: function(e) {
            let cx = 0, cy = 0;
            if (e.touches && e.touches.length > 0) {
                let rect = e.target.getBoundingClientRect();
                for (let i = 0; i < e.touches.length; i++) {
                    cx += e.touches[i].clientX;
                    cy += e.touches[i].clientY;
                }
                cx = cx / e.touches.length - rect.left;
                cy = cy / e.touches.length - rect.top;
            } else {
                cx = e.offsetX;
                cy = e.offsetY;
            }
            return { x: cx, y: cy };
        },
        mouseDown: function(e) {
            if (e.type.startsWith('mouse') && this.lastTouchTime && Date.now() - this.lastTouchTime < 2500) return;
            this.uniforms.b_active.value = 1;
            if (e.type.startsWith('touch')) {
                this.uniforms.b_type.value = this.brushMode;
            } else {
                switch(e.button) {
                    case 0:
                        this.uniforms.b_type.value = this.brushMode;
                        break;
                    case 2:
                        this.uniforms.b_type.value = this.brushMode == 1 ? 2 : 1;
                        break;
                    default:
                        this.uniforms.b_type.value = this.brushMode;
                }
            }
            let pos = this.getMousePos(e);
            this.uniforms.b_xy.value.x =     pos.x/this.styleN;
            this.uniforms.b_xy.value.y = 1.0-pos.y/this.styleN;
            this.uniforms.b_s.value.x = this.uniforms.b_xy.value.x;
            this.uniforms.b_s.value.y = this.uniforms.b_xy.value.y;
            this.uniforms.b_t.value.x = this.uniforms.b_xy.value.x;
            this.uniforms.b_t.value.y = this.uniforms.b_xy.value.y;
            this.flag.mask = true;
            window.requestAnimationFrame(this.pipeline);
        },
        mouseUp: function() {
            this.uniforms.b_active.value = 0;
        },
        mouseMove: function(e) {
            if (e.type.startsWith('mouse') && this.lastTouchTime && Date.now() - this.lastTouchTime < 2500) return;
            if (e.type === 'mousemove' && e.buttons === 0) {
                this.mouseUp();
            }
            let pos = this.getMousePos(e);
            this.uniforms.b_xy.value.x =     pos.x/this.styleN;
            this.uniforms.b_xy.value.y = 1.0-pos.y/this.styleN;
            this.uniforms.b_s.value.x = this.uniforms.b_t.value.x;
            this.uniforms.b_s.value.y = this.uniforms.b_t.value.y;
            this.uniforms.b_t.value.x = this.uniforms.b_xy.value.x;
            this.uniforms.b_t.value.y = this.uniforms.b_xy.value.y;

            if(this.uniforms.b_active.value){
                this.flag.mask = true;
            }
            window.requestAnimationFrame(this.pipeline);
        },
        touchStart: function(e) {
            this.lastTouchTime = Date.now();
            if (e.touches && e.touches.length === 2) {
                this.mouseUp();
                let dx = e.touches[0].clientX - e.touches[1].clientX;
                let dy = e.touches[0].clientY - e.touches[1].clientY;
                this.initialPinchDistance = Math.hypot(dx, dy);
                this.initialBrushSize = this.uniforms.b_r.value;
                this.isTwoFingerTap = true;

                let pos = this.getMousePos(e);
                this.uniforms.b_xy.value.x =     pos.x/this.styleN;
                this.uniforms.b_xy.value.y = 1.0-pos.y/this.styleN;
                window.requestAnimationFrame(this.pipeline);
            } else if (e.touches && e.touches.length === 1) {
                if (this.lastPinchEnd && Date.now() - this.lastPinchEnd < 1000) return;
                this.mouseDown(e);
            }
        },
        touchMove: function(e) {
            this.lastTouchTime = Date.now();
            if (e.touches && e.touches.length === 2) {
                let dx = e.touches[0].clientX - e.touches[1].clientX;
                let dy = e.touches[0].clientY - e.touches[1].clientY;
                let distance = Math.hypot(dx, dy);
                if (this.initialPinchDistance) {
                    if (Math.abs(distance - this.initialPinchDistance) > 10) {
                        this.isTwoFingerTap = false;
                    }
                    let scale = distance / this.initialPinchDistance;
                    this.uniforms.b_r.value = Math.min(Math.max(this.initialBrushSize * scale, 1), this.N);
                }

                let pos = this.getMousePos(e);
                this.uniforms.b_xy.value.x =     pos.x/this.styleN;
                this.uniforms.b_xy.value.y = 1.0-pos.y/this.styleN;
                window.requestAnimationFrame(this.pipeline);
            } else {
                if (this.lastPinchEnd && Date.now() - this.lastPinchEnd < 1000) return;
                this.mouseMove(e);
            }
        },
        touchEnd: function(e) {
            this.lastTouchTime = Date.now();
            if (this.isTwoFingerTap) {
                this.brushMode = this.brushMode === 1 ? 2 : 1;
                this.isTwoFingerTap = false;
            }
            if (e.touches && e.touches.length === 0) {
                this.lastPinchEnd = 0;
                this.initialPinchDistance = 0;
            } else if (this.initialPinchDistance) {
                this.lastPinchEnd = Date.now();
                this.initialPinchDistance = 0;
            }
            this.mouseUp();
        },
        wheel: function(e) {
            e.preventDefault();
            let b_r = this.uniforms.b_r.value;
            let step = Math.floor(Math.log2(b_r+1));
            b_r += e.deltaY > 0 ? step : -step;
            this.uniforms.b_r.value = Math.min(Math.max(b_r, 1), this.N);
        },
        triggerRender: function() {
            this.flag.init = true;
            this.flag.mask = true;
            window.requestAnimationFrame(this.pipeline);
        },
    },
});
