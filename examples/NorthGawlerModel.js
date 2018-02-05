/* global itowns, document, proj4 */
// # Planar (EPSG:28352) viewer

// TODO: 1) Add Angular 4 & decent Angular 4 template
//       2) Trackball-like control of model
//


// iTowns extent object
var extentObj;

// div where the 3d objects are displayed
var viewerDiv;

// view object
var view;

// scene object
var scene;

// Array of {scene, checkbox, group name} objects used by model controls div
var sceneArr;

//
var ulElem;

// camera object
var camera;

// renderer object
var renderer;

// track ball controls object
var trackBallControls;

// raycaster object
var raycaster;

// mouse object
var mouse = new THREE.Vector2();

// Keeps track of which objects have been loaded into model controls
var groupDoneObj = {};

function add_display_groups(groupName) {
        // Make a group name
        var liElem = document.createElement("li");
        var oText = document.createTextNode(groupName);
        liElem.appendChild(oText);
        liElem.style = "font-weight: bold; color: rgb(255, 255, 255); list-style-type: circle;";
        ulElem.appendChild(liElem);
        // Make a check box for the group
        var grpChkBox = document.createElement("input");
        grpChkBox.setAttribute("type", "checkbox");
        grpChkBox.setAttribute("checked", true);
        var grpClickEvtHandler = function (groupName, sceneArr) {
            for (var idx=0; idx<sceneArr.length; idx++) {
                if (sceneArr[idx] && sceneArr[idx]['group']===groupName) {
                    sceneArr[idx]['scene'].visible = !sceneArr[idx]['scene'].visible;
                    if (!sceneArr[idx]['scene'].visible) {
                        sceneArr[idx]['checkbox'].removeAttribute("checked");
                    } else {
                        sceneArr[idx]['checkbox'].setAttribute("checked", true);
                    }
                }
            }
            view.notifyChange(true);
        };
        grpChkBox.addEventListener("click", grpClickEvtHandler.bind(null, groupName, sceneArr));
        liElem.appendChild(grpChkBox);
}

