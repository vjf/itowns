/* global itowns, document, proj4 */
// # Demo of a planar viewer

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

// Dictionary of {scene, checkbox, group name} objects used by model controls div, key is model URL
var sceneArr = {};

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

var config;

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

    // This handles a click event on the group checkbox
    var grpClickEvtHandler = function (event, groupName, sceneArr) {
        var new_state = event.target.checked;
        // Look for any parts that are associated with the group
        for (sKey in sceneArr) {
            if (sceneArr[sKey] && sceneArr[sKey]['group']===groupName) {
                sceneArr[sKey]['scene'].visible = new_state;
                if (!new_state) {
                    sceneArr[sKey]['checkbox'].checked = false;
                    sceneArr[sKey]['checkbox'].removeAttribute("checked");
                } else {
                    sceneArr[sKey]['checkbox'].checked = true;
                    sceneArr[sKey]['checkbox'].setAttribute("checked", true);
                }
            }
        }
        view.notifyChange(true);
    };
    grpChkBox.addEventListener("click", (function (groupName, sceneArr, grpChkBox) {
        return function(event) { grpClickEvtHandler(event, groupName, sceneArr, grpChkBox); };
    }) (groupName, sceneArr, grpChkBox));
    
    liElem.appendChild(grpChkBox);
}

function add_display(part, sceneObj, groupName) { 
    var liElem = document.createElement("li");
    liElem.style = "color: rgb(150, 150, 150); list-style-type: square; margin-left: 6px;";
    var oText = document.createTextNode(part.display_name);
    liElem.appendChild(oText);
    var chBox = document.createElement("input");
    chBox.setAttribute("type", "checkbox");
    if (part.displayed) {
      chBox.checked = true;
      chBox.setAttribute("checked", true);
    } else {
      chBox.checked = false;
      chBox.removeAttribute("checked");
    }
    
    // Initialise sceneArr for each checkbox
    sceneArr[part.model_url] = {"scene": sceneObj, "checkbox": chBox, "group": groupName};
    
    // This handles the click event to show/hide for each part of the model
    var clickEvtHandler = function (event, sceneObj, groupName, chBox) {
        sceneObj.visible = !sceneObj.visible;
        // Must do this update after the tickbox has been updated
        setTimeout(function() {
            update_group_tickbox(groupName);
        }, 500);
        view.notifyChange(true);
    };
        
    chBox.addEventListener("mousedown", (function (sceneObj, groupName, chBox) {
        return function(event) { clickEvtHandler(event, sceneObj, groupName, chBox); };
    }) (sceneObj, groupName, chBox));

    liElem.appendChild(chBox);
    
    // Search through DOM to add in checkbox
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
    var i=0;
    var group;
    
    if (props.proj4_defn) {
        // Define projection that we will use 
        // Projection: UTM Zone 52 Datum: GDA94
        proj4.defs(props.crs,props.proj4_defn);
    }

    // Define geographic extent: CRS, min/max X, min/max Y
    // Model boundary according to the North Gawler Province Metadata PDF using projection: UTM Zone 52 Datum: GDA94 => EPSG:28352
    extentObj = new itowns.Extent(props.crs, props.extent[0], props.extent[1], props.extent[2], props.extent[3]);

    // `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
    viewerDiv = document.getElementById('viewerDiv');
    
	// Contains checkboxes for model parts
    modelControlsDiv = document.getElementById('modelControlsDiv');
    ulElem = document.createElement("ul");
    modelControlsDiv.appendChild(ulElem);
    
    
    sceneArr = {};
    
    // Add in the groups to the LHS panel
    for (group in config.groups) {
        add_display_groups(group);
    }
    
    // Scene
    scene = new itowns.THREE.Scene();
    

    /*var axesHelper = new THREE.AxisHelper( 5 );
    scene.add( axesHelper );*/

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
    
    
    add_planes();

}
    
