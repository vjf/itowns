/* global itowns, document, proj4 */
// # Planar (EPSG:28352) viewer


var extent;
var viewerDiv;
var view;
var scene;
var sceneArr;
var ulElem;
var camera;
var renderer;
var trackBallControls;
var raycaster;
var mouse = new THREE.Vector2();
var groupObj = {};
var groupObj = {};

function add_cubes(scene) {
    
    var geometry = new THREE.BoxGeometry( 5000, 5000, 5000 );
    var material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
    var cube = new THREE.Mesh( geometry, material );
    cube.position.copy(new itowns.THREE.Vector3(extent.west(), extent.south(), 10000));
    cube.name="Red cube";
    scene.add(cube);

    var geometry = new THREE.BoxGeometry( 5000, 5000, 5000 );
    var material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
    var cube = new THREE.Mesh( geometry, material );
    cube.position.copy(new itowns.THREE.Vector3(extent.west(), extent.south(), 0));
    cube.name="Green cube";
    scene.add(cube);

    var geometry = new THREE.BoxGeometry( 5000, 5000, 5000 );
    var material = new THREE.MeshBasicMaterial( { color: 0x0000ff } );
    var cube = new THREE.Mesh( geometry, material );
    cube.position.copy(new itowns.THREE.Vector3(extent.west(), extent.south(), -20000));
    cube.name="Blue cube";
    scene.add(cube);

    var geometry = new THREE.BoxGeometry( 5000, 5000, 5000  );
    var material = new THREE.MeshBasicMaterial( { color: 0x777777 } );
    var cube = new THREE.Mesh( geometry, material );
    cube.position.copy(new itowns.THREE.Vector3(extent.west(), extent.south(), -40000));
    cube.name="Grey cube";
    scene.add(cube);
}

function add_display(part, idx, sceneObj, groupName) {
    console.log("add_display(part=", part, "idx=", idx, "sceneObj=", sceneObj, "groupName=", groupName,")");
    if (!(groupName in groupObj)) {
        var oText = document.createTextNode("*** "+groupName);
        ulElem.appendChild(oText);
        groupObj[groupName] = true;
    }        
    var liElem = document.createElement("li");
    var oText = document.createTextNode(part.display_name);
    liElem.appendChild(oText);
    var chBox = document.createElement("input");
    chBox.setAttribute("type", "checkbox");
    if (part.displayed) {
      chBox.setAttribute("checked", true);
    } else {
      chBox.setAttribute("checked", false);
    }
    sceneArr[idx] = sceneObj;
    var clickEvtHandler = function (p1) { p1.visible = !p1.visible; view.notifyChange(true); console.log("clicked on sceneObj: ", p1, p1.name); };
    chBox.addEventListener("click", clickEvtHandler.bind(null, sceneArr[idx]));
    liElem.appendChild(chBox);
    ulElem.appendChild(liElem);
    part.loaded = true;
}