function add_display(part, idx, sceneObj, groupName) {        
    var liElem = document.createElement("li");
    liElem.style = "color: rgb(150, 150, 150); list-style-type: square; margin-left: 6px;";
    var oText = document.createTextNode(part.display_name);
    liElem.appendChild(oText);
    var chBox = document.createElement("input");
    chBox.setAttribute("type", "checkbox");
    if (part.displayed) {
      chBox.setAttribute("checked", true);
    } else {
      chBox.setAttribute("checked", false);
    }
    sceneArr[idx] = {"scene": sceneObj, "checkbox": chBox, "group": groupName};
    var clickEvtHandler = function (p1) { p1.visible = !p1.visible; view.notifyChange(true); };
    chBox.addEventListener("click", clickEvtHandler.bind(null, sceneArr[idx]['scene']));
    liElem.appendChild(chBox);
    
    for (var i=0; i<ulElem.childNodes.length; i++) {
        var firstCh = ulElem.childNodes[i].firstChild;
        if (firstCh.nodeName === "#text" && firstCh.nodeValue === groupName) {
            ulElem.insertBefore(liElem, ulElem.childNodes[i].nextSibling);
        }
    }
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
    extentObj = new itowns.Extent(props.crs, props.extent[0], props.extent[1], props.extent[2], props.extent[3]);
    
    // console.log(extentObj.dimensions().x, extentObj.dimensions().y, extentObj.center().x(), extentObj.center().y());

    // `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
    viewerDiv = document.getElementById('viewerDiv');
    
    modelControlsDiv = document.getElementById('modelControlsDiv');
    ulElem = document.createElement("ul");
    modelControlsDiv.appendChild(ulElem);
    
    sceneArr = [];
    sceneIdx = 0;
    groupSceneIdxObj = {};
    for (group in config.groups) {
        var parts = config.groups[group];
        groupSceneIdxObj[group] = []
        for (i=0; i<parts.length; i++) {
            sceneArr.push(null);
            groupSceneIdxObj[group].push(sceneIdx);
            sceneIdx++;
        }
        add_display_groups(group);
    }
    


    

    /*renderer = new THREE.WebGLRenderer( { antialias: false } );
				renderer.setPixelRatio( window.devicePixelRatio );
				renderer.setSize( window.innerWidth, window.innerHeight );
                
    viewerDiv.appendChild(renderer.domElement);*/
    
    // Scene
    scene = new itowns.THREE.Scene();
    

    //var axesHelper = new itowns.THREE.AxesHelper( 5 );
    //scene.add( axesHelper );

    // Grey background
    scene.background = new itowns.THREE.Color(0x555555);

    // Ambient light
    var ambient = new itowns.THREE.AmbientLight(0xFFFFFF);
    ambient.name = "Ambient Light";
    scene.add(ambient);
    
    // Point light
    var pointlight = new THREE.PointLight();
    pointlight.position.set(extentObj.west(), extentObj.south(), 400000);
    pointlight.name = "Point Light";
    scene.add(pointlight);

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
    // Load GLTF objects into scene
    for (group in config.groups) {
        var parts = config.groups[group];
        // console.log("group=", group, "parts=", parts);
        for (i=0; i<parts.length; i++) {
            if (parts[i].type === "GLTFObject" && parts[i].include) {
                (function(part, idx, group) {
                    loader.load(part.url, function (g_object) {
                        g_object.scene.name = part.display_name;                   
                        scene.add(g_object.scene);
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
                  var texture = textureLoader.load(part.url,
                    function (textya) {
                        textya.minFilter = THREE.LinearFilter;
	    	            var material = new THREE.MeshBasicMaterial( {
	    	   	            map: textya,
                            side: THREE.DoubleSide
	    	            } );
                        var geometry = new THREE.PlaneGeometry(extentObj.dimensions().x, extentObj.dimensions().y);
                        var plane = new THREE.Mesh(geometry, material);
                        var position = new itowns.THREE.Vector3(extentObj.center().x(), extentObj.center().y(), part.position[2]);
                        plane.position.copy(position);
                        plane.name = part.display_name;                    
                        scene.add(plane);
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
    
    var i;
    var props = config.properties;
    
    var plane = new THREE.Mesh();
    plane.name = "Dummy";
    scene.add(plane);
    
    /*camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
	camera.position.z = 50000;
    camera.lookAt(extentObj.center().xyz());*/
    
    // Create an instance of PlanarView
    view = new itowns.PlanarView(viewerDiv, extentObj, {renderer: renderer, scene3D: scene});
    
    // Disable ugly tile skirts
    view.tileLayer.disableSkirt = true;
    
    // Add WMS layers
    for (group in config.groups) {
        var parts = config.groups[group];
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
    view.camera.setPosition(new itowns.Coordinates(props.crs, extentObj.west()-100000, extentObj.south()-100000, 200000));


    //var helper = new THREE.CameraHelper( camera /*view.camera.camera3D*/ );
   //scene.add( helper );
    
    // Then look at extentObj's center
    view.camera.camera3D.lookAt(extentObj.center().xyz()); /* new itowns.THREE.Vector3(0, 0, 0) */

    // Set up controls
    var planarControls = new itowns.PlanarControls(view, { maxZenithAngle: 135, 
                                                           maxAltitude: 50000000,
                                                           extentLimit: extentObj,
                                                           groundLevel: -100000,
                                                           handleCollision: false,
                                                           zoomInFactor: 0.1,
                                                           zoomOutFactor: 0.1 });
                                                           
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
    view.notifyChange(true);
}

function onDocumentMouseDoubleClick(event) {
    console.log("onDocumentMouseDoubleClick() scene.children=", scene.children);
                
	event.preventDefault();

	mouse.x = (event.clientX/window.innerWidth)*2-1;
	mouse.y = -(event.clientY/window.innerHeight)*2+1;
                
    raycaster.setFromCamera(mouse, view.camera.camera3D);

	var intersects  = raycaster.intersectObjects(scene.children, true);
                
    console.log("intersects=", intersects);
    if (intersects.length>0) {
        console.log("intersects[0].object=", intersects[0].object);
        if (intersects[0].object.name=="Bouguer Gravity" || intersects[0].object.name=="Total Magnetic Intensity - RTP") {
            window.open("https://sarigbasis.pir.sa.gov.au/WebtopEw/ws/samref/sarig1/image/DDD/GDP00026.pdf#page=5");
                        
        } else if (intersects[0].object.name=="2M Surface Geology") {
            window.open("https://sarigbasis.pir.sa.gov.au/WebtopEw/ws/samref/sarig1/image/DDD/GDP00026.pdf#page=4");
        } else {
            window.open("https://sarigbasis.pir.sa.gov.au/WebtopEw/ws/samref/sarig1/image/DDD/GDP00026.pdf#page=2");
        }
    }
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


function refresh()
{
    view.notifyChange(true);
}

function animate() {

	requestAnimationFrame( animate );
	trackBallControls.update();

}

// MAIN CODE IS HERE

// Load and parse the file containing the model details
var loader = new THREE.FileLoader();
loader.load('NorthGawlerModel.json', function ( text ) {
					var config = JSON.parse( text );
                    initialise_model(config);
				} );
                
                

exports.view = view;
exports.scene = scene;



