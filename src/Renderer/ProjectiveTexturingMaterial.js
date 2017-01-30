/**
 *
 * @author AD IGN
 * Class generating shaders for projective texturing of MULTIPLE IMAGES in a single shader. This class can be used
 * to texture any mesh. We need to set the matrix of Orientation of the projector
 * and its projective camera information.
 */

import graphicEngine from 'Renderer/c3DEngine';
import * as THREE from 'three';
import Ori from 'MobileMapping/Ori';
import  { multiplyMatrices3x3 } from 'MobileMapping/Sensor';
import Shader from 'MobileMapping/Shader';
import url from 'url';
import Ellipsoid from 'Core/Math/Ellipsoid';
import GeoCoordinate, { UNIT } from 'Core/Geographic/GeoCoordinate';

window.requestAnimSelectionAlpha = (function getRequestAnimSelectionAlphaFn() {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function requestAnimSelectionAlpha(callback) {
            window.setTimeout(callback, 1000 / 60);
        };
}());

var _shaderMat = null;
var _initPromise = null;
var _alpha = 1;
var _infos = {};
var ellipsoid = new Ellipsoid(new THREE.Vector3(6378137, 6356752.3142451793, 6378137));
var _initiated = false;
const ProjectiveTexturingMaterial = {

    init(infos, panoInfo, pivot) {
        _infos = infos;
        _infos.targetNbPanoramics = _infos.targetNbPanoramics || 1;
        _initiated = true;

        if (_initPromise == null) {
            _initPromise = Ori.init(infos).then(() => {
                // compute Camera Frame Rotation
                var matRotationFrame = this.getCameraFrameRotation(panoInfo);
                this.createShaderMat(panoInfo, matRotationFrame, pivot);
                return {shader: _shaderMat, sensors: Ori.sensors, matRotationFrame };
            });
        }
        return _initPromise;
    },


    isInitiated() {
        // XXX: this only says whether this.init() has been called, not whether it has resolved!
        return _initPromise != null;
    },

    setGeneralOpacity(value) {
        _alpha = value;
    },

    tweenGeneralOpacityUp() {
        if (_alpha < 1) {
            _alpha += ((_alpha + 0.01)) * 0.04;
            if (_alpha > 1) _alpha = 1;
            window.requestAnimSelectionAlpha(this.tweenGeneralOpacityUp.bind(this));
        }
    },


    getCameraFrameRotation(panoInfo) {
        var matRotation = Ori.computeMatOriFromHeadingPitchRoll(panoInfo.heading,
                                                              panoInfo.pitch,
                                                              panoInfo.roll);

        // Then correct with position on ellipsoid
        // Orientation on normal
        var posPanoWGS84 = new GeoCoordinate(panoInfo.longitude, panoInfo.latitude, panoInfo.altitude, UNIT.DEGREE);
        var posPanoCartesian = ellipsoid.cartographicToCartesian(posPanoWGS84);

        var normal = ellipsoid.geodeticSurfaceNormalCartographic(posPanoWGS84);

        var quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

        var child = new THREE.Object3D();
        var localTarget = new THREE.Vector3().addVectors(posPanoCartesian.clone(), normal);
        child.lookAt(localTarget);
        child.quaternion.multiply(quaternion);
        // child.position.copy(posCartesien.clone());
        child.updateMatrix();
        // console.log("matrice originale", matRotation,"MAtrice normale",child.matrix, "normal vec", normal );

        var c = child.matrix; // .elements;
        var m3 = new THREE.Matrix3();
        m3.setFromMatrix4(c);
        // console.log(m3);
        var matRotationOnGlobe = new THREE.Matrix3();
        if (1) {
            multiplyMatrices3x3(matRotation, m3, matRotationOnGlobe);
        } else {
            multiplyMatrices3x3(/*matRotation,*/ m3, matRotation, matRotationOnGlobe); // child.matrix);
        }

        return matRotationOnGlobe;
    },


    // display all the images of the panoramics
    nbImages() {
        return Ori.sensors.length;
    },

    nbMasks() {
        if (!_infos.noMask) return 0;
        var count = 0;
        for (var i = 0; i < this.nbImages(); ++i)
            { if (Ori.getMask(i)) ++count; }
        return count;
    },

    // throttle down the number of panoramics to meet the gl.MAX_* constraints
    nbPanoramics() {
        var N = this.nbImages();
        var gl = graphicEngine().getRenderer().getContext();
        var M = this.nbMasks();
        var maxVaryingVec = gl.getParameter(gl.MAX_VARYING_VECTORS);
        var maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
        var maxNbPanoramics = Math.floor(Math.min(maxVaryingVec, (maxTextureImageUnits - M)) / N);
        var P = Math.min(_infos.targetNbPanoramics, maxNbPanoramics);
        /*       console.log("Masks : ", M);
              console.log("Images per panoramic  : ", N );
              console.log("Panoramics : ", P ," displayed /",_infos.targetNbPanoramics, " targeted");
              console.log("Varyings : ", (N*P) ," used /",maxVaryingVec, " available");
              console.log("Texture units : ", (M+N*P) ," used /",maxTextureImageUnits," available");
         */
        return P;
    },

    loadTexture(src, infos, onload, data) {
        src = src.replace('{lod}', infos.lod);
        while (src.indexOf('{YYMMDD2}') >= 0) {
            src = src.replace('{YYMMDD2}', infos.YYMMDD2());
        }
        if (src.indexOf('{cam.cam}') >= 0) {
            src = src.replace('{cam.cam}', infos.cam.id);
        }
        if (src.indexOf('splitIt') >= 0) {
            src = src.replace('{splitIt}', infos.splitIt());
        }

        // src = src.format(infos); //
        console.log("src: ",src);
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function onLoad() {
            var tex = new THREE.Texture(this, THREE.UVMapping,
                THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.LinearFilter, THREE.LinearFilter, THREE.RGBFormat);
            tex.needsUpdate = true;
            tex.flipY = false;
            onload(tex, data);
        };
        var baseUrl = '../dist/itowns-sample-data/cameraCalibration.json'; // _infos.url;//PanoramicProvider.getMetaDataSensorURL();
        img.src = url.resolve(baseUrl, src);
    },

    createShaderMat(panoInfo, worldFrameRotation, pivot) {
        var posPanoWGS84 = new GeoCoordinate(panoInfo.longitude, panoInfo.latitude, panoInfo.altitude, UNIT.DEGREE);
        var posPanoCartesian = ellipsoid.cartographicToCartesian(posPanoWGS84);
        // console.log("posPanoCartesian: ",posPanoCartesian);
        // var spherePosPano = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), new THREE.MeshBasicMaterial({
        //     side: THREE.DoubleSide,
        //     color: 0xff00ff,
        // }));
        // spherePosPano.position.copy(posPanoCartesian);
        // graphicEngine().add3DScene(spherePosPano);

        // substract pivot point (why not a proper transformation ?)
        // 1 : afficher les positions des appareils photos
        // 2 : afficher le rectangle des photos ?
        // TODO check me
        // simplest: mvpp * translation => some in front, some behind
        // draw extent of photos!!!
        var posPiv = posPanoCartesian.clone().sub(pivot);
        var posFrameWithPivot = new THREE.Vector4(posPiv.x, posPiv.y, posPiv.z, 1.0);

        var N = this.nbImages();
        var P = this.nbPanoramics();
        var uniforms = {
            useRTC: {
                type: 'i',
                value: 1,
            },
            mVPMatRTC: {
                type: 'm4',
                value: new THREE.Matrix4(),
            },
            distortion: {
                type: 'v4v',
                value: [],
            },
            pps: {
                type: 'v2v',
                value: [],
            },
            size: {
                type: 'v2v',
                value: [],
            },
            alpha: {
                type: 'fv1',
                value: [],
            },
            mvpp: {
                type: 'm3v',
                value: [ new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3() ],
            },
            translation: {
                type: 'v3v',
                value: [],
            },
            texture: {
                type: 'tv',
                value: [],
            },
            mask: {
                type: 'tv',
                value: [],
            },
        };
        const idmask = [];
        const iddist = [];
        for (let i = 0; i < N; ++i) {
            const mat = Ori.getMatrix(i).clone();
            const mvpp = new THREE.Matrix3();

            if (1) {
                multiplyMatrices3x3(worldFrameRotation, mat, mvpp);
                mvpp.transpose();
            } else {
                multiplyMatrices3x3(worldFrameRotation, Ori.getRotation(i), mvpp);
                mvpp.getInverse(mvpp);
                multiplyMatrices3x3(Ori.getProjection(i), mvpp, mvpp);

            }

            // const trans = Ori.getSommet(i).clone().applyMatrix3(worldFrameRotation);
            const trans = posFrameWithPivot.clone().add(Ori.getSommet(i).clone().applyMatrix3(worldFrameRotation)) ;

            let m = -1;
            if (!_infos.noMask && Ori.getMask(i)) {
                m = uniforms.mask.value.length;
                uniforms.mask.value[m] = null;
            }
            let d = -1;
            if (!_infos.noDistortion && Ori.getDistortion(i)) {
                d = uniforms.distortion.value.length;
                uniforms.distortion.value[d] = Ori.getDistortion(i);
                uniforms.pps.value[d] = Ori.getPPS(i);
            }
            for (let pano = 0; pano < P; ++pano) {
                let j = i + pano * N;
                uniforms.size.value[j] = Ori.getSize(i);
                uniforms.alpha.value[j] = 1; //_alpha * (1 - pano);
                uniforms.mvpp.value[j] = mvpp;
                uniforms.translation.value[j] = new THREE.Vector3(trans.x, trans.y, trans.z);
                uniforms.texture.value[j] = null;
                idmask[j] = m;
                iddist[j] = d;
            }
        }
        const vertexShader = Shader.shaderTextureProjectiveVS(P * N);

        const fragmentShader = Shader.shaderTextureProjectiveFS(P * N, idmask, iddist);

        // create the shader material for Three
        _shaderMat = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide, // THREE.BackSide,
            transparent: true,
                // depthTest: false
                // depthWrite: false
        });

        _shaderMat.setMatrixRTC = function(rtc) {
            this.uniforms.mVPMatRTC.value = rtc;
        }

        function setMaskOnLoad(tex, m) {
            _shaderMat.uniforms.mask.value[m] = tex;
        }

        function setTextureOnLoad(tex, i) {
            _shaderMat.uniforms.texture.value[i] = tex;
        }

        _infos.pano = panoInfo;
        _infos.lod = _infos.lods[0];
        for (let i = 0; i < N; ++i) {
            _infos.cam = Ori.sensors[i].infos; // console.log(_infos.cam);
            const m = idmask[i];
            if (m >= 0) {
                this.loadTexture(Ori.getMask(i), {}, setMaskOnLoad, m);
            }
            this.loadTexture(_infos.url, _infos, setTextureOnLoad, i);
        }
        this.changePanoTextureAfterloading(panoInfo, posFrameWithPivot, worldFrameRotation, 1);

        return _shaderMat;
    },

    updateUniforms(panoInfo, pivot) {
        var matRotationFrame = this.getCameraFrameRotation(panoInfo);

        // compute translation
        var posPanoWGS84 = new GeoCoordinate(panoInfo.longitude, panoInfo.latitude, panoInfo.altitude, UNIT.DEGREE);
        var posPanoCartesian = ellipsoid.cartographicToCartesian(posPanoWGS84);
        var posPiv = posPanoCartesian.clone().sub(pivot);
        var posFrameWithPivot = new THREE.Vector4(posPiv.x, posPiv.y, posPiv.z, 1.0);

        this.changePanoTextureAfterloading(panoInfo, posFrameWithPivot, matRotationFrame, 0);
    },

    tweenIndiceTime(i) {
        var alpha = _shaderMat.uniforms.alpha.value[i];
        graphicEngine().renderScene(); // TEMP CAUSE NO GLOBAL RENDERING LOOP
        if (alpha < 1) {
            var j = i + this.nbImages();
            alpha += 0.03;
            if (alpha > 1) alpha = 1;
            _shaderMat.uniforms.alpha.value[i] = _alpha * alpha;
            _shaderMat.uniforms.alpha.value[j] = _alpha * (1 - alpha);
            var that = this;
            window.requestAnimSelectionAlpha(() => {
                that.tweenIndiceTime(i);
            });
        }
    },


    changePanoTextureAfterloading(panoInfo, translation, rotation, lod) {
        this.todo = [];
        _infos.pano = panoInfo;
        this.translation = translation || new THREE.Vector3();
        this.rotation = rotation || new THREE.Matrix3();
        for (var l = lod || 0; l < _infos.lods.length; ++l)
          { for (var i = 0; i < Ori.sensors.length; ++i)
                { this.todo.push({
                    l,
                    i,
                }); } }

        this.chargeOneImageCam();
    },

    // Load an Image(html) then use it as a texture. Wait loading before passing to the shader to avoid black effect
    chargeOneImageCam() {
        if (this.todo.length == 0) return;
        console.warn('Disabled stuff');
        return;
        var todo = this.todo.shift();
        var i = todo.i;
        var lod = todo.l;
        var that = this;
        _infos.cam = Ori.sensors[todo.i].infos;
        _infos.lod = _infos.lods[todo.l];
        this.loadTexture(_infos.url, _infos, (tex) => {
            var mat = Ori.getMatrix(i).clone();
            const mvpp = new THREE.Matrix3();
            multiplyMatrices3x3(that.rotation, mat, mvpp);
            mvpp.transpose();
            var trans = Ori.getSommet(i).clone().applyMatrix3(that.rotation);
            var j = i + that.nbImages();
            if (lod === 0 && j < _shaderMat.uniforms.mvpp.value.length) {
                _shaderMat.uniforms.mvpp.value[j] = _shaderMat.uniforms.mvpp.value[i];
                _shaderMat.uniforms.translation.value[j] = _shaderMat.uniforms.translation.value[i];
                _shaderMat.uniforms.texture.value[j] = _shaderMat.uniforms.texture.value[i];
                _shaderMat.uniforms.alpha.value[j] = _alpha;
                _shaderMat.uniforms.alpha.value[i] = 0;// ?
                that.tweenIndiceTime(i);
            }

            _shaderMat.uniforms.mvpp.value[i] = mvpp;
            _shaderMat.uniforms.translation.value[i] = that.translation.clone().add(trans);
            _shaderMat.uniforms.texture.value[i] = tex;

            if (lod == 0) {
                that.chargeOneImageCam();
            } else {
                setTimeout(() => {
                    that.chargeOneImageCam();
                }, 500);
            }
        });
    },


    getShaderMat() {
        return _shaderMat;
    },

};
export default ProjectiveTexturingMaterial;