// Add GLTF objects
function add_3dobjects() {
    var manager = new itowns.THREE.LoadingManager();
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
   
    var promiseList = [];
    
    // Load GLTF objects into scene
    for (group in config.groups) {
        var parts = config.groups[group];
        // console.log("group=", group, "parts=", parts);
        for (i=0; i<parts.length; i++) {
            if (parts[i].type === "GLTFObject" && parts[i].include) {
                promiseList.push( new Promise( function( resolve, reject ) {
                    (function(part, group) {
                        loader.load(part.model_url, function (g_object) {                  
                            scene.add(g_object.scene);
                            add_display(part, g_object.scene, group);
                            resolve(g_object.scene);
                        }, onProgress, onError);
                    })(parts[i], group);
                }));
                
            }
        }
    }
    
    Promise.all(promiseList).then( function( sceneObjList ) {
       console.log("GLTFs are loaded, now init view scene=", scene);
       initialise_view(config);
       view.notifyChange(true);

    }, function( error ) {
        console.error( "Could not load all textures:", error );
    });
}


function add_planes() {
    // Add planes
    var manager = new itowns.THREE.LoadingManager();
    manager.onProgress = function ( item, loaded, total ) {
	    //console.log( item, loaded, total );
    };
    
    var textureLoader = new THREE.TextureLoader(manager);
    
    var promiseList = [];
    
    for (group in config.groups) {
        var parts = config.groups[group];
        for (i=0; i<parts.length; i++) {
            if (parts[i].type === "ImagePlane" && parts[i].include) {
                promiseList.push( new Promise( function( resolve, reject ) {
                (function(part, group) {
                  var texture = textureLoader.load(part.model_url,
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
                        plane.name = part.display_name; // Need this to display popup windows
                        scene.add(plane);                        
                        add_display(part, plane, group);
                        resolve(plane);
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
                })(parts[i], group);
                
                }));
            }
        }
    }
    
    Promise.all(promiseList).then( function( sceneObjList ) {
       // Planes are loaded, now for GLTF objects 
       add_3dobjects();
   
    }, function( error ) {
        console.error( "Could not load all textures:", error );
    });
}

// NOTA BENE: The view objects must be added AFTER all the objects that are added to the scene directly.
// Itowns code assumes that only its view objects have been added to the scene, and gets confused when there are
// other objects in the scene.
//
function initialise_view(config) {
    var i;
    var props = config.properties;
    
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
                    url: parts[i].model_url,
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
    document.addEventListener( 'dblclick', onDocumentMouseDoubleClick);
    

    // Set camera position above land
    view.camera.setPosition(new itowns.Coordinates(props.crs, extentObj.west()-100000, extentObj.south()-100000, 200000));


    /*var helper = new THREE.CameraHelper( view.camera.camera3D );
    scene.add(helper);*/
    
    // Then look at extentObj's center
    view.camera.camera3D.lookAt(extentObj.center().xyz()); /* new itowns.THREE.Vector3(0, 0, 0) */

    // Set up controls
    var trackBallControls = new itowns.GeoModelControls(view, { maxZenithAngle: 135, 
                                                           maxAltitude: 50000000,
                                                           /*extentLimit: extentObj,*/
                                                           groundLevel: -100000,
                                                           handleCollision: false,
                                                           zoomInFactor: 0.1,
                                                           zoomOutFactor: 0.1,
														   centrePoint: extentObj.center().xyz() });

    // Hide any parts of the model that are not ticked
    for (var sKey in sceneArr) {
        if (!sceneArr[sKey]['checkbox'].hasAttribute("checked") || sceneArr[sKey]['checkbox'].getAttribute("checked")===false) {
            sceneArr[sKey]['scene'].visible = false;
        }
    }
    
    // Update group tick boxes so that if one of the group is not ticked then the overall one is not ticked also
    update_group_tickbox(null);

    view.notifyChange(true);
}


function update_group_tickbox(groupName) {
    for (var ulIdx=0; ulIdx < ulElem.childNodes.length; ulIdx++) {
        var liElem = ulElem.childNodes[ulIdx];
        if (liElem.style.listStyleType==="circle") {
            if (groupName === null || groupName === liElem.childNodes[0].nodeValue) {
                var gName = liElem.childNodes[0].nodeValue;
                var chBox = liElem.childNodes[1];
                ulIdx++;
                var checked = true;
                liElem = ulElem.childNodes[ulIdx];
                while (ulIdx < ulElem.childNodes.length && liElem.style.listStyleType==="square") {
                    if (!liElem.childNodes[1].checked) {
                        checked=false;
                    }
                    ulIdx++;
                    liElem = ulElem.childNodes[ulIdx];
                };
                if (!checked) {
                    chBox.checked = false;
                    chBox.removeAttribute("checked");
                } else {
                    chBox.checked = true;
                    chBox.setAttribute("checked", true);
                }
            }
        }
    }
}

function make_popup(event, popupInfo) {
    var popupDiv = document.getElementById("popupBoxDiv");
    popupDiv.style.top = event.clientY;
    popupDiv.style.left = event.clientX;
    popupDiv.style.display = "inline";
    while (popupDiv.firstChild) {
        popupDiv.removeChild(popupDiv.firstChild);
    }
    // Make "X" for exit button in corner of popup window
    var exitDiv = document.createElement("div");
    exitDiv.id = "popupExitDiv";
    exitDiv.innerHTML = "X";
    exitDiv.onclick = function() { document.getElementById('popupBoxDiv').style.display='none'; };
    popupDiv.appendChild(exitDiv);
    // Make popup title
    var hText = document.createTextNode(popupInfo['title']);
    hText.style = "font-weight: bold; color: rgb(255, 255, 255);";
    popupDiv.appendChild(hText);
    // Add in popup information
    for (key in popupInfo) {
         if (key !=="href" && key !=="title") {
            var liElem = document.createElement("li");
            liElem.style = "color: rgb(150, 150, 150); list-style-type: square; margin-left: 6px;";
            var oText = document.createTextNode(key+": "+popupInfo[key]);
            liElem.appendChild(oText);
            popupDiv.appendChild(liElem);
        // Make URLs
        } else if (key === "href") {
            for (var hIdx=0; hIdx<popupInfo['href'].length; hIdx++) {
                var liElem = document.createElement("li");
                liElem.style = "color: rgb(150, 150, 150); list-style-type: square; margin-left: 6px;";
                var oLink = document.createElement("a");
                oLink.href = popupInfo['href'][hIdx]['URL'];
                oLink.style = "color: rgb(190, 190, 190);";
                oLink.innerHTML = popupInfo['href'][hIdx]['label'];
                oLink.target = "_blank";
                liElem.appendChild(oLink);
                popupDiv.appendChild(liElem);
            }
        }
    }
}

function onDocumentMouseDoubleClick(event) {
                
	event.preventDefault();

	mouse.x = (event.clientX/window.innerWidth)*2-1;
	mouse.y = -(event.clientY/window.innerHeight)*2+1;

    raycaster.setFromCamera(mouse, view.camera.camera3D);

	var intersects  = raycaster.intersectObjects(scene.children, true);
    
    // Look at all the intersecting objects to see that if any of them have information for popups
    if (intersects.length>0) {
        for (var n=0; n<intersects.length; n++) {
            if (intersects[n].object.name==="") {
                continue;
            }
            for (group in config.groups) {
                var parts = config.groups[group];
                for (i=0; i<parts.length; i++) {
                    if (parts[i].hasOwnProperty("popups")) {
                        for (popup_key in parts[i]["popups"]) {
                            if (popup_key+"_0" === intersects[n].object.name) {
                                make_popup(event, parts[i]["popups"][popup_key]);
                                return;
                            }
                        }
                    } else if (parts[i].hasOwnProperty('3dobject_label') && parts[i].hasOwnProperty('popup_info') && intersects[n].object.name === parts[i]["3dobject_label"]+"_0") {
                        make_popup(event, parts[i]['popup_info']);
                        return;
                    } else if (parts[i].hasOwnProperty('3dobject_label') && intersects[n].object.name === parts[i]["3dobject_label"] && parts[i].hasOwnProperty('reference')) {
                        window.open(parts[i]['reference']);
                        return;
                    }
                }
            }
        }
    }
}

function render() {
	renderer.render(scene, view.camera.camera3D);
}

function refresh() {
    view.notifyChange(true);
}



// MAIN CODE IS HERE

// Load and parse the file containing the model details
var loader = new THREE.FileLoader();
loader.load('NorthGawlerModel.json', function (text) {
					config = JSON.parse(text);
                    initialise_model(config);
				} );
                
                

exports.view = view;
exports.scene = scene;