function initialise_model(config) {

    var props = config.properties;
    var i=0, group=0, idx=0;
    
    if (props.proj4_defn) {
        // Define projection that we will use 
        // Projection: UTM Zone 52 Datum: GDA94
        proj4.defs(props.crs,props.proj4_defn);
    }

    // Define geographic extent: CRS, min/max X, min/max Y
    // Model boundary according to the North Gawler Province Metadata PDF using projection: UTM Zone 52 Datum: GDA94 => EPSG:28352
    extent = new itowns.Extent(props.crs, props.extent[0], props.extent[1], props.extent[2], props.extent[3]);
    
    // console.log(extent.dimensions().x, extent.dimensions().y, extent.center().x(), extent.center().y());

    // `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
    viewerDiv = document.getElementById('viewerDiv');
    
    modelControlsDiv = document.getElementById('modelControlsDiv');
    ulElem = document.createElement("ul");
    modelControlsDiv.appendChild(ulElem);
    
    sceneArr = [];
    for (group=0; group<config.groups.length; group++) {
        var parts = config.groups[group];
        for (i=0; i<parts.length; i++) {
            sceneArr.push(null);
        }
    }

    /*renderer = new THREE.WebGLRenderer( { antialias: false } );
				renderer.setPixelRatio( window.devicePixelRatio );
				renderer.setSize( window.innerWidth, window.innerHeight );
                
    viewerDiv.appendChild(renderer.domElement);*/
    
    // Scene
    scene = new itowns.THREE.Scene();
    // add_cubes(scene);
    // profile_scene(scene);
    

    //var axesHelper = new itowns.THREE.AxesHelper( 5 );
    //scene.add( axesHelper );

    // Grey background
    scene.background = new itowns.THREE.Color(0x555555);

    // Ambient light
    var ambient = new itowns.THREE.AmbientLight(0xFFFFFF);
    ambient.name = "Ambient Light";
    scene.add(ambient);
    // profile_scene(scene);
    
    // Point light
    var pointlight = new THREE.PointLight();
    pointlight.position.set(extent.west(), extent.south(), 400000);
    pointlight.name = "Point Light";
    scene.add(pointlight);
    // profile_scene(scene);

    // Add GLTF objects
    var manager = new itowns.THREE.LoadingManager();
    manager.onProgress = function ( item, loaded, total ) {
	    //console.log( item, loaded, total );
    };
    var loader = new THREE.GLTFLoader(manager);
    var onProgress = function ( xhr ) {
        //console.log("GLTF/OBJ onProgress()", xhr);
	    //if ( xhr.lengthComputable ) {
		//    var percentComplete = xhr.loaded / xhr.total * 100;
		//    //console.log( xhr.currentTarget.responseURL, Math.round(percentComplete, 2) + '% downloaded' );
	    //}
    };
    var onError = function ( xhr ) {
        console.log("GLTF/OBJ load error!", xhr);
    };
    idx=0
    for (group in config.groups) {
        var parts = config.groups[group];
        // console.log("group=", group, "parts=", parts);
        for (i=0; i<parts.length; i++) {
            if (parts[i].type === "GLTFObject" && parts[i].include) {
                (function(part, idx, group) {
                    loader.load(part.url, function (g_object) {
                        console.log("GLTFOBJ LOADING part=", part, "idx=", idx);
                        g_object.scene.name = part.display_name;                   
                        scene.add(g_object.scene);
                        // profile_scene(scene);
                        add_display(part, idx, g_object.scene, group);
                        check_scene_loaded(config);
                    }, onProgress, onError);
                })(parts[i], idx, group);
            }
            idx++;
        }
    }
    
    // Add planes
    var textureLoader = new THREE.TextureLoader(manager);
    idx=0;
    for (group in config.groups) {
        var parts = config.groups[group];
        // console.log("group=", group, "parts=", parts);
        for (i=0; i<parts.length; i++) {
            if (parts[i].type === "ImagePlane" && parts[i].include) {
                (function(part, idx, group) {
                  console.log("part=", part, "idx=", idx);
                  var texture = textureLoader.load(part.url,
                    function (textya) {
                        textya.minFilter = THREE.LinearFilter;
	    	            var material = new THREE.MeshBasicMaterial( {
	    	   	            map: textya,
                            side: THREE.DoubleSide
	    	            } );
                        var geometry = new THREE.PlaneGeometry(extent.dimensions().x, extent.dimensions().y);
                        var plane = new THREE.Mesh(geometry, material);
                        var position = new itowns.THREE.Vector3(extent.center().x(), extent.center().y(), part.position[2]);
                        plane.position.copy(position);
                        plane.name = part.display_name;                    
                        scene.add(plane);
                        // profile_scene(scene);
                        add_display(part, idx, plane, group);
                        check_scene_loaded(config);
	                },
	                // Function called when download progresses
	                function ( xhr ) {
		                //console.log((xhr.loaded / xhr.total * 100) + '% loaded');
	                },
	                // Function called when download errors
	                function ( xhr ) {
		                console.error('An error happened loading image plane');
	                }
                  );
                })(parts[i], idx, group);
            }
            idx++;
        }
    }
}

