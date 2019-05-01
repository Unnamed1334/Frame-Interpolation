/* GLOBAL CONSTANTS AND VARIABLES */
const useExtraDebug = true;

/* assignment specific globals */
const WIN_Z = 0;  // default graphics window z coord in world space
const WIN_LEFT = 0; const WIN_RIGHT = 1;  // default left and right x coords in world space
const WIN_BOTTOM = 0; const WIN_TOP = 1;  // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog4/triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = "https://ncsucgclass.github.io/prog4/ellipsoids.json"; // spheres file loc
const defaultPictureLocation = "https://ncsucgclass.github.io/prog4/";
//var Eye = new vec4.fromValues(0.5,0.5,-0.5,1.0); // default eye position in world space. Currenty unused.

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var vertexBuffer; // this contains vertex coordinates in triples
var colorBuffer;
var triangleBuffer; // this contains indices into vertexBuffer in triples
var triBufferSize; // the number of indices in the triangle buffer
var vertexPositionAttrib; // where to put position for vertex shader
var vertexNormalAttrib; // where to put normals for vertex shader

var textureLocation;

var modelLocation;
var MaterialAmbient;
var MaterialDiffuse;
var MaterialSpecular;
var MaterialTransparency;

var ModulationType;

// CLASSES

// World broad object for managing the world and its scripts
class World {
    constructor() {

    }

    ToString() {
        return "Color(r: " + this.r + " g: " + this.g + " b: " + this.b + " a: " + this.a + ")";
    }
}

// An object as it is represented in the world
class WorldObject {
    constructor() {
        this.active = true;
        // Transform
        this.position = vec3.fromValues(0,0,0);
        // Eular Angles
        this.rotation = vec3.fromValues(0,0,0);
        this.scale = vec3.fromValues(1,1,1);

        // Instead of remaking the matrix every time it is needed, 
        // create the matrix as needed and store if it needs to be remade (is dirty)
        
        /* // The matrix that stores just the transform matrix of this object.
        // Might be pointless to store, will almost always need the hierarchy matrix.
        // Only saves time remaking the transform matrix.
        // (so once per object, per frame, in the worst case (moving every root object))
        // And the transform matrix is fairly quick to create compared to the multiply
        this.dirtyTransform = true;
        this.transformMatrix = mat4.create(); */
        // Stores the matrix that is used for rendering this object
        this.dirtyHierarchy = true;
        this.hierarchyMatrix = mat4.create();

        // children and parent
        // Allows for nested transforms
        this.children = [];
        this.parent = null;

        // Compenents
        this.components = [];

        this.mesh = null;
    }
    
    Destruct() {

    }

    GetPosition() {
        var position = vec3.fromValues(0,0,0);
        vec3.transformMat4(position, position, this.GetMatrix());
        return position;
    }

    SetPosition(newPosition) {
        this.position = newPosition;
        this.MakeDirty();
    }

    Move(movement) {
        vec3.add(this.position, this.position, movement);
        this.MakeDirty();
    }

    GetEularRotation() {
        return vec3.clone(this.rotation);
    }

    GetQuaternionRotation() {
        return quat.fromEuler(quat.create(), this.rotation[0], this.rotation[1], this.rotation[2]);
    }

    SetEularRotation(newRotation) {
        this.rotation = newRotation;
        this.MakeDirty();
    }
    
    SetQuaternionRotation(newRotation) {
        this.rotation = QuaternionToEulerAngles(newRotation);
        this.MakeDirty();
    }

    GetScale() {
        return this.scale;
    }

    SetScale(newScale) {
        this.scale = newScale;
        this.MakeDirty();
    }

    Scale(newScale) {
        vec3.multiply(this.scale, this.scale, newScale);
        this.MakeDirty();
    }

    SetParent(newParent) {
        this.parent = newParent;
        newParent.children.push(this);
        this.MakeDirty();
    }

    MakeDirty() {
        this.dirtyHierarchy = true;
        for(var i = 0; i < this.children.length; i++) {
            this.children[i].MakeDirty();
        }
    }

    GetAxis( inputAxis ) {
        vec3.transformMat4(inputAxis, inputAxis, this.GetMatrix());
        vec3.subtract(inputAxis, inputAxis, this.GetPosition());
        return inputAxis;
    }

    GetMatrix() {
        if(this.dirtyHierarchy) {
            // Model transformation
            /*
            // The output matrix
            var modelMatrix = mat4.create();
            // Calculate the translation
            var modelPos = vec3.fromValues(0, 0, 0);
            mat4.translate(modelMatrix, modelMatrix, modelPos)
            // Calculate the rotation
            var modelRot = mat4.create();
            var modelRotQ = quat.create();
            quat.fromEuler(modelRotQ, 0, 0, 0);
            mat4.fromQuat(modelRot, modelRotQ)
            mat4.multiply(modelMatrix, modelMatrix, modelRot)
            // Calculate the rotation
            var modelScale = vec3.fromValues(1, 1, 1);
            mat4.scale(modelMatrix, modelMatrix, modelScale)
            */
            // With that said, mat4.fromRotationTranslationScale is faster and easier to use
            var modelRotQ = quat.create();
            quat.fromEuler(modelRotQ, this.rotation[0], this.rotation[1], this.rotation[2]);
            // var modelMatrix = mat4.create();
            mat4.fromRotationTranslationScale(this.hierarchyMatrix, modelRotQ, this.position, this.scale);
            // Get the parent if it exists
            if(this.parent != null) {
                mat4.multiply(this.hierarchyMatrix, this.parent.GetMatrix(), this.hierarchyMatrix);
                //mat4.multiply(this.hierarchyMatrix, this.hierarchyMatrix, this.parent.GetMatrix());
            }
            // matrix is clean
            this.dirtyHierarchy = false;
        }
        return this.hierarchyMatrix;
    }

    GetMesh() {
        return this.mesh;
    }

    SetMesh(newMesh) {
        this.mesh = newMesh;
        newMesh.worldobject = this;
    }

    AddComponent(newComponent) {
        this.components.push(newComponent);
        newComponent.worldobject = this;
    }

    
}


// Variables to store delta time
var time = 0;
var deltaFrameTime;
var lastStartTime = new Date();
var averageFPS = 1;

// A generalized holder for a script
var componentList = [];
class Component {
    constructor(worldobject) {
        if(worldobject == undefined) {
            throw "invalid world object";
        }
        this.worldobject = worldobject;
        this.Create = null;
        this.Update = null;

        componentList.push(this);
    }

    static UpdateComponents() {
        // Render frame setup
        var startTime = new Date();
        deltaFrameTime = (startTime - lastStartTime) / 1000;
        if(deltaFrameTime > .1) {
            deltaFrameTime = .1;
        }
        //console.log(deltaFrameTime);
        lastStartTime = startTime;

        for(var i = 0; i < componentList.length; i++) {
            if(componentList[i].Update != null && componentList[i].worldobject.active) {
                
                componentList[i].Update();
            }
        }
    }
}

var colliderList = [];
class SphereCollider {
    constructor(worldobject, radius) {
        this.worldobject = worldobject;

        this.radius = radius;
        // List of callbacks for when this object collides with another object.
        this.OnCollision = [];

        colliderList.push(this);
    }

    CheckCollision() {
        //console.log(this);
        if(this.worldobject.active && this.OnCollision.length > 0) {
            for(var i = 0; i < colliderList.length; i++) {
                if(colliderList[i] != this && colliderList[i].worldobject.active) {
                    var r2 = this.radius + colliderList[i].radius;
                    r2 = r2 * r2;
                    //console.log(vec3.squaredDistance(this.worldobject.position, colliderList[i].worldobject.position) +"<="+ r2);
                    if(vec3.squaredDistance(this.worldobject.position, colliderList[i].worldobject.position) <= r2) {
                        //console.log("collision");
                        this.CallOnCollision(colliderList[i]);
                    }
                }
            }
        }
    }

    CallOnCollision(otherCollider) {
        for(var i = 0; i < this.OnCollision.length; i++) {
            //console.log(this);
            this.OnCollision[i].call(this, otherCollider);
        }
    }
}

class Material {
    constructor(ambient, diffuse, specular, n, transparent, alpha, textureURL) {
        this.ambient = ambient;
        this.diffuse = diffuse;
        this.specular = specular;
        this.n = n;

        this.transparent = (transparent) ? transparent : false;
        this.alpha = alpha;
        // console.log(transparent);
        // console.log(this.transparent);
        if(textureURL) {
            // Temp Texture
            // Creating the temporary texture addapted from:
            // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
            // Create a new empty texture
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            // Define the image values
            const level = 0;
            const internalFormat = gl.RGBA;
            const width = 1;
            const height = 1;
            const border = 0;
            const srcFormat = gl.RGBA;
            const srcType = gl.UNSIGNED_BYTE;
            const pixel = new Uint8Array([255, 0, 255, 255]);  // opaque Magenta
            // Put the texture in the image
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                          width, height, border, srcFormat, srcType,
                          pixel);

            // Load the real image
            var newImage = new Image(); 
            newImage.crossOrigin = "Anonymous";
            var target = this;
            newImage.onload = function() {
                // /*
                gl.bindTexture(gl.TEXTURE_2D, target.texture);
                gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                              srcFormat, srcType, newImage);
                // Set up the texture atributes
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                //*/
            } // end onload callback
            newImage.src = textureURL;
        }
        // Make all objects use a texture by providing a default texture.
        else {
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            // Define the image values
            const level = 0;
            const internalFormat = gl.RGBA;
            const width = 1;
            const height = 1;
            const border = 0;
            const srcFormat = gl.RGBA;
            const srcType = gl.UNSIGNED_BYTE;
            const pixel = new Uint8Array([255, 255, 255, 255]);  // opaque white
            // Put the texture in the image
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                          width, height, border, srcFormat, srcType,
                          pixel);
            console.log("No Texture");
        }

        this.type = 1;
    }

    
    GetPosition() {
        return this.position;
    }
    
    static FromJsonObject(jsonObject) {
        return new Material(jsonObject.ambient, jsonObject.diffuse, jsonObject.specular, jsonObject.n, (jsonObject.alpha < 1), jsonObject.alpha, jsonObject.texture);
    }
}

// Object for holding data related to a mesh.
var meshList = [];
class Mesh {
    
    constructor(worldobject, material, vertices, normals, triangles, uvs) {
        this.worldobject = worldobject;
        this.material = material;
        this.vertices = vertices;
        this.normals = normals;
        this.triangles = triangles;
        this.uvs = uvs;

        if(worldobject != null && material != null) {
            meshList.push(this);
        }
    }

    // Create a mesh from a list of meshes
    // All will have the same material
    static FromMergedMesh(worldobject, mat, meshArray) {
        var vertArray = [];
        var normArray = [];
        var uVArray = [];
        var triangles = [];
        for(var i = 0; i < meshArray.length; i++) {
            if(meshArray[i] != null) {
                var startVertIdx = vertArray.length / 3;
                var startTriangleIdx = triangles.length;
                // Concat the array
                vertArray = vertArray.concat(meshArray[i].vertices);
                normArray = normArray.concat(meshArray[i].normals);
                uVArray = uVArray.concat(meshArray[i].uvs);
                triangles = triangles.concat(meshArray[i].triangles);

                // Adjust the triangle idx to match the new mesh
                for(var t = startTriangleIdx;  t < triangles.length; t++) {
                    triangles[t] += startVertIdx;
                }
            }
        }
        return new Mesh(worldobject, mat, vertArray, normArray, triangles, uVArray);
    }

    SoftCopy() {
        return new Mesh(this.worldobject, this.material, this.vertices,this.normals, this.triangles, this.uvs);
    }

