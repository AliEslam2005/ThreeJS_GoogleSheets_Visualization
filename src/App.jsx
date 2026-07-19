import { useState, useEffect, useRef } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

export default function App() {
  const mountRef = useRef(null);
  const [sheetData, setSheetData] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);

  // Store Three.js references in refs so they persist without crashing
  const sceneRef = useRef(new THREE.Scene());
  const objectsRef = useRef([]);
  const targetsRef = useRef({ table: [], sphere: [], helix: [], grid: [] });
  // Modern @tweenjs/tween.js global group
  const tweenGroupRef = useRef(new TWEEN.Group());

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    onSuccess: async (tokenResponse) => {
      setIsAuthenticated(true);
      setLoading(true);
      
      const sheetId = import.meta.env.VITE_SPREADSHEET_ID;
      const range = 'Sheet1!A:F'; // Fetch wider range to ensure all columns are caught
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        const result = await response.json();
        
        if (result.values) {
            let rows = result.values;
            // The fetched range (Sheet1!A:F) always starts at row 1, which is
            // the header row (Name, Photo, Age, Country, Interest, Net Worth).
            // Always drop it - it's never actual row data.
            if (rows.length > 0) {
              rows = rows.slice(1);
            }

            // === Column mapping - matches the actual sheet header order ===
            const colName = 0;
            const colImage = 1;
            const colCountry = 3;
            const colInterest = 4;
            const colNetWorth = 5;

            const formattedData = rows.map((row, index) => ({
              ID: index + 1, // no ID column in the sheet, so use row position
              Image: row[colImage] || '', 
              Name: row[colName] || '',
              Country: row[colCountry] || '',
              Interest: row[colInterest] || '',
              NetWorth: row[colNetWorth] || '0'
            }));
            
            setSheetData(formattedData);
        }
      } catch (error) {
        console.error("Error fetching sheet:", error);
      } finally {
        setLoading(false);
      }
    }
  });

  useEffect(() => {
    if (sheetData.length === 0 || !mountRef.current) return;

    // this one clears previous elements to prevent overlapping canvases
    mountRef.current.innerHTML = '';
    objectsRef.current = [];
    targetsRef.current = { table: [], sphere: [], helix: [], grid: [] };
    const scene = sceneRef.current;
    scene.clear(); 

    // Camera setup
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = 3000;

    // Renderer setup
    const renderer = new CSS3DRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Controls setup
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.minDistance = 500;
    controls.maxDistance = 8000;

    const vector = new THREE.Vector3();

    // ---- Layout constants ----------------------------------------------
    /* 
    Single source of truth for each shape's spacing/grid dimensions.
    Centering offsets below are DERIVED from these + the actual row
    count, so changing a spacing value (or the dataset size) re-centers
    the shape automatically 
    */
    const TABLE_COLS = 20;
    const TABLE_SPACING_X = 160;
    const TABLE_SPACING_Y = 200;
    const TABLE_ROWS = Math.ceil(sheetData.length / TABLE_COLS);
    const tableOffsetX = ((TABLE_COLS - 1) / 2) * TABLE_SPACING_X;
    const tableOffsetY = ((TABLE_ROWS - 1) / 2) * TABLE_SPACING_Y;

    const SPHERE_RADIUS = 800;

    const HELIX_RADIUS = 900;
    const HELIX_THETA_STEP = 0.175;
    const HELIX_Y_SPACING = 15;
    const HELIX_PAIRS = Math.ceil(sheetData.length / 2);
    const helixOffsetY = ((HELIX_PAIRS - 1) / 2) * HELIX_Y_SPACING;

    const GRID_COLS = 5;
    const GRID_ROWS = 4;
    const GRID_SPACING_X = 400;
    const GRID_SPACING_Y = 400;
    const GRID_SPACING_Z = 800;
    const GRID_PER_LAYER = GRID_COLS * GRID_ROWS; // items per Z-layer (independent of TABLE_COLS - 20 here is a coincidence of 5x4)
    const GRID_LAYERS = Math.ceil(sheetData.length / GRID_PER_LAYER);
    const gridOffsetX = ((GRID_COLS - 1) / 2) * GRID_SPACING_X;
    const gridOffsetY = ((GRID_ROWS - 1) / 2) * GRID_SPACING_Y;
    const gridOffsetZ = ((GRID_LAYERS - 1) / 2) * GRID_SPACING_Z;
    // -----------------------------------------------------------------------

    sheetData.forEach((data, i) => {
      const element = document.createElement('div');
      element.className = 'element';
      
      // Parse Net Worth
      const rawString = String(data.NetWorth).toUpperCase();
      let parsedNum = parseFloat(rawString.replace(/[^0-9.-]+/g, ""));
      if (isNaN(parsedNum)) parsedNum = 0;
      
      // Multiply if values are written as "150 B" or "500 K"
      if (rawString.includes('B')) parsedNum *= 1000000000;
      else if (rawString.includes('M')) parsedNum *= 1000000;
      else if (rawString.includes('K')) parsedNum *= 1000;

      // Color logic based on Assignment Rules (hex values)
      let baseColor;
      if (parsedNum < 100000) baseColor = '#EF3022'; // Red
      else if (parsedNum <= 200000) baseColor = '#FDCA35'; // Orange
      else baseColor = '#3A9F48'; // Green

      element.style.backgroundColor = baseColor + '80'; // 50% opacity fill in hex
      element.style.setProperty('--tile-border', baseColor);
      element.style.setProperty('--tile-glow', baseColor + '80');
      // HTML Layout utilizing the Image URL
      element.innerHTML = `
        <div class="country">${data.Country}</div>
        <div class="number">${data.ID}</div>
        <div style="width: 100%; height: 75px; margin-top: 18px; background-image: url('${data.Image}'); background-size: cover; background-position: center;"></div>
        <div class="details">
          <div class="name">${data.Name}</div>
          <div class="interest">${data.Interest}</div>
        </div>
      `;

      const object = new CSS3DObject(element);
      object.position.x = Math.random() * 4000 - 2000;
      object.position.y = Math.random() * 4000 - 2000;
      object.position.z = Math.random() * 4000 - 2000;
      scene.add(object);
      objectsRef.current.push(object);

      // --- 1. TABLE TARGET (20x10 Arrangement) ---
      const tableTarget = new THREE.Object3D();
      tableTarget.position.x = ((i % TABLE_COLS) * TABLE_SPACING_X) - tableOffsetX;
      tableTarget.position.y = -(Math.floor(i / TABLE_COLS) * TABLE_SPACING_Y) + tableOffsetY;
      targetsRef.current.table.push(tableTarget);

      // --- 2. SPHERE TARGET ---
      const sphereTarget = new THREE.Object3D();
      const phi = Math.acos(-1 + (2 * i) / sheetData.length);
      const theta = Math.sqrt(sheetData.length * Math.PI) * phi;
      sphereTarget.position.setFromSphericalCoords(SPHERE_RADIUS, phi, theta);
      vector.copy(sphereTarget.position).multiplyScalar(2);
      sphereTarget.lookAt(vector);
      targetsRef.current.sphere.push(sphereTarget);

      // --- 3. DOUBLE HELIX TARGET ---
      const helixTarget = new THREE.Object3D();
      const pairIndex = Math.floor(i / 2); 
      const isSecondStrand = (i % 2) !== 0;
      const helixTheta = pairIndex * HELIX_THETA_STEP + (isSecondStrand ? Math.PI : 0);
      const helixY = -(pairIndex * HELIX_Y_SPACING) + helixOffsetY;
      
      helixTarget.position.setFromCylindricalCoords(HELIX_RADIUS, helixTheta, helixY);
      vector.x = helixTarget.position.x * 2;
      vector.y = helixTarget.position.y;
      vector.z = helixTarget.position.z * 2;
      helixTarget.lookAt(vector);
      targetsRef.current.helix.push(helixTarget);

      // --- 4. GRID TARGET (5x4x10 Arrangement) ---
      const gridTarget = new THREE.Object3D();
      gridTarget.position.x = ((i % GRID_COLS) * GRID_SPACING_X) - gridOffsetX;
      gridTarget.position.y = -(Math.floor((i % GRID_PER_LAYER) / GRID_COLS) * GRID_SPACING_Y) + gridOffsetY;
      gridTarget.position.z = (Math.floor(i / GRID_PER_LAYER) * GRID_SPACING_Z) - gridOffsetZ;
      targetsRef.current.grid.push(gridTarget);
    });

    // Window Resize Handler
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    // Secure Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      tweenGroupRef.current.update(); // Drives the shape animations
      controls.update(); // Drives the mouse movement
      renderer.render(scene, camera);
    };
    
    // Initial shape load
    transform(targetsRef.current.table, 2000);
    animate();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [sheetData]);

  // animates objects to their new assigned targets
  const transform = (targets, duration) => {
    tweenGroupRef.current.removeAll();
    for (let i = 0; i < objectsRef.current.length; i++) {
      const object = objectsRef.current[i];
      const target = targets[i];
      if (!target) continue;

      new TWEEN.Tween(object.position, tweenGroupRef.current)
        .to({ x: target.position.x, y: target.position.y, z: target.position.z }, Math.random() * duration + duration)
        .easing(TWEEN.Easing.Exponential.InOut)
        .start();

      new TWEEN.Tween(object.rotation, tweenGroupRef.current)
        .to({ x: target.rotation.x, y: target.rotation.y, z: target.rotation.z }, Math.random() * duration + duration)
        .easing(TWEEN.Easing.Exponential.InOut)
        .start();
    }
  };

  return (
    <>
      {!isAuthenticated && (
        <div className="auth-container">
          <h2>Data Visualization Login</h2>
          <button onClick={() => login()} style={{ padding: '10px 20px', fontSize: '16px', background: 'rgba(0,255,255,0.2)' }}>
            Sign in with Google
          </button>
        </div>
      )}
      
      {loading && <div className="auth-container"><h2>Loading Data...</h2></div>}

      {sheetData.length > 0 && (
        <div id="menu">
          <div className="buttons-container">
            <button onClick={() => transform(targetsRef.current.table, 2000)}>TABLE</button>
            <button onClick={() => transform(targetsRef.current.sphere, 2000)}>SPHERE</button>
            <button onClick={() => transform(targetsRef.current.helix, 2000)}>HELIX</button>
            <button onClick={() => transform(targetsRef.current.grid, 2000)}>GRID</button>
          </div>
          <div className="legend">
            <span>Low Net Worth</span>
            <div className="gradient-bar"></div>
            <span>High Net Worth</span>
          </div>
        </div>
      )}

      <div ref={mountRef} style={{ position: 'absolute', top: 0, left: 0 }} />
    </>
  );
}