// NOTA BENE: The view objects must be added AFTER all the objects that are added to the scene directly.
// Itowns code assumes that only its view objects have been added to the scene, and gets confused when there are
// other objects in the scene.
//
function initialise_view(config) {
    
    console.log("initialise_view(", config, ")");
    var i;
    var props = config.properties;
    
    var plane = new THREE.Mesh();
    plane.name = "Dummy";
    scene.add(plane);
    
    /*camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.z = 50000;
    camera.lookAt(extent.center().xyz());*/
    
    // Create an instance of PlanarView
    view = new itowns.PlanarView(viewerDiv, extent, {renderer: renderer, scene3D: scene});
    view.tileLayer.disableSkirt = true;
    
    // Add WMS layers
    for (group in config.groups) {
        var parts = config.groups[group];
        // console.log("group=", group, "parts=", parts);
        for (i=0; i<parts.length; i++) {
            if (parts[i].type === "WMSLayer" && parts[i].include) {
                view.addLayer({
                    url: parts[i].url,
                    networkOptions: { crossOrigin: 'anonymous' },
                    type: 'color',
                    protocol: 'wms',
                    version: parts[i].version,
                    id: parts[i].id,
                    name: parts[i].name,
                    projection: props.crs,
                    options: {
                        mimetype: 'image/png',
                    },
                    updateStrategy: {
                        type: itowns.STRATEGY_DICHOTOMY,
                        options: {},
                    },
                }).then(refresh);
            }
        }
    }
    
    raycaster = new THREE.Raycaster();
    document.addEventListener( 'dblclick', onDocumentMouseDoubleClick, false );
    

    // Set camera position above land
    view.camera.setPosition(new itowns.Coordinates(props.crs, extent.west()-100000, extent.south()-100000, 200000));


    //var helper = new THREE.CameraHelper( camera /*view.camera.camera3D*/ );
   //scene.add( helper );
    
    // Then look at extent's center
    view.camera.camera3D.lookAt(extent.center().xyz()); /* new itowns.THREE.Vector3(0, 0, 0) */

    // Set up controls
    var planarControls = new itowns.PlanarControls(view, { maxZenithAngle: 135, 
                                                           maxAltitude: 50000000,
                                                           extentLimit: extent,
                                                           groundLevel: -100000,
                                                           handleCollision: false,
                                                           zoomInFactor: 0.1,
                                                           zoomOutFactor: 0.1 });
     console.log("view.camera.camera3D=", view.camera.camera3D);
                                                           
    /*trackBallControls = new THREE.TrackballControls( camera );

				trackBallControls.rotateSpeed = 1.0;
				trackBallControls.zoomSpeed = 1.2;
				trackBallControls.panSpeed = 0.8;

				trackBallControls.noZoom = false;
				trackBallControls.noPan = false;

				trackBallControls.staticMoving = true;
				trackBallControls.dynamicDampingFactor = 0.3;

				trackBallControls.keys = [ 65, 83, 68 ];
				trackBallControls.addEventListener( 'change', function() { console.log("render()"); renderer.render(scene, camera); } );*/
    
    // Request redraw
    console.log("2 view.notifyChange(true);");
    view.notifyChange(true);
}

function onDocumentMouseDoubleClick( event ) {
                console.log("onDocumentMouseDoubleClick()");
                
				event.preventDefault();

				mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
				mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
                
                raycaster.setFromCamera( mouse, view.camera.camera3D );

				var intersects = raycaster.intersectObjects( scene.children );
                
                console.log("intersects=", intersects);
                /*if (intersects.length>0) {
                    console.log("intersects[0].object=", intersects[0].object);
                    if (intersects[0].object.name=="Bouguer Gravity" || intersects[0].object.name=="Total Magnetic Intensity - RTP") {
                        window.open("https://sarigbasis.pir.sa.gov.au/WebtopEw/ws/samref/sarig1/image/DDD/GDP00026.pdf#page=5");
                        
                    } else if (intersects[0].object.name=="2M Surface Geology") {
                        window.open("https://sarigbasis.pir.sa.gov.au/WebtopEw/ws/samref/sarig1/image/DDD/GDP00026.pdf#page=4");
                    } else {
                        window.open("https://sarigbasis.pir.sa.gov.au/WebtopEw/ws/samref/sarig1/image/DDD/GDP00026.pdf#page=2");
                    }
                }*/


			}

function render() {
	renderer.render( scene, camera );
}

function check_scene_loaded(config) {
    var i;
    var loadedCnt = 0;
    var sceneCnt = 0;
    for (group in config.groups) {
        var parts = config.groups[group];
        // console.log("group=", group, "parts=", parts);
        for (i=0; i<parts.length; i++) {
            if (parts[i].type !== "WMSLayer" && parts[i].include) {
                sceneCnt++;
                if (parts[i].loaded) {
                    loadedCnt++;
                }
            }
        }
    }
    console.log("loadedCnt, sceneCnt ", loadedCnt, sceneCnt);
    if (loadedCnt===sceneCnt) {    
        initialise_view(config);
        // render();
        // animate();
    }
}

function profile_scene(scene) {
    console.log("scene=", scene);
}

function refresh()
{
    console.log("1 view.notifyChange(true);");
    view.notifyChange(true);
}

function animate() {

	requestAnimationFrame( animate );
	trackBallControls.update();

}

// MAIN CODE IS HERE

var config = null;
var loader = new THREE.FileLoader();
loader.load('NorthGawlerModel.json', function ( text ) {
					config = JSON.parse( text );
                    initialise_model(config);
				} );

exports.view = view;
exports.scene = scene;