    //
    static FromJsonObject(worldobject, jsonObject) {
        var mat = Material.FromJsonObject(jsonObject.material);
        var vert = [];
        for(var i = 0; i < jsonObject.vertices.length; i++) {
            vert.push(jsonObject.vertices[i][0]);
            vert.push(jsonObject.vertices[i][1]);
            vert.push(jsonObject.vertices[i][2]);
        } 
        var norm = [];
        for(var i = 0; i < jsonObject.normals.length; i++) {
            norm.push(jsonObject.normals[i][0]);
            norm.push(jsonObject.normals[i][1]);
            norm.push(jsonObject.normals[i][2]);
        } 
        var tri = [];
        for(var i = 0; i < jsonObject.triangles.length; i++) {
            tri.push(jsonObject.triangles[i][0]);
            tri.push(jsonObject.triangles[i][1]);
            tri.push(jsonObject.triangles[i][2]);
        }
        var uv = [];
        for(var i = 0; i < jsonObject.uvs.length; i++) {
            uv.push(jsonObject.uvs[i][0]);
            uv.push(1 - jsonObject.uvs[i][1]);
        }
        // console.log(vert);
        // console.log(norm);
        // console.log(tri);
        return new Mesh(worldobject, mat, vert, norm, tri, uv);
    }
}

// A generalized holder for the input manager
class Input {
    constructor() {
        if(!Input.instance) {
            // Create the instance

            // Object storing all recieved inputs
            this.inputs = {};

            this.mousePosition = vec2.fromValues(0,0);

            this.lockedMouse = false;
            this.mouseMovement = vec2.fromValues(0,0);

            // Set up the document for registering inputs
            /* Function for disabling the right click menu
            document.addEventListener( "contextmenu", function (e) {e.preventDefault()}, false );
            */
            document.onkeydown = function ( e ) {
                // e.preventDefault();
                var name = "Key" + e.keyCode;
                if(!Input.instance.inputs[name]) {
                    Input.instance.inputs[name] = {down: false, pressed: false, up: false, magnitude: 0};
                }
                Input.instance.inputs[name].down = true;
                Input.instance.inputs[name].pressed = true;
            };
            document.onkeyup = function ( e ) {
                // e.preventDefault();
                var name = "Key" + e.keyCode;
                if(!Input.instance.inputs[name]) {
                    Input.instance.inputs[name] = {down: false, pressed: false, up: false, magnitude: 0};
                }
                Input.instance.inputs[name].up = true;
                Input.instance.inputs[name].pressed = false;
            };
            // Mouse Input
            document.onmousemove = function ( e ) {
                // TODO: store the canvas in a better position
                // If the mouse is unlocked we only care about position
                if(Input.instance.lockedMouse == false) {
                    // Simple method for getting the real mouse position relative to the canvas
                    // Fails on IE.
                    let canvas = document.getElementById("myWebGLCanvas");
                    var xPos = event.pageX - canvas.getBoundingClientRect().left - window.scrollX;
                    var yPos = event.pageY - canvas.getBoundingClientRect().top - window.scrollY;
                    vec2.set(Input.instance.mousePosition, xPos, yPos);
                }
                // Only store the movement
                else {
                    // Flipping the y values to better match world coordinates
                    Input.instance.mouseMovement = vec2.fromValues(e.movementX, -e.movementY);
                }
            };
            document.onmousedown = function ( e ) {
                // e.preventDefault();
                var name = "Mouse" + e.button;
                if(!Input.instance.inputs[name]) {
                    Input.instance.inputs[name] = {down: false, pressed: false, up: false, magnitude: 0};
                }
                Input.instance.inputs[name].down = true;
                Input.instance.inputs[name].pressed = true;
            };
            document.onmouseup = function ( e ) {
                // e.preventDefault();
                var name = "Mouse" + e.button;
                if(!Input.instance.inputs[name]) {
                    Input.instance.inputs[name] = {down: false, pressed: false, up: false, magnitude: 0};
                }
                Input.instance.inputs[name].up = true;
                Input.instance.inputs[name].pressed = false;
            };
            // document.onmouseenter;

            // Detect if the lock state changes.
            document.addEventListener('pointerlockchange', Input.LockStateChange, false);
            document.addEventListener('mozpointerlockchange', Input.LockStateChange, false);

            // Store the instance
            Input.instance = this;
        }
        return Input.instance;
    }

    // Clear any inputs that recieved a down or up event.
    static CleanInputs()  {
        Input.instance.mouseMovement = vec2.fromValues(0,0);

        var values = Input.instance.inputs;
        for(var key in values) {
            Input.instance.inputs[key].up = false;
            Input.instance.inputs[key].down = false;
        }
    }

    // The is the generalized input function that deals with
    // getting both keyboard buttons and mouse buttons.
    // This makes keybinding much easier to deal with.
    static InputUp( inputId ) {
        if(!Input.instance) {
            console.error("The Input Object has not been created but someone is trying to access it!");
            return false;
        }
        // Button was never pressed
        if(!Input.instance.inputs[inputId]) {
            return false;
        }
        return Input.instance.inputs[inputId].up;
    }

    static InputDown( inputId ) {
        if(!Input.instance) {
            console.error("The Input Object has not been created but someone is trying to access it!");
            return false;
        }
        // Button was never pressed
        if(!Input.instance.inputs[inputId]) {
            return false;
        }
        return Input.instance.inputs[inputId].down;
    }

    static InputPressed( inputId ) {
        if(!Input.instance) {
            console.error("The Input Object has not been created but someone is trying to access it!");
            return false;
        }
        // Button was never pressed
        if(!Input.instance.inputs[inputId]) {
            return false;
        }
        return Input.instance.inputs[inputId].pressed;
    }

    static MouseLocked() {
        if(!Input.instance) {
            console.error("The Input Object has not been created but someone is trying to access it!");
            return false;
        }
        return Input.instance.lockedMouse;
    }

    static LockMouse() {
        if(!Input.instance) {
            console.error("The Input Object has not been created but someone is trying to access it!");
            return false;
        }
        let canvas = document.getElementById("myWebGLCanvas");
        canvas.requestPointerLock();
    }

    static LockStateChange() {
        if(!Input.instance) {
            console.error("The Input Object has not been created but someone is trying to access it!");
            return false;
        }
        let canvas = document.getElementById("myWebGLCanvas");
        if(document.pointerLockElement == canvas || document.mozPointerLockElement === canvas) {
            Input.instance.lockedMouse = true;
        }
        else {
            Input.instance.lockedMouse = false;
        }
    }
}
// Make the instance
const input = new Input();

// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response); 
        } // end if good params
    } // end try    
    
    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get input spheres

// Helper function addapted from:
// https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
// Convert a quaternion to Eular angles
// Input is a GLMatrix quat; Output is a new vec3
function QuaternionToEulerAngles(q) {
    // Simple conversion
    var x = q[0];
    var y = q[1];
    var z = q[2];
    var w = q[3];
    // The algorithum
    var t0 = 2.0 * (w * x + y * z);
    var t1 = 1.0 - 2.0 * (x * x + y * y);
    var X = Math.atan2(t0, t1);
  
    var t2 = 2.0 * (w * y - z * x);
      if(t2 > 1.0) {
      t2 = 1.0;
    } else if(t2 < -1.0){
        t2 = -1.0;
    }
    var Y = Math.asin(t2);
  
    var t3 = 2.0 * (w * z + x * y);
    var t4 = 1.0 - 2.0 * (y * y + z * z);
    var Z = Math.atan2(t3, t4);
  
    return vec3.fromValues(180 / Math.PI * X, 180 / Math.PI * Y, 180 / Math.PI * Z);
}

// Gets a random point on the surface of the mesh
// Currently does not take into account the size of the triangles
function GetRandomSurfaceLocation(mesh) {
    var triangleIdx = Math.floor(Math.random() * (mesh.triangles.length / 3));
    i = 3 * triangleIdx;
    //console.log(i);
    //console.log("meshe: " + m + " tri: " + i / 3);
    // Store the variables
    var aIdx = mesh.triangles[i];
    var bIdx = mesh.triangles[i+1];
    var cIdx = mesh.triangles[i+2];
    // var vertex1 = meshes[m].vertices[aIdx];
    var vertex1 = vec3.fromValues(mesh.vertices[3 * aIdx], mesh.vertices[3 * aIdx + 1], mesh.vertices[3 * aIdx + 2]);
    vec3.transformMat4(vertex1, vertex1, mesh.worldobject.GetMatrix());
    //console.log(vertex1);
    // var vertex2 = meshes[m].vertices[bIdx];
    var vertex2 = vec3.fromValues(mesh.vertices[3 * bIdx], mesh.vertices[3 * bIdx + 1], mesh.vertices[3 * bIdx + 2]);
    vec3.transformMat4(vertex2, vertex2, mesh.worldobject.GetMatrix());
    //console.log(vertex2);
    // var vertex3 = meshes[m].vertices[cIdx];
    var vertex3 = vec3.fromValues(mesh.vertices[3 * cIdx], mesh.vertices[3 * cIdx + 1], mesh.vertices[3 * cIdx + 2]);
    vec3.transformMat4(vertex3, vertex3, mesh.worldobject.GetMatrix());
    //console.log(vertex3);

    // Find the point that the ray hits the plane
    // var normalVect = Vector3.Cross(vertex2.Minus(vertex1), vertex3.Minus(vertex1)).Normalised();
    var vec32 = vec3.create();
    vec3.subtract(vec32, vertex3, vertex2);
    var vec31 = vec3.create();
    vec3.subtract(vec31, vertex3, vertex1);
    var normalVect = vec3.create();
    vec3.cross(normalVect, vec31, vec32);
    vec3.normalize(normalVect, normalVect);

    //Find a random point
    var a = Math.random();
    var b = Math.random();
    var c = Math.random();
    var l = a + b + c;
    a = a / l;
    b = b / l;
    c = c / l;

    vec3.scale(vertex1, vertex1, a);
    vec3.scale(vertex2, vertex2, b);
    vec3.scale(vertex3, vertex3, c);
    vec3.add(vertex1, vertex1, vertex2);
    vec3.add(vertex1, vertex1, vertex3);

    return {position: vertex1, normal: normalVect}
}

// Preform a raycast against a array of meshes.
function Raycast(rayStart, rayForward, meshes, ignoreInactive) {
    vec3.normalize(rayForward, rayForward);
    //console.log("Ray Direction: " + rayForward);

    var currentPoly = null;
    var depth = -1; // should never be negative. That would be behind the start.

    //console.log(meshes);
    for(var m = 0; m < meshes.length; m++) {
        if(ignoreInactive == false || (meshes[m].worldobject != undefined && meshes[m].worldobject.active)) {
            for(var i = 0; i < meshes[m].triangles.length; i += 3) {
                //console.log("meshe: " + m + " tri: " + i / 3);
                // Store the variables
                var aIdx = meshes[m].triangles[i];
                var bIdx = meshes[m].triangles[i+1];
                var cIdx = meshes[m].triangles[i+2];
                // var vertex1 = meshes[m].vertices[aIdx];
                var vertex1 = vec3.fromValues(meshes[m].vertices[3 * aIdx], meshes[m].vertices[3 * aIdx + 1], meshes[m].vertices[3 * aIdx + 2]);
                vec3.transformMat4(vertex1, vertex1, meshes[m].worldobject.GetMatrix());
                // var vertex2 = meshes[m].vertices[bIdx];
                var vertex2 = vec3.fromValues(meshes[m].vertices[3 * bIdx], meshes[m].vertices[3 * bIdx + 1], meshes[m].vertices[3 * bIdx + 2]);
                vec3.transformMat4(vertex2, vertex2, meshes[m].worldobject.GetMatrix());
                // var vertex3 = meshes[m].vertices[cIdx];
                var vertex3 = vec3.fromValues(meshes[m].vertices[3 * cIdx], meshes[m].vertices[3 * cIdx + 1], meshes[m].vertices[3 * cIdx + 2]);
                vec3.transformMat4(vertex3, vertex3, meshes[m].worldobject.GetMatrix());

                // Find the point that the ray hits the plane
                // var normalVect = Vector3.Cross(vertex2.Minus(vertex1), vertex3.Minus(vertex1)).Normalised();
                var vec32 = vec3.create();
                vec3.subtract(vec32, vertex3, vertex2);
                var vec31 = vec3.create();
                vec3.subtract(vec31, vertex3, vertex1);
                var normalVect = vec3.create();
                vec3.cross(normalVect, vec31, vec32);
                vec3.normalize(normalVect, normalVect);
                
                //console.log(vertex3);
                //console.log(vertex2);
                //console.log(vec32);
                //console.log(vec31);
                //console.log(normalVect);
                // Code to ensure the normal always faces the camera.
                //if(Vector3.Dot(normalVect, cameraPosition.Minus(vertex1)) > 0) {
                //    normalVect = normalVect.Scale(-1);
                //}
                // the distance from the plane to the point is the vector between any point on the plane projected onto the normal vector.
                //var distance = Vector3.Dot(cameraPosition.Minus(vertex1), normalVect);
                var displacement = vec3.create();
                vec3.subtract(displacement, rayStart, vertex1);
                var distance = vec3.dot(displacement, normalVect);
                // the normal vector dotted with the normalized ray gives a divisor for the ray length. AKA distance / (ray o norm) * ray = point
                //var point = rayForward.Scale(-distance / Vector3.Dot(rayForward, normalVect)).Plus(cameraPosition);
                var point = vec3.clone(rayForward);
                vec3.scale( point, point, -distance / vec3.dot(rayForward, normalVect) );
                vec3.add(point, point, rayStart)


                //console.log("idx: " + i + ", " + point.ToString());
                //console.log("Forward: "+rayForward);
                //console.log(vec3.dot(rayForward, normalVect));
                //console.log(point);
                if(vec3.dot(rayForward, normalVect) < -.0001) {
                    //console.log("alligned");
                    /*
                    // simpler code for checking for overlap:
                    // given vertexes have to be transformed to be in local space of the camera with x and y modified by depth (takes <1ms)
                    // Gives if a hit occured but does not give the correct position.
                    // Useful for checking for shadows.
                    // solve for the system: (ix, iy) = a * (x1, y1) + b * (x2, y2) + c * (x3, y3), x + y + z = 1, for a, b, c.
                    // ( Has a very small issue with compounding error. Only effects huge triangles but does exist. )
                    var c = ((iy - y1) * (x2 - x1) - (y2 - y1) * (ix - x1)) / ((y3 - y1) * (x2 - x1) - (y2 - y1) * (x3 - x1));
                    var b = (ix - x1 - (x3-x1) * c) / (x2 - x1);
                    var a = 1 - b - c;
                    */
                    var hitloc = getHitLocation(point, vertex1, vertex2, vertex3, vec3.clone(normalVect));
                    var a = hitloc[0];
                    var b = hitloc[1];
                    var c = hitloc[2];
                    // Did we hit?
                    //if(Math.abs(1 - a - b - c) > .1) {
                    //    console.error("Components do not sum to 1: " + hitloc);
                        //console.log(point);
                    //}
                    if(Math.abs(1 - a - b - c) < .1 && a >= 0 && a <= 1 && b >= 0 && b <= 1 && c >= 0 && c <= 1 ) {
                        //console.log("hit");
                        // calculate the depth using know values
                        //var newDepth = Vector3.Dot(cameraForward, vertex1.Scale(a).Plus(vertex2.Scale(b)).Plus(vertex3.Scale(c)).Minus(cameraPosition));
                        // Reuse the old vertex position.
                        // Not used later anyway
                        //console.log("v1: " + vertex1 + "\nv2: " + vertex2 + "\nv3: " + vertex3);
                        vec3.scale(vertex1, vertex1, a);
                        vec3.scale(vertex2, vertex2, b);
                        vec3.scale(vertex3, vertex3, c);
                        vec3.add(vertex1, vertex1, vertex2);
                        vec3.add(vertex1, vertex1, vertex3);
                        var hitPosition = vec3.clone(vertex1);
                        vec3.subtract(vertex1, vertex1, rayStart)
                        //console.log(vertex1);
                        var newDepth = vec3.dot(vertex1, rayForward);
                        //console.log("Hit Displacement: " + vertex1);
                        //console.log("Forward: " + rayForward);
                        //console.log("Depth: " + newDepth);
                        //var newDepth = a * vertexes[aIdx].z + b * vertexes[bIdx].z + c * vertexes[cIdx].z;
                        if(newDepth > 0 && (depth == -1 || newDepth < depth) ) {
                            // console.log(depth + ", " + newDepth);
                            currentPoly = {mesh: meshes[m], position: hitPosition, distance: newDepth, normal: normalVect};
                            depth = newDepth;
                        }
                    }
                }
            }
        }
    }
    return currentPoly;
}

function getHitLocation(p, v1, v2, v3, n) {
    //console.log(v1.ToString());
    //console.log(v2.ToString());
    //console.log(v3.ToString());
    // Calculate the position
    var a = -1;
    var b = -1;
    var c = -1;

    // Calculate a
    //var aVect = Vector3.Cross(v2.Minus(v3), n).Normalised();
    var aVect = vec3.create();
    vec3.subtract(aVect, v2, v3);
    vec3.cross(aVect, aVect, n);
    vec3.normalize(aVect, aVect);
    // ensure double sided tris
    //if(Vector3.Dot(v1.Minus(v3), aVect) < 0) {
    //    aVect = aVect.Scale(-1);
    //}
    //var aTotal = Vector3.Dot(v1.Minus(v3), aVect);
    var vec13 = vec3.create();
    vec3.subtract(vec13, v1, v3);
    var aTotal = vec3.dot(vec13, aVect);
    
    //var aPart = Vector3.Dot(p.Minus(v3), aVect);
    var vecp3 = vec3.create();
    vec3.subtract(vecp3, p, v3);
    var aPart = vec3.dot(vecp3, aVect);
    a = aPart / aTotal;

    // Calculate b
    //var bVect = Vector3.Cross(v3.Minus(v1), n).Normalised();
    var bVect = vec3.create();
    vec3.subtract(bVect, v3, v1);
    vec3.cross(bVect, bVect, n);
    vec3.normalize(bVect, bVect);
    // ensure double sided tris
    //if(Vector3.Dot(v2.Minus(v1), bVect) < 0) {
    //    bVect = bVect.Scale(-1);
    //}
    //var bTotal = Vector3.Dot(v2.Minus(v1), bVect);
    var vec21 = vec3.create();
    vec3.subtract(vec21, v2, v1);
    var bTotal = vec3.dot(vec21, bVect);
    //var bPart = Vector3.Dot(p.Minus(v1), bVect);
    var vecp1 = vec3.create();
    vec3.subtract(vecp1, p, v1);
    var bPart = vec3.dot(vecp1, bVect);
    b = bPart / bTotal;

    // Calculate c
    //var cVect = Vector3.Cross(v1.Minus(v2), n).Normalised();
    var cVect = vec3.create();
    vec3.subtract(cVect, v1, v2);
    vec3.cross(cVect, cVect, n);
    vec3.normalize(cVect, cVect);
    // ensure double sided tris
    //if(Vector3.Dot(v3.Minus(v2), cVect) < 0) {
    //    cVect = cVect.Scale(-1);
    //}
    //var cTotal = Vector3.Dot(v3.Minus(v2), cVect);
    var vec32 = vec3.create();
    vec3.subtract(vec32, v3, v2);
    var cTotal = vec3.dot(vec32, cVect);
    //var cPart = Vector3.Dot(p.Minus(v2), cVect);
    var vecp2 = vec3.create();
    vec3.subtract(vecp2, p, v2);
    var cPart = vec3.dot(vecp2, cVect);
    c = cPart / cTotal;

    /*
    console.log("Location: \n" +
    aPart + "/" + aTotal + "=" + a + "\n" +
    bPart + "/" + bTotal + "=" + b + "\n" +
    cPart + "/" + cTotal + "=" + c + "\n"
    );
    */

    return [a, b, c];
}

// set up the webGL environment
var debugText;
function setupWebGL() {

    // Load the debug output
    debugText = document.getElementById("debugText");

    // Get the canvas and context
    var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    var cw = canvas.width, ch = canvas.height;
    gl = canvas.getContext("webgl"); // get a webgl object from it
    
    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(1.0, 1.0, 1.0, 1.0); // use gray when we clear the frame buffer
        //gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
        // Don't render back faces
        //gl.enable(gl.CULL_FACE);
        //gl.cullFace(gl.BACK);
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

// Create the camera
var camera = new WorldObject();
camera.SetPosition(vec3.fromValues(.5,.5,-.5));
camera.SetEularRotation(vec3.fromValues(0,0,0));

// Load the rest of the objects
var objectArray = []; // 1D array of worldObjects
var world;
var accesableMeshData;
var reprojectionPlane;
var reprojectionPlaneMesh;

var interpolation = 1;
function loadTriangles() {
    // ----- Load the static meshes. Used to render the room. (Hardcode?)
    // There are 16 potential tiles UDLR + ceiling and floor. 5 base meshes.
    // Alternately just treat each case as a different object in a room. add whatever it needed.
    var roomTiles = [];
    // floor
    roomTiles[0]= new Mesh( null, null, 
        /*verts   */[-.5, -.5, -.5, -.5, -.5, .5, .5, -.5, -.5, .5, -.5, .5],
        /*normal  */[0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        /*triangle*/[0, 1, 2, 3, 2, 1],
        /*verts   */[0, 0, 0, 1, 1, 0, 1, 1]);
    // ceiling
    roomTiles[1]= new Mesh( null, null, 
        /*verts   */[-.5, .5, -.5, -.5, .5, .5, .5, .5, -.5, .5, .5, .5],
        /*normal  */[0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
        /*triangle*/[2, 1, 0, 1, 2, 3],
        /*verts   */[0, 0, 0, 1, 1, 0, 1, 1]);
    // X plus
    roomTiles[2]= new Mesh( null, null, 
        /*verts   */[.5, .5, .5, .5, .5, -.5, .5, -.5, .5, .5, -.5, -.5],
        /*normal  */[-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0],
        /*triangle*/[0, 1, 2, 3, 2, 1],
        /*verts   */[0, 0, 0, 1, 1, 0, 1, 1]);
    // X minus
    roomTiles[3]= new Mesh( null, null, 
        /*verts   */[-.5, .5, .5, -.5, .5, -.5, -.5, -.5, .5, -.5, -.5, -.5],
        /*normal  */[1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
        /*triangle*/[2, 1, 0, 1, 2, 3],
        /*verts   */[0, 0, 0, 1, 1, 0, 1, 1]);
    // Z plus
    roomTiles[4]= new Mesh( null, null, 
        /*verts   */[.5, .5, .5, .5, -.5, .5, -.5, .5, .5, -.5, -.5, .5],
        /*normal  */[0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
        /*triangle*/[0, 1, 2, 3, 2, 1],
        /*verts   */[0, 0, 0, 1, 1, 0, 1, 1]);
    // Z minus
    roomTiles[5]= new Mesh( null, null, 
        /*verts   */[.5, .5, -.5, .5, -.5, -.5, -.5, .5, -.5, -.5, -.5, -.5],
        /*normal  */[0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        /*triangle*/[2, 1, 0, 1, 2, 3],
        /*verts   */[0, 0, 0, 1, 1, 0, 1, 1]);


    // ----- Load the spheres. store each in a seperate object? duplicate as needed?
    // Load the static sphere
    var spheresMesh = JSON.parse(sphereJson);
    // Create the spheres
    var spheresURL = "https://ncsucg4games.github.io/prog2/spheres.json";
    var sphereInput = getJSONFile(spheresURL, "spheres");

    // ----- Load the triangles. store each in a seperate object? duplicate as needed?
    var trianlesURL = "https://ncsucg4games.github.io/prog2/triangles.json";
    var triangleInput = getJSONFile(trianlesURL, "triangles");
    // fix the url
    for(var i = 0; i < triangleInput.length; i++) {
        var o = triangleInput[i];
        if(o.material.texture != false) {
            o.material.texture = "https://ncsucg4games.github.io/prog2/" + o.material.texture;
        }
    }

    // ----- Load the rooms
    var roomURL = "https://ncsucg4games.github.io/prog2/rooms.json";
    //var roomInput = getJSONFile(roomURL, "room");
    var roomInput = JSON.parse(`
    {
        "rooms": [["s", "s", "s", "s", "s", "s", "s", "s", "s", "s", "s", "s", "s"],
                  ["s",  0,   0,   0,   0,   0,  "s",  1,   1,   1,   1,   1,  "s"],
                  ["s",  0,   0,   0,   0,   0,  "p",  1,   1,   1,   1,   1,  "s"],
                  ["s",  0,   0,   0,   0,   0,  "s",  1,   1,   1,   1,   1,  "s"],
                  ["s",  0,   0,   0,   0,   0,  "p",  1,   1,   1,   1,   1,  "s"],
                  ["s",  0,   0,   0,   0,   0,  "s",  1,   1,   1,   1,   1,  "s"],
                  ["s", "s", "s",  3, "s", "s", "s", "s", "s",   3, "s", "s",  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s",  3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,  "s"],
                  ["s","s",   3, "s",   3, "s",   3, "s",   3, "s",   3, "s",  "s"],
                  ["s",  2,   2,   2,   2,   2,   2,   2,   2,   2,   2,   2,  "s"],
                  ["s", "s", "s", "s", "s", "s", "s", "s", "s", "s", "s", "s", "s"]],
        "furniture": []
    }
    `);
    console.log(roomInput);

    // Make a list of rooms
    var room = [];
    var portals = [];
    for(var roomZ = 0; roomZ < roomInput.rooms.length; roomZ++) {
        for(var roomX = 0; roomX < roomInput.rooms[roomZ].length; roomX++) {
            var celldata = roomInput.rooms[roomZ][roomX];
            if(typeof celldata == "number") {
                if(room[celldata] == undefined) {
                    room[celldata] = {cells:[], center: [0,0,0], start: [-1,0,-1], cellcount: 0, furniture: []};
                }
                var submeshList = [];
                // update the start cell
                if(room[celldata].start[0] == -1 || roomX < room[celldata].start[0]) {
                    room[celldata].start[0] = roomX;
                }
                if(room[celldata].start[2] == -1 || roomZ < room[celldata].start[2]) {
                    room[celldata].start[2] = roomZ;
                }
                // update the center
                room[celldata].center[0] += roomX;
                room[celldata].center[2] += roomZ;
                room[celldata].cellcount += 1;
                // Make the mesh
                submeshList.push(roomTiles[0]);
                submeshList.push(roomTiles[1]);
                if(roomX + 1 < roomInput.rooms[roomZ].length && roomInput.rooms[roomZ][roomX + 1] == "s") {
                   submeshList.push(roomTiles[2]);
                }
                if(roomX - 1 >= 0 && roomInput.rooms[roomZ][roomX - 1] == "s") {
                    submeshList.push(roomTiles[3]);
                }
                if(roomZ + 1 < roomInput.rooms.length && roomInput.rooms[roomZ + 1][roomX] == "s") {
                    submeshList.push(roomTiles[4]);
                }
                if(roomZ - 1 >= 0 && roomInput.rooms[roomZ - 1][roomX] == "s") {
                    submeshList.push(roomTiles[5]);
                }
                var newRoom = createRoom(roomX, roomZ, new WorldObject(), submeshList, "https://ncsucg4games.github.io/prog2/rocktile.jpg");
                //newRoom.checked = false;
                // Add the sphere to the list
                objectArray.push(newRoom);
                room[celldata].cells.push(newRoom);
            }
            // Portals tell both connected rooms to render. (one room will automatically be skipped)
            if(celldata == "p") {
                // create the portal
                var newRoom = new WorldObject();
                portals.push({location: [roomX, roomZ], worldObject: newRoom})
                var connectedRooms = [];
                var submeshList = [];
                submeshList.push(roomTiles[0]);
                submeshList.push(roomTiles[1]);
                if(roomX + 1 < roomInput.rooms[roomZ].length) {
                    if(roomInput.rooms[roomZ][roomX + 1] == "s") {
                        submeshList.push(roomTiles[2]);
                    }
                    if(typeof roomInput.rooms[roomZ][roomX + 1] == "number") {
                        connectedRooms.push(roomInput.rooms[roomZ][roomX + 1]);
                        room[roomInput.rooms[roomZ][roomX + 1]].cells.push(newRoom);
                    }
                }
                if(roomX - 1 >= 0) {
                    if(roomInput.rooms[roomZ][roomX - 1] == "s") {
                        submeshList.push(roomTiles[3]);
                    }
                    if(typeof roomInput.rooms[roomZ][roomX - 1] == "number") {
                        connectedRooms.push(roomInput.rooms[roomZ][roomX - 1]);
                        room[roomInput.rooms[roomZ][roomX - 1]].cells.push(newRoom);
                    }
                }
                if(roomZ + 1 < roomInput.rooms.length) {
                    if(roomInput.rooms[roomZ + 1][roomX] == "s") {
                        submeshList.push(roomTiles[4]);
                    }
                    if(typeof roomInput.rooms[roomZ + 1][roomX] == "number") {
                        connectedRooms.push(roomInput.rooms[roomZ + 1][roomX]);
                        room[roomInput.rooms[roomZ + 1][roomX]].cells.push(newRoom);
                    }
                }
                if(roomZ - 1 >= 0) {
                    if(roomInput.rooms[roomZ - 1][roomX] == "s") {
                        submeshList.push(roomTiles[5]);
                    }
                    if(typeof roomInput.rooms[roomZ - 1][roomX] == "number") {
                        connectedRooms.push(roomInput.rooms[roomZ - 1][roomX]);
                        room[roomInput.rooms[roomZ - 1][roomX]].cells.push(newRoom);
                    }
                }
                createRoom(roomX, roomZ, newRoom, submeshList, "https://ncsucg4games.github.io/prog2/rocktile.jpg");
                newRoom.checked = false;
                newRoom.connectedRooms = connectedRooms;
                // Add the sphere to the list
                objectArray.push(newRoom);
            }
        }
    }
    //Post room loading cleanup
    for(var i = 0; i < room.length; i++) {
        room[i].center[0] = Math.floor(room[i].center[0] / room[i].cellcount);
        room[i].center[1] = .5;
        room[i].center[2] = Math.floor(room[i].center[2] / room[i].cellcount);
    }
    //Furniture
    for(var i = 0; i < roomInput.furniture.length; i++) {
        var input = roomInput.furniture[i];
        //console.log("input");
        //console.log(input);
        if(input[3] == "sphere") {
            var o = sphereInput[input[4]];
            var sphereObject = new WorldObject();
            sphereObject.SetPosition(vec3.fromValues(o.x,o.y,o.z));
            sphereObject.Move(vec3.fromValues(input[1] + room[input[0]].start[0], 0, input[2] + room[input[0]].start[2]));
            // Hardcoded move to make the input look nicer
            sphereObject.Move(vec3.fromValues(-.5, 0, -.5));
            sphereObject.SetScale(vec3.fromValues(o.r,o.r,o.r));
            //var mat = new Material(o.ambient, o.diffuse, o.specular, o.n, (o.alpha < 1), o.alpha, (o.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + o.texture);
            var mat = new Material(o.ambient, o.diffuse, o.specular, o.n, true, 1.0, (o.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + o.texture);
            mat.alpha = 1;
            var mesh = new Mesh(sphereObject, mat, spheresMesh.verts, spheresMesh.normals, spheresMesh.indices, spheresMesh.texcoords);
            mesh.allTriangles = mesh.triangles;
            sphereObject.SetMesh(mesh);
            objectArray.push(sphereObject);
            room[input[0]].furniture.push(sphereObject);
        }
        else if(input[3] == "triangleset") {
            var o = triangleInput[input[4]];
            var trianlgeObject = new WorldObject();
            trianlgeObject.Move(vec3.fromValues(input[1], 0, input[2]));
            trianlgeObject.Move(vec3.fromValues(room[input[0]].start[0], 0, room[input[0]].start[2]));
            // Hardcoded move to make the input look nicer
            trianlgeObject.Move(vec3.fromValues(-.5, 0, -.5));
            //var mat = new Material(o.material.ambient, o.material.diffuse, o.material.specular, o.material.n, false, 1, (o.material.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + o.material.texture);
            //var mesh = new Mesh(trianlgeObject, mat, o.vertices, o.normals, o.triangles, o.uvs);
            var mesh = Mesh.FromJsonObject(trianlgeObject, o);
            mesh.allTriangles = mesh.triangles;
            mesh.material.alpha = 1;
            trianlgeObject.SetMesh(mesh);
            // Add the sphere to the list
            objectArray.push(trianlgeObject);
            room[input[0]].furniture.push(trianlgeObject);
        }
    }
    //console.log(room);
    //console.log(portals);
    
    // ----- WorldObject setup

    // Camera
    camera.SetPosition(room[0].center);

    var cameraControls = new Component(camera);
    // camera movement
    cameraControls.movespeed = 2;
    cameraControls.turnspeed = 15;
    // the collision map
    cameraControls.roomCollision = roomInput.rooms;
    cameraControls.lastroom = 0;
    // list of objects
    cameraControls.rooms = room;
    cameraControls.portals = portals;
    // do portal culling
    cameraControls.cullingType = 1;
    cameraControls.Update = function() {
        // Translate:
        // (W) Move Forward
        if(!Input.InputPressed("Key16") && Input.InputPressed("Key87")) {
            Input.LockMouse();

            var startPosition = this.worldobject.GetPosition();

            var translation = vec3.fromValues(0, 0, 1)
            translation = this.worldobject.GetAxis(translation);
            translation[1] = 0;
            vec3.normalize(translation, translation);
            vec3.scale(translation, translation, this.movespeed * deltaFrameTime)
            this.worldobject.Move(translation);
            
            var cellX1 = Math.floor(this.worldobject.GetPosition()[0] + .5 + .25);
            var cellX2 = Math.floor(this.worldobject.GetPosition()[0] + .5 - .25);
            var cellZ1 = Math.floor(this.worldobject.GetPosition()[2] + .5 + .25);
            var cellZ2 = Math.floor(this.worldobject.GetPosition()[2] + .5 - .25);
            if(this.roomCollision[cellZ1][cellX1] == "s" || this.roomCollision[cellZ1][cellX2] == "s" || 
                this.roomCollision[cellZ2][cellX1] == "s" || this.roomCollision[cellZ2][cellX2] == "s") {
                this.worldobject.SetPosition(startPosition);
            }
        }
        // (S) Move Back
        if(!Input.InputPressed("Key16") && Input.InputPressed("Key83")) {
            var startPosition = this.worldobject.GetPosition();

            var translation = vec3.fromValues(0, 0, -1)
            translation = this.worldobject.GetAxis(translation);
            translation[1] = 0;
            vec3.normalize(translation, translation);
            vec3.scale(translation, translation, this.movespeed * deltaFrameTime)
            this.worldobject.Move(translation);
            
            var cellX1 = Math.floor(this.worldobject.GetPosition()[0] + .5 + .25);
            var cellX2 = Math.floor(this.worldobject.GetPosition()[0] + .5 - .25);
            var cellZ1 = Math.floor(this.worldobject.GetPosition()[2] + .5 + .25);
            var cellZ2 = Math.floor(this.worldobject.GetPosition()[2] + .5 - .25);
            if(this.roomCollision[cellZ1][cellX1] == "s" || this.roomCollision[cellZ1][cellX2] == "s" || 
                this.roomCollision[cellZ2][cellX1] == "s" || this.roomCollision[cellZ2][cellX2] == "s") {
                this.worldobject.SetPosition(startPosition);
            }
        }
        // (a) rotate left
        if(Input.InputPressed("Key65")) {
            var startPosition = this.worldobject.GetPosition();

            var translation = vec3.fromValues(1, 0, 0)
            translation = this.worldobject.GetAxis(translation);
            translation[1] = 0;
            vec3.normalize(translation, translation);
            vec3.scale(translation, translation, this.movespeed * deltaFrameTime)
            this.worldobject.Move(translation);
            
            var cellX1 = Math.floor(this.worldobject.GetPosition()[0] + .5 + .25);
            var cellX2 = Math.floor(this.worldobject.GetPosition()[0] + .5 - .25);
            var cellZ1 = Math.floor(this.worldobject.GetPosition()[2] + .5 + .25);
            var cellZ2 = Math.floor(this.worldobject.GetPosition()[2] + .5 - .25);
            if(this.roomCollision[cellZ1][cellX1] == "s" || this.roomCollision[cellZ1][cellX2] == "s" || 
                this.roomCollision[cellZ2][cellX1] == "s" || this.roomCollision[cellZ2][cellX2] == "s") {
                this.worldobject.SetPosition(startPosition);
            }
        }
        // (d) rotate right
        if(Input.InputPressed("Key68")) {
            var startPosition = this.worldobject.GetPosition();

            var translation = vec3.fromValues(-1, 0, 0)
            translation = this.worldobject.GetAxis(translation);
            translation[1] = 0;
            vec3.normalize(translation, translation);
            vec3.scale(translation, translation, this.movespeed * deltaFrameTime)
            this.worldobject.Move(translation);
            
            var cellX1 = Math.floor(this.worldobject.GetPosition()[0] + .5 + .25);
            var cellX2 = Math.floor(this.worldobject.GetPosition()[0] + .5 - .25);
            var cellZ1 = Math.floor(this.worldobject.GetPosition()[2] + .5 + .25);
            var cellZ2 = Math.floor(this.worldobject.GetPosition()[2] + .5 - .25);
            if(this.roomCollision[cellZ1][cellX1] == "s" || this.roomCollision[cellZ1][cellX2] == "s" || 
                this.roomCollision[cellZ2][cellX1] == "s" || this.roomCollision[cellZ2][cellX2] == "s") {
                this.worldobject.SetPosition(startPosition);
            }
        }
        // Rotate:
        // (q) rotate left
        //console.log(Input.instance.inputs);
        if(Input.InputDown("Mouse0")) {
            Input.LockMouse();
        }
        if(Input.MouseLocked()) {
            var newRot = this.worldobject.GetEularRotation();
            newRot[1] = (newRot[1] - Input.instance.mouseMovement[0] * this.turnspeed * deltaFrameTime) % 360;
            newRot[0] = newRot[0] - Input.instance.mouseMovement[1] * this.turnspeed * deltaFrameTime;
            newRot[0] = Math.max(newRot[0], -70);
            newRot[0] = Math.min(newRot[0], 70);
            this.worldobject.SetEularRotation(newRot);
        }
        // Enable or disable interpolation
        if(Input.InputPressed("Key49")) {
            // disable
            interpolation = 1;
        }
        if(Input.InputPressed("Key50")) {
            // enable
            interpolation = 2;
        }
    }

    // Shinies
    var orb = new WorldObject();
    orb.SetPosition(room[3].center);
    orb.Move(vec3.fromValues(-.5, 0, -.5));
    orb.SetScale(vec3.fromValues(1,1,1));
    //var mat = new Material(o.ambient, o.diffuse, o.specular, o.n, (o.alpha < 1), o.alpha, (o.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + o.texture);
    var mat = new Material([.3,.3,.3], [.6,.6,.6], [.4,.4,.4], 1, false, 1.0, (o.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + "rocktile.jpg");
    var mesh = new Mesh(orb, mat, spheresMesh.verts, spheresMesh.normals, spheresMesh.indices, spheresMesh.texcoords);
    mesh.allTriangles = mesh.triangles;
    orb.SetMesh(mesh);
    objectArray.push(orb);
    var script = createRotateCompnent(orb);
    script.movespeed = 0;
    script.translation = 0;
    script.turnspeed = 30;
    
    var orb2 = new WorldObject();
    orb2.SetParent(orb);
    orb2.SetScale(vec3.fromValues(.25,.25,.25));
    console.log(orb2)
    //var mat = new Material(o.ambient, o.diffuse, o.specular, o.n, (o.alpha < 1), o.alpha, (o.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + o.texture);
    mat = new Material([.3,.3,.3], [.6,.6,.6], [.4,.4,.4], 1, false, 1.0, (o.texture == false) ? undefined : "https://ncsucg4games.github.io/prog2/" + "rocktile.jpg");
    mesh = new Mesh(orb2, mat, spheresMesh.verts, spheresMesh.normals, spheresMesh.indices, spheresMesh.texcoords);
    mesh.allTriangles = mesh.triangles;
    orb2.SetMesh(mesh);
    objectArray.push(orb2);
    script = createRotateCompnent(orb2);
    script.movespeed = 1;
    script.translation = .5;
    script.turnspeed = -30;
    script.center = vec3.fromValues(2, 0, 0);

    // Reprojection plane
    reprojectionPlane = new WorldObject();
    //reprojectionPlane.SetParent(camera);
    var mat = new Material([1,1,1], [0,0,0], [0,0,0], 1, false, 1.0, null);
    var mesh;
    // A more distance plane 
    var planeDistance = 5;
    var planeSize = planeDistance * Math.tan(45 / 180 * Math.PI / 2);
    mesh = new Mesh(reprojectionPlane, mat,
        /*verts   */[planeSize, planeSize, planeDistance, planeSize, -planeSize, planeDistance, -planeSize, planeSize, planeDistance, -planeSize, -planeSize, planeDistance],
        /*normal  */[0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        /*triangle*/[0, 1, 2, 1, 2, 3],
        /*verts   */[0, 1, 0, 0, 1, 1, 1, 0]);
    reprojectionPlaneMesh = mesh;
    //console.log(reprojectionPlaneMesh);

    reprojectionPlane.SetMesh(mesh);
    objectArray.push(reprojectionPlane);

    //console.log(reprojectionPlane);
} // end load triangles

function createRotateCompnent(targetWorldobject) {
    var newComponent = new Component(targetWorldobject);

    newComponent.timer = 0;
    newComponent.movespeed = 15;

    newComponent.center = targetWorldobject.GetPosition();
    newComponent.translation = 0;

    newComponent.turnspeed = 15;

    newComponent.Update = function() {
        this.timer = (this.timer + this.movespeed * deltaFrameTime) % (2 * Math.PI);

        let newPos = vec3.fromValues(this.center[0], this.center[1] + this.translation * Math.sin(this.timer), this.center[2]);
        this.worldobject.SetPosition(newPos);
        
        var newRot = this.worldobject.GetEularRotation();
        newRot[1] = (newRot[1] - this.turnspeed * deltaFrameTime) % 360;
        this.worldobject.SetEularRotation(newRot);
    }

    return newComponent;
}

function createRoom(x, y, roomObject, submeshList, textureURL) {
    roomObject.SetPosition(vec3.fromValues(x,.5,y));
    var mat = new Material([0.1,0.1,0.1], [0.6,0.6,0.6], [0.3,0.3,0.3], 9, false, 1.0, textureURL);
    mat.alpha = 1;
    var mesh = Mesh.FromMergedMesh(roomObject, mat, submeshList);
    
    mesh.allTriangles = mesh.triangles;
    roomObject.SetMesh(mesh);

    return roomObject;
}

// setup the webGL shaders
var shaderProgram;
var viewTexture;
var testColorTexture;
var depthTexture;
var normalTexture
var framebuffer;
var attachment;
var buffersExt;

var viewWidth = 512;
var viewHeight = 512;
var viewBuffer = 2;
function setupShaders() {
    // Get the used extensions
    // Might not be needed any more?
    // Used to store depth in a texture that can be manipulated.
    var depthExtension = gl.getExtension('WEBGL_depth_texture');
    if(!depthExtension) {
        console.error("WEBGL_depth_texture failed to load. Is is supported by your browser?");
    }
    
    // // Used to write floats to a texture (positions, normals, depths)
    // var floatExt = gl.getExtension('OES_texture_float');
    // if(!floatExt) {
    //     console.error("OES_texture_float failed to load. Is is supported by your browser?");
    // }
    // gl.getExtension("OES_texture_float_linear");

    // Used to write floats to a texture (positions, normals, depths)
    buffersExt = gl.getExtension('WEBGL_draw_buffers');
    if(!buffersExt) {
        console.error("WEBGL_draw_buffers failed to load. Is is supported by your browser?");
    }

    // Create the reprojection view
    // Has three outputs (color, depth, normal(If I want lighting))
    // Also has a depth buffer

    // Color
    viewTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, viewTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
        viewBuffer * viewWidth, viewBuffer * viewHeight, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Color
    testColorTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, testColorTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
        viewBuffer * viewWidth, viewBuffer * viewHeight, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // // Depth
    // depthTexture = gl.createTexture();
    // gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
    //     viewWidth, viewHeight, 0,
    //     gl.RGBA, gl.FLOAT, null);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // // Normal
    // normalTexture = gl.createTexture();
    // gl.bindTexture(gl.TEXTURE_2D, normalTexture);
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
    //     viewWidth, viewHeight, 0,
    //     gl.RGBA, gl.FLOAT, null);

    // Create and bind the framebuffer
    framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    // attach the textures
    gl.framebufferTexture2D(gl.FRAMEBUFFER, buffersExt.COLOR_ATTACHMENT0_WEBGL, gl.TEXTURE_2D, viewTexture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, buffersExt.COLOR_ATTACHMENT1_WEBGL, gl.TEXTURE_2D, testColorTexture, 0);
    //gl.framebufferTexture2D(gl.FRAMEBUFFER, buffersExt.COLOR_ATTACHMENT1_WEBGL, gl.TEXTURE_2D, depthTexture, 0);
    //gl.framebufferTexture2D(gl.FRAMEBUFFER, buffersExt.COLOR_ATTACHMENT2_WEBGL, gl.TEXTURE_2D, normalTexture, 0);
 
    buffersExt.drawBuffersWEBGL([
        buffersExt.COLOR_ATTACHMENT0_WEBGL, // gl_FragData[0]
        buffersExt.COLOR_ATTACHMENT1_WEBGL, // gl_FragData[1]
    ]);

    // Add a depth buffer to the render buffer
    let depthBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, viewBuffer * viewWidth, viewBuffer * viewHeight, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthBuffer, 0);
    
    // Report errors
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Failed to create the frame buffer");
    }

    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        #extension GL_EXT_draw_buffers : require

        // Per vertex variables
        varying lowp vec4 vColor;
        // Unnormalized pixel normal
        varying lowp vec3 vNormal;
        // Pixel Location
        varying lowp vec3 vPosition;
        // Texture location
        varying highp vec2 vTextureCoord;
        
        // Texture
        uniform sampler2D uTexture;
        uniform sampler2D uDepth;
    
        // Uniforms
        // Lights ( For now assume that there is a single light position )
        uniform lowp vec3 uLightPosition;
        uniform lowp vec3 uLightAmbient;
        uniform lowp vec3 uLightDiffuse;
        uniform lowp vec3 uLightSpecular;
        // Camera
        uniform lowp vec3 uCameraPos;
        // Material: ambient, diffuse, specular
        uniform lowp vec3 uSurfaceAmbient;
        uniform lowp vec3 uSurfaceDiffuse;
        uniform lowp vec3 uSurfaceSpecular;
        uniform lowp float uSurfaceTransparency;
        uniform lowp float uNPower;
        // Hacky uniform for switching betweeen Phong and Blinn-Phong
        uniform lowp float uSpecularType;
        // Type of
        uniform int uModulationType;

        void main(void) {
            // Needed:
            // Light vector
            lowp vec3 lightVect = normalize(uLightPosition - vPosition);
            // Camera vector
            lowp vec3 cameraVect = normalize(uCameraPos - vPosition);
            // Normalized normal
            lowp vec3 normalVect = normalize(vNormal);

            // Output color
            lowp vec3 outColor = vec3(0,0,0);

            // Calculate ambient
                // ambColor = materials[triIdx].ambient * lights[i].ambient;
            outColor += uSurfaceAmbient * uLightAmbient;

            // Calculate diffuse
            lowp float ndotL = max(0.0, dot(lightVect, normalVect));
            // if(ndotL > 0.0) {
            outColor += ndotL * uSurfaceDiffuse * uLightDiffuse;

            // Calculate specular
            // Phong uses: (dirrection of bounced light at point (R) dotted with dirrection from point to eye (V))
            // vector towards light source (L)
            lowp vec3 reflectedVect = reflect(-lightVect, normalVect);
            lowp float rdotv = max(0.0, dot(reflectedVect, cameraVect));
            // Needs a check to make sure the light doesn't show through a back
            rdotv = pow(rdotv, uNPower);
            outColor += uSpecularType * rdotv * uSurfaceSpecular * uLightSpecular;

            // Blinn-Phong uses: (surface normal (N) dotted with normalized sum of vector towards light source (L) and towards Camera (V))
            // So: (N o (V + L).normalized)^a~
            // a~ ~= 4a but variations exist
            lowp vec3 halfVect = normalize(cameraVect + lightVect);
            lowp float ndoth = max(0.0, dot(normalVect, halfVect));
            ndoth = pow(ndoth, uNPower);
            //outColor += (1.0 - uSpecularType) * ndoth * uSurfaceSpecular * uLightSpecular;

            // color = texture * material, alpha = texture * material
            if(uModulationType == 0) {
                gl_FragData[0] = texture2D( uDepth, vTextureCoord );
                gl_FragData[0] = vec4(outColor, uSurfaceTransparency) * texture2D(uTexture, vTextureCoord);
                highp float z =  2.0 * gl_FragCoord.z - 1.0;
                // Uses hacky code to make sure z gets rounded correctly
                // I have no clue why this works.
                gl_FragData[1] = vec4(floor(256.0 * z + 1.0) / 256.0, fract( 256.0 * z ), 0.0, 1.0);
                // gl_FragData[1] = vec4(rDepth, gDepth, bDepth, 1.0);
                //gl_FragData[0] = gl_FragData[1];
            }
            // Temporary code to test rendering depth
            else if(uModulationType == 1) {
                gl_FragData[0] = texture2D( uTexture, vTextureCoord );
                //gl_FragData[0] = texture2D( uDepth, vTextureCoord );
                //gl_FragData[0] = vec4( 0.5, 0.5, 0.5, 1.0 );
                //highp float z = 1000.0 * (2.0 * gl_FragCoord.z - 1.0) + 0.5;
                //gl_FragData[1] = vec4(z, z, z, 1);
            }
            // Default: color = texture * material, alpha = texture * material
            else {
                gl_FragData[0] = vec4(outColor, uSurfaceTransparency) * texture2D(uTexture, vTextureCoord);
            }
        }
    `;
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 vertexPosition;
        attribute vec3 vertexNormal;
        attribute vec2 vertexUV;
        // attribute vec4 vertexColor;

        uniform mat4 uCameraMatrix;
        uniform mat4 uModelMatrix;
        uniform vec4 uColor;

        varying lowp vec4 vColor;
        varying lowp vec3 vNormal;
        varying lowp vec3 vPosition;
        varying highp vec2 vTextureCoord;

        void main(void) {
            // change to position to a vector 4.
            gl_Position = vec4(vertexPosition, 1.0 );
            gl_Position = uCameraMatrix * uModelMatrix * gl_Position;

            vColor = uColor;
            vNormal = vec3(uModelMatrix * vec4(vertexNormal, 0.0 ));
            vPosition = vec3(uModelMatrix * vec4(vertexPosition, 1.0 ));
            vTextureCoord = vertexUV;
        }
    `;
    
    //Compile shaders
    try {
        // console.log("fragment shader: "+fShaderCode);
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        // console.log("vertex shader: "+vShaderCode);
        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)

                modelLocation = gl.getUniformLocation(shaderProgram, "uModelMatrix");
                MaterialAmbient = gl.getUniformLocation(shaderProgram, "uSurfaceAmbient");
                MaterialDiffuse = gl.getUniformLocation(shaderProgram, "uSurfaceDiffuse");
                MaterialSpecular = gl.getUniformLocation(shaderProgram, "uSurfaceSpecular");
                MaterialTransparency = gl.getUniformLocation(shaderProgram, "uSurfaceTransparency");

                ModulationType = gl.getUniformLocation(shaderProgram, "uModulationType");

                gl.activeTexture(gl.TEXTURE0);
                textureLocation = gl.getUniformLocation(shaderProgram, 'uTexture');

                vertexPositionAttrib = // get pointer to vertex shader input
                    gl.getAttribLocation(shaderProgram, "vertexPosition"); 
                gl.enableVertexAttribArray(vertexPositionAttrib); // input to shader from array

                vertexNormalAttrib = // get pointer to vertex shader input
                    gl.getAttribLocation(shaderProgram, "vertexNormal"); 
                gl.enableVertexAttribArray(vertexNormalAttrib); // input to shader from array

                vertexUVAttrib = // get pointer to vertex shader input
                    gl.getAttribLocation(shaderProgram, "vertexUV"); 
                gl.enableVertexAttribArray(vertexUVAttrib); // input to shader from array
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

// render the loaded model
function renderTriangles() {
    //Create an empty buffer for the triangles
    vertexBuffer = gl.createBuffer(); // init empty vertex coord buffer
    normalBuffer = gl.createBuffer(); // init empty vertex coord buffer
    uvBuffer = gl.createBuffer(); // init empty vertex coord buffer
    colorBuffer = gl.createBuffer();
    triangleBuffer = gl.createBuffer();

    //setTimeout( render, 5 );
    requestAnimationFrame(render);
} // end render triangles

// Object array
var objectIdx = 0;
var selectionActive = false;

var frameIdx = 0;
var frameTimes = [];

var modulationNumber = 0;
var cameraRot = 0;

var lastFullRender = new Date();
var debugOutput = "";
var lastFullRenderInfo = "";

// None of these change. Would be better to make them static
var tempNormal;
var tempUV;
var tempTriangles;
var segments = 128;
function render() {
    debugOutput = "     Main Render: \n";
    debugOutput += lastFullRenderInfo;
    //  ----- Game update commands (Move to new script)
    Component.UpdateComponents();
    
    for(var i = 0; i < colliderList.length; i++) {
        colliderList[i].CheckCollision();
    }

    // Inputs consumed
    Input.CleanInputs();
    
    var renderStartTime = new Date();

    // Render the scene to a texture
    // Set this up on a delay
    // Only render the source 4 times a second to highlight results
    if(lastFullRender < new Date() - 1000 / 4 && !Input.InputPressed("Key80")) {
        lastFullRender = new Date();

        lastFullRenderInfo = "";
    //if(Math.random() < .5) {
        gl.viewport(0, 0, viewBuffer * viewWidth, viewBuffer * viewHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        if(interpolation == 1) {
            gl.viewport(0, 0, viewWidth, viewHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        else {
            // Wider angle to give a buffer on the sides of the screen
            cameraAngle = 2 * Math.atan( viewBuffer * Math.tan(45 * Math.PI / 180 / 2));
        }
        gl.clearColor(.5, .5, 1, 1);
        // Need the depth mask enabled or the texture doesn't have a depth buffer.
        gl.depthMask(true);
        toBuffer = true;
        // update the reprojection location
        reprojectionPlane.active = false;
        reprojectionPlane.SetPosition(camera.GetPosition());
        reprojectionPlane.SetQuaternionRotation(camera.GetQuaternionRotation());
        // Render
        renderScene();

        // Create the new depth mesh
        // Number of verticies along one edge
        //segments = 16;
        var planeSize = viewBuffer * Math.tan(45 / 180 * Math.PI / 2);
        //
        var verts = [];
        var norms = [];
        var tris = [];
        var uvs = [];
        
        // Copy the depth buffer into a texture.
        var fb = gl.createFramebuffer();
        gl.viewport(0, 0, viewBuffer * viewWidth, viewBuffer * viewHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        // gl.framebufferTexture2D(gl.FRAMEBUFFER, buffersExt.COLOR_ATTACHMENT0_WEBGL, gl.TEXTURE_2D, depthTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, buffersExt.COLOR_ATTACHMENT0_WEBGL, gl.TEXTURE_2D, testColorTexture, 0);
        // Read the entire texture in to javascript space.
        // This is faster then making several 1 pixel calls
        var pixels = new Uint8Array(viewBuffer * viewWidth * viewBuffer * viewHeight * 4);
        gl.readPixels(0, 0, viewBuffer * viewWidth, viewBuffer * viewHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Make the list of verticies
        //console.log("Making verticies");
        for(var x = 0; x < segments; x++) {
            var xOffset = 2 * x / (segments - 1) - 1;
            for(var y = 0; y < segments; y++) {
                var yOffset = 2 * y / (segments - 1) - 1;
                // Get the offset vector.
                // This is taking a long time. optimizes?
                var dirrection = vec3.fromValues(planeSize * xOffset, planeSize * yOffset, 1);
                //console.log(x, y, dirrection);

                // Using depth buffer
                var pixelIdx = 4 * (viewBuffer * viewWidth * Math.floor((viewBuffer * viewHeight - 1) * (yOffset / 2 + 0.5)) + Math.floor((viewBuffer * viewWidth - 1) * (0.5 - xOffset / 2)));
                //console.log(x,y,pixelIdx/4, (pixelIdx/4) % (viewBuffer * viewWidth), Math.floor((pixelIdx/4)/(viewBuffer * viewWidth)) )
                // Using only 8 bit depth
                //var depthValue = pixels[pixelIdx] / 255;
                // Using 16bit depth
                var depthValue = pixels[pixelIdx] / 256 + pixels[pixelIdx + 1] / 256 / 256;
                distance = 2 * 0.05 * 1000.05 / (1000.05 + .05 - (depthValue) * (1000.05 - .05));
                //console.log(x,y,distance)
                //console.log((xOffset / 2 + 0.5), (yOffset / 2 + 0.5), pixelIdx, dist);

                //else console.log("miss");
                //console.log("dist " + (x + segments * y) + " : " + distance);
                vec3.scale(dirrection, dirrection, distance)
                // push the offsets into the array
                verts.push(dirrection[0], dirrection[1], dirrection[2]);
                norms.push(0, 1, 0);
                uvs.push(1 - (xOffset + 1) / 2, (yOffset + 1) / 2);
            }
        }
        //console.log(uvs)
        for(var x = 0; x < segments - 1; x++) {
            for(var y = 0; y < segments - 1; y++) {
                tris.push(x + segments * y, x + 1 + segments * y, x + segments * (y + 1));
                tris.push(x + 1 + segments * y, x + segments * (y + 1), x + 1 + segments * (y + 1));
            }
        }

        reprojectionPlaneMesh.vertices = verts;
        reprojectionPlaneMesh.normals = norms;
        reprojectionPlaneMesh.triangles = tris;
        reprojectionPlaneMesh.uvs = uvs;

        // None of these change. Would be better to make them static
        if(tempNormal == undefined) {
            //console.log("Updated view")
            tempNormal = new Float32Array(reprojectionPlaneMesh.normals);
            tempUV = new Float32Array(reprojectionPlaneMesh.uvs);
            tempTriangles = new Uint16Array(reprojectionPlaneMesh.triangles);
        }
        
        //
        lastFullRenderInfo += "Render Time: " + (new Date() - lastFullRender) + "\n";
    }

    // enabled interpoation
    // Render every frame
    if(interpolation == 2) {
        debugOutput += "     Reprojection: \n"
        var reprojectionStart = new Date();
        //var reprojectStartTime = new Date();
        reprojectView();
        //var reprojectEndTime = new Date();
        //console.log("Reprojection Time: " + (reprojectEndTime - reprojectStartTime));

        debugOutput += "-Total Reprojection Time: " + (new Date() - reprojectionStart) + "\n";
    }

    // Output the debug string
    debugText.innerHTML = debugOutput;

    // Render the next frame
    //setTimeout(render, 5);
    requestAnimationFrame(render);
    //console.log("end" + randSeed);
}

var cameraAngle = 45;
var toBuffer = false;
function renderScene() {

    var triangleCount = 0;
    // ----- Render the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers 

    // Calculate the camera matrix. Only needs to be done once per frame
    cameraMatrix = mat4.create();
    lookMatrix = mat4.create();
    var camPos = camera.GetPosition();
    // Forward vector is easily calculated by the translation matrix
    var camForward = vec3.fromValues(0, 0, 1);
    camera.GetAxis(camForward);
    vec3.normalize(camForward, camForward);
    vec3.add(camForward, camForward, camera.GetPosition());
    //console.log(camForward);
    //vec3.transformMat4(camForward, camForward, camera.GetMatrix());
    // Up vector is similar but requires moving back to the origin
    var camUp = vec3.fromValues(0, 1, 0);
    camera.GetAxis(camUp);
    //vec3.transformMat4(camUp, camUp, camera.GetMatrix());
    vec3.normalize(camUp, camUp);
    // Construct the matrix
    mat4.lookAt(lookMatrix, camPos, camForward, camUp);
    perspectiveMatrix = mat4.create(); 
    // Construct the perspective matrix
    //mat4.perspective(perspectiveMatrix, 45 * Math.PI / 180, 1, 0.05, 1000.05);
    mat4.perspective(perspectiveMatrix, cameraAngle, 1, 0.05, 1000.05);
    cameraAngle = 45 * Math.PI / 180;
    mat4.multiply(cameraMatrix, perspectiveMatrix, lookMatrix);

    var cameraLocation = gl.getUniformLocation(shaderProgram, "uCameraMatrix");
    gl.uniformMatrix4fv(cameraLocation, false, cameraMatrix);

    // Camera Position
    var cameraPosition = gl.getUniformLocation(shaderProgram, "uCameraPos");
    gl.uniform3f(cameraPosition, camera.position[0], camera.position[1], camera.position[2]);

    // Light Position
    var lightPosition = gl.getUniformLocation(shaderProgram, "uLightPosition");
    gl.uniform3f(lightPosition, 2,4,-0.5);
    // Load Light colors
    var lightAmbient = gl.getUniformLocation(shaderProgram, "uLightAmbient");
    gl.uniform3f(lightAmbient, 1, 1, 1);
    var lightDiffuse = gl.getUniformLocation(shaderProgram, "uLightDiffuse");
    gl.uniform3f(lightDiffuse, 1, 1, 1);
    var lightSpecular = gl.getUniformLocation(shaderProgram, "uLightSpecular");
    gl.uniform3f(lightSpecular, 1, 1, 1);

    //Modulation Type
    //ModulationType = gl.getUniformLocation(shaderProgram, "uModulationType");
    gl.uniform1i(ModulationType, 0);
    //gl.uniform1i(ModulationType, 5);

    // Loop for all the models in the scene
    /* Needed:
    uniform model transform matrix
    uniform model vertex color (change to uniform) (also something to be said for texturing)
    atribute model vertexes
    atribute model vertex normals
    atribute model triangles
    */
    // Render the solid meshes
    var solidStartTime = new Date();
    gl.depthMask(true);
    gl.disable(gl.BLEND)
    for(var i = 0; i < objectArray.length; i++) {
        if(meshList[i] != null && meshList[i].worldobject.active && !meshList[i].material.transparent) {
            //console.log(meshList[i]);
            // console.log("     Object: " + i);
            // Model transformation
            modelLocation = gl.getUniformLocation(shaderProgram, "uModelMatrix");
            gl.uniformMatrix4fv(modelLocation, false, meshList[i].worldobject.GetMatrix());

            // Model color; Later replace with texture
            //var colorLocation = gl.getUniformLocation(shaderProgram, "uColor");
            //var nextColor = meshList[i].material.diffuse;
            //gl.uniform4f(colorLocation, nextColor[0], nextColor[1], nextColor[2], 1);

            // Load Texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, meshList[i].material.texture);
            var textureLocation = gl.getUniformLocation(shaderProgram, 'uTexture');
            gl.uniform1i(textureLocation, 0);

            // Load Material colors
            // Ambient
            var MaterialAmbient = gl.getUniformLocation(shaderProgram, "uSurfaceAmbient");
            var nextColor = meshList[i].material.ambient;
            gl.uniform3f(MaterialAmbient, nextColor[0], nextColor[1], nextColor[2]);
            // Diffuse
            var MaterialDiffuse = gl.getUniformLocation(shaderProgram, "uSurfaceDiffuse");
            nextColor = meshList[i].material.diffuse;
            gl.uniform3f(MaterialDiffuse, nextColor[0], nextColor[1], nextColor[2]);
            // Specular
            var MaterialSpecular = gl.getUniformLocation(shaderProgram, "uSurfaceSpecular");
            nextColor = meshList[i].material.specular;
            gl.uniform3f(MaterialSpecular, nextColor[0], nextColor[1], nextColor[2]);
            // Transparency
            gl.uniform1f(MaterialTransparency, meshList[i].material.alpha);
            // N
            var MaterialN = gl.getUniformLocation(shaderProgram, "uNPower");
            var nextPower = meshList[i].material.n;
            // setting minimum value to prevent strange results
            if( nextPower < .005) {
                nextPower = .005;
            }
            gl.uniform1f(MaterialN, nextPower);
            // Shader type
            var MaterialType = gl.getUniformLocation(shaderProgram, "uSpecularType");
            gl.uniform1f(MaterialType, meshList[i].material.type);

            // send the vertex coords to webGL
            // console.log("Vertexes: " + meshList[i].vertices);
            gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate that buffer
            gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(meshList[i].vertices),gl.DYNAMIC_DRAW); // coords to that buffer
            // vertex buffer: activate and feed into vertex shader
            gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate
            gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

            // send the vertex normals to webGL
            // console.log("Vertexes: " + meshList[i].vertices);
            gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer); // activate that buffer
            gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(meshList[i].normals),gl.DYNAMIC_DRAW); // coords to that buffer
            // vertex buffer: activate and feed into vertex shader
            gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer); // activate
            gl.vertexAttribPointer(vertexNormalAttrib,3,gl.FLOAT,false,0,0); // feed

            // send the vertex UVs to webGL
            // console.log("Vertexes: " + meshList[i].vertices);
            gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer); // activate that buffer
            gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(meshList[i].uvs),gl.DYNAMIC_DRAW); // coords to that buffer
            // vertex buffer: activate and feed into vertex shader
            gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer); // activate
            gl.vertexAttribPointer(vertexUVAttrib,2,gl.FLOAT,false,0,0); // feed
            
            //triBufferSize = triArray.length;
            // send the triangle indices to mebGL
            // Bind the new buffer to we gl so it can be modified
            // Add elements from the triangle buffer to array that was made. 
            // console.log("Triangles: " + meshList[i].triangles);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(meshList[i].triangles),gl.DYNAMIC_DRAW);
            // Once this is done modifying the tri array has no effect.
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffer); // activate
            gl.drawElements(gl.TRIANGLES,meshList[i].triangles.length,gl.UNSIGNED_SHORT,0); // render
            // Count the rendered triangles
            triangleCount += gl.TRIANGLES,meshList[i].triangles.length / 3;
        }
    }
    var solidEndTime = new Date();

    // Render the transparent meshes
    var transparentStartTime = new Date();
    // Turn off writing the depth mask
    gl.depthMask(false);
    // Enable transparent rendering
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    //gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Make a list of all the transparent triangles
    var arrayStartTime = new Date();
    // create a master array with all the transparent verts, norms, and UVs.
    var tempVertArray = [];
    var tempNormArray = [];
    var tempUVArray = [];
    // now holds the tri idx, source, and distance.
    var triangles = [];
    for(var i = 0; i < objectArray.length; i++) {
        if(meshList[i] != null && meshList[i].worldobject.active && meshList[i].material.transparent) {
            var startIdx = tempVertArray.length / 3;

            // Concat the array
            tempVertArray = tempVertArray.concat(meshList[i].vertices);
            tempNormArray = tempNormArray.concat(meshList[i].normals);
            tempUVArray = tempUVArray.concat(meshList[i].uvs);
            
            // get the model matrix
            var currentMatrix = meshList[i].worldobject.GetMatrix();
            // preapply to the meshes
            var vecOut = vec3.create();
            var newNorm = vec4.create();
            for(var j = startIdx; j < tempVertArray.length / 3; j++) {
                // apply the model matrix to the triangle
                vec3.set(vecOut, tempVertArray[3 * j], tempVertArray[3 * j + 1], tempVertArray[3 * j + 2]);
                vec3.transformMat4(vecOut, vecOut, currentMatrix);
                tempVertArray[3 * j] = vecOut[0];
                tempVertArray[3 * j + 1] = vecOut[1];
                tempVertArray[3 * j + 2] = vecOut[2];
                // normals do not use the scale. 
                vec4.set(newNorm, tempNormArray[3 * j], tempNormArray[3 * j + 1], tempNormArray[3 * j + 2], 0);
                vec4.transformMat4(newNorm, newNorm, currentMatrix);
                tempNormArray[3 * j] = newNorm[0];
                tempNormArray[3 * j + 1] = newNorm[1];
                tempNormArray[3 * j + 2] = newNorm[2];
            }
            for(var t = 0; t < meshList[i].triangles.length; t += 3) {
                var newTriangle = {};
                
                // Indexes 
                var i1 = meshList[i].triangles[t] + startIdx;
                var i2 = meshList[i].triangles[t + 1] + startIdx;
                var i3 = meshList[i].triangles[t + 2] + startIdx;
                
                newTriangle.source = objectArray[i];

                var dist = vec3.fromValues(
                    (tempVertArray[3 * i1] + tempVertArray[3 * i2] + tempVertArray[3 * i3]) / 3 - camera.position[0],
                    (tempVertArray[3 * i1 + 1] + tempVertArray[3 * i2 + 1] + tempVertArray[3 * i3 + 1]) / 3 - camera.position[1],
                    (tempVertArray[3 * i1 + 2] + tempVertArray[3 * i2 + 2] + tempVertArray[3 * i3 + 2]) / 3 - camera.position[2]);
                newTriangle.distance = vec3.squaredLength(dist);
                newTriangle.triIdx = [i1, i2, i3] // Always true

                triangles[triangles.length] = newTriangle;
            }
        }
    }
    var arrayEndTime = new Date();
    // Sort the list
    var sortStartTime = new Date();
    // Farthest to nearest
    triangles.sort(function(a, b){return b.distance - a.distance});
    var sortEndTime = new Date();
    // Render all of the triangles
    var renderTransparentStartTime = new Date();
    // Only switch the objecy information if it changes
    var lastObject = undefined;

    //Logging for rending time
    var materialDataTime = 0;
    var triangleDataTime = 0;
    var renderTriangleTime = 0;
    
    // Model transformation
    // Already aplied so just use the identity
    modelLocation = gl.getUniformLocation(shaderProgram, "uModelMatrix");
    gl.uniformMatrix4fv(modelLocation, false, mat4.create());

    // send the vertex coords to webGL
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(tempVertArray),gl.STATIC_DRAW); // coords to that buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate
    gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

    // send the vertex normals to webGL
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(tempNormArray),gl.STATIC_DRAW); // coords to that buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer); // activate
    gl.vertexAttribPointer(vertexNormalAttrib,3,gl.FLOAT,false,0,0); // feed
    //console.log(gl.getUniform(shaderProgram, gl.getUniformLocation(shaderProgram, "uSurfaceSpecular")));

    // send the vertex UVs to webGL
    gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(tempUVArray),gl.STATIC_DRAW); // coords to that buffer
    gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer); // activate that buffer
    gl.vertexAttribPointer(vertexUVAttrib,2,gl.FLOAT,false,0,0); // feed

    //for(var i = 0; i < 1; i++) {
    for(var i = 0; i < triangles.length; i++) {
        var materialDataStartTime = new Date();
        if(triangles[i].source != lastObject) {
            // Load Texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, triangles[i].source.mesh.material.texture);
            var textureLocation = gl.getUniformLocation(shaderProgram, 'uTexture');
            gl.uniform1i(textureLocation, 0);

            // Load Material colors
            // Ambient
            var nextColor = triangles[i].source.mesh.material.ambient;
            MaterialAmbient = gl.getUniformLocation(shaderProgram, "uSurfaceAmbient");
            gl.uniform3f(MaterialAmbient, nextColor[0], nextColor[1], nextColor[2]);
            // Diffuse
            nextColor = triangles[i].source.mesh.material.diffuse;
            MaterialDiffuse = gl.getUniformLocation(shaderProgram, "uSurfaceDiffuse");
            gl.uniform3f(MaterialDiffuse, nextColor[0], nextColor[1], nextColor[2]);
            // Specular
            nextColor = triangles[i].source.mesh.material.specular;
            MaterialSpecular = gl.getUniformLocation(shaderProgram, "uSurfaceSpecular");
            gl.uniform3f(MaterialSpecular, nextColor[0], nextColor[1], nextColor[2]);
            // Transparency
            gl.uniform1f(MaterialTransparency, triangles[i].source.mesh.material.alpha);
            // N
            var MaterialN = gl.getUniformLocation(shaderProgram, "uNPower");
            var nextPower = triangles[i].source.mesh.material.n;
            //console.log(triangles[i].source.mesh.material.n);
            // setting minimum value to prevent strange results
            if( nextPower < .005) {
                nextPower = .005;
            }
            gl.uniform1f(MaterialN, nextPower);
            // Shader type
            var MaterialType = gl.getUniformLocation(shaderProgram, "uSpecularType");
            gl.uniform1f(MaterialType, triangles[i].source.mesh.material.type);

            lastObject = triangles[i].source;

            /*console.log(lastObject);
            console.log(triangles[i].source.mesh.material.ambient);
            console.log(gl.getUniform(shaderProgram, gl.getUniformLocation(shaderProgram, "uSurfaceAmbient")));
            console.log(gl.getUniform(shaderProgram, gl.getUniformLocation(shaderProgram, "uSurfaceDiffuse")));
            console.log(gl.getUniform(shaderProgram, gl.getUniformLocation(shaderProgram, "uSurfaceSpecular")));
            console.log(gl.getUniform(shaderProgram, gl.getUniformLocation(shaderProgram, "uNPower")));
            console.log(gl.getUniform(shaderProgram, gl.getUniformLocation(shaderProgram, "uSpecularType")));*/
        }
        var materialDataEndTime = new Date();
        materialDataTime += (materialDataEndTime - materialDataStartTime);
        
        var triangleDataStartTime = new Date();
        // No longer being pushed to the gpu
        var triangleDataEndTime = new Date();
        triangleDataTime += (triangleDataEndTime - triangleDataStartTime);
        
        var renderTriangleStartTime = new Date();
        // send the triangle indices to mebGL
        // Does not change so only do once
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(triangles[i].triIdx),gl.STREAM_DRAW);

        // Once this is done modifying the tri array has no effect.
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffer); // activate
        gl.drawElements(gl.TRIANGLES,3,gl.UNSIGNED_SHORT,0); // render

        // Count the rendered triangles
        triangleCount += 1;
        
        var renderTriangleEndTime = new Date();
        renderTriangleTime += (renderTriangleEndTime - renderTriangleStartTime);
    }
}

// Renders the view texture to the view
function reprojectView() {
    let functionStart = new Date();
    gl.viewport(0, 0, viewWidth, viewHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // ----- Render the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers 

    // Calculate the camera matrix. Only needs to be done once per frame
    cameraMatrix = mat4.create();
    lookMatrix = mat4.create();
    var camPos = camera.GetPosition();
    // Forward vector is easily calculated by the translation matrix
    var camForward = vec3.fromValues(0, 0, 1);
    camera.GetAxis(camForward);
    vec3.normalize(camForward, camForward);
    vec3.add(camForward, camForward, camera.GetPosition());
    //console.log(camForward);
    //vec3.transformMat4(camForward, camForward, camera.GetMatrix());
    // Up vector is similar but requires moving back to the origin
    var camUp = vec3.fromValues(0, 1, 0);
    camera.GetAxis(camUp);
    //vec3.transformMat4(camUp, camUp, camera.GetMatrix());
    vec3.normalize(camUp, camUp);
    // Construct the matrix
    mat4.lookAt(lookMatrix, camPos, camForward, camUp);
    perspectiveMatrix = mat4.create(); 
    // Construct the perspective matrix
    mat4.perspective(perspectiveMatrix, 45 * Math.PI / 180, 1, 0.05, 1000.05);
    //mat4.perspective(perspectiveMatrix, 2 * Math.atan( 2 * Math.tan(45 * Math.PI / 180 / 2)), 1, 0.05, 1000.05);
    mat4.multiply(cameraMatrix, perspectiveMatrix, lookMatrix);

    var cameraLocation = gl.getUniformLocation(shaderProgram, "uCameraMatrix");
    gl.uniformMatrix4fv(cameraLocation, false, cameraMatrix);
    //gl.uniformMatrix4fv(cameraLocation, false, mat4.create());

    // Camera Position
    var cameraPosition = gl.getUniformLocation(shaderProgram, "uCameraPos");
    gl.uniform3f(cameraPosition, camera.position[0], camera.position[1], camera.position[2]);

    // Light Position
    var lightPosition = gl.getUniformLocation(shaderProgram, "uLightPosition");
    gl.uniform3f(lightPosition, 2,4,-0.5);
    // Load Light colors
    var lightAmbient = gl.getUniformLocation(shaderProgram, "uLightAmbient");
    gl.uniform3f(lightAmbient, 1, 1, 1);
    var lightDiffuse = gl.getUniformLocation(shaderProgram, "uLightDiffuse");
    gl.uniform3f(lightDiffuse, 1, 1, 1);
    var lightSpecular = gl.getUniformLocation(shaderProgram, "uLightSpecular");
    gl.uniform3f(lightSpecular, 1, 1, 1);

    //Modulation Type
    gl.uniform1i(ModulationType, 1);


    // Render the plane
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // Model transformation
    modelLocation = gl.getUniformLocation(shaderProgram, "uModelMatrix");
    gl.uniformMatrix4fv(modelLocation, false, reprojectionPlane.GetMatrix());
    //gl.uniformMatrix4fv(modelLocation, false, mat4.create());

    // Load Texture
    // Load the view texture as the main rendered texture.
    gl.activeTexture(gl.TEXTURE0);
    // Load the view texture
    gl.bindTexture(gl.TEXTURE_2D, viewTexture);
    //gl.bindTexture(gl.TEXTURE_2D, testColorTexture);
    var textureLocation = gl.getUniformLocation(shaderProgram, 'uTexture');
    // Set it as the color texture
    gl.uniform1i(textureLocation, 0);

    // Load Material colors
    // Ambient
    var MaterialAmbient = gl.getUniformLocation(shaderProgram, "uSurfaceAmbient");
    var nextColor = reprojectionPlaneMesh.material.ambient;
    gl.uniform3f(MaterialAmbient, nextColor[0], nextColor[1], nextColor[2]);
    // Diffuse
    var MaterialDiffuse = gl.getUniformLocation(shaderProgram, "uSurfaceDiffuse");
    nextColor = reprojectionPlaneMesh.material.diffuse;
    gl.uniform3f(MaterialDiffuse, nextColor[0], nextColor[1], nextColor[2]);
    // Specular
    var MaterialSpecular = gl.getUniformLocation(shaderProgram, "uSurfaceSpecular");
    nextColor = reprojectionPlaneMesh.material.specular;
    gl.uniform3f(MaterialSpecular, nextColor[0], nextColor[1], nextColor[2]);
    // Transparency
    gl.uniform1f(MaterialTransparency, reprojectionPlaneMesh.material.alpha);
    // N
    var MaterialN = gl.getUniformLocation(shaderProgram, "uNPower");
    var nextPower = reprojectionPlaneMesh.material.n;
    // setting minimum value to prevent strange results
    if( nextPower < .005) {
        nextPower = .005;
    }
    gl.uniform1f(MaterialN, nextPower);
    // Shader type
    var MaterialType = gl.getUniformLocation(shaderProgram, "uSpecularType");
    gl.uniform1f(MaterialType, reprojectionPlaneMesh.material.type);

    // ----- Precompute the vertex positions so vertex position are affine
    // Takes < 10 ms on my computer. Still far to slow but allows for the target fps.
    debugOutput += "Setup Uniforms: " + (new Date() - functionStart) + "\n";
    let transformStart = new Date();
    // Position vector stored outside the loop to improve speed.
    let vPos = vec4.create();
    let transformedVertex = [];
    // Compute the transformation matrix
    let transformMatrix = mat4.create();
    mat4.multiply(transformMatrix, cameraMatrix, reprojectionPlane.GetMatrix());
    // Transform all the verticies
    for(var v = 0; v < reprojectionPlaneMesh.vertices.length; v += 3) {
        vec4.set(vPos, reprojectionPlaneMesh.vertices[v],reprojectionPlaneMesh.vertices[v+1],reprojectionPlaneMesh.vertices[v+2], 1);
        //vec4.set(vPos, reprojectionPlaneMesh.vertices[v] - .125,reprojectionPlaneMesh.vertices[v+1] + .125,reprojectionPlaneMesh.vertices[v+2], 1);
        vec4.transformMat4(vPos, vPos, transformMatrix);
        vec4.scale(vPos, vPos, Math.abs(1/vPos[3]));
        transformedVertex.push(vPos[0],vPos[1],vPos[2]);
        //console.log("Transformed: ", v / 3, vPos)
    }
    debugOutput += "Vertex Transformation: " + (new Date() - transformStart) + "\n";

    // Converting the arrays for WebGL to use take a supprising long time. (~10ms?)
    // For now noted but could be improved later
    
    let arrayCreationStart = new Date();
    let tempVertex = new Float32Array(transformedVertex);
    debugOutput += "Array Creation: " + (new Date() - arrayCreationStart) + "\n";
    
    let functionEnd = new Date();

    // Use identity matrix as we already did the transformations
    gl.uniformMatrix4fv(cameraLocation, false, mat4.create());
    gl.uniformMatrix4fv(modelLocation, false, mat4.create());


    // send the vertex coords to webGL
    // console.log("Vertexes: " + meshList[i].vertices);
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,tempVertex,gl.DYNAMIC_DRAW); // coords to that buffer
    gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

    // send the vertex normals to webGL
    // console.log("Vertexes: " + meshList[i].vertices);
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,tempNormal,gl.DYNAMIC_DRAW); // coords to that buffer
    gl.vertexAttribPointer(vertexNormalAttrib,3,gl.FLOAT,false,0,0); // feed

    // send the vertex UVs to webGL
    // console.log("Vertexes: " + meshList[i].vertices);
    gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER,tempUV,gl.DYNAMIC_DRAW); // coords to that buffer
    gl.vertexAttribPointer(vertexUVAttrib,2,gl.FLOAT,false,0,0); // feed
    
    //triBufferSize = triArray.length;
    // send the triangle indices to mebGL
    // Bind the new buffer to we gl so it can be modified
    // Add elements from the triangle buffer to array that was made. 
    // console.log("Triangles: " + meshList[i].triangles);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,tempTriangles,gl.DYNAMIC_DRAW);
    debugOutput += "Load Mesh information: " + (new Date() - functionEnd) + "\n";

    let drawTime = new Date();
    // Average of 0ms
    gl.drawElements(gl.TRIANGLES,reprojectionPlaneMesh.triangles.length,gl.UNSIGNED_SHORT,0); // render
    
    debugOutput += "Draw Time: " + (new Date() - drawTime) + "\n";
}

/* MAIN -- HERE is where execution begins after window load */
function main() {
  
    // Engine setup
    setupWebGL(); // set up the webGL environment
    loadTriangles(); // load in the triangles from tri file
    setupShaders(); // setup the webGL shaders

    // Load the game

    // Start running the game (game updates tied to render updates)
    renderTriangles(); // draw the triangles using webGL
  
} // end main