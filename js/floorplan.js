// ============================================================
// floorplan.js — SVG Floor Plan Editor  (Phase H8)
// ============================================================
// Provides a full interactive SVG canvas for drawing floor layouts.
// Rooms are rectilinear polygons (all right angles).  Doors and
// windows are placed on wall segments.
// Saves to Firestore collection: floorPlans/{floorId}
// ============================================================

// ---- Constants ----
var FP_SNAP_FEET          = 0.25;  // snap grid: 0.25 ft (3-inch increments)
var FP_WALL_SNAP_PX       = 12;    // pixels — snap-to-wall proximity threshold
var FP_CLOSE_PX           = 20;    // pixels — click near first point to close shape
var FP_MAX_PX_PER_FOOT    = 30;    // cap pixels-per-foot so huge floors still fit

// Auto-assigned color palette for new rooms
var FP_ROOM_COLORS = [
    '#B3D9FF', '#B3FFD9', '#FFD9B3', '#FFB3D9',
    '#D9FFB3', '#D9B3FF', '#FFE5B3', '#B3E5FF'
];

// ---- State ----
var fpFloorId     = null;   // Firestore floor document ID
var fpFloor       = null;   // floor data {name, floorNumber, ...}
var fpPlan        = null;   // floorPlans doc: {widthFt, heightFt, rooms[], doors[], windows[]}
var fpRoomList    = [];     // rooms on this floor (for linking new shapes + stairs detection)
var fpAllFloors   = {};     // floorId → {name, floorNumber} — for stairs "connects to" labels
var fpDirty       = false;  // unsaved changes?
var fpViewMode    = true;   // true = view-only (default), false = edit mode

// Drawing tool state
var fpActiveTool   = 'select';
var fpDrawing      = false;
var fpDrawPoints   = [];     // [{x,y}] in feet — corners placed so far
var fpPreviewPoint = null;   // {x,y} — live cursor position (snapped, constrained)

// Selection state
var fpSelectedId        = null;    // ID of selected room shape or marker
var fpSelectedType      = 'room';  // 'room' | 'outlet' | 'switch' | 'plumbing' | 'ceiling' | 'recessedLight' | 'door' | 'window' | 'wallplate'
var fpSelectedSlotIndex = null;    // index of focused slot within a wall-plate (null = whole-plate view)

// Electrical mode state
var fpActiveMode = 'layout';   // 'layout' | 'electrical' — which layer is being edited
var fpElecFade       = true;   // true = dim structural elements in electrical mode
var fpTargetEditMode     = false;   // true = in fixture-picking mode for a specific slot
var fpTargetEditPlateId  = null;    // plate ID being edited
var fpTargetEditSlotIdx  = null;    // slot index being edited (null = still picking which slot)

// Computed display scale
var fpPixPerFoot   = 20;
var fpSvgW         = 800;
var fpSvgH         = 600;

// Zoom state (viewBox-based — no CSS transforms needed)
var fpZoom       = 1.0;  // current zoom level (1 = fit to window)
var fpViewX      = 0;    // viewBox origin X in SVG pixels
var fpViewY      = 0;    // viewBox origin Y in SVG pixels
var fpViewW      = 800;  // viewBox width  in SVG pixels  (fpSvgW / fpZoom)
var fpViewH      = 600;  // viewBox height in SVG pixels  (fpSvgH / fpZoom)
var fpPinchState = null; // active pinch gesture: {startDist, startZoom, midX, midY}
var fpDragState  = null; // active corner drag: {roomId, ptIndex} — drives segment highlighting
var fpCornerEditState = null; // active corner length edit: {room, ptIndex, isAHorizontal, signA, signB}

// Type Numbers mode state
var fpTypeMode   = false;  // true = Room tool in "Type Numbers" sub-mode
var fpTypeAnchor = null;   // {x, y} feet — the clicked start point

// Direction lookup tables for Type Numbers mode
var FP_DIR_CW  = { R:'D', D:'L', L:'U', U:'R' };  // turn right 90° (clockwise on screen)
var FP_DIR_CCW = { R:'U', U:'L', L:'D', D:'R' };  // turn left 90°
var FP_DIR_VEC = { R:{dx:1,dy:0}, L:{dx:-1,dy:0}, U:{dx:0,dy:-1}, D:{dx:0,dy:1} };

// ============================================================
// LOAD — entry point called by app.js on #floorplan/{id}
// ============================================================

function loadFloorPlanPage(floorId) {
    fpFloorId      = floorId;
    fpDirty        = false;
    fpViewMode     = true;   // reset to view mode each time the page loads
    fpDrawing      = false;
    fpDrawPoints   = [];
    fpPreviewPoint = null;
    fpSelectedId   = null;
    fpDragState       = null;
    fpCornerEditState = null;
    fpTypeMode     = false;
    fpTypeAnchor   = null;

    // Initialize plan to empty so fpRender() doesn't crash before the Firestore load completes
    fpPlan = { rooms: [], doors: [], windows: [], outlets: [], switches: [], plumbing: [], ceilingFixtures: [], recessedLights: [], wallPlates: [], fixtures: [], plumbingEndpoints: [] };

    // Reset toolbar to select
    fpSetTool('select');

    // Set back button immediately
    document.getElementById('fpBackBtn').href = '#floor/' + floorId;

    // Set title — use currentFloor if available (user navigated from floor detail),
    // otherwise fall back to a Firestore fetch
    var knownFloorName = (window.currentFloor && window.currentFloor.id === floorId)
        ? window.currentFloor.name : null;
    document.getElementById('fpFloorTitle').textContent =
        (knownFloorName || 'Floor') + ' — Floor Plan Drawing';

    // Load floor record (also updates title if navigated directly by URL)
    userCol('floors').doc(floorId).get()
        .then(function(doc) {
            if (!doc.exists) { window.location.hash = '#house'; return; }
            fpFloor = Object.assign({ id: doc.id }, doc.data());
            document.getElementById('fpFloorTitle').textContent =
                (fpFloor.name || 'Floor') + ' — Floor Plan Drawing';
            document.getElementById('fpBackBtn').href = '#floor/' + floorId;

            // Update breadcrumb: House › Floor Name › Floor Plan Drawing
            if (typeof buildHouseBreadcrumb === 'function') {
                buildHouseBreadcrumb([
                    { label: 'House',                         hash: '#house' },
                    { label: fpFloor.name || 'Floor',         hash: '#floor/' + floorId },
                    { label: 'Floor Plan Drawing',            hash: null }
                ]);
            }

            // Load rooms list (for linking shapes + stairs detection)
            var roomsPromise = userCol('rooms').where('floorId', '==', floorId).get()
                .then(function(snap) {
                    fpRoomList = [];
                    snap.forEach(function(d) {
                        fpRoomList.push(Object.assign({ id: d.id }, d.data()));
                    });
                    fpRoomList.sort(function(a, b) {
                        var ta = a.createdAt ? a.createdAt.toMillis() : 0;
                        var tb = b.createdAt ? b.createdAt.toMillis() : 0;
                        return ta - tb;
                    });
                });

            // Load all floors so stair labels can show the connected floor name
            var floorsPromise = userCol('floors').get().then(function(snap) {
                fpAllFloors = {};
                snap.forEach(function(d) {
                    fpAllFloors[d.id] = d.data();
                });
            });

            return Promise.all([roomsPromise, floorsPromise]);
        })
        .then(function() {
            // Load or initialize the floor plan document
            return userCol('floorPlans').doc(floorId).get();
        })
        .then(function(planDoc) {
            if (planDoc.exists) {
                fpViewMode = true;   // existing plan — open in view mode by default
                fpPlan = planDoc.data();
                // Ensure all arrays exist (backwards compat)
                if (!fpPlan.rooms)    fpPlan.rooms    = [];
                if (!fpPlan.doors)    fpPlan.doors    = [];
                if (!fpPlan.windows)  fpPlan.windows  = [];
                if (!fpPlan.outlets)          fpPlan.outlets          = [];
                if (!fpPlan.switches)         fpPlan.switches         = [];
                if (!fpPlan.plumbing)         fpPlan.plumbing         = [];
                if (!fpPlan.ceilingFixtures)  fpPlan.ceilingFixtures  = [];
                if (!fpPlan.recessedLights)   fpPlan.recessedLights   = [];
                if (!fpPlan.wallPlates)       fpPlan.wallPlates       = [];
            } else {
                // First time — no plan to protect, jump straight into edit mode
                fpViewMode = false;
                fpPlan = { widthFt: 40, heightFt: 30, rooms: [], doors: [], windows: [], outlets: [], switches: [], plumbing: [], ceilingFixtures: [], recessedLights: [], wallPlates: [], fixtures: [], plumbingEndpoints: [] };
                document.getElementById('fpWidthInput').value  = 40;
                document.getElementById('fpHeightInput').value = 30;
                openModal('fpDimensionsModal');
            }
            fpInitSvg();
            fpRender();
            fpApplyViewMode();
            fpSetStatus(fpViewMode
                ? 'View mode — click any item to inspect it. Press Edit to make changes.'
                : 'Edit mode — select a tool to begin drawing.');
        })
        .catch(function(err) {
            console.error('loadFloorPlanPage error:', err);
        });
}

// ============================================================
// SVG INITIALIZATION
// ============================================================

/**
 * Calculate pixels-per-foot so the floor fits in the available area,
 * then set the SVG element's width and height.
 */
function fpInitSvg() {
    var wrapper = document.getElementById('fpCanvasWrapper');
    var svg     = document.getElementById('fpSvg');

    var containerW = wrapper.clientWidth  || 800;
    var containerH = wrapper.clientHeight || 500;

    var pxW = Math.max(300, containerW - 32);
    var pxH = Math.max(200, containerH - 32);

    var scaleW = pxW / fpPlan.widthFt;
    var scaleH = pxH / fpPlan.heightFt;

    fpPixPerFoot = Math.min(scaleW, scaleH, FP_MAX_PX_PER_FOOT);
    fpSvgW = Math.round(fpPlan.widthFt  * fpPixPerFoot);
    fpSvgH = Math.round(fpPlan.heightFt * fpPixPerFoot);

    svg.setAttribute('width',   fpSvgW);
    svg.setAttribute('height',  fpSvgH);

    // Reset zoom to fit-to-window whenever a plan is (re)loaded
    fpZoom  = 1.0;
    fpViewX = 0; fpViewY = 0;
    fpViewW = fpSvgW; fpViewH = fpSvgH;
    fpApplyViewBox();
}

/**
 * Write the current zoom state back to the SVG viewBox attribute
 * and update the zoom slider/label.
 */
function fpApplyViewBox() {
    var svg = document.getElementById('fpSvg');
    if (!svg) return;
    svg.setAttribute('viewBox', fpViewX + ' ' + fpViewY + ' ' + fpViewW + ' ' + fpViewH);
    var slider = document.getElementById('fpZoomSlider');
    if (slider) slider.value = fpZoom;
    var label  = document.getElementById('fpZoomLabel');
    if (label)  label.textContent = Math.round(fpZoom * 100) + '%';
}

/**
 * Zoom to a new level, keeping the screen point (clientX, clientY) fixed.
 * Used by mouse-wheel, pinch, and the slider (which passes the canvas centre).
 */
function fpZoomTo(newZoom, clientX, clientY) {
    if (!fpPlan || !fpPlan.widthFt) return;
    newZoom = Math.max(0.25, Math.min(8, newZoom));

    var svg  = document.getElementById('fpSvg');
    var rect = svg.getBoundingClientRect();
    var physW = rect.width, physH = rect.height;
    if (!physW || !physH) return;

    // SVG-pixel coordinate currently under the focal point
    var fracX = (clientX - rect.left) / physW;
    var fracY = (clientY - rect.top)  / physH;
    var svgCx = fpViewX + fracX * fpViewW;
    var svgCy = fpViewY + fracY * fpViewH;

    // New viewBox dimensions
    var newViewW = fpSvgW / newZoom;
    var newViewH = fpSvgH / newZoom;

    // Shift origin so the focal SVG coord stays under the cursor
    fpViewX = svgCx - fracX * newViewW;
    fpViewY = svgCy - fracY * newViewH;

    // Clamp so we don't scroll outside the floor
    fpViewX = Math.max(0, Math.min(fpSvgW - newViewW, fpViewX));
    fpViewY = Math.max(0, Math.min(fpSvgH - newViewH, fpViewY));

    fpViewW = newViewW;
    fpViewH = newViewH;
    fpZoom  = newZoom;
    fpApplyViewBox();
}

// ============================================================
// FULL RENDER — clears & redraws everything
// ============================================================

function fpRender() {
    var svg = document.getElementById('fpSvg');
    svg.innerHTML = '';

    // --- SVG Defs (patterns, markers) ---
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);

    // Stair hatch pattern: diagonal lines at 45° (Phase H11)
    var hatchPat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    hatchPat.setAttribute('id', 'fp-stair-hatch');
    hatchPat.setAttribute('width', '10'); hatchPat.setAttribute('height', '10');
    hatchPat.setAttribute('patternUnits', 'userSpaceOnUse');
    // Three diagonal line segments that tile seamlessly
    [[-2, 12, 12, -2], [0, 10, 10, 0], [8, 12, 12, 8]].forEach(function(seg) {
        var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', seg[0]); ln.setAttribute('y1', seg[1]);
        ln.setAttribute('x2', seg[2]); ln.setAttribute('y2', seg[3]);
        ln.setAttribute('stroke', '#999'); ln.setAttribute('stroke-width', '1');
        hatchPat.appendChild(ln);
    });
    defs.appendChild(hatchPat);

    // Background rectangle
    fpSvgEl(svg, 'rect', {
        id: 'fpBgRect',
        x: 0, y: 0, width: fpSvgW, height: fpSvgH,
        fill: '#f8f8f8', stroke: '#444', 'stroke-width': 2
    });

    // Grid (if toggled on)
    if (document.getElementById('fpGridToggle').checked) {
        fpRenderGrid(svg);
    }

    // ---- Electrical mode: compute 3-way flags on wall plates ----
    // Build a map of fixtureId → [plateIds that have a slot targeting it]; plates targeted by 2+ get _threeway
    (function() {
        var targetMap = {};
        (fpPlan.wallPlates || []).forEach(function(p) {
            p._threeway = false; // reset
            (p.slots || []).forEach(function(slot) {
                if (slot.type !== 'switch') return;
                (slot.targetIds || []).forEach(function(tid) {
                    if (!targetMap[tid]) targetMap[tid] = [];
                    if (targetMap[tid].indexOf(p.id) < 0) targetMap[tid].push(p.id);
                });
            });
        });
        Object.keys(targetMap).forEach(function(tid) {
            if (targetMap[tid].length >= 2) {
                targetMap[tid].forEach(function(pid) {
                    var p = (fpPlan.wallPlates || []).find(function(x) { return x.id === pid; });
                    if (p) p._threeway = true;
                });
            }
        });
    }());

    // ---- Structural group (may be faded in electrical mode) ----
    var structG = fpSvgG(svg, 'fp-structural');
    if ((fpActiveMode === 'electrical' || fpActiveMode === 'plumbing') && fpElecFade) {
        structG.setAttribute('opacity', '0.25');
    }

    // Room shapes (drawn polygons)
    (fpPlan.rooms || []).forEach(function(room) { fpRenderRoom(structG, room); });

    // Doors
    (fpPlan.doors || []).forEach(function(door) { fpRenderDoor(structG, door); });

    // Windows
    (fpPlan.windows || []).forEach(function(win) { fpRenderWindow(structG, win); });

    // Legacy plumbing markers (old generic system — kept for backward compat)
    (fpPlan.plumbing || []).forEach(function(m) { fpRenderPlumbing(structG, m); });

    // Layout fixtures — toilet, sink, tub/shower (Phase 2)
    (fpPlan.fixtures || []).forEach(function(f) { fpRenderFixture(structG, f); });

    // Plumbing endpoints — spigots, stub-outs (Phase 2, visible in all modes)
    (fpPlan.plumbingEndpoints || []).forEach(function(ep) { fpRenderPlumbingEndpoint(svg, ep); });

    // ---- Electrical markers (always full opacity) ----
    // Legacy outlet/switch (renders empty arrays harmlessly)
    (fpPlan.outlets  || []).forEach(function(m) { fpRenderOutlet(svg, m); });
    (fpPlan.switches || []).forEach(function(m) { fpRenderSwitch(svg, m); });

    // Ceiling fixtures (Phase H10)
    (fpPlan.ceilingFixtures || []).forEach(function(m) { fpRenderCeilingFixture(svg, m); });

    // Recessed lights (Phase H-Elec)
    (fpPlan.recessedLights || []).forEach(function(m) { fpRenderRecessedLight(svg, m); });

    // Wall plates (Phase H-Elec)
    (fpPlan.wallPlates || []).forEach(function(m) { fpRenderWallPlate(svg, m); });

    // ---- Wiring lines (electrical mode + a wall plate is selected) ----
    if (fpActiveMode === 'electrical' && fpSelectedType === 'wallplate' && fpSelectedId) {
        fpRenderWiringLines(svg);
    }

    // ---- Target edit mode overlay ----
    if (fpTargetEditMode) {
        fpRenderTargetEditOverlay(svg);
        fpUpdateTargetEditPanel();  // keep panel in sync with current slot state
    }

    // In-progress drawing preview
    if (fpDrawing && fpDrawPoints.length > 0) {
        fpRenderDrawPreview(svg);
    }

    // Type Numbers mode preview
    if (fpTypeMode && fpTypeAnchor) {
        fpRenderTypePreview(svg);
    }

    // Update Row 3 properties bar based on current selection
    fpUpdatePropsBar();
}

// ============================================================
// GRID RENDERING
// ============================================================

function fpRenderGrid(svg) {
    var g = fpSvgG(svg, 'fp-grid');

    // 4-tier grid: 5ft dark, 1ft medium, 0.5ft light, 0.25ft very faint
    for (var x = 0; x <= fpPlan.widthFt; x += FP_SNAP_FEET) {
        var isMajor  = (Math.round(x * 100) % 500 === 0);   // 5ft
        var isFoot   = (Math.round(x * 100) % 100 === 0);   // 1ft
        var isHalf   = (Math.round(x * 100) % 50  === 0);   // 0.5ft
        // 0.25ft is everything else — colors darkened to be visible on #f8f8f8 background
        var stroke = isMajor ? '#999' : (isFoot ? '#bbb' : (isHalf ? '#ddd' : '#e8e8e8'));
        var sw     = isMajor ? 1 : 0.5;
        fpSvgEl(g, 'line', {
            x1: x * fpPixPerFoot, y1: 0,
            x2: x * fpPixPerFoot, y2: fpSvgH,
            stroke: stroke, 'stroke-width': sw
        });
    }

    for (var y = 0; y <= fpPlan.heightFt; y += FP_SNAP_FEET) {
        var isMajorY = (Math.round(y * 100) % 500 === 0);
        var isFootY  = (Math.round(y * 100) % 100 === 0);
        var isHalfY  = (Math.round(y * 100) % 50  === 0);
        var strokeY  = isMajorY ? '#999' : (isFootY ? '#bbb' : (isHalfY ? '#ddd' : '#e8e8e8'));
        var swY      = isMajorY ? 1 : 0.5;
        fpSvgEl(g, 'line', {
            x1: 0, y1: y * fpPixPerFoot,
            x2: fpSvgW, y2: y * fpPixPerFoot,
            stroke: strokeY, 'stroke-width': swY
        });
    }

    // Foot labels on major grid lines (every 5 feet)
    for (var xL = 0; xL <= fpPlan.widthFt; xL += 5) {
        var txt = fpSvgEl(g, 'text', {
            x: xL * fpPixPerFoot + 2, y: 10,
            'font-size': 9, fill: '#aaa', 'pointer-events': 'none'
        });
        txt.textContent = xL + 'ft';
    }
    for (var yL = 5; yL <= fpPlan.heightFt; yL += 5) {
        var txt2 = fpSvgEl(g, 'text', {
            x: 2, y: yL * fpPixPerFoot - 2,
            'font-size': 9, fill: '#aaa', 'pointer-events': 'none'
        });
        txt2.textContent = yL + 'ft';
    }
}

// ============================================================
// ROOM RENDERING
// ============================================================

function fpRenderRoom(svg, room) {
    if (!room.points || room.points.length < 3) return;

    // Look up the linked Firestore room record to detect type (stairs, hallway)
    var roomRecord  = fpRoomList.find(function(r) { return r.id === room.roomId; });
    var isStairs    = roomRecord && roomRecord.type === 'stairs';
    var isSelected  = (room.id === fpSelectedId && fpSelectedType === 'room');

    var ptsStr = room.points.map(function(p) {
        return fp2px(p.x) + ',' + fp2px(p.y);
    }).join(' ');

    // Fill: stair rooms use the hatch pattern; normal rooms use solid color
    var fillAttr = isStairs ? 'url(#fp-stair-hatch)' : (room.color || FP_ROOM_COLORS[0]);

    // Polygon
    var poly = fpSvgEl(svg, 'polygon', {
        points: ptsStr,
        fill: fillAttr,
        'fill-opacity': isStairs ? 1 : 0.45,
        stroke: isSelected ? '#0066cc' : (isStairs ? '#555' : '#333'),
        'stroke-width': isSelected ? 3 : 2,
        style: 'cursor:pointer'
    });
    poly.dataset.shapeId = room.id;

    // Click handler — behaviour depends on active tool
    poly.addEventListener('click', function(e) {
        e.stopPropagation();
        if (fpActiveTool === 'room') {
            fpHandleRoomClick(e);
        } else if (fpActiveTool === 'select') {
            // Selection handled by mousedown (to support drag-to-move)
        } else if (fpActiveTool === 'door') {
            fpPlaceMarkerOnWall(e, room, 'door');
        } else if (fpActiveTool === 'window') {
            fpPlaceMarkerOnWall(e, room, 'window');
        } else if (fpActiveTool === 'outlet') {
            fpPlaceMarkerOnWall(e, room, 'outlet');
        } else if (fpActiveTool === 'switch') {
            fpPlaceMarkerOnWall(e, room, 'switch');
        } else if (fpActiveTool === 'plumbing') {
            fpPlacePlumbingInRoom(e, room);
        } else if (fpActiveTool === 'ceiling') {
            fpPlaceCeilingFixtureInRoom(e, room);
        } else if (fpActiveTool === 'recessed') {
            fpPlaceRecessedLightInRoom(e, room);
        } else if (fpActiveTool === 'toilet' || fpActiveTool === 'sink' || fpActiveTool === 'tub') {
            fpPlaceFixtureInRoom(e, room, fpActiveTool);
        } else if (fpActiveTool === 'spigot' || fpActiveTool === 'stubout') {
            fpPlacePlumbingEndpointInRoom(e, room, fpActiveTool);
        } else if (fpActiveTool === 'wallplate') {
            fpPlaceMarkerOnWall(e, room, 'wallplate');
        }
    });

    // Make polygon body draggable in select mode (also handles selection)
    fpMakeDraggableRoom(poly, room);

    // Double-click: navigate to connected floor (stairs) or room detail
    poly.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (fpActiveTool !== 'select') return;
        if (isStairs && roomRecord && roomRecord.connectsToFloorId) {
            if (confirm('Go to "' + fpConnectedFloorName(roomRecord.connectsToFloorId) + '"?')) {
                window.location.hash = '#floor/' + roomRecord.connectsToFloorId;
            }
        } else if (room.roomId) {
            if (confirm('Go to room detail page for "' + (room.label || 'this room') + '"?')) {
                window.location.hash = '#room/' + room.roomId;
            }
        }
    });

    // Labels
    var c        = fpCentroid(room.points);
    var fontSize = Math.max(10, Math.min(14, fpPixPerFoot * 0.65));
    var labelFill = isStairs ? '#333' : '#222';

    if (isStairs) {
        // Stairs: show "Stairs ↕" + connected floor name if available
        var stairsLabel = fpSvgEl(svg, 'text', {
            x: fp2px(c.x), y: fp2px(c.y) - fontSize * 0.6,
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-size': fontSize, 'font-weight': 'bold',
            fill: labelFill, 'pointer-events': 'none'
        });
        stairsLabel.textContent = '↕ Stairs';

        if (roomRecord && roomRecord.connectsToFloorId) {
            var toName = fpConnectedFloorName(roomRecord.connectsToFloorId);
            var toText = fpSvgEl(svg, 'text', {
                x: fp2px(c.x), y: fp2px(c.y) + fontSize * 0.8,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': Math.max(8, fontSize * 0.75),
                fill: '#0055aa', 'pointer-events': 'none'
            });
            toText.textContent = '→ ' + toName;
        }
    } else {
        // Normal room: name + dimensions
        var nameText = fpSvgEl(svg, 'text', {
            x: fp2px(c.x), y: fp2px(c.y) - fontSize * 0.6,
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-size': fontSize, 'font-weight': 'bold',
            fill: labelFill, 'pointer-events': 'none'
        });
        nameText.textContent = room.label || '?';

        var bbox   = fpBBox(room.points);
        var areaFt = fpPolygonArea(room.points);
        var dimText = fpSvgEl(svg, 'text', {
            x: fp2px(c.x), y: fp2px(c.y) + fontSize * 0.8,
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-size': Math.max(8, fontSize * 0.75),
            fill: '#555', 'pointer-events': 'none'
        });
        dimText.textContent = bbox.w.toFixed(0) + '\xd7' + bbox.h.toFixed(0) + ' ft  (' + areaFt.toFixed(0) + ' sq ft)';
    }

    // Highlighted segments + colored handles during corner drag OR corner edit
    var dragInfo = null;
    if (fpDragState && fpDragState.roomId === room.id) {
        dragInfo = { ptIndex: fpDragState.ptIndex };
    } else if (fpCornerEditState && fpCornerEditState.room === room) {
        dragInfo = { ptIndex: fpCornerEditState.ptIndex };
    }
    if (isSelected && dragInfo) {
        var di   = dragInfo.ptIndex;
        var nPts = room.points.length;
        var dPrev = room.points[(di - 1 + nPts) % nPts];
        var dCurr = room.points[di];
        var dNext = room.points[(di + 1) % nPts];

        // Segment A: previous → dragged (cyan)
        fpSvgEl(svg, 'line', {
            x1: fp2px(dPrev.x), y1: fp2px(dPrev.y),
            x2: fp2px(dCurr.x), y2: fp2px(dCurr.y),
            stroke: FP_DRAG_COLOR_A, 'stroke-width': 3, 'pointer-events': 'none'
        });
        // Segment B: dragged → next (orange)
        fpSvgEl(svg, 'line', {
            x1: fp2px(dCurr.x), y1: fp2px(dCurr.y),
            x2: fp2px(dNext.x), y2: fp2px(dNext.y),
            stroke: FP_DRAG_COLOR_B, 'stroke-width': 3, 'pointer-events': 'none'
        });
    }

    // Corner drag handles when selected
    if (isSelected) {
        room.points.forEach(function(p, i) {
            // During drag or corner edit: color the prev/next anchor points to match their segment color
            var handleStroke = '#0066cc';
            if (dragInfo) {
                var di2   = dragInfo.ptIndex;
                var nPts2 = room.points.length;
                if (i === (di2 - 1 + nPts2) % nPts2) handleStroke = FP_DRAG_COLOR_A;
                if (i === (di2 + 1) % nPts2)          handleStroke = FP_DRAG_COLOR_B;
            }
            var handle = fpSvgEl(svg, 'circle', {
                cx: fp2px(p.x), cy: fp2px(p.y), r: 6,
                fill: 'white', stroke: handleStroke, 'stroke-width': 2,
                style: 'cursor:move'
            });
            handle.dataset.roomId  = room.id;
            handle.dataset.ptIndex = i;
            fpMakeDraggableHandle(handle, room, i);
        });
    }
}

/** Return the name of a connected floor from fpAllFloors, or a fallback */
function fpConnectedFloorName(floorId) {
    var floor = fpAllFloors[floorId];
    return floor ? floor.name : 'Floor';
}

/**
 * Allow a corner handle to be dragged to reshape a room.
 */
// Colors used for the two segments adjacent to a dragged corner
var FP_DRAG_COLOR_A = '#22d3ee';  // cyan  — segment: previous point → dragged point
var FP_DRAG_COLOR_B = '#fb923c';  // orange — segment: dragged point → next point

// ============================================================
// FEET + INCHES UTILITIES
// ============================================================

/**
 * Parse a measurement string → decimal feet.
 * Accepted formats:
 *   "3"       → 3 ft (bare number = feet)
 *   "3'"      → 3 ft
 *   "32in" or "32\"" → 32 ÷ 12 ft
 *   "2'8\""   → 2 + 8/12 ft
 *   "2'8in"   → 2 + 8/12 ft
 *   "2' 8\""  → same
 *   "2.5"     → 2.5 ft
 */
function fpParseFeetIn(str) {
    if (typeof str === 'number') return str;
    str = (str || '').trim();
    // feet + inches: 2'8" or 2'8in or 2' 8" etc.
    var m = str.match(/^(\d+(?:\.\d+)?)['\u2019]\s*(\d+(?:\.\d+)?)\s*(?:in|")?$/i);
    if (m) return parseFloat(m[1]) + parseFloat(m[2]) / 12;
    // bare inches: 32in or 32"
    var m2 = str.match(/^(\d+(?:\.\d+)?)\s*(?:in|")$/i);
    if (m2) return parseFloat(m2[1]) / 12;
    // feet: 3' or 3ft or plain 3
    var m3 = str.match(/^(\d+(?:\.\d+)?)\s*(?:'|\u2019|ft)?$/i);
    if (m3) return parseFloat(m3[1]);
    return NaN;
}

/** Format decimal feet → feet+inches string, e.g. 2.667 → "2' 8\"" */
function fpFmtFeetIn(ft) {
    var totalIn = Math.round(ft * 12);
    var f = Math.floor(totalIn / 12);
    var i = totalIn % 12;
    return f + '\' ' + i + '"';
}

function fpMakeDraggableHandle(handle, room, ptIndex) {
    handle.addEventListener('mousedown', function(eDown) {
        if (fpViewMode) return;
        eDown.preventDefault();
        eDown.stopPropagation();

        fpDragState = { roomId: room.id, ptIndex: ptIndex };
        var dragged = false;

        fpRender();  // draw highlighted segments immediately (no coords bar yet)

        function onMove(eMove) {
            var pt = fpMouseToFeet(eMove);
            room.points[ptIndex] = pt;
            fpDirty = true;
            dragged = true;

            // Update coords bar: position + two colored segment lengths
            var n    = room.points.length;
            var prev = room.points[(ptIndex - 1 + n) % n];
            var next = room.points[(ptIndex + 1) % n];
            var lenA = Math.hypot(pt.x - prev.x, pt.y - prev.y);
            var lenB = Math.hypot(next.x - pt.x, next.y - pt.y);
            fpShowDragCoordsBar(pt.x, pt.y, lenA, lenB);

            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            fpDragState = null;
            if (dragged) {
                // Only clear/re-render if we actually moved the point
                fpClearCoordsBar();
                fpRender();
                fpSilentSave();
            }
            // If not dragged (tap/click), skip clear so dblclick can show edit inputs cleanly
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // Double-click a corner handle → enter inline length editing mode
    handle.addEventListener('dblclick', function(e) {
        if (fpViewMode) return;
        e.stopPropagation();
        e.preventDefault();
        fpEnterCornerEdit(room, ptIndex);
    });
}

/**
 * Makes a room polygon body draggable in select mode.
 * Dragging the body (not corner handles) translates all room points.
 * A pure click (no movement) selects the room.
 */
function fpMakeDraggableRoom(poly, room) {
    poly.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'layout') return;  // edit-mode: layout only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var startPt     = fpMouseToFeet(eDown);
        var startPoints = room.points.map(function(p) { return { x: p.x, y: p.y }; });
        var dragged     = false;

        // Snapshot start positions for all floating items belonging to this room.
        // Wall-attached items (doors, windows, wall plates) use segmentIndex+position
        // so they move automatically when the room polygon moves — no snapshot needed.
        var floatingArrays = [
            fpPlan.ceilingFixtures  || [],
            fpPlan.recessedLights   || [],
            fpPlan.fixtures         || [],
            fpPlan.plumbing         || [],
            fpPlan.plumbingEndpoints|| []
        ];
        var floatingSnap = floatingArrays.map(function(arr) {
            return arr
                .filter(function(item) { return item.roomId === room.id; })
                .map(function(item)    { return { item: item, x: item.x, y: item.y }; });
        });

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode — clicks still select
            var cur = fpMouseToFeet(e);
            var dx  = cur.x - startPt.x;
            var dy  = cur.y - startPt.y;
            if (!dragged && Math.hypot(dx, dy) > 0.15) {
                dragged = true;
                fpSelectShape(room.id);
            }
            if (!dragged) return;
            // Move room polygon
            room.points = startPoints.map(function(p) {
                return {
                    x: fpSnap(Math.max(0, Math.min(fpPlan.widthFt,  p.x + dx))),
                    y: fpSnap(Math.max(0, Math.min(fpPlan.heightFt, p.y + dy)))
                };
            });
            // Move floating items by the same delta
            floatingSnap.forEach(function(group) {
                group.forEach(function(snap) {
                    snap.item.x = fpSnap(Math.max(0, Math.min(fpPlan.widthFt,  snap.x + dx)));
                    snap.item.y = fpSnap(Math.max(0, Math.min(fpPlan.heightFt, snap.y + dy)));
                });
            });
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectShape(room.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Makes a ceiling fixture draggable in select mode.
 * Attaches mousedown to the fixture group element.
 */
function fpMakeDraggableCeilingFixture(el, fix) {
    el.style.cursor = 'move';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'electrical') return;  // edit-mode: electrical only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var startPt  = fpMouseToFeet(eDown);
        var startX   = fix.x, startY = fix.y;
        var dragged  = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var cur = fpMouseToFeet(e);
            dragged = true;
            fix.x = fpSnap(Math.max(0, Math.min(fpPlan.widthFt,  startX + cur.x - startPt.x)));
            fix.y = fpSnap(Math.max(0, Math.min(fpPlan.heightFt, startY + cur.y - startPt.y)));
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('ceiling', fix.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Project mouse position (in floor feet) onto a wall segment and return
 * the clamped position in FEET along the segment from its start point,
 * keeping the full marker width inside the wall boundaries.
 */
function fpProjectOntoWallSegment(mouseX, mouseY, room, segmentIndex, markerWidth) {
    var seg = fpGetSegment(room.points, segmentIndex);
    if (!seg) return 0;
    var Ax = seg.start.x, Ay = seg.start.y;
    var Bx = seg.end.x,   By = seg.end.y;
    var ABx = Bx - Ax, ABy = By - Ay;
    var len2 = ABx * ABx + ABy * ABy;
    if (len2 < 0.0001) return 0;
    var len = Math.sqrt(len2);
    // Dot-product projection → 0-1 fraction, then convert to feet
    var t = ((mouseX - Ax) * ABx + (mouseY - Ay) * ABy) / len2;
    var posFt = t * len;
    var mw = markerWidth || 0.5;
    return Math.max(0, Math.min(len - mw, posFt));
}

/**
 * Makes a door draggable along its wall segment in select mode.
 * A tap with no movement selects the door; a drag slides it along the wall.
 */
function fpMakeDraggableDoor(el, door) {
    el.style.cursor = 'ew-resize';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'layout') return;  // edit-mode: layout only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var dragged    = false;
        var startPt    = fpMouseToFeet(eDown);  // snapshot mousedown position

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var pt   = fpMouseToFeet(e);
            // Require at least 0.3 ft of movement before treating as a drag.
            // Prevents tiny touch-synthesis mousemove events from nudging the door.
            if (!dragged && Math.hypot(pt.x - startPt.x, pt.y - startPt.y) < 0.3) return;
            dragged = true;
            var room = (fpPlan.rooms || []).find(function(r) { return r.id === door.roomId; });
            if (!room) return;
            door.position = fpProjectOntoWallSegment(pt.x, pt.y, room, door.segmentIndex, door.width || 3);
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('door', door.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Makes a window draggable along its wall segment in select mode.
 * A tap with no movement selects the window; a drag slides it along the wall.
 */
function fpMakeDraggableWindow(el, win) {
    el.style.cursor = 'ew-resize';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'layout') return;  // edit-mode: layout only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var dragged = false;
        var startPt = fpMouseToFeet(eDown);  // snapshot mousedown position

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var pt = fpMouseToFeet(e);
            // Require at least 0.3 ft of movement before treating as a drag.
            if (!dragged && Math.hypot(pt.x - startPt.x, pt.y - startPt.y) < 0.3) return;
            dragged = true;
            var room = (fpPlan.rooms || []).find(function(r) { return r.id === win.roomId; });
            if (!room) return;
            win.position = fpProjectOntoWallSegment(pt.x, pt.y, room, win.segmentIndex, win.width || 2);
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('window', win.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Makes an outlet draggable along its wall segment in select mode.
 * Tap = select; drag = slide. Silent-saves on drag up.
 */
function fpMakeDraggableOutlet(el, outlet) {
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();
        var dragged = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var room = (fpPlan.rooms || []).find(function(r) { return r.id === outlet.roomId; });
            if (!room) return;
            var pt = fpMouseToFeet(e);
            outlet.position = fpProjectOntoWallSegment(pt.x, pt.y, room, outlet.segmentIndex, 0);
            fpDirty = true;
            dragged = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('outlet', outlet.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Makes a switch draggable along its wall segment in select mode.
 * Tap = select; drag = slide. Silent-saves on drag up.
 */
function fpMakeDraggableSwitch(el, sw) {
    el.style.cursor = 'grab';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();
        var dragged = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var room = (fpPlan.rooms || []).find(function(r) { return r.id === sw.roomId; });
            if (!room) return;
            var pt = fpMouseToFeet(e);
            sw.position = fpProjectOntoWallSegment(pt.x, pt.y, room, sw.segmentIndex, 0);
            fpDirty = true;
            dragged = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('switch', sw.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

// ============================================================
// CORNER INLINE LENGTH EDITING
// ============================================================

/**
 * Enter inline corner length editing mode — show editable inputs in the coords bar.
 */
function fpEnterCornerEdit(room, ptIndex) {
    var n      = room.points.length;
    var corner = room.points[ptIndex];
    var prev   = room.points[(ptIndex - 1 + n) % n];
    var next   = room.points[(ptIndex + 1) % n];

    var isAHorizontal = Math.abs(corner.y - prev.y) < 0.01;
    var signA = isAHorizontal
        ? (corner.x >= prev.x ? 1 : -1)
        : (corner.y >= prev.y ? 1 : -1);
    var signB = isAHorizontal
        ? (next.y >= corner.y ? 1 : -1)
        : (next.x >= corner.x ? 1 : -1);

    fpCornerEditState = { room: room, ptIndex: ptIndex, isAHorizontal: isAHorizontal,
                          signA: signA, signB: signB };

    // Select the room so handles are visible
    fpSelectedId   = room.id;
    fpSelectedType = 'room';

    var lenA = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    var lenB = Math.hypot(next.x - corner.x, next.y - corner.y);

    fpShowCornerEditInputs(lenA, lenB, corner);
    fpRender(); // show highlighted segments
}

/**
 * Render the coords bar with two editable number inputs (cyan + orange).
 */
function fpShowCornerEditInputs(lenA, lenB, corner) {
    var bar   = document.getElementById('fpCoordsBar');
    var posEl = document.getElementById('fpCoordsPos');
    var lenEl = document.getElementById('fpCoordsLen');
    var sepEl = bar ? bar.querySelector('.fp-coords-sep') : null;
    if (!bar || !posEl || !lenEl) return;

    posEl.textContent = 'Edit corner: ' + corner.x.toFixed(2) + ', ' + corner.y.toFixed(2) + ' ft  (Enter or Esc to finish)';
    if (sepEl) sepEl.style.display = '';
    lenEl.style.display = '';

    var inputStyle = 'font-family:monospace;font-size:0.9rem;background:#1e293b;border-radius:3px;padding:2px 5px;width:65px;';
    lenEl.innerHTML =
        '<input id="fpEditLenA" type="number" step="0.25" min="0.25" value="' + lenA.toFixed(2) + '" ' +
        'style="' + inputStyle + 'color:#22d3ee;border:1px solid #22d3ee;">' +
        '<span style="margin:0 4px;color:#ccc;opacity:0.7">ft</span>' +
        '<span style="margin:0 6px;color:#475569">|</span>' +
        '<input id="fpEditLenB" type="number" step="0.25" min="0.25" value="' + lenB.toFixed(2) + '" ' +
        'style="' + inputStyle + 'color:#fb923c;border:1px solid #fb923c;">' +
        '<span style="margin:0 4px;color:#ccc;opacity:0.7">ft</span>';

    function applyAndUpdate() {
        if (!fpCornerEditState) return;
        var vA = parseFloat(document.getElementById('fpEditLenA').value);
        var vB = parseFloat(document.getElementById('fpEditLenB').value);
        if (!isNaN(vA) && vA >= 0.25 && !isNaN(vB) && vB >= 0.25) {
            fpApplyCornerLengths(fpCornerEditState, vA, vB);
            var c = fpCornerEditState.room.points[fpCornerEditState.ptIndex];
            posEl.textContent = 'Edit corner: ' + c.x.toFixed(2) + ', ' + c.y.toFixed(2) + ' ft  (Enter or Esc to finish)';
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' || e.key === 'Escape') { fpExitCornerEdit(); e.preventDefault(); }
    }

    document.getElementById('fpEditLenA').addEventListener('input',   applyAndUpdate);
    document.getElementById('fpEditLenA').addEventListener('keydown', onKeyDown);
    document.getElementById('fpEditLenB').addEventListener('input',   applyAndUpdate);
    document.getElementById('fpEditLenB').addEventListener('keydown', onKeyDown);
}

/**
 * Apply new lenA and lenB to the corner in fpCornerEditState.
 * Since all segments are axis-aligned, lenA controls one axis and lenB controls the other.
 */
function fpApplyCornerLengths(state, lenA, lenB) {
    var n      = state.room.points.length;
    var corner = state.room.points[state.ptIndex];
    var prev   = state.room.points[(state.ptIndex - 1 + n) % n];
    var next   = state.room.points[(state.ptIndex + 1) % n];

    var newCorner = { x: corner.x, y: corner.y };

    if (state.isAHorizontal) {
        // A is horizontal → lenA controls X; B is vertical → lenB controls Y
        newCorner.x = Math.round((prev.x + state.signA * lenA) * 10000) / 10000;
        newCorner.y = Math.round((next.y  - state.signB * lenB) * 10000) / 10000;
    } else {
        // A is vertical → lenA controls Y; B is horizontal → lenB controls X
        newCorner.y = Math.round((prev.y + state.signA * lenA) * 10000) / 10000;
        newCorner.x = Math.round((next.x  - state.signB * lenB) * 10000) / 10000;
    }

    state.room.points[state.ptIndex] = newCorner;
    fpDirty = true;
    fpRender();
}

/** Exit corner length edit mode */
function fpExitCornerEdit() {
    fpCornerEditState = null;
    fpClearCoordsBar();
    fpRender();
}

/** Clear the coords bar back to a blank state */
function fpClearCoordsBar() {
    var posEl = document.getElementById('fpCoordsPos');
    var lenEl = document.getElementById('fpCoordsLen');
    var bar   = document.getElementById('fpCoordsBar');
    var sepEl = bar ? bar.querySelector('.fp-coords-sep') : null;
    if (posEl) posEl.textContent = '';
    if (lenEl) { lenEl.innerHTML = ''; lenEl.style.display = 'none'; }
    if (sepEl) sepEl.style.display = 'none';
}

// ============================================================
// TYPE NUMBERS MODE — parse, preview, panel helpers
// ============================================================

/**
 * Parse a type-numbers command string into an array of {x,y} points.
 * anchor — start point in floor feet.
 * Returns array starting with anchor through each corner placed.
 */
function fpParseTypeCommand(str, anchor) {
    var tokens = str.toUpperCase().replace(/[^0-9.RLUDrlud,\s]/g, '').split(/[\s,]+/).filter(Boolean);
    if (!tokens.length) return [{ x: anchor.x, y: anchor.y }];

    var i = 0;
    var dir = 'D'; // default direction: Down

    // Optional first token: direction letter
    if (tokens[0] === 'R' || tokens[0] === 'L' || tokens[0] === 'U' || tokens[0] === 'D') {
        dir = tokens[0];
        i = 1;
    }

    var pts = [{ x: anchor.x, y: anchor.y }];
    var cx = anchor.x, cy = anchor.y;

    while (i < tokens.length) {
        var dist = parseFloat(tokens[i]);
        if (isNaN(dist) || dist <= 0) break;
        i++;
        var vec = FP_DIR_VEC[dir];
        cx = Math.round((cx + vec.dx * dist) * 10000) / 10000;
        cy = Math.round((cy + vec.dy * dist) * 10000) / 10000;
        pts.push({ x: cx, y: cy });
        if (i >= tokens.length) break;
        var turn = tokens[i];
        if (turn === 'R')      { dir = FP_DIR_CW[dir];  i++; }
        else if (turn === 'L') { dir = FP_DIR_CCW[dir]; i++; }
        else break;
    }
    return pts;
}

/** Open the Type Numbers panel, anchoring at the given point */
function fpOpenTypePanel(anchor) {
    fpTypeAnchor = anchor;
    var panel = document.getElementById('fpTypePanel');
    if (!panel) return;
    document.getElementById('fpTypeX').value = anchor.x.toFixed(2);
    document.getElementById('fpTypeY').value = anchor.y.toFixed(2);
    document.getElementById('fpTypeCmd').value = '';
    document.getElementById('fpTypeStatus').textContent = '';
    document.getElementById('fpTypeSaveBtn').disabled = true;
    panel.classList.remove('hidden');
    document.getElementById('fpTypeCmd').focus();
    fpRender();
    fpSetStatus('Type dimensions below. Press Save Room when done.');
}

/** Close the Type Numbers panel (keeps type mode active for next room) */
function fpCloseTypePanel() {
    var panel = document.getElementById('fpTypePanel');
    if (panel) panel.classList.add('hidden');
    fpTypeAnchor = null;
    fpRender();
}

/** Re-parse command, update status badge, refresh SVG preview */
function fpUpdateTypePreview() {
    if (!fpTypeAnchor) return;

    // Allow nudging start X/Y
    var xVal = parseFloat(document.getElementById('fpTypeX').value);
    var yVal = parseFloat(document.getElementById('fpTypeY').value);
    if (!isNaN(xVal) && !isNaN(yVal)) fpTypeAnchor = { x: xVal, y: yVal };

    var pts = fpParseTypeCommand(document.getElementById('fpTypeCmd').value, fpTypeAnchor);
    var statusEl = document.getElementById('fpTypeStatus');
    var saveBtn  = document.getElementById('fpTypeSaveBtn');

    if (pts.length >= 3) {
        var last = pts[pts.length - 1];
        var gap  = Math.hypot(last.x - fpTypeAnchor.x, last.y - fpTypeAnchor.y);
        if (gap < 0.26) {
            statusEl.textContent = '✓ Shape closes';
            statusEl.className   = 'fp-type-status fp-type-status-ok';
        } else {
            statusEl.textContent = '⚠ Off by ' + gap.toFixed(2) + ' ft';
            statusEl.className   = 'fp-type-status fp-type-status-warn';
        }
        if (saveBtn) saveBtn.disabled = false;
    } else {
        statusEl.textContent = pts.length > 1 ? 'Keep going…' : '';
        statusEl.className   = 'fp-type-status';
        if (saveBtn) saveBtn.disabled = true;
    }
    fpRender();
}

/** Render the type-mode room shape as a dashed preview on the SVG */
function fpRenderTypePreview(svg) {
    if (!fpTypeAnchor) return;
    var cmdEl = document.getElementById('fpTypeCmd');
    var pts = fpParseTypeCommand(cmdEl ? cmdEl.value : '', fpTypeAnchor);

    if (pts.length >= 2) {
        var ptsStr = pts.map(function(p) { return fp2px(p.x) + ',' + fp2px(p.y); }).join(' ');
        fpSvgEl(svg, 'polyline', {
            points: ptsStr, fill: 'none',
            stroke: '#0066cc', 'stroke-width': 2,
            'stroke-dasharray': '6,3', 'pointer-events': 'none'
        });
        // Closing line
        var last = pts[pts.length - 1];
        var gap  = Math.hypot(last.x - fpTypeAnchor.x, last.y - fpTypeAnchor.y);
        fpSvgEl(svg, 'line', {
            x1: fp2px(last.x), y1: fp2px(last.y),
            x2: fp2px(fpTypeAnchor.x), y2: fp2px(fpTypeAnchor.y),
            stroke: gap < 0.26 ? '#00aa44' : '#888',
            'stroke-width': gap < 0.26 ? 2 : 1,
            'stroke-dasharray': gap < 0.26 ? '' : '4,4',
            'pointer-events': 'none'
        });
    }

    // Anchor dot
    fpSvgEl(svg, 'circle', {
        cx: fp2px(fpTypeAnchor.x), cy: fp2px(fpTypeAnchor.y), r: 7,
        fill: 'white', stroke: '#0066cc', 'stroke-width': 2, 'pointer-events': 'none'
    });
    // Corner dots
    pts.slice(1).forEach(function(p) {
        fpSvgEl(svg, 'circle', {
            cx: fp2px(p.x), cy: fp2px(p.y), r: 4,
            fill: '#0066cc', stroke: '#0066cc', 'stroke-width': 2, 'pointer-events': 'none'
        });
    });
}

/** Show coords bar with position + two colored segment lengths during corner drag */
function fpShowDragCoordsBar(x, y, lenA, lenB) {
    var bar   = document.getElementById('fpCoordsBar');
    var posEl = document.getElementById('fpCoordsPos');
    var lenEl = document.getElementById('fpCoordsLen');
    var sepEl = bar ? bar.querySelector('.fp-coords-sep') : null;
    if (!bar || !posEl || !lenEl) return;
    posEl.textContent = 'Position: ' + x.toFixed(2) + ', ' + y.toFixed(2) + ' ft';
    if (sepEl) sepEl.style.display = '';
    lenEl.innerHTML =
        '<span style="color:' + FP_DRAG_COLOR_A + '">' + lenA.toFixed(2) + ' ft</span>' +
        '<span style="margin:0 8px;opacity:0.5">|</span>' +
        '<span style="color:' + FP_DRAG_COLOR_B + '">' + lenB.toFixed(2) + ' ft</span>';
    lenEl.style.display = '';
}

// ============================================================
// DOOR RENDERING
// ============================================================

function fpRenderDoor(svg, door) {
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === door.roomId; });
    if (!room || !room.points) return;
    var seg = fpGetSegment(room.points, door.segmentIndex);
    if (!seg) return;

    var info = fpWallMetrics(seg, door.position, door.width);
    if (!info) return;

    var h  = info.hinge;   // px coords of door hinge
    var oe = info.openEnd; // px coords of other side of opening
    var sw = door.swingLeft ? 1 : -1; // +1 = left normal, -1 = right normal

    var isSelected  = fpSelectedId === door.id && fpSelectedType === 'door';
    var strokeColor = isSelected ? '#f59e0b' : '#1e293b';  // amber when selected, near-black otherwise
    var jambLen     = 5;  // px — length of jamb tick marks on each side of opening

    // 1. Gap (erase the wall at the opening — match SVG background #f8f8f8)
    fpSvgEl(svg, 'line', {
        x1: h.x, y1: h.y, x2: oe.x, y2: oe.y,
        stroke: '#f8f8f8', 'stroke-width': 8, 'pointer-events': 'none'
    });

    // 2. Jamb marks — short perpendicular ticks at each end of the opening
    [h, oe].forEach(function(pt) {
        fpSvgEl(svg, 'line', {
            x1: pt.x - info.nx * jambLen, y1: pt.y - info.ny * jambLen,
            x2: pt.x + info.nx * jambLen, y2: pt.y + info.ny * jambLen,
            stroke: strokeColor, 'stroke-width': isSelected ? 2.5 : 2, 'pointer-events': 'none'
        });
    });

    var subtype = door.subtype || 'single';

    if (subtype === 'single') {
        // --- Single door: existing render ---
        // Panel endpoint (door in open position — perpendicular to wall)
        var panelX = h.x - sw * info.ny * fp2px(door.width);
        var panelY = h.y + sw * info.nx * fp2px(door.width);

        // Door panel (solid line from hinge perpendicular into room)
        fpSvgEl(svg, 'line', {
            x1: h.x, y1: h.y, x2: panelX, y2: panelY,
            stroke: strokeColor, 'stroke-width': isSelected ? 3 : 2.5, 'pointer-events': 'none'
        });

        // Swing arc (quarter circle from panel end to opening end)
        var sweepFlag = door.swingLeft ? 0 : 1;
        var r = fp2px(door.width);
        fpSvgEl(svg, 'path', {
            d: 'M ' + panelX + ' ' + panelY +
               ' A ' + r + ' ' + r + ' 0 0 ' + sweepFlag + ' ' + oe.x + ' ' + oe.y,
            fill: 'none', stroke: isSelected ? '#f59e0b' : '#334155',
            'stroke-width': isSelected ? 2 : 1.5,
            'stroke-dasharray': '5,3', 'pointer-events': 'none'
        });

        // Hinge dot
        fpSvgEl(svg, 'circle', {
            cx: h.x, cy: h.y, r: isSelected ? 4 : 3,
            fill: strokeColor, 'pointer-events': 'none'
        });

    } else if (subtype === 'french') {
        // --- French door: two short panel lines pointing into the room, no arc ---
        // Simple symbol: each hinge has a short perpendicular tick into the room,
        // plus a center divider post and "FR" label.

        var frPx   = fp2px(10 / 12);    // ~10 inch panel indicator length
        var frMidX = (h.x + oe.x) / 2;
        var frMidY = (h.y + oe.y) / 2;

        // Room-normal direction: (info.nx, info.ny) = left-hand wall normal (into room)
        // Inward = along that normal; outward = flip it
        var frDir = door.swingInward !== false ? 1 : -1;
        var frNx  = frDir * info.nx;
        var frNy  = frDir * info.ny;

        // Panel tips — short lines perpendicular to wall at each hinge
        var lTipX = h.x  + frNx * frPx;
        var lTipY = h.y  + frNy * frPx;
        var rTipX = oe.x + frNx * frPx;
        var rTipY = oe.y + frNy * frPx;

        // Center divider post
        fpSvgEl(svg, 'line', {
            x1: frMidX - info.nx * jambLen, y1: frMidY - info.ny * jambLen,
            x2: frMidX + info.nx * jambLen, y2: frMidY + info.ny * jambLen,
            stroke: strokeColor, 'stroke-width': isSelected ? 2.5 : 2, 'pointer-events': 'none'
        });

        // Left panel line + hinge dot
        fpSvgEl(svg, 'line', {
            x1: h.x, y1: h.y, x2: lTipX, y2: lTipY,
            stroke: strokeColor, 'stroke-width': isSelected ? 3 : 2.5, 'pointer-events': 'none'
        });
        fpSvgEl(svg, 'circle', { cx: h.x, cy: h.y, r: isSelected ? 4 : 3, fill: strokeColor, 'pointer-events': 'none' });

        // Right panel line + hinge dot
        fpSvgEl(svg, 'line', {
            x1: oe.x, y1: oe.y, x2: rTipX, y2: rTipY,
            stroke: strokeColor, 'stroke-width': isSelected ? 3 : 2.5, 'pointer-events': 'none'
        });
        fpSvgEl(svg, 'circle', { cx: oe.x, cy: oe.y, r: isSelected ? 4 : 3, fill: strokeColor, 'pointer-events': 'none' });

        // Connecting line between panel tips (shows closed-door panel extent)
        fpSvgEl(svg, 'line', {
            x1: lTipX, y1: lTipY, x2: rTipX, y2: rTipY,
            stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5,
            'stroke-dasharray': '4,3', 'pointer-events': 'none'
        });

        // Type label
        var lblFR = fpSvgEl(svg, 'text', { x: frMidX, y: frMidY - 8, 'text-anchor': 'middle', 'font-size': 7, fill: strokeColor, 'pointer-events': 'none' });
        lblFR.textContent = 'FR';

    } else if (subtype === 'sliding') {
        // --- Sliding door: two panel lines side-by-side along the wall opening ---
        var panelW = fp2px(door.width) / 2;
        // Direction vector along wall (from h to oe)
        var dx = oe.x - h.x, dy = oe.y - h.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;  // unit along wall
        // Offset perpendicular (into room side) for panel depth representation
        var depthPx = 6; // px panel depth shown in plan
        var ox = -sw * info.ny * depthPx;
        var oy =  sw * info.nx * depthPx;

        // Panel 1: left half of opening
        var p1sx = h.x, p1sy = h.y;
        var p1ex = h.x + ux * panelW, p1ey = h.y + uy * panelW;
        fpSvgEl(svg, 'line', { x1: p1sx, y1: p1sy, x2: p1ex, y2: p1ey, stroke: strokeColor, 'stroke-width': isSelected ? 2.5 : 2, 'pointer-events': 'none' });
        fpSvgEl(svg, 'line', { x1: p1sx + ox, y1: p1sy + oy, x2: p1ex + ox, y2: p1ey + oy, stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5, 'pointer-events': 'none' });
        fpSvgEl(svg, 'line', { x1: p1sx, y1: p1sy, x2: p1sx + ox, y2: p1sy + oy, stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5, 'pointer-events': 'none' });
        fpSvgEl(svg, 'line', { x1: p1ex, y1: p1ey, x2: p1ex + ox, y2: p1ey + oy, stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5, 'pointer-events': 'none' });

        // Panel 2: right half (offset slightly to show overlap)
        var overlapPx = 4;
        var p2sx = h.x + ux * (panelW - overlapPx), p2sy = h.y + uy * (panelW - overlapPx);
        var p2ex = oe.x, p2ey = oe.y;
        var p2ox = ox * 0.4, p2oy = oy * 0.4; // second panel slightly less depth to show layering
        fpSvgEl(svg, 'line', { x1: p2sx, y1: p2sy, x2: p2ex, y2: p2ey, stroke: strokeColor, 'stroke-width': isSelected ? 2.5 : 2, 'pointer-events': 'none' });
        fpSvgEl(svg, 'line', { x1: p2sx + p2ox, y1: p2sy + p2oy, x2: p2ex + p2ox, y2: p2ey + p2oy, stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5, 'pointer-events': 'none' });
        fpSvgEl(svg, 'line', { x1: p2sx, y1: p2sy, x2: p2sx + p2ox, y2: p2sy + p2oy, stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5, 'pointer-events': 'none' });
        fpSvgEl(svg, 'line', { x1: p2ex, y1: p2ey, x2: p2ex + p2ox, y2: p2ey + p2oy, stroke: strokeColor, 'stroke-width': isSelected ? 2 : 1.5, 'pointer-events': 'none' });

        // Type label
        var midSX = (h.x + oe.x) / 2, midSY = (h.y + oe.y) / 2;
        var lblSL = fpSvgEl(svg, 'text', { x: midSX, y: midSY - 8, 'text-anchor': 'middle', 'font-size': 7, fill: strokeColor, 'pointer-events': 'none' });
        lblSL.textContent = 'SL';

    } else if (subtype === 'pocket') {
        // --- Pocket door: slides into the wall (dashed rect showing pocket) ---
        var pWidthPx = fp2px(door.width);
        // Direction along wall from h toward oe
        var pdx = oe.x - h.x, pdy = oe.y - h.y;
        var pLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        var pux = pdx / pLen, puy = pdy / pLen; // unit along wall
        // Pocket extends from h back into the wall (opposite room-normal)
        var pocketDepth = 8; // px
        var pox = sw * info.ny * pocketDepth;  // into wall (away from room)
        var poy = -sw * info.nx * pocketDepth;

        // Dashed rect: the pocket cavity inside the wall
        fpSvgEl(svg, 'rect', {
            x: Math.min(h.x, h.x + pux * pWidthPx + pox) - 1,
            y: Math.min(h.y, h.y + puy * pWidthPx + poy) - 1,
            width: Math.abs(pux * pWidthPx + pox) + 2,
            height: Math.abs(puy * pWidthPx + poy) + 2,
            fill: 'none', stroke: strokeColor,
            'stroke-width': isSelected ? 2 : 1.5,
            'stroke-dasharray': '4,3', 'pointer-events': 'none'
        });

        // Door panel line (in opening — shows where door sits when closed)
        fpSvgEl(svg, 'line', {
            x1: h.x, y1: h.y, x2: oe.x, y2: oe.y,
            stroke: strokeColor, 'stroke-width': isSelected ? 2.5 : 2, 'pointer-events': 'none'
        });

        // Type label
        var midPX = (h.x + oe.x) / 2, midPY = (h.y + oe.y) / 2;
        var lblPK = fpSvgEl(svg, 'text', { x: midPX, y: midPY - 8, 'text-anchor': 'middle', 'font-size': 7, fill: strokeColor, 'pointer-events': 'none' });
        lblPK.textContent = 'PK';

    } else {
        // Fallback to single for unknown subtypes
        var fbPanelX = h.x - sw * info.ny * fp2px(door.width);
        var fbPanelY = h.y + sw * info.nx * fp2px(door.width);
        fpSvgEl(svg, 'line', {
            x1: h.x, y1: h.y, x2: fbPanelX, y2: fbPanelY,
            stroke: strokeColor, 'stroke-width': isSelected ? 3 : 2.5, 'pointer-events': 'none'
        });
        var fbSweepFlag = door.swingLeft ? 0 : 1;
        var fbR = fp2px(door.width);
        fpSvgEl(svg, 'path', {
            d: 'M ' + fbPanelX + ' ' + fbPanelY + ' A ' + fbR + ' ' + fbR + ' 0 0 ' + fbSweepFlag + ' ' + oe.x + ' ' + oe.y,
            fill: 'none', stroke: isSelected ? '#f59e0b' : '#334155',
            'stroke-width': isSelected ? 2 : 1.5, 'stroke-dasharray': '5,3', 'pointer-events': 'none'
        });
        fpSvgEl(svg, 'circle', { cx: h.x, cy: h.y, r: isSelected ? 4 : 3, fill: strokeColor, 'pointer-events': 'none' });
    }

    // Transparent hit-area line for drag + click (wider stroke, pointer events enabled)
    var hitLine = fpSvgEl(svg, 'line', {
        x1: h.x, y1: h.y, x2: oe.x, y2: oe.y,
        stroke: 'transparent', 'stroke-width': 14,
        style: 'cursor:pointer'
    });

    fpMakeDraggableDoor(hitLine, door);
}

// ============================================================
// WINDOW RENDERING
// ============================================================

function fpRenderWindow(svg, win) {
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === win.roomId; });
    if (!room || !room.points) return;
    var seg = fpGetSegment(room.points, win.segmentIndex);
    if (!seg) return;

    var info = fpWallMetrics(seg, win.position, win.width);
    if (!info) return;

    var h  = info.hinge;
    var oe = info.openEnd;

    var isSelected  = fpSelectedId === win.id && fpSelectedType === 'window';
    var strokeColor = isSelected ? '#f59e0b' : '#4488cc';  // amber when selected, blue otherwise
    var strokeW     = isSelected ? 2.5 : 1.5;

    // Gap (erase wall)
    fpSvgEl(svg, 'line', {
        x1: h.x, y1: h.y, x2: oe.x, y2: oe.y,
        stroke: '#f8f8f8', 'stroke-width': 6, 'pointer-events': 'none'
    });

    // Double line (standard window symbol: two parallel lines offset from wall)
    var off = 3; // pixels each side
    [-1, 1].forEach(function(sign) {
        fpSvgEl(svg, 'line', {
            x1: h.x  + sign * off * info.nx,
            y1: h.y  + sign * off * info.ny,
            x2: oe.x + sign * off * info.nx,
            y2: oe.y + sign * off * info.ny,
            stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
    });

    // End caps
    fpSvgEl(svg, 'line', {
        x1: h.x  - off * info.nx, y1: h.y  - off * info.ny,
        x2: h.x  + off * info.nx, y2: h.y  + off * info.ny,
        stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
    });
    fpSvgEl(svg, 'line', {
        x1: oe.x - off * info.nx, y1: oe.y - off * info.ny,
        x2: oe.x + off * info.nx, y2: oe.y + off * info.ny,
        stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
    });

    // Transparent hit-area line for drag + click
    var hitLine = fpSvgEl(svg, 'line', {
        x1: h.x, y1: h.y, x2: oe.x, y2: oe.y,
        stroke: 'transparent', 'stroke-width': 14,
        style: 'cursor:pointer'
    });
    fpMakeDraggableWindow(hitLine, win);
}

// ============================================================
// IN-PROGRESS DRAWING PREVIEW
// ============================================================

function fpRenderDrawPreview(svg) {
    var pts = fpDrawPoints.slice();

    // Add constrained live cursor point
    if (fpPreviewPoint && pts.length > 0) {
        pts.push(fpConstrainToAxis(fpPreviewPoint, pts[pts.length - 1]));
    }

    // Dashed preview polyline
    if (pts.length >= 2) {
        var ptsStr = pts.map(function(p) {
            return fp2px(p.x) + ',' + fp2px(p.y);
        }).join(' ');
        fpSvgEl(svg, 'polyline', {
            points: ptsStr, fill: 'none',
            stroke: '#0066cc', 'stroke-width': 2,
            'stroke-dasharray': '6,3', 'pointer-events': 'none'
        });
    }

    // Dot at each placed corner
    pts.forEach(function(p, i) {
        fpSvgEl(svg, 'circle', {
            cx: fp2px(p.x), cy: fp2px(p.y),
            r: i === 0 ? 7 : 4,
            fill: i === 0 ? 'white' : '#0066cc',
            stroke: '#0066cc', 'stroke-width': 2,
            'pointer-events': 'none'
        });
    });

    // Coordinate + length label at cursor (SVG)
    if (fpPreviewPoint && pts.length > 0) {
        var cur  = pts[pts.length - 1];
        var prev = fpDrawPoints.length > 0 ? fpDrawPoints[fpDrawPoints.length - 1] : null;
        var segLen = prev ? Math.sqrt(Math.pow(cur.x - prev.x, 2) + Math.pow(cur.y - prev.y, 2)) : 0;
        var lbl = fpSvgEl(svg, 'text', {
            x: fp2px(cur.x) + 8, y: fp2px(cur.y) - 6,
            'font-size': 10, fill: '#0066cc', 'pointer-events': 'none'
        });
        lbl.textContent = cur.x.toFixed(2) + ', ' + cur.y.toFixed(2) + ' ft'
            + (prev ? '  (' + segLen.toFixed(2) + ' ft)' : '');

        // Update the coords bar above the canvas
        fpUpdateCoordsBar(cur.x, cur.y, prev ? segLen : null);
    }
}

/**
 * Update the coords bar display above the SVG canvas.
 * @param {number} x        - Current cursor X in feet
 * @param {number} y        - Current cursor Y in feet
 * @param {number|null} len - Length of current segment in feet, or null if no segment yet
 */
function fpUpdateCoordsBar(x, y, len) {
    var bar     = document.getElementById('fpCoordsBar');
    var posEl   = document.getElementById('fpCoordsPos');
    var lenEl   = document.getElementById('fpCoordsLen');
    var sepEl   = bar ? bar.querySelector('.fp-coords-sep') : null;
    if (!bar || !posEl || !lenEl) return;

    posEl.textContent = 'Position: ' + x.toFixed(2) + ', ' + y.toFixed(2) + ' ft';
    if (len !== null) {
        lenEl.textContent  = 'Segment: ' + len.toFixed(2) + ' ft';
        if (sepEl) sepEl.style.display = '';
        lenEl.style.display = '';
    } else {
        lenEl.textContent  = '';
        if (sepEl) sepEl.style.display = 'none';
        lenEl.style.display = 'none';
    }
}

// ============================================================
// SVG EVENT HANDLERS
// ============================================================

(function() {
    var svg = document.getElementById('fpSvg');

    // Click — room drawing (background) or deselect
    svg.addEventListener('click', function(e) {
        if (!fpPlan) return;
        if (fpActiveTool === 'room') {
            fpHandleRoomClick(e);
        } else if (fpActiveTool === 'select' && e.target === svg) {
            // Background click → deselect
            fpSelectedId        = null;
            fpSelectedSlotIndex = null;
            if (fpCornerEditState) fpExitCornerEdit();
            fpSetStatus('Ready.');
            fpRender();
        }
    });

    // Double-click — finish room or navigate to room
    svg.addEventListener('dblclick', function(e) {
        if (!fpPlan) return;
        if (fpActiveTool === 'room' && fpDrawing) {
            fpFinishRoom(fpMouseToFeet(e));
        } else if (fpActiveTool === 'select' && fpSelectedId) {
            var room = (fpPlan.rooms || []).find(function(r) { return r.id === fpSelectedId; });
            if (room && room.roomId) {
                if (confirm('Go to room detail page for "' + (room.label || 'this room') + '"?')) {
                    window.location.hash = '#room/' + room.roomId;
                }
            }
        }
    });

    // Mouse move — live preview while drawing; also update coords bar when tool is room
    svg.addEventListener('mousemove', function(e) {
        if (!fpPlan) return;

        // Update coords bar whenever the room tool is active
        if (fpActiveTool === 'room') {
            if (!fpDrawing) {
                // Just update position, no segment yet
                var rawPt = fpMouseToFeet(e);
                fpUpdateCoordsBar(rawPt.x, rawPt.y, null);
            }
        }

        if (!fpDrawing) return;
        fpPreviewPoint = fpMouseToFeet(e);
        if (fpDrawPoints.length > 0) {
            var constrained = fpConstrainToAxis(fpPreviewPoint, fpDrawPoints[fpDrawPoints.length - 1]);
            fpSetStatus('Click to place corner  |  Double-click to close  |  Esc to cancel');
        }
        fpRender();
    });
})();

// ============================================================
// ROOM DRAWING LOGIC
// ============================================================

function fpHandleRoomClick(e) {
    // In type mode: first click sets anchor and opens panel; ignore subsequent canvas clicks
    if (fpTypeMode) {
        if (!fpTypeAnchor) {
            fpOpenTypePanel(fpMouseToFeet(e));
        }
        return;
    }

    var pt = fpMouseToFeet(e);

    if (!fpDrawing) {
        // Start a new room
        fpDrawing    = true;
        fpDrawPoints = [pt];
        fpSetStatus('Corner placed at (' + pt.x.toFixed(1) + ', ' + pt.y.toFixed(1) +
            ' ft).  Click to add corners.  Double-click to finish.');
        fpRender();
        return;
    }

    // Check if click is near the first point → close the shape
    var first = fpDrawPoints[0];
    var dx = (pt.x - first.x) * fpPixPerFoot;
    var dy = (pt.y - first.y) * fpPixPerFoot;
    if (fpDrawPoints.length >= 3 && Math.abs(dx) < FP_CLOSE_PX && Math.abs(dy) < FP_CLOSE_PX) {
        fpFinishRoom(null);  // close back to first point
        return;
    }

    // Add constrained corner
    var constrained = fpConstrainToAxis(pt, fpDrawPoints[fpDrawPoints.length - 1]);
    fpDrawPoints.push(constrained);
    fpRender();
}

/**
 * Finish drawing the room.  dblClickPt is the raw (snapped) position of the
 * double-click; null means the user clicked near the first point to close.
 */
function fpFinishRoom(dblClickPt) {
    fpDrawing      = false;
    fpPreviewPoint = null;

    var pts = fpDrawPoints.slice();
    fpDrawPoints = [];

    // --- Rectangle shortcut ---
    // If only 1 segment has been drawn (2 points) and we have a double-click position,
    // auto-complete the 4 corners of a rectangle.
    if (pts.length === 2 && dblClickPt) {
        var A = pts[0], B = pts[1];
        if (A.y === B.y) {
            // Horizontal first segment → use dblClickPt.y for the other dimension
            pts.push({ x: B.x, y: dblClickPt.y });
            pts.push({ x: A.x, y: dblClickPt.y });
        } else {
            // Vertical first segment → use dblClickPt.x
            pts.push({ x: dblClickPt.x, y: B.y });
            pts.push({ x: dblClickPt.x, y: A.y });
        }
    }

    if (pts.length < 3) {
        alert('Need at least 3 corners to close a room. Keep clicking to place more corners.');
        fpRender();
        return;
    }

    // Ensure shape closes with right angles:
    // If the last point and the first point are not on the same axis, add a bridging corner.
    var last  = pts[pts.length - 1];
    var first = pts[0];
    if (last.x !== first.x && last.y !== first.y) {
        pts.push({ x: first.x, y: last.y });
    }

    // Pick next color
    var color = FP_ROOM_COLORS[(fpPlan.rooms || []).length % FP_ROOM_COLORS.length];

    // Open the room-link modal
    fpOpenRoomLinkModal(pts, color);
    fpRender();
}

// ============================================================
// ROOM LINK MODAL  (link shape → Room record, or create new)
// ============================================================

function fpOpenRoomLinkModal(points, color) {
    var select   = document.getElementById('fpRoomLinkSelect');
    var modal    = document.getElementById('fpRoomLinkModal');
    var newGroup = document.getElementById('fpRoomLinkNewNameGroup');

    // Store pending shape data immediately
    modal.dataset.pendingPoints = JSON.stringify(points);
    modal.dataset.pendingColor  = color;
    document.getElementById('fpRoomLinkNewName').value = '';

    // Show modal with a loading state while we fetch rooms
    select.innerHTML = '<option value="">Loading rooms…</option>';
    newGroup.style.display = 'none';
    openModal('fpRoomLinkModal');

    // Always do a fresh query so we get rooms added after the page loaded
    userCol('rooms').where('floorId', '==', fpFloorId).get()
        .then(function(snap) {
            // Refresh fpRoomList from this fresh query
            fpRoomList = [];
            snap.forEach(function(d) {
                fpRoomList.push(Object.assign({ id: d.id }, d.data()));
            });
            fpRoomList.sort(function(a, b) {
                var ta = a.createdAt ? a.createdAt.toMillis() : 0;
                var tb = b.createdAt ? b.createdAt.toMillis() : 0;
                return ta - tb;
            });

            select.innerHTML = '';

            // Only offer rooms not already on this floor plan
            var usedIds  = (fpPlan.rooms || []).map(function(r) { return r.roomId; });
            var unplaced = fpRoomList.filter(function(r) { return !usedIds.includes(r.id); });

            // Existing unplaced rooms listed first
            unplaced.forEach(function(room) {
                var opt = document.createElement('option');
                opt.value       = room.id;
                opt.textContent = room.name;
                select.appendChild(opt);
            });

            // "Create new room" at the bottom
            var newOpt = document.createElement('option');
            newOpt.value       = '';
            newOpt.textContent = '＋ Create a new room…';
            select.appendChild(newOpt);

            // Default: first existing room if any; otherwise "Create new"
            select.value = unplaced.length > 0 ? unplaced[0].id : '';

            newGroup.style.display = select.value === '' ? '' : 'none';
            select.onchange = function() {
                newGroup.style.display = select.value === '' ? '' : 'none';
            };
        })
        .catch(function(err) {
            console.error('fpOpenRoomLinkModal rooms query error:', err);
            select.innerHTML = '';
            var newOpt = document.createElement('option');
            newOpt.value = '';
            newOpt.textContent = '＋ Create a new room…';
            select.appendChild(newOpt);
            select.value = '';
            newGroup.style.display = '';
        });
}

document.getElementById('fpRoomLinkSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('fpRoomLinkModal');
    var points  = JSON.parse(modal.dataset.pendingPoints || '[]');
    var color   = modal.dataset.pendingColor || FP_ROOM_COLORS[0];
    var select  = document.getElementById('fpRoomLinkSelect');
    var newName = document.getElementById('fpRoomLinkNewName').value.trim();

    if (!select.value && !newName) {
        alert('Please enter a name for the new room, or pick an existing one.');
        return;
    }

    function addShape(roomId, roomLabel) {
        var shape = {
            id:     fpGenId(),
            roomId: roomId,
            label:  roomLabel,
            points: points,
            color:  color
        };
        if (!fpPlan.rooms) fpPlan.rooms = [];
        fpPlan.rooms.push(shape);
        fpDirty = true;
        fpSelectedId = shape.id;
        closeModal('fpRoomLinkModal');
        fpRender();
        fpSetStatus('Room "' + roomLabel + '" placed.  Select it to edit corners or navigate to the room.');
    }

    if (select.value) {
        // Link to existing room
        var existing = fpRoomList.find(function(r) { return r.id === select.value; });
        addShape(select.value, existing ? existing.name : 'Room');
    } else {
        // Create a new room record in Firestore, then link
        userCol('rooms').add({
            name:      newName,
            floorId:   fpFloorId,
            type:      'standard',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function(ref) {
            fpRoomList.push({ id: ref.id, name: newName, floorId: fpFloorId });
            addShape(ref.id, newName);
        }).catch(function(err) {
            console.error('Error creating room:', err);
            alert('Failed to create room: ' + err.message);
        });
    }
});

document.getElementById('fpRoomLinkCancelBtn').addEventListener('click', function() {
    closeModal('fpRoomLinkModal');
});

// ============================================================
// SHAPE SELECTION
// ============================================================

function fpSelectShape(shapeId) {
    fpSelectedId   = (fpSelectedId === shapeId && fpSelectedType === 'room') ? null : shapeId;
    fpSelectedType = 'room';
    fpRender();
    if (fpSelectedId) {
        var room = (fpPlan.rooms || []).find(function(r) { return r.id === fpSelectedId; });
        fpSetStatus('"' + (room ? room.label : 'Room') + '" selected.  ' +
            'Edit corners/color with Edit.  Double-click to go to room page.  ' +
            'Delete key or Remove button to remove from floor plan.  Esc to deselect.');
    } else {
        fpSetStatus('Ready.');
    }
}

// ============================================================
// ROOM EDIT MODAL  (label, color, corner positions)
// ============================================================

function fpOpenRoomEditModal() {
    if (!fpSelectedId) return;
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === fpSelectedId; });
    if (!room) return;

    document.getElementById('fpRoomEditLabel').value = room.label || '';
    document.getElementById('fpRoomEditColor').value = room.color || FP_ROOM_COLORS[0];

    // Build corner table rows
    var tbody = document.getElementById('fpRoomEditCornersBody');
    tbody.innerHTML = '';
    (room.points || []).forEach(function(p, i) {
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>Corner ' + (i + 1) + '</td>' +
            '<td><input type="number" step="0.25" class="fp-corner-x" data-idx="' + i + '" value="' + p.x + '" style="width:70px"> ft</td>' +
            '<td><input type="number" step="0.25" class="fp-corner-y" data-idx="' + i + '" value="' + p.y + '" style="width:70px"> ft</td>';
        tbody.appendChild(tr);
    });

    document.getElementById('fpRoomEditModal').dataset.editId = fpSelectedId;
    fpConfigureModalViewMode('fpRoomEditModal', 'fpRoomEditSaveBtn');
    openModal('fpRoomEditModal');
}

document.getElementById('fpRoomEditSaveBtn').addEventListener('click', function() {
    var shapeId = document.getElementById('fpRoomEditModal').dataset.editId;
    var room    = (fpPlan.rooms || []).find(function(r) { return r.id === shapeId; });
    if (!room) { closeModal('fpRoomEditModal'); return; }

    room.label = document.getElementById('fpRoomEditLabel').value.trim() || room.label;
    room.color = document.getElementById('fpRoomEditColor').value;

    document.querySelectorAll('.fp-corner-x').forEach(function(inp) {
        var i = parseInt(inp.dataset.idx, 10);
        if (room.points[i]) room.points[i].x = parseFloat(inp.value) || room.points[i].x;
    });
    document.querySelectorAll('.fp-corner-y').forEach(function(inp) {
        var i = parseInt(inp.dataset.idx, 10);
        if (room.points[i]) room.points[i].y = parseFloat(inp.value) || room.points[i].y;
    });

    fpDirty = true;
    closeModal('fpRoomEditModal');
    fpRender();
});

document.getElementById('fpRoomEditCancelBtn').addEventListener('click', function() {
    closeModal('fpRoomEditModal');
});

// ============================================================
// AUTO-NAMING HELPER
// ============================================================

/**
 * Returns a default name for a newly placed item.
 * If nothing else has this name, returns baseName.
 * If one already exists, returns "baseName 2", then "baseName 3", etc.
 * @param {Array} existingItems  - the fpPlan array to scan (may be null/undefined)
 * @param {string} baseName      - e.g. "Door", "Window", "Recessed Light"
 */
function fpAutoName(existingItems, baseName) {
    var items = existingItems || [];
    var count = items.filter(function(item) {
        return item.name && (item.name === baseName || item.name.startsWith(baseName + ' '));
    }).length;
    return count === 0 ? baseName : baseName + ' ' + (count + 1);
}

// ============================================================
// DELETE SELECTED ROOM SHAPE
// ============================================================

function fpDeleteSelected() {
    if (!fpSelectedId) return;

    if (fpSelectedType === 'room') {
        var room = (fpPlan.rooms || []).find(function(r) { return r.id === fpSelectedId; });
        var name = room ? '"' + room.label + '"' : 'this room';
        if (!confirm('Remove ' + name + ' from the floor plan?\n(The room record is NOT deleted — only the drawing is removed.)')) return;
        fpPlan.rooms    = (fpPlan.rooms    || []).filter(function(r) { return r.id !== fpSelectedId; });
        fpPlan.doors    = (fpPlan.doors    || []).filter(function(d) { return d.roomId !== fpSelectedId; });
        fpPlan.windows  = (fpPlan.windows  || []).filter(function(w) { return w.roomId !== fpSelectedId; });
        fpPlan.outlets          = (fpPlan.outlets          || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpPlan.switches         = (fpPlan.switches         || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpPlan.plumbing         = (fpPlan.plumbing         || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        // Collect IDs of fixtures being removed so we can scrub them from wall plate targets
        var removedFixtureIds = [];
        (fpPlan.ceilingFixtures || []).forEach(function(m) { if (m.roomId === fpSelectedId) removedFixtureIds.push(m.id); });
        (fpPlan.recessedLights  || []).forEach(function(m) { if (m.roomId === fpSelectedId) removedFixtureIds.push(m.id); });
        fpScrubTargetIds(removedFixtureIds);

        fpPlan.ceilingFixtures  = (fpPlan.ceilingFixtures  || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpPlan.recessedLights   = (fpPlan.recessedLights   || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpPlan.wallPlates       = (fpPlan.wallPlates       || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpPlan.fixtures         = (fpPlan.fixtures         || []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpPlan.plumbingEndpoints= (fpPlan.plumbingEndpoints|| []).filter(function(m) { return m.roomId !== fpSelectedId; });
        fpSetStatus('Room removed from floor plan.');
    } else if (fpSelectedType === 'outlet') {
        if (!confirm('Delete this outlet marker?')) return;
        fpPlan.outlets = (fpPlan.outlets || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpSetStatus('Outlet removed.');
    } else if (fpSelectedType === 'switch') {
        if (!confirm('Delete this switch marker?')) return;
        fpPlan.switches = (fpPlan.switches || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpSetStatus('Switch removed.');
    } else if (fpSelectedType === 'plumbing') {
        if (!confirm('Delete this plumbing fixture?')) return;
        fpPlan.plumbing = (fpPlan.plumbing || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpSetStatus('Plumbing fixture removed.');
    } else if (fpSelectedType === 'door') {
        if (!confirm('Delete this door?')) return;
        fpPlan.doors = (fpPlan.doors || []).filter(function(d) { return d.id !== fpSelectedId; });
        fpSetStatus('Door removed.');
    } else if (fpSelectedType === 'window') {
        if (!confirm('Delete this window?')) return;
        fpPlan.windows = (fpPlan.windows || []).filter(function(w) { return w.id !== fpSelectedId; });
        fpSetStatus('Window removed.');
    } else if (fpSelectedType === 'ceiling') {
        if (!confirm('Remove this ceiling fixture from the floor plan?\n(The Thing record is NOT deleted.)')) return;
        fpScrubTargetIds(fpSelectedId);
        fpPlan.ceilingFixtures = (fpPlan.ceilingFixtures || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpSetStatus('Ceiling fixture removed from floor plan.');
    } else if (fpSelectedType === 'recessedLight') {
        if (!confirm('Delete this recessed light?')) return;
        fpScrubTargetIds(fpSelectedId);
        fpPlan.recessedLights = (fpPlan.recessedLights || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpDirty = true;
        fpSelectedId = null;
        fpSelectedType = 'room';
        fpSilentSave();
        fpRender();
        return;
    } else if (fpSelectedType === 'wallplate') {
        if (!confirm('Delete this wall plate?')) return;
        fpPlan.wallPlates = (fpPlan.wallPlates || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpDirty = true;
        fpSelectedId = null;
        fpSelectedType = 'room';
        fpSilentSave();
        fpRender();
        fpSetStatus('Wall plate deleted.');
        return;
    } else if (fpSelectedType === 'fixture') {
        if (!confirm('Delete this fixture?')) return;
        fpPlan.fixtures = (fpPlan.fixtures || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpDirty = true;
        fpSelectedId = null;
        fpSelectedType = 'room';
        fpSilentSave();
        fpRender();
        fpSetStatus('Fixture removed.');
        return;
    } else if (fpSelectedType === 'plumbingEndpoint') {
        if (!confirm('Delete this plumbing endpoint?')) return;
        fpPlan.plumbingEndpoints = (fpPlan.plumbingEndpoints || []).filter(function(m) { return m.id !== fpSelectedId; });
        fpDirty = true;
        fpSelectedId = null;
        fpSelectedType = 'room';
        fpSilentSave();
        fpRender();
        fpSetStatus('Plumbing endpoint removed.');
        return;
    }

    fpSelectedId = null;
    fpDirty = true;
    fpRender();
}

// ============================================================
// DOOR & WINDOW PLACEMENT
// ============================================================

/**
 * Determine which wall segment of a room was clicked, then open the
 * appropriate modal to configure the door or window.
 */
function fpPlaceMarkerOnWall(e, room, markerType) {
    var pt = fpMouseToFeet(e);

    var bestSeg  = null;
    var bestDist = Infinity;
    var bestT    = 0;

    (room.points || []).forEach(function(_, i) {
        var seg = fpGetSegment(room.points, i);
        var r   = fpPtToSegDist(pt, seg);
        if (r.dist < bestDist) {
            bestDist = r.dist;
            bestSeg  = i;
            var segLen = fpSegLength(seg);
            bestT = r.t * segLen;
        }
    });

    // Must click within 2 feet of a wall
    if (bestSeg === null || bestDist > 2) {
        fpSetStatus('Click closer to a wall edge to place a ' + markerType + '.');
        return;
    }

    if (markerType === 'door') {
        var dModal = document.getElementById('fpDoorModal');
        dModal.dataset.mode    = 'add';
        dModal.dataset.editId  = '';
        dModal.dataset.roomId  = room.id;
        dModal.dataset.segIndex = bestSeg;
        dModal.dataset.position = bestT.toFixed(3);
        document.getElementById('fpDoorModalTitle').textContent = 'Add Door';
        document.getElementById('fpDoorFrameInput').value  = "3'";
        document.getElementById('fpDoorInseamInput').value = '32"';
        document.getElementById('fpDoorSubtypeSelect').value = 'single';
        document.getElementById('fpDoorSwingSelect').value = 'inward-left';
        document.getElementById('fpDoorFrenchSwingSelect').value = 'inward';
        document.getElementById('fpDoorDeleteBtn').style.display = 'none';
        document.getElementById('fpDoorSaveBtn').textContent = 'Place Door';
        fpDoorUpdateSwingControls('single');
        openModal('fpDoorModal');
    } else if (markerType === 'window') {
        var wModal = document.getElementById('fpWindowModal');
        wModal.dataset.mode    = 'add';
        wModal.dataset.editId  = '';
        wModal.dataset.roomId  = room.id;
        wModal.dataset.segIndex = bestSeg;
        wModal.dataset.position = bestT.toFixed(3);
        document.getElementById('fpWindowModalTitle').textContent = 'Add Window';
        document.getElementById('fpWindowWidthInput').value  = "3'";
        document.getElementById('fpWindowInseamInput').value = '32"';
        document.getElementById('fpWindowDeleteBtn').style.display = 'none';
        document.getElementById('fpWindowPositionSection').style.display = 'none';
        openModal('fpWindowModal');
    } else if (markerType === 'outlet') {
        fpOpenOutletModal(null, { roomId: room.id, segmentIndex: bestSeg, position: bestT });
    } else if (markerType === 'switch') {
        fpOpenSwitchModal(null, { roomId: room.id, segmentIndex: bestSeg, position: bestT });
    } else if (markerType === 'wallplate') {
        fpOpenWallPlateModal(null, { roomId: room.id, segmentIndex: bestSeg, position: bestT });
    }
}

/** Open the door modal in edit mode for an existing door. */
function fpOpenDoorEditModal(door) {
    var m = document.getElementById('fpDoorModal');
    m.dataset.mode   = 'edit';
    m.dataset.editId = door.id;
    m.dataset.roomId = door.roomId;
    document.getElementById('fpDoorModalTitle').textContent = 'Edit Door';
    document.getElementById('fpDoorFrameInput').value  = fpFmtFeetIn(door.width || 3);
    document.getElementById('fpDoorInseamInput').value = fpFmtFeetIn(door.inseamWidth || Math.max((door.width || 3) - 2/12, 0.5));
    var sub = door.subtype || 'single';
    document.getElementById('fpDoorSubtypeSelect').value = sub;
    // Set swing values and show/hide the right swing control
    var swing = (door.swingInward !== false ? 'inward' : 'outward') + '-' + (door.swingLeft !== false ? 'left' : 'right');
    document.getElementById('fpDoorSwingSelect').value       = swing;
    document.getElementById('fpDoorFrenchSwingSelect').value = door.swingInward !== false ? 'inward' : 'outward';
    fpDoorUpdateSwingControls(sub);

    // Position-from-wall section
    var posSection = document.getElementById('fpDoorPositionSection');
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === door.roomId; });
    var seg  = room ? fpGetSegment(room.points, door.segmentIndex) : null;
    if (seg) {
        var segLen   = fpSegLength(seg);
        var fromStart = door.position;
        var fromEnd   = segLen - door.position - (door.width || 3);
        document.getElementById('fpDoorPosFromStart').textContent = fpFmtFeetIn(Math.max(0, fromStart));
        document.getElementById('fpDoorPosFromEnd').textContent   = fpFmtFeetIn(Math.max(0, fromEnd));
        document.getElementById('fpDoorPosInput').value = fpFmtFeetIn(Math.max(0, fromStart));
        document.getElementById('fpDoorPosRef').value   = 'start';
        m.dataset.segLen = segLen.toFixed(4);
        posSection.style.display = '';
    } else {
        posSection.style.display = 'none';
    }

    document.getElementById('fpDoorDeleteBtn').style.display = '';
    document.getElementById('fpDoorSaveBtn').textContent = 'Save';
    fpConfigureModalViewMode('fpDoorModal', 'fpDoorSaveBtn');
    openModal('fpDoorModal');
}

/** Open the window modal in edit mode for an existing window. */
function fpOpenWindowEditModal(win) {
    var m = document.getElementById('fpWindowModal');
    m.dataset.mode   = 'edit';
    m.dataset.editId = win.id;
    m.dataset.roomId = win.roomId;
    document.getElementById('fpWindowModalTitle').textContent = 'Edit Window';
    document.getElementById('fpWindowWidthInput').value  = fpFmtFeetIn(win.width || 3);
    document.getElementById('fpWindowInseamInput').value = fpFmtFeetIn(win.inseamWidth || Math.max((win.width || 3) - 4/12, 0.5));
    document.getElementById('fpWindowDeleteBtn').style.display = '';

    // Position-from-wall section (populated below, then fpConfigureModalViewMode runs before open)
    var posSection = document.getElementById('fpWindowPositionSection');
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === win.roomId; });
    var seg  = room ? fpGetSegment(room.points, win.segmentIndex) : null;
    if (seg) {
        var segLen    = fpSegLength(seg);
        var fromStart = win.position;
        var fromEnd   = segLen - win.position - (win.width || 3);
        document.getElementById('fpWindowPosFromStart').textContent = fpFmtFeetIn(Math.max(0, fromStart));
        document.getElementById('fpWindowPosFromEnd').textContent   = fpFmtFeetIn(Math.max(0, fromEnd));
        document.getElementById('fpWindowPosInput').value = fpFmtFeetIn(Math.max(0, fromStart));
        document.getElementById('fpWindowPosRef').value   = 'start';
        m.dataset.segLen = segLen.toFixed(4);
        posSection.style.display = '';
    } else {
        posSection.style.display = 'none';
    }

    fpConfigureModalViewMode('fpWindowModal', 'fpWindowSaveBtn');
    openModal('fpWindowModal');
}

// ============================================================
// FIXTURE RENDERING — toilet, sink, tub/shower (Phase 2)
// ============================================================

/**
 * Render a plumbing fixture (toilet/sink/tub) as an SVG symbol.
 * Centered at fp2px(fix.x), fp2px(fix.y), rotated per fix.orientation.
 * @param {SVGElement} svg  - parent SVG/group
 * @param {object}     fix  - fixture record from fpPlan.fixtures[]
 */
function fpRenderFixture(svg, fix) {
    var cx = fp2px(fix.x);
    var cy = fp2px(fix.y);
    var isSelected = (fpSelectedId === fix.id && fpSelectedType === 'fixture');
    var strokeColor = isSelected ? '#f59e0b' : '#1e4d8c';
    var strokeW     = isSelected ? 2.5 : 1.5;

    var g = fpSvgG(svg, 'fp-fixture');
    g.style.cursor = 'pointer';

    // Rotation: 0=0°, 1=90°, 2=180°, 3=270°
    var deg = (fix.orientation || 0) * 90;
    g.setAttribute('transform', 'rotate(' + deg + ',' + cx + ',' + cy + ')');

    if (fix.fixtureType === 'toilet') {
        // Bowl: ellipse
        fpSvgEl(g, 'ellipse', {
            cx: cx, cy: cy + 4, rx: 10, ry: 11,
            fill: isSelected ? '#fffacc' : '#f0f4ff',
            stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
        // Tank: rectangle at top
        fpSvgEl(g, 'rect', {
            x: cx - 10, y: cy - 16, width: 20, height: 8, rx: 2,
            fill: isSelected ? '#fffacc' : '#dce8ff',
            stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });

    } else if (fix.fixtureType === 'sink') {
        // Basin: rounded rect
        fpSvgEl(g, 'rect', {
            x: cx - 9, y: cy - 7, width: 18, height: 14, rx: 3,
            fill: isSelected ? '#fffacc' : '#e0f4ff',
            stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
        // Drain: small center circle
        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy, r: 2,
            fill: strokeColor, 'pointer-events': 'none'
        });

    } else if (fix.fixtureType === 'tub') {
        // Outer rect
        fpSvgEl(g, 'rect', {
            x: cx - 8, y: cy - 13, width: 16, height: 26, rx: 2,
            fill: isSelected ? '#fffacc' : '#e0f4ff',
            stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
        // Inner oval
        fpSvgEl(g, 'ellipse', {
            cx: cx, cy: cy + 1, rx: 6, ry: 9,
            fill: 'none', stroke: strokeColor, 'stroke-width': strokeW * 0.8, 'pointer-events': 'none'
        });
        // Faucet dot at top
        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy - 10, r: 2,
            fill: strokeColor, 'pointer-events': 'none'
        });
    }

    // Transparent hit area
    fpSvgEl(g, 'circle', {
        cx: cx, cy: cy, r: 16,
        fill: 'transparent', stroke: 'none', style: 'cursor:pointer'
    });

    // Label below
    var lbl = fpSvgEl(g, 'text', {
        x: cx, y: cy + 22,
        'text-anchor': 'middle', 'font-size': 7,
        fill: strokeColor, 'pointer-events': 'none'
    });
    lbl.textContent = fix.name || fix.fixtureType || '';

    // Make draggable
    fpMakeDraggableFixture(g, fix);
}

/**
 * Make a fixture group draggable in layout/select mode.
 * A click-without-drag selects; a drag moves the fixture.
 */
function fpMakeDraggableFixture(el, fix) {
    el.style.cursor = 'move';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'layout') return;  // edit-mode: layout only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var startPt = fpMouseToFeet(eDown);
        var startX  = fix.x, startY = fix.y;
        var dragged = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var cur = fpMouseToFeet(e);
            dragged = true;
            fix.x = fpSnap(Math.max(0, Math.min(fpPlan.widthFt,  startX + cur.x - startPt.x)));
            fix.y = fpSnap(Math.max(0, Math.min(fpPlan.heightFt, startY + cur.y - startPt.y)));
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('fixture', fix.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

// ============================================================
// PLUMBING ENDPOINT RENDERING — spigot, stub-out (Phase 2)
// ============================================================

/**
 * Render a plumbing endpoint (spigot or stub-out) symbol.
 * @param {SVGElement} svg - parent SVG element
 * @param {object}     ep  - endpoint record from fpPlan.plumbingEndpoints[]
 */
function fpRenderPlumbingEndpoint(svg, ep) {
    var cx = fp2px(ep.x);
    var cy = fp2px(ep.y);
    var isSelected = (fpSelectedId === ep.id && fpSelectedType === 'plumbingEndpoint');
    var strokeColor = isSelected ? '#f59e0b' : '#0369a1';
    var strokeW     = isSelected ? 2.5 : 1.5;

    var g = fpSvgG(svg, 'fp-plumbing-ep');
    g.style.cursor = 'pointer';

    if (ep.endpointType === 'spigot') {
        // Outer circle
        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy, r: 9,
            fill: '#e0f2fe', stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
        // Stub extending right (spigot nozzle)
        fpSvgEl(g, 'rect', {
            x: cx + 8, y: cy - 3, width: 8, height: 6, rx: 1,
            fill: strokeColor, 'pointer-events': 'none'
        });
        // SP label
        var spLbl = fpSvgEl(g, 'text', {
            x: cx, y: cy + 3, 'text-anchor': 'middle', 'font-size': 7,
            'font-weight': 'bold', fill: strokeColor, 'pointer-events': 'none'
        });
        spLbl.textContent = 'SP';

    } else if (ep.endpointType === 'sprinkler') {
        // Sprinkler head: circle + spray arc above + SPR label
        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy, r: 9,
            fill: '#e0f2fe', stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
        // Spray arc — a quadratic curve fanning upward from the circle
        var arcPath = 'M ' + (cx - 6) + ' ' + (cy - 5) +
                      ' Q ' + cx + ' ' + (cy - 13) + ' ' + (cx + 6) + ' ' + (cy - 5);
        fpSvgEl(g, 'path', {
            d: arcPath, fill: 'none',
            stroke: strokeColor, 'stroke-width': 1.5, 'pointer-events': 'none'
        });
        // SPR label
        var sprLbl = fpSvgEl(g, 'text', {
            x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': 5.5,
            'font-weight': 'bold', fill: strokeColor, 'pointer-events': 'none'
        });
        sprLbl.textContent = 'SPR';

    } else {
        // stub-out: circle with letter(s) for cold/hot/both
        var subtypeColors = { cold: '#0369a1', hot: '#b91c1c', both: '#6b21a8' };
        var sc = subtypeColors[ep.subtype] || strokeColor;
        if (isSelected) sc = '#f59e0b';

        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy, r: 9,
            fill: '#f0f9ff', stroke: sc, 'stroke-width': strokeW, 'pointer-events': 'none'
        });

        var labelText = ep.subtype === 'hot' ? 'H' : (ep.subtype === 'both' ? 'C/H' : 'C');
        var soLbl = fpSvgEl(g, 'text', {
            x: cx, y: cy + 3, 'text-anchor': 'middle',
            'font-size': ep.subtype === 'both' ? 5.5 : 7,
            'font-weight': 'bold', fill: sc, 'pointer-events': 'none'
        });
        soLbl.textContent = labelText;
    }

    // Transparent hit area
    fpSvgEl(g, 'circle', {
        cx: cx, cy: cy, r: 14,
        fill: 'transparent', stroke: 'none', style: 'cursor:pointer'
    });

    // Name label below
    var nameLbl = fpSvgEl(g, 'text', {
        x: cx, y: cy + 18, 'text-anchor': 'middle', 'font-size': 7,
        fill: strokeColor, 'pointer-events': 'none'
    });
    nameLbl.textContent = ep.name || '';

    fpMakeDraggablePlumbingEndpoint(g, ep);
}

/**
 * Make a plumbing endpoint draggable in plumbing/select mode.
 */
function fpMakeDraggablePlumbingEndpoint(el, ep) {
    el.style.cursor = 'move';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'plumbing') return;  // edit-mode: plumbing only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var startPt = fpMouseToFeet(eDown);
        var startX  = ep.x, startY = ep.y;
        var dragged = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var cur = fpMouseToFeet(e);
            dragged = true;
            ep.x = fpSnap(Math.max(0, Math.min(fpPlan.widthFt,  startX + cur.x - startPt.x)));
            ep.y = fpSnap(Math.max(0, Math.min(fpPlan.heightFt, startY + cur.y - startPt.y)));
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('plumbingEndpoint', ep.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

// ============================================================
// FIXTURE + PLUMBING ENDPOINT PLACEMENT (click-to-drop)
// ============================================================

/**
 * Drop a fixture (toilet/sink/tub) into the room at the clicked point.
 * @param {MouseEvent} e          - canvas click event
 * @param {object}     room       - room from fpPlan.rooms
 * @param {string}     fixtureType - 'toilet' | 'sink' | 'tub'
 */
function fpPlaceFixtureInRoom(e, room, fixtureType) {
    var pt = fpMouseToFeet(e);
    if (!fpPointInPolygon(pt, room.points)) return;
    var baseNames = { toilet: 'Toilet', sink: 'Sink', tub: 'Tub' };
    var fix = {
        id:          fpGenId(),
        roomId:      room.id,
        x:           fpSnap(pt.x),
        y:           fpSnap(pt.y),
        fixtureType: fixtureType,
        orientation: 0,
        name:        fpAutoName(fpPlan.fixtures || [], baseNames[fixtureType] || fixtureType),
        notes:       ''
    };
    if (!fpPlan.fixtures) fpPlan.fixtures = [];
    fpPlan.fixtures.push(fix);
    fpDirty = true;
    fpSelectedId   = fix.id;
    fpSelectedType = 'fixture';
    fpSilentSave();
    fpSetTool('select');   // switches tool, re-renders, shows Row 3 props bar
    fpSetStatus(fix.name + ' placed. Drag to reposition or click Edit Marker to configure.');
}

/**
 * Drop a plumbing endpoint (spigot/stubout) into the room at the clicked point.
 * @param {MouseEvent} e    - canvas click event
 * @param {object}     room - room from fpPlan.rooms
 * @param {string}     tool - 'spigot' | 'stubout'
 */
function fpPlacePlumbingEndpointInRoom(e, room, tool) {
    var pt = fpMouseToFeet(e);
    if (!fpPointInPolygon(pt, room.points)) return;
    var baseNames = { spigot: 'Spigot', stubout: 'Stub-out' };
    var ep = {
        id:           fpGenId(),
        roomId:       room.id,
        x:            fpSnap(pt.x),
        y:            fpSnap(pt.y),
        endpointType: tool,
        subtype:      'cold',
        name:         fpAutoName(fpPlan.plumbingEndpoints || [], baseNames[tool] || tool),
        notes:        ''
    };
    if (!fpPlan.plumbingEndpoints) fpPlan.plumbingEndpoints = [];
    fpPlan.plumbingEndpoints.push(ep);
    fpDirty = true;
    fpSelectedId   = ep.id;
    fpSelectedType = 'plumbingEndpoint';
    fpSilentSave();
    fpSetTool('select');   // switches tool, re-renders, shows Row 3 props bar
    fpSetStatus(ep.name + ' placed. Drag to reposition or click Edit Marker to configure.');
}

// ============================================================
// FIXTURE EDIT MODAL
// ============================================================

/**
 * Open the fixture edit modal pre-populated with the given fixture's data.
 * @param {object} fx - fixture record from fpPlan.fixtures[]
 */
function fpOpenFixtureEditModal(fx) {
    document.getElementById('fpFixtureLabel').value       = fx.name || '';
    document.getElementById('fpFixtureOrientation').value = String(fx.orientation || 0);
    document.getElementById('fpFixtureNotes').value       = fx.notes || '';
    var modal = document.getElementById('fpFixtureModal');
    modal.dataset.editId = fx.id;
    fpConfigureModalViewMode('fpFixtureModal', 'fpFixtureSaveBtn');
    openModal('fpFixtureModal');
}

/**
 * Open the plumbing endpoint edit modal pre-populated with the given endpoint's data.
 * @param {object} ep - endpoint record from fpPlan.plumbingEndpoints[]
 */
function fpOpenPlumbingEndpointEditModal(ep) {
    document.getElementById('fpPlumbingEpLabel').value   = ep.name || '';
    document.getElementById('fpPlumbingEpSubtype').value = ep.subtype || 'cold';
    document.getElementById('fpPlumbingEpNotes').value   = ep.notes || '';
    var modal = document.getElementById('fpPlumbingEndpointModal');
    modal.dataset.editId = ep.id;
    fpConfigureModalViewMode('fpPlumbingEndpointModal', 'fpPlumbingEpSaveBtn');
    openModal('fpPlumbingEndpointModal');
}

document.getElementById('fpDoorSaveBtn').addEventListener('click', function() {
    var m       = document.getElementById('fpDoorModal');
    var sub     = document.getElementById('fpDoorSubtypeSelect').value || 'single';
    // Read the correct swing control based on subtype
    var swingInward, swingLeft;
    if (sub === 'french') {
        swingInward = document.getElementById('fpDoorFrenchSwingSelect').value === 'inward';
        swingLeft   = true;  // not used for french rendering, but keep field consistent
    } else if (sub === 'sliding') {
        swingInward = true;
        swingLeft   = true;
    } else {
        var swing   = document.getElementById('fpDoorSwingSelect').value;
        swingInward = swing.startsWith('inward');
        swingLeft   = swing.endsWith('left');
    }
    var frameVal  = fpParseFeetIn(document.getElementById('fpDoorFrameInput').value);
    var inseamVal = fpParseFeetIn(document.getElementById('fpDoorInseamInput').value);
    if (isNaN(frameVal)  || frameVal  <= 0) frameVal  = isNaN(inseamVal) ? 3 : inseamVal + 2/12;
    if (isNaN(inseamVal) || inseamVal <= 0) inseamVal = Math.max(frameVal - 2/12, 0.5);

    var isEdit = m.dataset.mode === 'edit';
    var newDoorId = null;
    if (isEdit) {
        var existing = (fpPlan.doors || []).find(function(d) { return d.id === m.dataset.editId; });
        if (existing) {
            existing.width       = frameVal;
            existing.inseamWidth = inseamVal;
            existing.swingInward = swingInward;
            existing.swingLeft   = swingLeft;
            existing.subtype     = sub;
            // Apply position-from-wall if the user typed a value
            var posRaw = fpParseFeetIn(document.getElementById('fpDoorPosInput').value);
            if (!isNaN(posRaw) && posRaw >= 0) {
                var segLen = parseFloat(m.dataset.segLen) || 0;
                var ref    = document.getElementById('fpDoorPosRef').value;
                if (ref === 'end' && segLen > 0) {
                    existing.position = Math.max(0, segLen - posRaw - frameVal);
                } else {
                    existing.position = Math.max(0, posRaw);
                }
            }
        }
    } else {
        var door = {
            id:           fpGenId(),
            roomId:       m.dataset.roomId,
            segmentIndex: parseInt(m.dataset.segIndex, 10),
            position:     parseFloat(m.dataset.position),
            width:        frameVal,
            inseamWidth:  inseamVal,
            swingInward:  swingInward,
            swingLeft:    swingLeft,
            subtype:      sub,
            name:         fpAutoName(fpPlan.doors, 'Door')
        };
        if (!fpPlan.doors) fpPlan.doors = [];
        fpPlan.doors.push(door);
        newDoorId = door.id;
    }
    fpDirty = true;
    closeModal('fpDoorModal');
    if (newDoorId) { fpSetTool('select'); fpSelectedId = newDoorId; fpSelectedType = 'door'; }
    fpRender();
    fpSetStatus('Door ' + (isEdit ? 'updated' : 'placed — drag to reposition or use Edit Marker to set exact position') + '.');
});

document.getElementById('fpDoorCancelBtn').addEventListener('click', function() {
    closeModal('fpDoorModal');
});

/**
 * Show/hide the appropriate swing control based on door subtype.
 * Sliding has no swing. French has inward/outward only. Single/Pocket have all options.
 */
function fpDoorUpdateSwingControls(subtype) {
    var grp        = document.getElementById('fpDoorSwingGroup');
    var singleSel  = document.getElementById('fpDoorSwingSelect');
    var frenchSel  = document.getElementById('fpDoorFrenchSwingSelect');
    if (subtype === 'sliding') {
        grp.style.display = 'none';
    } else if (subtype === 'french') {
        grp.style.display = '';
        singleSel.style.display = 'none';
        frenchSel.style.display = '';
    } else {
        // single, pocket
        grp.style.display = '';
        singleSel.style.display = '';
        frenchSel.style.display = 'none';
    }
}

// Update swing controls immediately when door type changes in the modal
document.getElementById('fpDoorSubtypeSelect').addEventListener('change', function() {
    fpDoorUpdateSwingControls(this.value);
});

document.getElementById('fpDoorDeleteBtn').addEventListener('click', function() {
    var m = document.getElementById('fpDoorModal');
    if (!confirm('Delete this door?')) return;
    fpPlan.doors = (fpPlan.doors || []).filter(function(d) { return d.id !== m.dataset.editId; });
    fpDirty = true;
    fpSelectedId = null;
    closeModal('fpDoorModal');
    fpRender();
});

document.getElementById('fpWindowSaveBtn').addEventListener('click', function() {
    var m         = document.getElementById('fpWindowModal');
    var frameVal  = fpParseFeetIn(document.getElementById('fpWindowWidthInput').value);
    var inseamVal = fpParseFeetIn(document.getElementById('fpWindowInseamInput').value);
    if (isNaN(frameVal)  || frameVal  <= 0) frameVal  = isNaN(inseamVal) ? 3 : inseamVal + 4/12;
    if (isNaN(inseamVal) || inseamVal <= 0) inseamVal = Math.max(frameVal - 4/12, 0.5);

    var isEdit = m.dataset.mode === 'edit';
    var newWinId = null;
    if (isEdit) {
        var existing = (fpPlan.windows || []).find(function(w) { return w.id === m.dataset.editId; });
        if (existing) {
            existing.width       = frameVal;
            existing.inseamWidth = inseamVal;
            // Apply position-from-wall if the user typed a value
            var posRaw = fpParseFeetIn(document.getElementById('fpWindowPosInput').value);
            if (!isNaN(posRaw) && posRaw >= 0) {
                var segLen = parseFloat(m.dataset.segLen) || 0;
                var ref    = document.getElementById('fpWindowPosRef').value;
                if (ref === 'end' && segLen > 0) {
                    existing.position = Math.max(0, segLen - posRaw - frameVal);
                } else {
                    existing.position = Math.max(0, posRaw);
                }
            }
        }
    } else {
        var win = {
            id:           fpGenId(),
            roomId:       m.dataset.roomId,
            segmentIndex: parseInt(m.dataset.segIndex, 10),
            position:     parseFloat(m.dataset.position),
            width:        frameVal,
            inseamWidth:  inseamVal,
            subtype:      'fixed',
            name:         fpAutoName(fpPlan.windows, 'Window')
        };
        if (!fpPlan.windows) fpPlan.windows = [];
        fpPlan.windows.push(win);
        newWinId = win.id;
    }
    fpDirty = true;
    closeModal('fpWindowModal');
    if (newWinId) { fpSetTool('select'); fpSelectedId = newWinId; fpSelectedType = 'window'; }
    fpRender();
    fpSetStatus('Window ' + (isEdit ? 'updated' : 'placed — drag to reposition or use Edit Marker to set exact position') + '.');
});

document.getElementById('fpWindowCancelBtn').addEventListener('click', function() {
    closeModal('fpWindowModal');
});

document.getElementById('fpWindowDeleteBtn').addEventListener('click', function() {
    var m = document.getElementById('fpWindowModal');
    if (!confirm('Delete this window?')) return;
    fpPlan.windows = (fpPlan.windows || []).filter(function(w) { return w.id !== m.dataset.editId; });
    fpDirty = true;
    fpSelectedId = null;
    closeModal('fpWindowModal');
    fpRender();
});

// ============================================================
// DIMENSIONS MODAL
// ============================================================

document.getElementById('fpSetDimensionsBtn').addEventListener('click', function() {
    if (fpPlan) {
        document.getElementById('fpWidthInput').value  = fpPlan.widthFt;
        document.getElementById('fpHeightInput').value = fpPlan.heightFt;
    }
    openModal('fpDimensionsModal');
});

document.getElementById('fpDimensionsSaveBtn').addEventListener('click', function() {
    var w = parseFloat(document.getElementById('fpWidthInput').value);
    var h = parseFloat(document.getElementById('fpHeightInput').value);
    if (!w || !h || w <= 0 || h <= 0) {
        alert('Enter valid dimensions (positive numbers).');
        return;
    }
    if (!fpPlan) fpPlan = { rooms: [], doors: [], windows: [], outlets: [], switches: [], plumbing: [], ceilingFixtures: [] };
    fpPlan.widthFt  = w;
    fpPlan.heightFt = h;
    fpDirty = true;
    closeModal('fpDimensionsModal');
    fpInitSvg();
    fpRender();
    fpSetStatus('Canvas resized to ' + w + ' × ' + h + ' ft. Saving…');
    // Auto-save so dimensions are persisted even before any rooms are drawn
    fpSave();
});

document.getElementById('fpDimensionsCancelBtn').addEventListener('click', function() {
    closeModal('fpDimensionsModal');
    if (fpPlan) { fpInitSvg(); fpRender(); }
});

// ============================================================
// TOOL SELECTION
// ============================================================

var FP_ALL_TOOLS = ['fpToolSelect','fpToolRoom','fpToolDoor','fpToolWindow','fpToolWallPlate','fpToolCeiling','fpToolRecessed','fpToolToilet','fpToolSink','fpToolTub','fpToolSpigot','fpToolStubout','fpToolSprinkler'];

FP_ALL_TOOLS.forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function() { fpSetTool(btn.dataset.tool); });
});

// ---- Fixtures flyout toggle ----
var ftToggleBtn = document.getElementById('fpToolFixturesToggle');
if (ftToggleBtn) {
    ftToggleBtn.addEventListener('click', function() {
        var subTools = document.querySelectorAll('.fp-fixture-subtool');
        var visible  = subTools.length && subTools[0].style.display !== 'none';
        subTools.forEach(function(el) { el.style.display = visible ? 'none' : ''; });
        ftToggleBtn.textContent = visible ? '🛁 Fixtures ▾' : '🛁 Fixtures ▴';
        ftToggleBtn.classList.toggle('active', !visible);
    });
}

// ---- Fixture modal save / delete ----
document.getElementById('fpFixtureSaveBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpFixtureModal');
    var editId = modal.dataset.editId;
    var fix    = (fpPlan.fixtures || []).find(function(f) { return f.id === editId; });
    if (!fix) return;
    fix.name        = document.getElementById('fpFixtureLabel').value.trim() || fix.name;
    fix.orientation = parseInt(document.getElementById('fpFixtureOrientation').value, 10) || 0;
    fix.notes       = document.getElementById('fpFixtureNotes').value;
    fpDirty = true;
    fpSilentSave();
    closeModal('fpFixtureModal');
    fpRender();
});

document.getElementById('fpFixtureDeleteBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpFixtureModal');
    var editId = modal.dataset.editId;
    if (!confirm('Delete this fixture?')) return;
    fpPlan.fixtures = (fpPlan.fixtures || []).filter(function(f) { return f.id !== editId; });
    fpDirty = true;
    fpSilentSave();
    closeModal('fpFixtureModal');
    fpSelectedId = null;
    fpRender();
});

// ---- Plumbing endpoint modal save / delete ----
document.getElementById('fpPlumbingEpSaveBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpPlumbingEndpointModal');
    var editId = modal.dataset.editId;
    var ep     = (fpPlan.plumbingEndpoints || []).find(function(p) { return p.id === editId; });
    if (!ep) return;
    ep.name    = document.getElementById('fpPlumbingEpLabel').value.trim() || ep.name;
    ep.subtype = document.getElementById('fpPlumbingEpSubtype').value;
    ep.notes   = document.getElementById('fpPlumbingEpNotes').value;
    fpDirty = true;
    fpSilentSave();
    closeModal('fpPlumbingEndpointModal');
    fpRender();
});

document.getElementById('fpPlumbingEpDeleteBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpPlumbingEndpointModal');
    var editId = modal.dataset.editId;
    if (!confirm('Delete this plumbing endpoint?')) return;
    fpPlan.plumbingEndpoints = (fpPlan.plumbingEndpoints || []).filter(function(p) { return p.id !== editId; });
    fpDirty = true;
    fpSilentSave();
    closeModal('fpPlumbingEndpointModal');
    fpSelectedId = null;
    fpRender();
});

// Enter key = place a corner at the current cursor position while drawing a room.
// If the cursor is near the first point (3+ corners placed), the shape closes instead.
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    if (fpCornerEditState) return; // corner edit inputs handle their own Enter
    if (!fpDrawing || !fpPreviewPoint) return;
    // Don't fire if focus is inside a text input or modal
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();

    var pt = fpPreviewPoint;

    // If 3+ corners and preview is near the first point → close the shape
    if (fpDrawPoints.length >= 3) {
        var first = fpDrawPoints[0];
        var dx = (pt.x - first.x) * fpPixPerFoot;
        var dy = (pt.y - first.y) * fpPixPerFoot;
        if (Math.abs(dx) < FP_CLOSE_PX && Math.abs(dy) < FP_CLOSE_PX) {
            fpFinishRoom(null);
            return;
        }
    }

    // Otherwise place a corner at the current snapped cursor position
    fpDrawPoints.push(pt);
    fpRender();
});

function fpSetTool(tool) {
    // In view mode only the Select tool is allowed
    if (fpViewMode && tool !== 'select') return;
    fpActiveTool = tool;
    // Cancel any in-progress drawing
    if (tool !== 'room') {
        fpDrawing      = false;
        fpDrawPoints   = [];
        fpPreviewPoint = null;
    }

    // Switching tools always exits corner edit mode
    if (fpCornerEditState) fpExitCornerEdit();

    // Switching tools always exits type mode and closes the panel
    if (fpTypeMode) {
        fpTypeMode = false;
        fpCloseTypePanel();
        var typeModeBtn = document.getElementById('fpToolTypeMode');
        if (typeModeBtn) typeModeBtn.classList.remove('active');
    }

    // Update button active states
    FP_ALL_TOOLS.forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Clear coords bar when switching tools (bar is always visible)
    if (tool !== 'room') fpClearCoordsBar();

    var svg = document.getElementById('fpSvg');
    svg.style.cursor = (tool === 'select') ? 'default' : 'crosshair';

    var hints = {
        select:   'Click a room or marker to select it.  Double-click room to go to room page.  Drag corner handles to reshape.',
        room:     'Click to place corners.  Segments auto-snap to horizontal/vertical.  Double-click to finish.',
        door:     'Click on any wall edge to place a door.',
        window:   'Click on any wall edge to place a window.',
        wallplate: 'Click on any wall edge to place a wall plate (outlets and switches).',
        plumbing: 'Click inside a room to place a plumbing fixture.',
        ceiling:  'Click inside a room to place a ceiling fixture.',
        recessed: 'Click inside a room to place a recessed light.',
        toilet:   'Click inside a room to place a toilet.',
        sink:     'Click inside a room to place a sink.',
        tub:      'Click inside a room to place a tub or shower.',
        spigot:   'Click inside a room to place an outdoor spigot endpoint.',
        stubout:  'Click inside a room to place a water supply stub-out.'
    };
    fpSetStatus(hints[tool] || '');

    // Close the Fixtures flyout when switching to anything other than a fixture tool
    if (['toilet', 'sink', 'tub'].indexOf(tool) < 0) {
        document.querySelectorAll('.fp-fixture-subtool').forEach(function(el) { el.style.display = 'none'; });
        var ftBtn = document.getElementById('fpToolFixturesToggle');
        if (ftBtn) { ftBtn.textContent = '🛁 Fixtures ▾'; ftBtn.classList.remove('active'); }
    }

    fpRender();
}

// ============================================================
// VIEW / EDIT MODE
// ============================================================

/**
 * Apply or remove view-mode restrictions on the floor plan editor.
 * Call this whenever fpViewMode changes (on load and when Edit button is pressed).
 * View mode: Save hidden, Edit button shown, toolbar hidden, nothing editable.
 * Edit mode: Save shown, Edit hidden, toolbar visible, full editing enabled.
 */
function fpApplyViewMode() {
    var saveBtn = document.getElementById('fpSaveBtn');
    var editBtn = document.getElementById('fpEditBtn');
    var toolbar = document.querySelector('.fp-toolbar');
    var dimBtn  = document.getElementById('fpSetDimensionsBtn');

    if (fpViewMode) {
        if (saveBtn) saveBtn.style.display = 'none';
        if (editBtn) editBtn.style.display = '';
        if (toolbar) toolbar.style.display = 'none';
        if (dimBtn)  dimBtn.style.display  = 'none';
    } else {
        if (saveBtn) saveBtn.style.display = '';
        if (editBtn) editBtn.style.display = 'none';
        if (toolbar) toolbar.style.display = '';
        if (dimBtn)  dimBtn.style.display  = '';
    }

    // Rebuild props bar so button labels/visibility update immediately
    fpUpdatePropsBar();
}

/**
 * Configure a floor plan modal for the current view/edit mode.
 * In view mode: disable all inputs and hide the save + delete buttons.
 * In edit mode: re-enable inputs and restore button visibility.
 * Call this just before openModal() in every marker/room modal open function.
 *
 * @param {string} modalId   - ID of the modal element
 * @param {string} saveBtnId - ID of the modal's Save button
 */
function fpConfigureModalViewMode(modalId, saveBtnId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        // Disable (or re-enable) every form field in the modal
        modal.querySelectorAll('input, select, textarea').forEach(function(el) {
            el.disabled = fpViewMode;
        });
        // Hide (or restore) delete buttons inside the modal
        modal.querySelectorAll('.btn-danger').forEach(function(btn) {
            btn.style.display = fpViewMode ? 'none' : '';
        });
    }
    // Hide (or restore) the modal's Save button
    if (saveBtnId) {
        var saveBtn = document.getElementById(saveBtnId);
        if (saveBtn) saveBtn.style.display = fpViewMode ? 'none' : '';
    }
}

// ============================================================
// TOOLBAR BUTTONS
// ============================================================

document.getElementById('fpGridToggle').addEventListener('change', function() {
    fpRender();
});

// fpEditRoomBtn and fpDeleteRoomBtn removed from toolbar — now built dynamically in fpUpdatePropsBar()

document.getElementById('fpSaveBtn').addEventListener('click', function() {
    fpSave();
});

document.getElementById('fpEditBtn').addEventListener('click', function() {
    fpViewMode = false;
    fpApplyViewMode();
    fpSetStatus('Edit mode — drag items to reposition, use tools to add new items. Click Save when done.');
});

// ============================================================
// SAVE TO FIRESTORE
// ============================================================

/** Save without any button/status UI — used after drags to persist position changes. */
/**
 * Remove one or more fixture IDs from every wall plate slot's targetIds[].
 * Call this whenever a recessed light or ceiling fixture is deleted so no
 * orphaned target references remain in wall plates.
 *
 * @param {string|string[]} ids  - single ID or array of IDs to scrub
 */
function fpScrubTargetIds(ids) {
    var toRemove = Array.isArray(ids) ? ids : [ids];
    if (!toRemove.length) return;
    (fpPlan.wallPlates || []).forEach(function(plate) {
        (plate.slots || []).forEach(function(slot) {
            if (!slot.targetIds || !slot.targetIds.length) return;
            slot.targetIds = slot.targetIds.filter(function(tid) {
                return toRemove.indexOf(tid) < 0;
            });
        });
    });
}

function fpSilentSave() {
    if (!fpFloorId || !fpPlan || !fpDirty) return;
    userCol('floorPlans').doc(fpFloorId).set({
        widthFt:         fpPlan.widthFt,
        heightFt:        fpPlan.heightFt,
        rooms:           fpPlan.rooms            || [],
        doors:           fpPlan.doors            || [],
        windows:         fpPlan.windows          || [],
        outlets:         fpPlan.outlets          || [],
        switches:        fpPlan.switches         || [],
        plumbing:        fpPlan.plumbing         || [],
        ceilingFixtures: fpPlan.ceilingFixtures  || [],
        recessedLights:      fpPlan.recessedLights      || [],
        wallPlates:          fpPlan.wallPlates          || [],
        fixtures:            fpPlan.fixtures            || [],
        plumbingEndpoints:   fpPlan.plumbingEndpoints   || [],
        updatedAt:           firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() { fpDirty = false; })
    .catch(function(err) { console.error('fpSilentSave error:', err); });
}

function fpSave() {
    if (!fpFloorId || !fpPlan) return;
    var btn = document.getElementById('fpSaveBtn');
    btn.textContent = 'Saving…';
    btn.disabled    = true;

    userCol('floorPlans').doc(fpFloorId).set({
        widthFt:          fpPlan.widthFt,
        heightFt:         fpPlan.heightFt,
        rooms:            fpPlan.rooms            || [],
        doors:            fpPlan.doors            || [],
        windows:          fpPlan.windows          || [],
        outlets:          fpPlan.outlets          || [],
        switches:         fpPlan.switches         || [],
        plumbing:         fpPlan.plumbing         || [],
        ceilingFixtures:  fpPlan.ceilingFixtures  || [],
        recessedLights:   fpPlan.recessedLights   || [],
        wallPlates:       fpPlan.wallPlates       || [],
        updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() {
        fpDirty         = false;
        btn.textContent = 'Saved ✓';
        setTimeout(function() { btn.textContent = 'Save'; btn.disabled = false; }, 1800);
        fpSetStatus('Floor plan saved.');
    })
    .catch(function(err) {
        console.error('fpSave error:', err);
        btn.textContent = 'Save';
        btn.disabled    = false;
        alert('Save failed: ' + err.message);
    });
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener('keydown', function(e) {
    if (!window.location.hash.startsWith('#floorplan/')) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (e.key === 'Escape') {
        if (fpDrawing) {
            fpDrawing      = false;
            fpDrawPoints   = [];
            fpPreviewPoint = null;
            fpSetStatus('Drawing cancelled.  Press Esc again to deselect.');
            fpRender();
        } else {
            fpSelectedId = null;
            fpRender();
            fpSetStatus('Deselected.');
        }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && fpSelectedId) {
        if (fpViewMode) return;
        e.preventDefault();
        fpDeleteSelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!fpViewMode) fpSave();
    }
});

// ============================================================
// THUMBNAIL  — render a small read-only floor plan preview
// Called from house.js renderFloorDetail
// ============================================================

/**
 * Load the floorPlans document for a floor and render a small SVG thumbnail
 * inside the given container element.
 *
 * @param {string}   floorId      - Firestore floor ID
 * @param {string}   containerId  - ID of the wrapper div
 * @param {string}   emptyId      - ID of the empty-state <p>
 */
function fpLoadAndRenderThumbnail(floorId, containerId, emptyId) {
    var container = document.getElementById(containerId);
    var emptyEl   = document.getElementById(emptyId);
    if (!container) return;

    userCol('floorPlans').doc(floorId).get()
        .then(function(doc) {
            if (!doc.exists || !doc.data().widthFt) {
                // No plan at all
                if (emptyEl) emptyEl.style.display = '';
                return;
            }
            if (!(doc.data().rooms || []).length) {
                // Dimensions set but no rooms drawn yet
                if (emptyEl) {
                    emptyEl.style.display = '';
                    emptyEl.textContent = 'Floor plan dimensions set — click "Edit Floor Plan" to draw rooms.';
                }
                return;
            }
            if (emptyEl) emptyEl.style.display = 'none';

            var plan = doc.data();
            var thumbW = Math.min(container.clientWidth || 400, 500);
            var scale  = Math.min(thumbW / plan.widthFt, 150 / plan.heightFt, 8);
            var svgW   = Math.round(plan.widthFt  * scale);
            var svgH   = Math.round(plan.heightFt * scale);

            // Build inline SVG
            var ns  = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('width',   svgW);
            svg.setAttribute('height',  svgH);
            svg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
            svg.setAttribute('class',   'fp-thumbnail-svg');

            // Background
            var bg = document.createElementNS(ns, 'rect');
            bg.setAttribute('x', 0); bg.setAttribute('y', 0);
            bg.setAttribute('width', svgW); bg.setAttribute('height', svgH);
            bg.setAttribute('fill', '#f0f0f0'); bg.setAttribute('stroke', '#888');
            bg.setAttribute('stroke-width', 1);
            svg.appendChild(bg);

            // Room shapes
            (plan.rooms || []).forEach(function(room) {
                if (!room.points || room.points.length < 3) return;
                var pts = room.points.map(function(p) {
                    return (p.x * scale) + ',' + (p.y * scale);
                }).join(' ');

                var poly = document.createElementNS(ns, 'polygon');
                poly.setAttribute('points', pts);
                poly.setAttribute('fill', room.color || '#B3D9FF');
                poly.setAttribute('fill-opacity', '0.5');
                poly.setAttribute('stroke', '#444');
                poly.setAttribute('stroke-width', 1);
                poly.style.cursor = 'pointer';
                poly.title = room.label || 'Room';
                poly.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (room.roomId) window.location.hash = '#room/' + room.roomId;
                });
                svg.appendChild(poly);

                // Label
                var c = fpCentroid(room.points);
                var txt = document.createElementNS(ns, 'text');
                txt.setAttribute('x', c.x * scale);
                txt.setAttribute('y', c.y * scale);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('dominant-baseline', 'middle');
                txt.setAttribute('font-size', Math.max(6, scale * 0.55));
                txt.setAttribute('fill', '#333');
                txt.setAttribute('pointer-events', 'none');
                txt.textContent = room.label || '?';
                svg.appendChild(txt);
            });

            // Clear old content and insert
            // Keep the empty state element but hide it
            while (container.firstChild) container.removeChild(container.firstChild);
            if (emptyEl) container.appendChild(emptyEl);
            container.appendChild(svg);
        })
        .catch(function(err) {
            console.error('fpLoadAndRenderThumbnail error:', err);
        });
}

// ============================================================
// GEOMETRY & MATH HELPERS
// ============================================================

/** Convert feet to SVG pixels */
function fp2px(ft) { return ft * fpPixPerFoot; }

/** Snap a feet value to the grid (FP_SNAP_FEET increments) */
function fpSnap(ft) { return Math.round(ft / FP_SNAP_FEET) * FP_SNAP_FEET; }

/** Convert SVG mouse event coords to snapped feet, accounting for zoom/pan */
function fpMouseToFeet(e) {
    var svg  = document.getElementById('fpSvg');
    var rect = svg.getBoundingClientRect();
    var physW = rect.width, physH = rect.height;
    // Map screen pixel → SVG viewBox pixel → floor feet
    var svgX = fpViewX + (e.clientX - rect.left) / physW * fpViewW;
    var svgY = fpViewY + (e.clientY - rect.top)  / physH * fpViewH;
    return {
        x: Math.max(0, Math.min(fpPlan.widthFt,  fpSnap(svgX / fpPixPerFoot))),
        y: Math.max(0, Math.min(fpPlan.heightFt, fpSnap(svgY / fpPixPerFoot)))
    };
}

/**
 * Constrain a new point so the segment from `from` is axis-aligned.
 * Whichever axis has the larger displacement wins.
 */
function fpConstrainToAxis(pt, from) {
    var dx = Math.abs(pt.x - from.x);
    var dy = Math.abs(pt.y - from.y);
    return dx >= dy
        ? { x: pt.x, y: from.y }   // horizontal
        : { x: from.x, y: pt.y };  // vertical
}

/** Centroid of a polygon (average of vertices) */
function fpCentroid(points) {
    var sx = 0, sy = 0;
    points.forEach(function(p) { sx += p.x; sy += p.y; });
    return { x: sx / points.length, y: sy / points.length };
}

/** Axis-aligned bounding box */
function fpBBox(points) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(function(p) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Area of a polygon (shoelace formula), in square feet */
function fpPolygonArea(points) {
    var n    = points.length;
    var area = 0;
    for (var i = 0; i < n; i++) {
        var j  = (i + 1) % n;
        area  += points[i].x * points[j].y;
        area  -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

/** Get the start/end of a wall segment (wraps around to 0) */
function fpGetSegment(points, index) {
    if (!points || index < 0 || index >= points.length) return null;
    return { start: points[index], end: points[(index + 1) % points.length] };
}

/** Length of a segment in feet */
function fpSegLength(seg) {
    var dx = seg.end.x - seg.start.x;
    var dy = seg.end.y - seg.start.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance from point pt to segment seg.
 * Returns {dist, t} where t is [0,1] along the segment.
 */
function fpPtToSegDist(pt, seg) {
    var dx = seg.end.x - seg.start.x;
    var dy = seg.end.y - seg.start.y;
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) {
        return { dist: Math.hypot(pt.x - seg.start.x, pt.y - seg.start.y), t: 0 };
    }
    var t  = ((pt.x - seg.start.x) * dx + (pt.y - seg.start.y) * dy) / len2;
    t      = Math.max(0, Math.min(1, t));
    var qx = seg.start.x + t * dx;
    var qy = seg.start.y + t * dy;
    return { dist: Math.hypot(pt.x - qx, pt.y - qy), t: t };
}

/**
 * Pre-compute wall metrics for door/window rendering (pixel coords).
 * Returns {hinge, openEnd, nx, ny} where nx,ny is the unit normal.
 */
function fpWallMetrics(seg, positionFt, widthFt) {
    var dx  = seg.end.x - seg.start.x;
    var dy  = seg.end.y - seg.start.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;

    var ux = dx / len;  // unit vector along wall
    var uy = dy / len;

    var pos = Math.min(positionFt, len - widthFt);
    if (pos < 0) pos = 0;

    return {
        hinge:   { x: fp2px(seg.start.x + ux * pos),          y: fp2px(seg.start.y + uy * pos) },
        openEnd: { x: fp2px(seg.start.x + ux * (pos + widthFt)), y: fp2px(seg.start.y + uy * (pos + widthFt)) },
        nx: -uy,   // perpendicular (left-hand normal)
        ny:  ux
    };
}

/** Generate a short random shape ID */
function fpGenId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Set the status bar text */
function fpSetStatus(msg) {
    var el = document.getElementById('fpStatus');
    if (el) el.textContent = msg;
}

// ============================================================
// SVG ELEMENT FACTORY HELPERS
// ============================================================

/** Create an SVG element with given attributes, append to parent, return it */
function fpSvgEl(parent, tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function(k) {
        el.setAttribute(k, attrs[k]);
    });
    parent.appendChild(el);
    return el;
}

/** Create a <g> group, append to parent, return it */
function fpSvgG(parent, className) {
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (className) g.setAttribute('class', className);
    parent.appendChild(g);
    return g;
}

// ============================================================
// PHASE H9 — ELECTRICAL & PLUMBING MARKERS
// ============================================================

// ---- Outlet Rendering ----
// Symbol: small filled circle on the wall + two short parallel tick marks
// GFCI outlets get an extra small rectangle label below.

function fpRenderOutlet(svg, outlet) {
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === outlet.roomId; });
    if (!room || !room.points) return;
    var seg = fpGetSegment(room.points, outlet.segmentIndex);
    if (!seg) return;

    var info = fpWallMetrics(seg, outlet.position, 0);
    if (!info) return;

    var cx = info.hinge.x;
    var cy = info.hinge.y;
    var isSelected = (fpSelectedId === outlet.id && fpSelectedType === 'outlet');
    var r = 6;

    // Circle body (no pointer events — hit area handles interaction)
    fpSvgEl(svg, 'circle', {
        cx: cx, cy: cy, r: r,
        fill: isSelected ? '#ffcc00' : 'white',
        stroke: isSelected ? '#cc8800' : '#333',
        'stroke-width': isSelected ? 2.5 : 1.5,
        'pointer-events': 'none'
    });

    // Two small slots (horizontal ticks across the wall direction)
    var ox = info.nx * r * 0.5;
    var oy = info.ny * r * 0.5;
    [-1, 1].forEach(function(sign) {
        fpSvgEl(svg, 'line', {
            x1: cx + sign * ox - info.ny * 2,
            y1: cy + sign * oy + info.nx * 2,
            x2: cx + sign * ox + info.ny * 2,
            y2: cy + sign * oy - info.nx * 2,
            stroke: '#333', 'stroke-width': 1.5, 'pointer-events': 'none'
        });
    });

    // Type label for non-standard outlets
    if (outlet.type && outlet.type !== 'standard') {
        var abbr = { gfci: 'GFI', '220v': '220', usb: 'USB', combo: 'CO' };
        var lbl  = (abbr[outlet.type] || outlet.type.substring(0, 3).toUpperCase());
        var txt  = fpSvgEl(svg, 'text', {
            x: cx, y: cy + r + 8,
            'text-anchor': 'middle', 'font-size': 7, fill: '#0044aa',
            'pointer-events': 'none'
        });
        txt.textContent = lbl;
    }

    // Circuit badge
    if (outlet.circuit) {
        var cb = fpSvgEl(svg, 'text', {
            x: cx, y: cy - r - 3,
            'text-anchor': 'middle', 'font-size': 7, fill: '#666',
            'pointer-events': 'none'
        });
        cb.textContent = outlet.circuit;
    }

    // Transparent hit area — larger than the visible circle, handles drag + select
    var outletHit = fpSvgEl(svg, 'circle', {
        cx: cx, cy: cy, r: 12, fill: 'transparent', stroke: 'transparent'
    });
    fpMakeDraggableOutlet(outletHit, outlet);
}

// ---- Switch Rendering ----
// Symbol: small rectangle with an 'S' inside, placed on the wall

function fpRenderSwitch(svg, sw) {
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === sw.roomId; });
    if (!room || !room.points) return;
    var seg = fpGetSegment(room.points, sw.segmentIndex);
    if (!seg) return;

    var info = fpWallMetrics(seg, sw.position, 0);
    if (!info) return;

    var cx = info.hinge.x;
    var cy = info.hinge.y;
    var isSelected = (fpSelectedId === sw.id && fpSelectedType === 'switch');
    var hw = 7, hh = 9;  // half-width, half-height of the rectangle

    // Rectangle (no pointer events — hit area handles interaction)
    fpSvgEl(svg, 'rect', {
        x: cx - hw, y: cy - hh,
        width: hw * 2, height: hh * 2,
        fill: isSelected ? '#ffcc00' : 'white',
        stroke: isSelected ? '#cc8800' : '#333',
        'stroke-width': isSelected ? 2 : 1.5,
        rx: 1, 'pointer-events': 'none'
    });

    // 'S' label
    var stxt = fpSvgEl(svg, 'text', {
        x: cx, y: cy + 1,
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': 9, 'font-weight': 'bold', fill: '#333',
        'pointer-events': 'none'
    });
    stxt.textContent = 'S';

    // Dimmer indicator
    if (sw.type === 'dimmer') {
        fpSvgEl(svg, 'line', {
            x1: cx - hw + 2, y1: cy + hh + 3,
            x2: cx + hw - 2, y2: cy + hh + 3,
            stroke: '#666', 'stroke-width': 1, 'pointer-events': 'none'
        });
    }

    // Circuit badge
    if (sw.circuit) {
        var cb = fpSvgEl(svg, 'text', {
            x: cx, y: cy - hh - 3,
            'text-anchor': 'middle', 'font-size': 7, fill: '#666',
            'pointer-events': 'none'
        });
        cb.textContent = sw.circuit;
    }

    // Transparent hit area — handles drag + select
    var switchHit = fpSvgEl(svg, 'rect', {
        x: cx - 14, y: cy - 14, width: 28, height: 28,
        fill: 'transparent', stroke: 'transparent'
    });
    fpMakeDraggableSwitch(switchHit, sw);
}

// ---- Plumbing Rendering ----
// Each fixture type has its own shape drawn at (x, y) in feet.

var FP_PLUMBING_LABELS = {
    toilet:    'WC',
    sink:      'Sink',
    bathtub:   'Tub',
    shower:    'Shwr',
    drain:     'Dr',
    waterheater: 'WH',
    washer:    'W',
    dryer:     'D'
};

function fpRenderPlumbing(svg, fix) {
    var cx = fp2px(fix.x);
    var cy = fp2px(fix.y);
    var isSelected = (fpSelectedId === fix.id && fpSelectedType === 'plumbing');
    var stroke = isSelected ? '#cc8800' : '#0055aa';
    var fill   = isSelected ? '#fff3cc' : '#ddeeff';
    var sw     = isSelected ? 2.5 : 1.5;

    var g = fpSvgG(svg, 'fp-plumbing');
    g.style.cursor = 'pointer';
    g.addEventListener('click', function(e) {
        e.stopPropagation();
        if (fpActiveTool === 'select') fpSelectMarker('plumbing', fix.id);
    });

    var type = fix.fixtureType || 'sink';

    if (type === 'toilet') {
        // Oval (bowl) + small rect (tank)
        fpSvgEl(g, 'ellipse', { cx: cx, cy: cy + 6, rx: 9, ry: 12, fill: fill, stroke: stroke, 'stroke-width': sw });
        fpSvgEl(g, 'rect', { x: cx - 8, y: cy - 16, width: 16, height: 10, rx: 2, fill: fill, stroke: stroke, 'stroke-width': sw });

    } else if (type === 'sink') {
        fpSvgEl(g, 'rect', { x: cx - 10, y: cy - 8, width: 20, height: 16, rx: 3, fill: fill, stroke: stroke, 'stroke-width': sw });
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 3, fill: stroke, 'stroke-width': 0 }); // drain

    } else if (type === 'bathtub') {
        fpSvgEl(g, 'rect', { x: cx - 10, y: cy - 20, width: 20, height: 38, rx: 8, fill: fill, stroke: stroke, 'stroke-width': sw });

    } else if (type === 'shower') {
        fpSvgEl(g, 'rect', { x: cx - 12, y: cy - 12, width: 24, height: 24, fill: fill, stroke: stroke, 'stroke-width': sw });
        // Diagonal corner cuts
        fpSvgEl(g, 'line', { x1: cx - 12, y1: cy - 4, x2: cx - 4, y2: cy - 12, stroke: stroke, 'stroke-width': sw });
        fpSvgEl(g, 'line', { x1: cx + 4,  y1: cy - 12, x2: cx + 12, y2: cy - 4, stroke: stroke, 'stroke-width': sw });

    } else if (type === 'drain') {
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 7, fill: fill, stroke: stroke, 'stroke-width': sw });
        fpSvgEl(g, 'line', { x1: cx - 5, y1: cy - 5, x2: cx + 5, y2: cy + 5, stroke: stroke, 'stroke-width': sw });
        fpSvgEl(g, 'line', { x1: cx + 5, y1: cy - 5, x2: cx - 5, y2: cy + 5, stroke: stroke, 'stroke-width': sw });

    } else if (type === 'waterheater') {
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 13, fill: fill, stroke: stroke, 'stroke-width': sw });

    } else if (type === 'washer' || type === 'dryer') {
        fpSvgEl(g, 'rect', { x: cx - 12, y: cy - 12, width: 24, height: 24, rx: 2, fill: fill, stroke: stroke, 'stroke-width': sw });
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 8, fill: 'none', stroke: stroke, 'stroke-width': sw });

    } else {
        // Generic square
        fpSvgEl(g, 'rect', { x: cx - 10, y: cy - 10, width: 20, height: 20, fill: fill, stroke: stroke, 'stroke-width': sw });
    }

    // Label below fixture
    var lbl = fpSvgEl(g, 'text', {
        x: cx, y: cy + 22,
        'text-anchor': 'middle', 'font-size': 8, fill: '#0044aa',
        'pointer-events': 'none'
    });
    lbl.textContent = FP_PLUMBING_LABELS[type] || type;
}

// ---- Marker Selection ----

function fpSelectMarker(type, id) {
    // Changing selection always clears slot focus (wall plate click sets it explicitly after)
    if (type !== 'wallplate' || id !== fpSelectedId) fpSelectedSlotIndex = null;

    if (fpSelectedId === id && fpSelectedType === type) {
        fpSelectedId   = null;
        fpSelectedType = 'room';
        fpSetStatus('Ready.');
    } else {
        fpSelectedId   = id;
        fpSelectedType = type;
        fpSetStatus(type.charAt(0).toUpperCase() + type.slice(1) + ' selected. Edit Marker to view/edit properties. Delete or Remove to delete.');
    }
    fpRender();
}

// ---- Plumbing floor-placement (click inside room) ----

function fpPlacePlumbingInRoom(e, room) {
    var pt = fpMouseToFeet(e);

    // Verify the click is inside the room polygon
    if (!fpPointInPolygon(pt, room.points)) {
        fpSetStatus('Click inside a room to place a plumbing fixture.');
        return;
    }

    var modal = document.getElementById('fpPlumbingModal');
    modal.dataset.mode   = 'add';
    modal.dataset.roomId = room.id;
    modal.dataset.x      = pt.x.toFixed(3);
    modal.dataset.y      = pt.y.toFixed(3);
    modal.dataset.editId = '';

    // Reset form
    document.getElementById('fpPlumbingTypeSelect').value   = 'toilet';
    document.getElementById('fpPlumbingShutoffInput').value = '';
    document.getElementById('fpPlumbingSupplySelect').value = '';
    document.getElementById('fpPlumbingNotesInput').value   = '';
    document.getElementById('fpPlumbingProblemsSection').style.display = 'none';

    openModal('fpPlumbingModal');
}

// ---- Point-in-polygon test (ray casting) ----

function fpPointInPolygon(pt, points) {
    var x = pt.x, y = pt.y;
    var inside = false;
    for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
        var xi = points[i].x, yi = points[i].y;
        var xj = points[j].x, yj = points[j].y;
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

// ---- Open marker edit modal ----

function fpOpenMarkerEditModal(type, id) {
    if (type === 'outlet') {
        var outlet = (fpPlan.outlets || []).find(function(m) { return m.id === id; });
        if (!outlet) return;
        fpOpenOutletModal(id, outlet);
    } else if (type === 'switch') {
        var sw = (fpPlan.switches || []).find(function(m) { return m.id === id; });
        if (!sw) return;
        fpOpenSwitchModal(id, sw);
    } else if (type === 'plumbing') {
        var fix = (fpPlan.plumbing || []).find(function(m) { return m.id === id; });
        if (!fix) return;
        fpOpenPlumbingEditModal(id, fix);
    } else if (type === 'ceiling') {
        var cf = (fpPlan.ceilingFixtures || []).find(function(m) { return m.id === id; });
        if (!cf) return;
        fpOpenCeilingModal(id, cf);
    } else if (type === 'recessedLight') {
        var rl = (fpPlan.recessedLights || []).find(function(m) { return m.id === id; });
        if (!rl) return;
        fpOpenRecessedModal(id, rl);
    } else if (type === 'door') {
        var d = (fpPlan.doors || []).find(function(m) { return m.id === id; });
        if (!d) return;
        fpOpenDoorEditModal(d);
    } else if (type === 'window') {
        var w = (fpPlan.windows || []).find(function(m) { return m.id === id; });
        if (!w) return;
        fpOpenWindowEditModal(w);
    } else if (type === 'wallplate') {
        var wp = (fpPlan.wallPlates || []).find(function(m) { return m.id === id; });
        if (!wp) return;
        fpOpenWallPlateModal(id, wp);
    } else if (type === 'fixture') {
        var fx = (fpPlan.fixtures || []).find(function(m) { return m.id === id; });
        if (!fx) return;
        fpOpenFixtureEditModal(fx);
    } else if (type === 'plumbingEndpoint') {
        var pe = (fpPlan.plumbingEndpoints || []).find(function(m) { return m.id === id; });
        if (!pe) return;
        fpOpenPlumbingEndpointEditModal(pe);
    }
}

// ============================================================
// BREAKER DROPDOWN HELPER  (Phase H13)
// ============================================================

/**
 * Populate a <select> element with all breakers from all panels.
 * Groups by panel name using <optgroup>. Sets the current selection
 * if currentBreakerId is provided.
 *
 * @param {string}      selectId         - id of the <select> element to populate
 * @param {string|null} currentBreakerId - breaker.id to pre-select, or null/empty for none
 */
function fpLoadBreakerOptions(selectId, currentBreakerId) {
    var select = document.getElementById(selectId);
    select.innerHTML = '<option value="">— No breaker linked —</option>';

    userCol('breakerPanels').get()
        .then(function(snap) {
            if (snap.empty) return;  // No panels configured yet — leave just the default option

            var panelDocs = [];
            snap.forEach(function(d) { panelDocs.push(d); });
            // Sort panels alphabetically so the dropdown is predictable
            panelDocs.sort(function(a, b) {
                return (a.data().name || '').localeCompare(b.data().name || '');
            });

            panelDocs.forEach(function(panelDoc) {
                var panel    = panelDoc.data();
                var breakers = (panel.breakers || []).slice().sort(function(a, b) {
                    return a.slot - b.slot;
                });
                if (!breakers.length) return;  // Panel exists but has no assigned slots yet

                var group = document.createElement('optgroup');
                group.label = panel.name || 'Panel';

                breakers.forEach(function(b) {
                    var opt = document.createElement('option');
                    opt.value           = b.id;
                    opt.dataset.panelId = panelDoc.id;
                    opt.dataset.slot    = b.slot;
                    opt.textContent =
                        'Slot ' + b.slot +
                        (b.label ? ' \u2013 ' + b.label : '') +
                        (b.amps  ? ' (' + b.amps + 'A)' : '');
                    if (currentBreakerId && b.id === currentBreakerId) opt.selected = true;
                    group.appendChild(opt);
                });

                select.appendChild(group);
            });
        })
        .catch(function(err) {
            console.error('fpLoadBreakerOptions error:', err);
        });
}

// ============================================================
// OUTLET MODAL
// ============================================================

/**
 * Open the outlet add/edit modal.
 * @param {string|null} editId   - existing outlet ID, or null for new
 * @param {object}      data     - existing data (or pending wall position for new)
 */
function fpOpenOutletModal(editId, data) {
    var modal = document.getElementById('fpOutletModal');
    modal.dataset.editId = editId || '';

    if (editId) {
        // Edit mode
        document.getElementById('fpOutletModalTitle').textContent = 'Edit Outlet';
        document.getElementById('fpOutletTypeSelect').value  = data.type  || 'standard';
        document.getElementById('fpOutletNotesInput').value  = data.notes || '';
        // Store wall position from existing marker
        modal.dataset.roomId   = data.roomId;
        modal.dataset.segIndex = data.segmentIndex;
        modal.dataset.position = data.position;
        // Position-from-wall section
        var outletPosSection = document.getElementById('fpOutletPositionSection');
        var outletRoom = (fpPlan.rooms || []).find(function(r) { return r.id === data.roomId; });
        var outletSeg  = outletRoom ? fpGetSegment(outletRoom.points, data.segmentIndex) : null;
        if (outletSeg) {
            var outletSegLen  = fpSegLength(outletSeg);
            var outletFromStart = data.position;
            var outletFromEnd   = outletSegLen - data.position;
            document.getElementById('fpOutletPosFromStart').textContent = fpFmtFeetIn(Math.max(0, outletFromStart));
            document.getElementById('fpOutletPosFromEnd').textContent   = fpFmtFeetIn(Math.max(0, outletFromEnd));
            document.getElementById('fpOutletPosInput').value = fpFmtFeetIn(Math.max(0, outletFromStart));
            document.getElementById('fpOutletPosRef').value   = 'start';
            modal.dataset.segLen = outletSegLen.toFixed(4);
            outletPosSection.style.display = '';
        } else {
            outletPosSection.style.display = 'none';
        }
        // Show problems section
        document.getElementById('fpOutletProblemsSection').style.display = '';
        loadProblems('outlet', editId,
            'fpOutletProblemsContainer', 'fpOutletProblemsEmptyState');
    } else {
        // Add mode
        document.getElementById('fpOutletModalTitle').textContent = 'Add Outlet';
        document.getElementById('fpOutletTypeSelect').value  = 'standard';
        document.getElementById('fpOutletNotesInput').value  = '';
        modal.dataset.roomId   = data.roomId;
        modal.dataset.segIndex = data.segmentIndex;
        modal.dataset.position = data.position;
        document.getElementById('fpOutletPositionSection').style.display = 'none';
        document.getElementById('fpOutletProblemsSection').style.display = 'none';
    }

    // Populate breaker dropdown (async — loads after modal opens)
    fpLoadBreakerOptions('fpOutletBreakerSelect', data.breakerId || '');

    fpConfigureModalViewMode('fpOutletModal', 'fpOutletSaveBtn');
    openModal('fpOutletModal');
}

document.getElementById('fpOutletSaveBtn').addEventListener('click', function() {
    var modal   = document.getElementById('fpOutletModal');
    var editId  = modal.dataset.editId;

    // Read the breaker selection — value is breakerId, data-panel-id is panelId
    var bkrSel  = document.getElementById('fpOutletBreakerSelect');
    var bkrId   = bkrSel.value || '';
    var panelId = bkrId && bkrSel.selectedIndex >= 0
        ? (bkrSel.options[bkrSel.selectedIndex].dataset.panelId || '') : '';

    var props = {
        type:         document.getElementById('fpOutletTypeSelect').value,
        breakerId:    bkrId,
        panelId:      panelId,
        notes:        document.getElementById('fpOutletNotesInput').value.trim(),
        roomId:       modal.dataset.roomId,
        segmentIndex: parseInt(modal.dataset.segIndex, 10),
        position:     parseFloat(modal.dataset.position)
    };

    // Apply position-from-wall if the user typed a value (edit mode only)
    if (editId) {
        var posRawOutlet = fpParseFeetIn(document.getElementById('fpOutletPosInput').value);
        if (!isNaN(posRawOutlet) && posRawOutlet >= 0) {
            var segLenOutlet = parseFloat(modal.dataset.segLen) || 0;
            var refOutlet    = document.getElementById('fpOutletPosRef').value;
            if (refOutlet === 'end' && segLenOutlet > 0) {
                props.position = Math.max(0, segLenOutlet - posRawOutlet);
            } else {
                props.position = Math.max(0, posRawOutlet);
            }
        }
    }

    var newOutletId = null;
    if (editId) {
        // Update existing
        var outlet = (fpPlan.outlets || []).find(function(m) { return m.id === editId; });
        if (outlet) Object.assign(outlet, props);
    } else {
        // Add new
        props.id = fpGenId();
        if (!fpPlan.outlets) fpPlan.outlets = [];
        fpPlan.outlets.push(props);
        newOutletId = props.id;
    }

    fpDirty = true;
    closeModal('fpOutletModal');
    if (newOutletId) { fpSetTool('select'); fpSelectedId = newOutletId; fpSelectedType = 'outlet'; }
    fpRender();
    fpSetStatus('Outlet ' + (editId ? 'updated' : 'placed — drag to reposition or use Edit Marker to set exact position') + '.');
});

document.getElementById('fpOutletCancelBtn').addEventListener('click', function() {
    closeModal('fpOutletModal');
});

document.getElementById('fpOutletAddProblemBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpOutletModal').dataset.editId;
    if (!editId) return;
    if (typeof openAddProblemModal === 'function') {
        openAddProblemModal('outlet', editId, function() {
            loadProblems('outlet', editId, 'fpOutletProblemsContainer', 'fpOutletProblemsEmptyState');
        });
    }
});

// ============================================================
// SWITCH MODAL
// ============================================================

function fpOpenSwitchModal(editId, data) {
    var modal = document.getElementById('fpSwitchModal');
    modal.dataset.editId = editId || '';

    if (editId) {
        document.getElementById('fpSwitchModalTitle').textContent = 'Edit Switch';
        document.getElementById('fpSwitchTypeSelect').value     = data.type     || 'single-pole';
        document.getElementById('fpSwitchControlsInput').value  = data.controls || '';
        document.getElementById('fpSwitchNotesInput').value     = data.notes    || '';
        modal.dataset.roomId   = data.roomId;
        modal.dataset.segIndex = data.segmentIndex;
        modal.dataset.position = data.position;
        // Position-from-wall section
        var switchPosSection = document.getElementById('fpSwitchPositionSection');
        var switchRoom = (fpPlan.rooms || []).find(function(r) { return r.id === data.roomId; });
        var switchSeg  = switchRoom ? fpGetSegment(switchRoom.points, data.segmentIndex) : null;
        if (switchSeg) {
            var switchSegLen    = fpSegLength(switchSeg);
            var switchFromStart = data.position;
            var switchFromEnd   = switchSegLen - data.position;
            document.getElementById('fpSwitchPosFromStart').textContent = fpFmtFeetIn(Math.max(0, switchFromStart));
            document.getElementById('fpSwitchPosFromEnd').textContent   = fpFmtFeetIn(Math.max(0, switchFromEnd));
            document.getElementById('fpSwitchPosInput').value = fpFmtFeetIn(Math.max(0, switchFromStart));
            document.getElementById('fpSwitchPosRef').value   = 'start';
            modal.dataset.segLen = switchSegLen.toFixed(4);
            switchPosSection.style.display = '';
        } else {
            switchPosSection.style.display = 'none';
        }
        document.getElementById('fpSwitchProblemsSection').style.display = '';
        loadProblems('switch', editId,
            'fpSwitchProblemsContainer', 'fpSwitchProblemsEmptyState');
    } else {
        document.getElementById('fpSwitchModalTitle').textContent = 'Add Switch';
        document.getElementById('fpSwitchTypeSelect').value    = 'single-pole';
        document.getElementById('fpSwitchControlsInput').value = '';
        document.getElementById('fpSwitchNotesInput').value    = '';
        modal.dataset.roomId   = data.roomId;
        modal.dataset.segIndex = data.segmentIndex;
        modal.dataset.position = data.position;
        document.getElementById('fpSwitchPositionSection').style.display = 'none';
        document.getElementById('fpSwitchProblemsSection').style.display = 'none';
    }

    // Populate breaker dropdown (async)
    fpLoadBreakerOptions('fpSwitchBreakerSelect', data.breakerId || '');

    fpConfigureModalViewMode('fpSwitchModal', 'fpSwitchSaveBtn');
    openModal('fpSwitchModal');
}

document.getElementById('fpSwitchSaveBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpSwitchModal');
    var editId = modal.dataset.editId;

    var bkrSel  = document.getElementById('fpSwitchBreakerSelect');
    var bkrId   = bkrSel.value || '';
    var panelId = bkrId && bkrSel.selectedIndex >= 0
        ? (bkrSel.options[bkrSel.selectedIndex].dataset.panelId || '') : '';

    var props = {
        type:         document.getElementById('fpSwitchTypeSelect').value,
        controls:     document.getElementById('fpSwitchControlsInput').value.trim(),
        breakerId:    bkrId,
        panelId:      panelId,
        notes:        document.getElementById('fpSwitchNotesInput').value.trim(),
        roomId:       modal.dataset.roomId,
        segmentIndex: parseInt(modal.dataset.segIndex, 10),
        position:     parseFloat(modal.dataset.position)
    };

    // Apply position-from-wall if typed (edit mode only)
    if (editId) {
        var posRawSwitch = fpParseFeetIn(document.getElementById('fpSwitchPosInput').value);
        if (!isNaN(posRawSwitch) && posRawSwitch >= 0) {
            var segLenSwitch = parseFloat(modal.dataset.segLen) || 0;
            var refSwitch    = document.getElementById('fpSwitchPosRef').value;
            if (refSwitch === 'end' && segLenSwitch > 0) {
                props.position = Math.max(0, segLenSwitch - posRawSwitch);
            } else {
                props.position = Math.max(0, posRawSwitch);
            }
        }
    }

    var newSwitchId = null;
    if (editId) {
        var sw = (fpPlan.switches || []).find(function(m) { return m.id === editId; });
        if (sw) Object.assign(sw, props);
    } else {
        props.id = fpGenId();
        if (!fpPlan.switches) fpPlan.switches = [];
        fpPlan.switches.push(props);
        newSwitchId = props.id;
    }

    fpDirty = true;
    closeModal('fpSwitchModal');
    if (newSwitchId) { fpSetTool('select'); fpSelectedId = newSwitchId; fpSelectedType = 'switch'; }
    fpRender();
    fpSetStatus('Switch ' + (editId ? 'updated' : 'placed — drag to reposition or use Edit Marker to set exact position') + '.');
});

document.getElementById('fpSwitchCancelBtn').addEventListener('click', function() {
    closeModal('fpSwitchModal');
});

document.getElementById('fpSwitchAddProblemBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpSwitchModal').dataset.editId;
    if (!editId) return;
    if (typeof openAddProblemModal === 'function') {
        openAddProblemModal('switch', editId, function() {
            loadProblems('switch', editId, 'fpSwitchProblemsContainer', 'fpSwitchProblemsEmptyState');
        });
    }
});

// ============================================================
// PLUMBING MODAL
// ============================================================

function fpOpenPlumbingEditModal(editId, data) {
    var modal = document.getElementById('fpPlumbingModal');
    modal.dataset.mode   = 'edit';
    modal.dataset.editId = editId;
    modal.dataset.roomId = data.roomId;
    modal.dataset.x      = data.x;
    modal.dataset.y      = data.y;

    document.getElementById('fpPlumbingTypeSelect').value   = data.fixtureType  || 'sink';
    document.getElementById('fpPlumbingShutoffInput').value = data.shutoff      || '';
    document.getElementById('fpPlumbingSupplySelect').value = data.supplyLine   || '';
    document.getElementById('fpPlumbingNotesInput').value   = data.notes        || '';
    document.getElementById('fpPlumbingProblemsSection').style.display = '';
    loadProblems('plumbing', editId,
        'fpPlumbingProblemsContainer', 'fpPlumbingProblemsEmptyState');

    fpConfigureModalViewMode('fpPlumbingModal', 'fpPlumbingSaveBtn');
    openModal('fpPlumbingModal');
}

document.getElementById('fpPlumbingSaveBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpPlumbingModal');
    var editId = modal.dataset.editId;
    var mode   = modal.dataset.mode;

    var props = {
        fixtureType: document.getElementById('fpPlumbingTypeSelect').value,
        shutoff:     document.getElementById('fpPlumbingShutoffInput').value.trim(),
        supplyLine:  document.getElementById('fpPlumbingSupplySelect').value,
        notes:       document.getElementById('fpPlumbingNotesInput').value.trim(),
        roomId:      modal.dataset.roomId,
        x:           parseFloat(modal.dataset.x),
        y:           parseFloat(modal.dataset.y)
    };

    var newPlumbingId = null;
    if (mode === 'edit' && editId) {
        var fix = (fpPlan.plumbing || []).find(function(m) { return m.id === editId; });
        if (fix) Object.assign(fix, props);
    } else {
        props.id = fpGenId();
        if (!fpPlan.plumbing) fpPlan.plumbing = [];
        fpPlan.plumbing.push(props);
        newPlumbingId = props.id;
    }

    fpDirty = true;
    closeModal('fpPlumbingModal');
    if (newPlumbingId) { fpSetTool('select'); fpSelectedId = newPlumbingId; fpSelectedType = 'plumbing'; }
    fpRender();
    fpSetStatus('Plumbing fixture ' + (editId ? 'updated' : 'placed — drag to reposition') + '.');
});

document.getElementById('fpPlumbingCancelBtn').addEventListener('click', function() {
    closeModal('fpPlumbingModal');
});

document.getElementById('fpPlumbingAddProblemBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpPlumbingModal');
    var editId = modal.dataset.editId;
    if (!editId) return;
    if (typeof openAddProblemModal === 'function') {
        openAddProblemModal('plumbing', editId, function() {
            loadProblems('plumbing', editId, 'fpPlumbingProblemsContainer', 'fpPlumbingProblemsEmptyState');
        });
    }
});

// ============================================================
// PHASE H10 — CEILING FIXTURE MARKERS
// ============================================================
// Ceiling fans and ceiling lights are placed inside room shapes.
// Each is linked to a Thing record (category: ceiling-fan or ceiling-light).
// Clicking the symbol in Select mode selects it; double-click navigates
// to the Thing's detail page.
// ============================================================

// ---- Rendering ----

/**
 * Draw a ceiling fixture symbol inside the floor plan.
 * Fan: circle + 4 blade lines radiating at 45° angles.
 * Light: circle + 8 short ray lines (starburst).
 */
function fpRenderCeilingFixture(svg, fix) {
    var cx = fp2px(fix.x);
    var cy = fp2px(fix.y);
    var isSelected = (fpSelectedId === fix.id && fpSelectedType === 'ceiling');

    // Determine subtype with backward compat for old category field
    var subtype = fix.subtype;
    if (!subtype) {
        subtype = (fix.category === 'ceiling-fan') ? 'fan' : 'generic';
    }

    // Color scheme: fans = blue tones, lights = amber/brown tones
    var isFanType = (subtype === 'fan' || subtype === 'fan-light');
    var strokeColor = isSelected ? '#cc8800' : (isFanType ? '#005599' : '#884400');
    var fillColor   = isSelected ? '#fffacc' : (isFanType ? '#ddeeff' : '#fff5dd');
    var strokeW     = isSelected ? 2.5 : 1.5;

    var g = fpSvgG(svg, 'fp-ceiling-fixture');
    g.style.cursor = 'pointer';

    // Outer circle (all subtypes share this)
    fpSvgEl(g, 'circle', {
        cx: cx, cy: cy, r: 14,
        fill: fillColor,
        stroke: strokeColor, 'stroke-width': strokeW
    });

    if (subtype === 'fan') {
        // 4 blade lines at 0°, 45°, 90°, 135°
        [0, 45, 90, 135].forEach(function(deg) {
            var rad = deg * Math.PI / 180;
            var bx  = Math.cos(rad) * 12;
            var by  = Math.sin(rad) * 12;
            fpSvgEl(g, 'line', {
                x1: cx - bx, y1: cy - by,
                x2: cx + bx, y2: cy + by,
                stroke: strokeColor, 'stroke-width': strokeW,
                'pointer-events': 'none'
            });
        });

    } else if (subtype === 'fan-light') {
        // 4 blade lines + inner filled circle (bulb)
        [0, 45, 90, 135].forEach(function(deg) {
            var rad = deg * Math.PI / 180;
            var bx  = Math.cos(rad) * 12;
            var by  = Math.sin(rad) * 12;
            fpSvgEl(g, 'line', {
                x1: cx - bx, y1: cy - by,
                x2: cx + bx, y2: cy + by,
                stroke: strokeColor, 'stroke-width': strokeW,
                'pointer-events': 'none'
            });
        });
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 5, fill: strokeColor, 'pointer-events': 'none' });

    } else if (subtype === 'drop-light') {
        // Outer circle already drawn; add a short vertical stub (pendant cord)
        fpSvgEl(g, 'line', {
            x1: cx, y1: cy - 14, x2: cx, y2: cy - 22,
            stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });
        // Bulb dot at center
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 4, fill: strokeColor, 'pointer-events': 'none' });

    } else if (subtype === 'chandelier') {
        // Outer circle + 4 short spokes with dots at tips (arms)
        [0, 90, 180, 270].forEach(function(deg) {
            var rad = deg * Math.PI / 180;
            var ax  = Math.cos(rad) * 10;
            var ay  = Math.sin(rad) * 10;
            fpSvgEl(g, 'line', {
                x1: cx, y1: cy, x2: cx + ax, y2: cy + ay,
                stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
            });
            fpSvgEl(g, 'circle', { cx: cx + ax, cy: cy + ay, r: 2, fill: strokeColor, 'pointer-events': 'none' });
        });
        // Center dot
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 3, fill: strokeColor, 'pointer-events': 'none' });

    } else if (subtype === 'flush-mount') {
        // Concentric rings only (outer already drawn, add inner circle)
        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy, r: 8,
            fill: 'none', stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
        });

    } else if (subtype === 'solar') {
        // Solar light: sun symbol — 6 radiating rays + filled center circle
        for (var si = 0; si < 6; si++) {
            var srad = si * Math.PI / 3;
            fpSvgEl(g, 'line', {
                x1: cx + Math.cos(srad) * 6,  y1: cy + Math.sin(srad) * 6,
                x2: cx + Math.cos(srad) * 13, y2: cy + Math.sin(srad) * 13,
                stroke: strokeColor, 'stroke-width': strokeW, 'pointer-events': 'none'
            });
        }
        fpSvgEl(g, 'circle', { cx: cx, cy: cy, r: 5, fill: strokeColor, 'pointer-events': 'none' });

    } else {
        // generic (default): 8-ray starburst + inner filled circle
        for (var i = 0; i < 8; i++) {
            var rad2 = i * Math.PI / 4;
            var rx1  = Math.cos(rad2) * 7;
            var ry1  = Math.sin(rad2) * 7;
            var rx2  = Math.cos(rad2) * 13;
            var ry2  = Math.sin(rad2) * 13;
            fpSvgEl(g, 'line', {
                x1: cx + rx1, y1: cy + ry1,
                x2: cx + rx2, y2: cy + ry2,
                stroke: strokeColor, 'stroke-width': strokeW,
                'pointer-events': 'none'
            });
        }
        fpSvgEl(g, 'circle', {
            cx: cx, cy: cy, r: 5,
            fill: strokeColor, 'pointer-events': 'none'
        });
    }

    // Default label text based on subtype
    var defaultLabels = {
        'fan': 'Fan', 'fan-light': 'Fan/Lt', 'drop-light': 'Pendant',
        'chandelier': 'Chand', 'flush-mount': 'Flush', 'solar': 'Solar', 'generic': 'Light'
    };

    // Label below
    var lbl = fpSvgEl(g, 'text', {
        x: cx, y: cy + 20,
        'text-anchor': 'middle', 'font-size': 8,
        fill: strokeColor, 'pointer-events': 'none'
    });
    lbl.textContent = fix.label || defaultLabels[subtype] || 'Light';

    // Click — select (single) or navigate to Thing (double via dblclick on svg)
    // Note: selection is also handled by fpMakeDraggableCeilingFixture mousedown/onUp below
    g.addEventListener('click', function(e) {
        e.stopPropagation();
        // Selection handled by mousedown (to support drag-to-move)
    });

    g.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (fix.thingId) {
            window.location.hash = '#thing/' + fix.thingId;
        }
    });

    // Make the fixture draggable in select mode
    fpMakeDraggableCeilingFixture(g, fix);
}

// ---- Placement — click inside a room ----

/**
 * Open the ceiling fixture modal to place a new fixture.
 * @param {MouseEvent} e    - the click event
 * @param {object}     room - the room shape object (from fpPlan.rooms)
 */
function fpPlaceCeilingFixtureInRoom(e, room) {
    var pt = fpMouseToFeet(e);

    if (!fpPointInPolygon(pt, room.points)) {
        fpSetStatus('Click inside a room to place a ceiling fixture.');
        return;
    }

    // Get the Firestore room ID from the shape so we can list Things in it
    var firestoreRoomId = room.roomId;

    fpOpenCeilingModal(null, {
        roomId:          room.id,          // shape ID (for rendering)
        firestoreRoomId: firestoreRoomId,  // Firestore room ID (for querying Things)
        x:               pt.x,
        y:               pt.y,
        category:        'ceiling-fan',
        label:           '',
        thingId:         null
    });
}

// ---- Ceiling Fixture Modal ----

/**
 * Open the ceiling fixture add/edit modal.
 * @param {string|null} editId   - existing fixture ID when editing, null when adding
 * @param {object}      data     - existing fixture data or pending position data
 */
function fpOpenCeilingModal(editId, data) {
    var modal = document.getElementById('fpCeilingModal');
    modal.dataset.editId         = editId || '';
    modal.dataset.roomId         = data.roomId         || '';
    modal.dataset.firestoreRoomId = data.firestoreRoomId || (function() {
        // Derive from shape if not provided (edit mode)
        var shape = (fpPlan.rooms || []).find(function(r) { return r.id === data.roomId; });
        return shape ? (shape.roomId || '') : '';
    }());
    modal.dataset.x              = data.x || 0;
    modal.dataset.y              = data.y || 0;

    var title = editId ? 'Edit Ceiling Fixture' : 'Add Ceiling Fixture';
    document.getElementById('fpCeilingModalTitle').textContent = title;
    // Use subtype if present; otherwise map old category value for backward compat
    var ceilSubtype = data.subtype || (data.category === 'ceiling-fan' ? 'fan' : (data.category === 'ceiling-light' ? 'generic' : 'generic'));
    document.getElementById('fpCeilingCategorySelect').value   = ceilSubtype;
    document.getElementById('fpCeilingNewName').value          = '';

    // Populate breaker dropdown (async)
    fpLoadBreakerOptions('fpCeilingBreakerSelect', data.breakerId || '');

    // Populate the "link to existing Thing" dropdown
    var select = document.getElementById('fpCeilingThingSelect');
    select.innerHTML = '<option value="">— Link to an existing ceiling Thing —</option>';

    // Always show new name group initially
    document.getElementById('fpCeilingNewNameGroup').style.display = '';
    select.onchange = function() {
        document.getElementById('fpCeilingNewNameGroup').style.display =
            select.value ? 'none' : '';
    };

    // In edit mode, pre-select the current Thing if any
    if (editId && data.thingId) {
        var preOpt = document.createElement('option');
        preOpt.value       = data.thingId;
        preOpt.textContent = data.label || 'Current fixture';
        preOpt.selected    = true;
        select.appendChild(preOpt);
        document.getElementById('fpCeilingNewNameGroup').style.display = 'none';
    }

    // Also load problems section in edit mode
    if (editId) {
        document.getElementById('fpCeilingProblemsSection').style.display = '';
        loadProblems('ceiling-fixture', editId,
            'fpCeilingProblemsContainer', 'fpCeilingProblemsEmptyState');
    } else {
        document.getElementById('fpCeilingProblemsSection').style.display = 'none';
    }

    // Async: load ceiling-fan/ceiling-light Things in this room
    var firestoreRoomId = modal.dataset.firestoreRoomId;
    if (firestoreRoomId) {
        userCol('things')
            .where('roomId', '==', firestoreRoomId)
            .get()
            .then(function(snap) {
                snap.forEach(function(d) {
                    var t = d.data();
                    if (t.category !== 'ceiling-fan' && t.category !== 'ceiling-light') return;
                    // Skip if already placed on this floor plan
                    var alreadyPlaced = (fpPlan.ceilingFixtures || []).some(function(cf) {
                        return cf.thingId === d.id && cf.id !== editId;
                    });
                    if (alreadyPlaced) return;
                    var opt = document.createElement('option');
                    opt.value       = d.id;
                    opt.textContent = t.name + ' (' + t.category + ')';
                    if (editId && data.thingId === d.id) opt.selected = true;
                    select.appendChild(opt);
                });
                // Refresh the new-name group visibility
                document.getElementById('fpCeilingNewNameGroup').style.display =
                    select.value ? 'none' : '';
            })
            .catch(function(err) {
                console.error('fpOpenCeilingModal: error loading Things:', err);
            });
    }

    fpConfigureModalViewMode('fpCeilingModal', 'fpCeilingSaveBtn');
    openModal('fpCeilingModal');
}

document.getElementById('fpCeilingSaveBtn').addEventListener('click', function() {
    var modal           = document.getElementById('fpCeilingModal');
    var editId          = modal.dataset.editId;
    var roomId          = modal.dataset.roomId;
    var firestoreRoomId = modal.dataset.firestoreRoomId;
    var x               = parseFloat(modal.dataset.x);
    var y               = parseFloat(modal.dataset.y);
    var category        = document.getElementById('fpCeilingCategorySelect').value;  // now holds subtype value
    var select          = document.getElementById('fpCeilingThingSelect');
    var newName         = document.getElementById('fpCeilingNewName').value.trim();

    // Read breaker linkage
    var bkrSel  = document.getElementById('fpCeilingBreakerSelect');
    var bkrId   = bkrSel.value || '';
    var panelId = bkrId && bkrSel.selectedIndex >= 0
        ? (bkrSel.options[bkrSel.selectedIndex].dataset.panelId || '') : '';

    if (!select.value && !newName) {
        alert('Enter a name for the new fixture, or pick an existing ceiling Thing.');
        return;
    }

    function addFixture(thingId, label, cat) {
        var newCeilingId = null;
        if (editId) {
            // Update existing
            var cf = (fpPlan.ceilingFixtures || []).find(function(m) { return m.id === editId; });
            if (cf) {
                cf.thingId   = thingId;
                cf.label     = label;
                cf.category  = cat;
                cf.subtype   = cat;   // select value is the subtype directly
                cf.breakerId = bkrId;
                cf.panelId   = panelId;
            }
        } else {
            // Add new
            if (!fpPlan.ceilingFixtures) fpPlan.ceilingFixtures = [];
            var newCf = {
                id:        fpGenId(),
                roomId:    roomId,
                thingId:   thingId,
                label:     label,
                category:  cat,   // kept for backward compat with Thing records
                subtype:   cat,   // select value is now the subtype directly
                breakerId: bkrId,
                panelId:   panelId,
                x:         x,
                y:         y,
                name:      fpAutoName(fpPlan.ceilingFixtures, 'Ceiling Fixture')
            };
            fpPlan.ceilingFixtures.push(newCf);
            newCeilingId = newCf.id;
        }
        fpDirty = true;
        closeModal('fpCeilingModal');
        if (newCeilingId) { fpSetTool('select'); fpSelectedId = newCeilingId; fpSelectedType = 'ceiling'; }
        fpRender();
        fpSetStatus('"' + label + '" ' + (editId ? 'updated' : 'placed — drag to reposition') + '. Double-click the symbol to go to the Thing page.');
    }

    if (select.value) {
        // Link to existing Thing
        var opt = select.options[select.selectedIndex];
        addFixture(select.value, opt.textContent.replace(/ \(ceiling-[a-z]+\)$/, ''), category);
    } else {
        // Create a new Thing record then link
        var newCat = category;
        userCol('things').add({
            name:      newName,
            category:  newCat,
            roomId:    firestoreRoomId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function(ref) {
            addFixture(ref.id, newName, newCat);
        }).catch(function(err) {
            console.error('fpCeilingSaveBtn: error creating Thing:', err);
            alert('Failed to create Thing record: ' + err.message);
        });
    }
});

document.getElementById('fpCeilingCancelBtn').addEventListener('click', function() {
    closeModal('fpCeilingModal');
});

document.getElementById('fpCeilingAddProblemBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpCeilingModal').dataset.editId;
    if (!editId) return;
    if (typeof openAddProblemModal === 'function') {
        openAddProblemModal('ceiling-fixture', editId, function() {
            loadProblems('ceiling-fixture', editId,
                'fpCeilingProblemsContainer', 'fpCeilingProblemsEmptyState');
        });
    }
});

// ============================================================
// PHASE H-ELEC: RECESSED LIGHTS
// ============================================================

/**
 * Draw a recessed light symbol on the SVG ceiling plane.
 * Two concentric circles: outer white, inner light grey.
 */
function fpRenderRecessedLight(svg, light) {
    var cx = fp2px(light.x);
    var cy = fp2px(light.y);
    var isSelected = (fpSelectedId === light.id && fpSelectedType === 'recessedLight');

    var outerStroke = isSelected ? '#cc8800' : '#334155';
    var outerFill   = isSelected ? '#fffacc' : '#ffffff';
    var strokeW     = isSelected ? 2.5 : 1.5;

    var g = fpSvgG(svg, 'fp-recessed-light');
    g.style.cursor = 'move';

    // Outer circle
    fpSvgEl(g, 'circle', {
        cx: cx, cy: cy, r: 9,
        fill: outerFill, stroke: outerStroke, 'stroke-width': strokeW,
        'pointer-events': 'none'
    });

    // Inner circle (the recessed look)
    fpSvgEl(g, 'circle', {
        cx: cx, cy: cy, r: 5,
        fill: '#d1d5db', stroke: outerStroke, 'stroke-width': 0.75,
        'pointer-events': 'none'
    });

    // Label below (if set)
    if (light.label) {
        fpSvgEl(g, 'text', {
            x: cx, y: cy + 18,
            'text-anchor': 'middle', 'font-size': 7,
            fill: '#555', 'pointer-events': 'none'
        }).textContent = light.label;
    }

    // Transparent hit circle for interaction
    var hit = fpSvgEl(g, 'circle', {
        cx: cx, cy: cy, r: 14,
        fill: 'transparent', stroke: 'transparent'
    });
    fpMakeDraggableRecessedLight(hit, light);
}

/**
 * Makes a recessed light draggable anywhere on the plan.
 * Tap = select; drag = reposition. Silent-saves on drag up.
 */
function fpMakeDraggableRecessedLight(el, light) {
    el.style.cursor = 'move';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'electrical') return;  // edit-mode: electrical only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();

        var startPt  = fpMouseToFeet(eDown);
        var startX   = light.x, startY = light.y;
        var dragged  = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var cur = fpMouseToFeet(e);
            dragged = true;
            light.x = fpSnap(Math.max(0, Math.min(fpPlan.widthFt,  startX + cur.x - startPt.x)));
            light.y = fpSnap(Math.max(0, Math.min(fpPlan.heightFt, startY + cur.y - startPt.y)));
            fpDirty = true;
            fpRender();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) fpSilentSave();
            else fpSelectMarker('recessedLight', light.id);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Place a recessed light on click inside a room — no modal, immediate drop.
 */
function fpPlaceRecessedLightInRoom(e, room) {
    var pt = fpMouseToFeet(e);

    if (!fpPointInPolygon(pt, room.points)) {
        fpSetStatus('Click inside a room to place a recessed light.');
        return;
    }

    var light = {
        id:     fpGenId(),
        roomId: room.id,
        x:      pt.x,
        y:      pt.y,
        label:  '',
        notes:  '',
        name:   fpAutoName(fpPlan.recessedLights, 'Recessed Light')
    };

    if (!fpPlan.recessedLights) fpPlan.recessedLights = [];
    fpPlan.recessedLights.push(light);
    fpDirty = true;

    // Auto-switch to select and pre-select the new light
    fpSetTool('select');
    fpSelectedId   = light.id;
    fpSelectedType = 'recessedLight';
    fpRender();
    fpSilentSave();
    fpSetStatus('Recessed light placed — drag to reposition or use Edit Marker to add details.');
}

/**
 * Open the recessed light edit modal.
 */
function fpOpenRecessedModal(editId, data) {
    var modal = document.getElementById('fpRecessedModal');
    modal.dataset.editId = editId || '';

    document.getElementById('fpRecessedModalTitle').textContent = editId ? 'Edit Recessed Light' : 'Recessed Light';
    document.getElementById('fpRecessedLabelInput').value = data.label || '';
    document.getElementById('fpRecessedNotesInput').value = data.notes || '';

    if (editId) {
        document.getElementById('fpRecessedFactsSection').style.display    = '';
        document.getElementById('fpRecessedProblemsSection').style.display = '';
        document.getElementById('fpRecessedActivitiesSection').style.display = '';
        loadFacts('recessedLight', editId, 'fpRecessedFactsList');
        loadProblems('recessedLight', editId, 'fpRecessedProblemsContainer', 'fpRecessedProblemsEmptyState');
        loadActivities('recessedLight', editId, 'fpRecessedActivitiesContainer', 'fpRecessedActivitiesEmptyState');
        document.getElementById('fpRecessedDeleteBtn').style.display = '';
    } else {
        document.getElementById('fpRecessedFactsSection').style.display    = 'none';
        document.getElementById('fpRecessedProblemsSection').style.display = 'none';
        document.getElementById('fpRecessedActivitiesSection').style.display = 'none';
        document.getElementById('fpRecessedDeleteBtn').style.display = 'none';
    }

    fpConfigureModalViewMode('fpRecessedModal', 'fpRecessedSaveBtn');
    openModal('fpRecessedModal');
}

document.getElementById('fpRecessedSaveBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpRecessedModal');
    var editId = modal.dataset.editId;
    var label  = document.getElementById('fpRecessedLabelInput').value.trim();
    var notes  = document.getElementById('fpRecessedNotesInput').value.trim();

    if (editId) {
        var light = (fpPlan.recessedLights || []).find(function(m) { return m.id === editId; });
        if (light) { light.label = label; light.notes = notes; }
    } else {
        // Should not normally reach here (placement is instant), but handle gracefully
        return;
    }

    fpDirty = true;
    fpSilentSave();
    closeModal('fpRecessedModal');
    fpRender();
    fpSetStatus('Recessed light updated.');
});

document.getElementById('fpRecessedCancelBtn').addEventListener('click', function() {
    closeModal('fpRecessedModal');
});

document.getElementById('fpRecessedDeleteBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpRecessedModal');
    var editId = modal.dataset.editId;
    if (!editId) return;
    if (!confirm('Delete this recessed light?')) return;
    fpScrubTargetIds(editId);
    fpPlan.recessedLights = (fpPlan.recessedLights || []).filter(function(m) { return m.id !== editId; });
    fpDirty       = true;
    fpSelectedId  = null;
    fpSelectedType = 'room';
    fpSilentSave();
    closeModal('fpRecessedModal');
    fpRender();
    fpSetStatus('Recessed light deleted.');
});

document.getElementById('fpRecessedAddFactBtn') && document.getElementById('fpRecessedAddFactBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpRecessedModal').dataset.editId;
    if (!editId) return;
    if (typeof openAddFactModal === 'function') {
        openAddFactModal('recessedLight', editId, function() {
            loadFacts('recessedLight', editId, 'fpRecessedFactsList');
        });
    }
});

document.getElementById('fpRecessedAddProblemBtn') && document.getElementById('fpRecessedAddProblemBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpRecessedModal').dataset.editId;
    if (!editId) return;
    if (typeof openAddProblemModal === 'function') {
        openAddProblemModal('recessedLight', editId, function() {
            loadProblems('recessedLight', editId, 'fpRecessedProblemsContainer', 'fpRecessedProblemsEmptyState');
        });
    }
});

document.getElementById('fpRecessedAddActivityBtn') && document.getElementById('fpRecessedAddActivityBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpRecessedModal').dataset.editId;
    if (!editId) return;
    if (typeof openActivityModal === 'function') {
        openActivityModal('recessedLight', editId, function() {
            loadActivities('recessedLight', editId, 'fpRecessedActivitiesContainer', 'fpRecessedActivitiesEmptyState');
        });
    }
});

// ============================================================
// PHASE H-ELEC: WALL PLATES (unified outlets + switches)
// ============================================================

// Per-slot mini symbol labels
var FP_PLATE_SYMBOLS = {
    'switch/single-pole': 'S',
    'switch/3-way':       '3S',
    'switch/dimmer':      'D',
    'switch/smart':       '⚡',
    'outlet/standard':    '·',   // will be rendered as two dots specially
    'outlet/gfci':        'GFI',
    'outlet/220v':        '220',
    'outlet/usb':         'USB'
};

/**
 * Draw a wall plate symbol on the wall.
 * Width scales with slot count; each slot has a mini symbol.
 */
function fpRenderWallPlate(svg, plate) {
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === plate.roomId; });
    if (!room || !room.points) return;
    var seg = fpGetSegment(room.points, plate.segmentIndex);
    if (!seg) return;

    var slots    = plate.slots || [{ type: 'switch', subtype: 'single-pole' }];
    var slotW    = 14;
    var padding  = 6;
    var totalW   = slots.length * slotW + padding;
    var totalH   = 22;
    var hw       = totalW / 2;
    var hh       = totalH / 2;

    var info = fpWallMetrics(seg, plate.position, 0);
    if (!info) return;

    var cx = info.hinge.x;
    var cy = info.hinge.y;
    var isSelected = (fpSelectedId === plate.id && fpSelectedType === 'wallplate');

    // Store centre X for slot hit-testing in fpComputeClickedSlot()
    plate._svgCx = cx;

    // Check 3-way detection flag (set at render time)
    var isThreeWay = plate._threeway || false;

    var g = fpSvgG(svg, 'fp-wall-plate');

    // Outer rectangle
    fpSvgEl(g, 'rect', {
        x: cx - hw, y: cy - hh,
        width: totalW, height: totalH,
        fill:   isSelected ? '#fffacc' : '#ffffff',
        stroke: isSelected ? '#cc8800' : '#334155',
        'stroke-width': isSelected ? 2 : 1.5,
        rx: 2, 'pointer-events': 'none'
    });

    // Focused-slot highlight — amber tint behind the selected slot (rendered under symbols)
    if (isSelected && fpSelectedSlotIndex !== null && fpSelectedSlotIndex < slots.length) {
        var fsi = fpSelectedSlotIndex;
        fpSvgEl(g, 'rect', {
            x:      cx - hw + padding / 2 + fsi * slotW,
            y:      cy - hh + 1,
            width:  slotW,
            height: totalH - 2,
            fill:   '#fcd34d',  // amber-300 — clearly distinct from the plate background
            rx: 1,
            'pointer-events': 'none'
        });
    }

    // Per-slot symbols + dividers
    slots.forEach(function(slot, i) {
        var slotCx = cx - hw + padding / 2 + i * slotW + slotW / 2;

        // Divider line between slots
        if (i > 0) {
            fpSvgEl(g, 'line', {
                x1: cx - hw + padding / 2 + i * slotW,
                y1: cy - hh + 2,
                x2: cx - hw + padding / 2 + i * slotW,
                y2: cy + hh - 2,
                stroke: '#ccc', 'stroke-width': 1, 'pointer-events': 'none'
            });
        }

        var key    = (slot.type || 'switch') + '/' + (slot.subtype || 'single-pole');
        var symbol = FP_PLATE_SYMBOLS[key] || 'S';
        // Append * for external switch slots (controls items outside this room)
        if (slot.type === 'switch' && slot.external) symbol += '*';

        if (slot.type === 'outlet' && slot.subtype === 'standard') {
            // Standard outlet: two small dots
            fpSvgEl(g, 'circle', { cx: slotCx - 2, cy: cy, r: 1.5, fill: '#334155', 'pointer-events': 'none' });
            fpSvgEl(g, 'circle', { cx: slotCx + 2, cy: cy, r: 1.5, fill: '#334155', 'pointer-events': 'none' });
        } else {
            var stxt = fpSvgEl(g, 'text', {
                x: slotCx, y: cy + 1,
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': slot.subtype === 'gfci' || slot.subtype === '220v' || slot.subtype === 'usb' ? 6 : 8,
                'font-weight': slot.type === 'switch' ? 'bold' : 'normal',
                fill: slot.type === 'switch' ? '#1e293b' : '#0044aa',
                'pointer-events': 'none'
            });
            stxt.textContent = symbol;
        }
    });

    // 3-way badge — pill shape above plate; only shown in electrical mode
    var showBadge = isThreeWay && fpActiveMode === 'electrical';
    if (showBadge) {
        var badgeW = 24, badgeH = 9, badgeY = cy - hh - 13;
        // Pill background
        fpSvgEl(g, 'rect', {
            x: cx - badgeW / 2, y: badgeY - badgeH / 2,
            width: badgeW, height: badgeH,
            rx: 4, fill: '#ede9fe', stroke: '#7c3aed', 'stroke-width': 0.75,
            'pointer-events': 'none'
        });
        // Badge text
        fpSvgEl(g, 'text', {
            x: cx, y: badgeY + 0.5,
            'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-size': 5.5, fill: '#5b21b6', 'font-weight': 'bold',
            'pointer-events': 'none'
        }).textContent = '3-way';
    }

    // Transparent hit area (expanded upward to include badge when visible)
    var hit = fpSvgEl(g, 'rect', {
        x: cx - hw - 4, y: cy - hh - (showBadge ? 18 : 4),
        width: totalW + 8, height: totalH + (showBadge ? 22 : 8),
        fill: 'transparent', stroke: 'transparent'
    });
    fpMakeDraggableWallPlate(hit, plate);
}

/**
 * Makes a wall plate draggable along its wall segment.
 * Tap = select; drag = slide. Silent-saves on drag up.
 */
/**
 * Given a mouseup event and a wall plate, returns the 0-based slot index that
 * was clicked, or null if the click was outside the slot area or the plate has
 * only one slot (no need to distinguish).
 * Uses plate._svgCx stored by fpRenderWallPlate() and the zoom/pan state.
 * @param {Object} plate — wall plate data with _svgCx set
 * @param {MouseEvent} e
 * @returns {number|null}
 */
function fpComputeClickedSlot(plate, e) {
    var slots = plate.slots || [];
    if (slots.length < 2) return null;             // single slot — nothing to distinguish
    if (plate._svgCx === undefined) return null;   // not yet rendered

    var slotW   = 14;
    var padding = 6;
    var hw      = (slots.length * slotW + padding) / 2;

    // Convert the mouse's client X to SVG internal X (same calculation as fpMouseToFeet)
    var svg  = document.getElementById('fpSvg');
    if (!svg) return null;
    var rect  = svg.getBoundingClientRect();
    var svgX  = fpViewX + (e.clientX - rect.left) / rect.width * fpViewW;

    // Position of slot 0's left edge in SVG coords
    var slotAreaStart = plate._svgCx - hw + padding / 2;
    var relX          = svgX - slotAreaStart;
    var idx           = Math.floor(relX / slotW);

    return (idx >= 0 && idx < slots.length) ? idx : null;
}

function fpMakeDraggableWallPlate(el, plate) {
    el.style.cursor = 'ew-resize';
    el.addEventListener('mousedown', function(eDown) {
        if (fpActiveTool !== 'select') return;
        if (!fpViewMode && fpActiveMode !== 'electrical') return;  // edit-mode: electrical only; view mode: any mode
        // View mode: allow clicks (for selection) but block dragging (handled in onMove)
        eDown.preventDefault();
        eDown.stopPropagation();
        var dragged = false;

        function onMove(e) {
            if (fpViewMode) return;   // no dragging in view mode
            var room = (fpPlan.rooms || []).find(function(r) { return r.id === plate.roomId; });
            if (!room) return;
            var pt = fpMouseToFeet(e);
            plate.position = fpProjectOntoWallSegment(pt.x, pt.y, room, plate.segmentIndex, 0);
            fpDirty = true;
            dragged = true;
            fpRender();
        }

        function onUp(eUp) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            if (dragged) {
                fpSilentSave();
            } else {
                // Determine which slot was clicked so the props bar can show its controls info.
                // Direct assignment (no toggle) so slot navigation doesn't accidentally deselect.
                var slotIdx = fpComputeClickedSlot(plate, eUp);

                // If clicking the same slot on the already-selected plate: clear slot focus
                // (but keep the plate selected so the user can still open/edit it)
                if (fpSelectedId === plate.id && fpSelectedSlotIndex === slotIdx && slotIdx !== null) {
                    fpSelectedSlotIndex = null;
                } else {
                    fpSelectedSlotIndex = slotIdx;
                }

                fpSelectedId   = plate.id;
                fpSelectedType = 'wallplate';
                fpRender();
            }
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

/**
 * Open the wall plate add/edit modal.
 * @param {string|null} editId  - existing plate ID, or null for add
 * @param {object}      data    - existing plate data or {roomId, segmentIndex, position}
 */
function fpOpenWallPlateModal(editId, data) {
    var modal = document.getElementById('fpWallPlateModal');
    modal.dataset.editId      = editId || '';
    modal.dataset.roomId      = data.roomId      || '';
    modal.dataset.segIndex    = data.segmentIndex != null ? data.segmentIndex : '';
    modal.dataset.position    = data.position    != null ? data.position    : '';

    document.getElementById('fpWallPlateModalTitle').textContent = editId ? 'Edit Wall Plate' : 'Add Wall Plate';
    document.getElementById('fpWallPlateNotesInput').value = data.notes || '';

    // Build slot rows
    var slots = data.slots || [{ type: 'switch', subtype: 'single-pole', controls: '', breakerId: '', panelId: '' }];
    fpWallPlateBuildSlots(slots);

    // Position section (edit mode only)
    if (editId) {
        var room = (fpPlan.rooms || []).find(function(r) { return r.id === data.roomId; });
        if (room) {
            var seg    = fpGetSegment(room.points, data.segmentIndex);
            var segLen = seg ? fpSegLength(seg) : 0;
            var fromStart = data.position || 0;
            var fromEnd   = segLen - fromStart;
            document.getElementById('fpWallPlatePosFromStart').textContent = fpFmtFeetIn(fromStart);
            document.getElementById('fpWallPlatePosFromEnd').textContent   = fpFmtFeetIn(fromEnd);
            document.getElementById('fpWallPlatePosInput').value           = fpFmtFeetIn(fromStart);
            document.getElementById('fpWallPlatePosRef').value             = 'start';
            modal.dataset.segLen = segLen.toFixed(4);
        }
        document.getElementById('fpWallPlatePositionSection').style.display = '';
        document.getElementById('fpWallPlateProblemsSection').style.display = '';
        document.getElementById('fpWallPlateDeleteBtn').style.display       = '';
        loadProblems('wallplate', editId, 'fpWallPlateProblemsContainer', 'fpWallPlateProblemsEmptyState');
    } else {
        document.getElementById('fpWallPlatePositionSection').style.display = 'none';
        document.getElementById('fpWallPlateProblemsSection').style.display = 'none';
        document.getElementById('fpWallPlateDeleteBtn').style.display       = 'none';
    }

    // Load breaker options for all slots (async)
    fpWallPlateLoadBreakers();

    fpConfigureModalViewMode('fpWallPlateModal', 'fpWallPlateSaveBtn');
    openModal('fpWallPlateModal');
}

/** Build the slot rows in the wall plate modal from a slots array */
function fpWallPlateBuildSlots(slots) {
    var container = document.getElementById('fpWallPlateSlots');
    container.innerHTML = '';
    slots.forEach(function(slot, i) {
        fpWallPlateAddSlotRow(slot, i);
    });
    fpWallPlateUpdateAddBtn();
}

/** Add one slot row to the slots container */
function fpWallPlateAddSlotRow(slot, index) {
    var container = document.getElementById('fpWallPlateSlots');
    var row = document.createElement('div');
    row.className = 'fp-plate-slot-row';
    row.dataset.index = index;

    var typeOptions = [
        { v: 'switch', l: 'Switch' },
        { v: 'outlet', l: 'Outlet' }
    ];
    var switchSubs = [
        { v: 'single-pole', l: 'Single-pole' },
        { v: '3-way',       l: '3-Way' },
        { v: 'dimmer',      l: 'Dimmer' },
        { v: 'smart',       l: 'Smart' }
    ];
    var outletSubs = [
        { v: 'standard', l: 'Standard' },
        { v: 'gfci',     l: 'GFCI' },
        { v: '220v',     l: '220V' },
        { v: 'usb',      l: 'USB' }
    ];

    function makeSelect(opts, val, cls) {
        var sel = document.createElement('select');
        sel.className = cls;
        opts.forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.v; opt.textContent = o.l;
            if (o.v === val) opt.selected = true;
            sel.appendChild(opt);
        });
        return sel;
    }

    var typeSel    = makeSelect(typeOptions, slot.type || 'switch', 'fp-slot-type');
    var subSel     = makeSelect(slot.type === 'outlet' ? outletSubs : switchSubs,
                                slot.subtype || (slot.type === 'outlet' ? 'standard' : 'single-pole'),
                                'fp-slot-subtype');
    var ctrlInput  = document.createElement('input');
    ctrlInput.type = 'text'; ctrlInput.className = 'fp-slot-controls';
    ctrlInput.placeholder = 'Controls (e.g. Ceiling fan)';
    ctrlInput.value = slot.controls || '';

    var bkrSel = document.createElement('select');
    bkrSel.className = 'fp-slot-breaker';
    bkrSel.innerHTML = '<option value="">— No breaker —</option>';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.textContent = '✕';
    removeBtn.className = 'btn btn-danger btn-small fp-slot-remove';
    removeBtn.addEventListener('click', function() {
        row.remove();
        fpWallPlateRenumberSlots();
        fpWallPlateUpdateAddBtn();
    });

    // When type changes, rebuild subtype options and show/hide external row
    typeSel.addEventListener('change', function() {
        var subs = typeSel.value === 'outlet' ? outletSubs : switchSubs;
        subSel.innerHTML = '';
        subs.forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.v; opt.textContent = o.l;
            subSel.appendChild(opt);
        });
        // External targets only relevant for switches
        extRow.style.display = typeSel.value === 'switch' ? '' : 'none';
    });

    // Main row (type + subtype + controls + breaker + remove)
    var mainRow = document.createElement('div');
    mainRow.className = 'fp-slot-main-row';
    mainRow.appendChild(typeSel);
    mainRow.appendChild(subSel);
    mainRow.appendChild(ctrlInput);
    mainRow.appendChild(bkrSel);
    mainRow.appendChild(removeBtn);
    row.appendChild(mainRow);

    // External targets row (switch slots only)
    var extRow = document.createElement('div');
    extRow.className = 'fp-slot-external-row';
    extRow.style.display = (slot.type === 'outlet') ? 'none' : '';

    // "External" checkbox
    var extLabel = document.createElement('label');
    extLabel.className = 'fp-slot-external-label';
    var extCb = document.createElement('input');
    extCb.type = 'checkbox'; extCb.className = 'fp-slot-external-cb';
    extCb.checked = slot.external || false;
    extLabel.appendChild(extCb);
    extLabel.appendChild(document.createTextNode(' External (controls items outside this room)'));
    extRow.appendChild(extLabel);

    // External targets list (shown when checkbox checked)
    var extTargetsDiv = document.createElement('div');
    extTargetsDiv.className = 'fp-slot-external-targets';
    extTargetsDiv.style.display = slot.external ? '' : 'none';

    var chipsDiv = document.createElement('div');
    chipsDiv.className = 'fp-ext-target-chips';
    extTargetsDiv.appendChild(chipsDiv);

    var addExtBtn = document.createElement('button');
    addExtBtn.type = 'button';
    addExtBtn.className = 'btn btn-secondary btn-small fp-add-external-btn';
    addExtBtn.textContent = '+ Add External Target';
    addExtBtn.addEventListener('click', function() {
        fpOpenExternalTargetModal(row);
    });
    extTargetsDiv.appendChild(addExtBtn);
    extRow.appendChild(extTargetsDiv);

    // Toggle targets div on checkbox change
    extCb.addEventListener('change', function() {
        extTargetsDiv.style.display = extCb.checked ? '' : 'none';
    });

    // Store existing external targets as JSON in dataset and render chips
    row.dataset.externalTargets = JSON.stringify(slot.externalTargets || []);
    fpWallPlateRenderTargetChips(row);

    row.appendChild(extRow);
    container.appendChild(row);
}

/**
 * Render external target chips inside a slot row based on row.dataset.externalTargets.
 */
function fpWallPlateRenderTargetChips(row) {
    var chipsDiv = row.querySelector('.fp-ext-target-chips');
    if (!chipsDiv) return;
    chipsDiv.innerHTML = '';
    var targets = [];
    try { targets = JSON.parse(row.dataset.externalTargets || '[]'); } catch(e) {}
    targets.forEach(function(t) {
        var chip = document.createElement('span');
        chip.className = 'fp-ext-target-chip';
        var loc = [t.roomName, t.floorName].filter(Boolean).join(', ');
        chip.textContent = t.name + (loc ? ' (' + loc + ')' : '');
        var rmBtn = document.createElement('button');
        rmBtn.type = 'button'; rmBtn.textContent = '✕'; rmBtn.className = 'fp-ext-chip-remove';
        rmBtn.addEventListener('click', function() {
            var arr = [];
            try { arr = JSON.parse(row.dataset.externalTargets || '[]'); } catch(e) {}
            arr = arr.filter(function(x) { return x.id !== t.id; });
            row.dataset.externalTargets = JSON.stringify(arr);
            fpWallPlateRenderTargetChips(row);
        });
        chip.appendChild(rmBtn);
        chipsDiv.appendChild(chip);
    });
}

// ============================================================
// EXTERNAL TARGET MODAL
// ============================================================

// The slot row DOM element currently being targeted
var fpExtTargetCurrentRow = null;

/**
 * Open the external target modal for a given slot row.
 * Loads all floors into the floor picker, then chains room + item loading.
 */
function fpOpenExternalTargetModal(slotRow) {
    fpExtTargetCurrentRow = slotRow;

    // Reset the modal state
    var floorSel = document.getElementById('fpExtTargetFloorSelect');
    var roomSel  = document.getElementById('fpExtTargetRoomSelect');
    var itemSel  = document.getElementById('fpExtTargetItemSelect');
    var nameInp  = document.getElementById('fpExtTargetNameInput');
    var saveBtn  = document.getElementById('fpExtTargetSaveBtn');

    floorSel.innerHTML = '<option value="">— Select floor —</option>';
    roomSel.innerHTML  = '<option value="">— Select room —</option>';
    itemSel.innerHTML  = '<option value="">— Select item —</option>';
    nameInp.value      = '';
    saveBtn.disabled   = true;

    document.getElementById('fpExtTargetRoomGroup').style.display = 'none';
    document.getElementById('fpExtTargetItemGroup').style.display = 'none';
    document.getElementById('fpExtTargetNameGroup').style.display = 'none';

    // Load all floors
    userCol('floors').orderBy('name').get()
        .then(function(snap) {
            snap.forEach(function(doc) {
                var opt = document.createElement('option');
                opt.value       = doc.id;
                opt.textContent = doc.data().name || 'Floor';
                floorSel.appendChild(opt);
            });
        })
        .catch(function(err) { console.error('fpOpenExternalTargetModal floors error:', err); });

    openModal('fpExternalTargetModal');
}

// Floor selected → load rooms
document.getElementById('fpExtTargetFloorSelect').addEventListener('change', function() {
    var floorId = this.value;
    var roomSel = document.getElementById('fpExtTargetRoomSelect');
    var itemSel = document.getElementById('fpExtTargetItemSelect');
    var nameInp = document.getElementById('fpExtTargetNameInput');
    var saveBtn = document.getElementById('fpExtTargetSaveBtn');

    roomSel.innerHTML = '<option value="">— Select room —</option>';
    itemSel.innerHTML = '<option value="">— Select item —</option>';
    nameInp.value     = '';
    saveBtn.disabled  = true;
    document.getElementById('fpExtTargetItemGroup').style.display = 'none';
    document.getElementById('fpExtTargetNameGroup').style.display = 'none';

    if (!floorId) {
        document.getElementById('fpExtTargetRoomGroup').style.display = 'none';
        return;
    }

    document.getElementById('fpExtTargetRoomGroup').style.display = '';

    userCol('rooms').where('floorId', '==', floorId).orderBy('name').get()
        .then(function(snap) {
            snap.forEach(function(doc) {
                var opt = document.createElement('option');
                opt.value       = doc.id;
                opt.dataset.name = doc.data().name || 'Room';
                opt.textContent  = doc.data().name || 'Room';
                roomSel.appendChild(opt);
            });
        })
        .catch(function(err) { console.error('fpExtTargetFloor rooms error:', err); });
});

// Room selected → load floor plan items
document.getElementById('fpExtTargetRoomSelect').addEventListener('change', function() {
    var roomId  = this.value;
    var floorSel = document.getElementById('fpExtTargetFloorSelect');
    var floorId  = floorSel.value;
    var itemSel  = document.getElementById('fpExtTargetItemSelect');
    var nameInp  = document.getElementById('fpExtTargetNameInput');
    var saveBtn  = document.getElementById('fpExtTargetSaveBtn');

    itemSel.innerHTML = '<option value="">— Select item —</option>';
    nameInp.value     = '';
    saveBtn.disabled  = true;
    document.getElementById('fpExtTargetNameGroup').style.display = 'none';

    if (!roomId) {
        document.getElementById('fpExtTargetItemGroup').style.display = 'none';
        return;
    }

    document.getElementById('fpExtTargetItemGroup').style.display = '';

    // Load the floorPlan doc (planId = floorId per our convention)
    userCol('floorPlans').doc(floorId).get()
        .then(function(doc) {
            if (!doc.exists) return;
            var plan  = doc.data();
            var items = [];

            // Find the room shape whose .roomId matches the selected Firestore roomId
            var shape = (plan.rooms || []).find(function(r) { return r.roomId === roomId; });
            var shapeId = shape ? shape.id : null;
            if (!shapeId) return;

            // Collect all items belonging to this room shape
            var typeMap = {
                'ceiling':          { arr: plan.ceilingFixtures  || [], label: 'Ceiling Fixture' },
                'recessedLight':    { arr: plan.recessedLights   || [], label: 'Recessed Light'  },
                'fixture':          { arr: plan.fixtures         || [], label: 'Fixture'          },
                'plumbingEndpoint': { arr: plan.plumbingEndpoints|| [], label: 'Plumbing Endpoint'},
                'plumbing':         { arr: plan.plumbing         || [], label: 'Plumbing'         },
                'door':             { arr: plan.doors            || [], label: 'Door'             },
                'window':           { arr: plan.windows          || [], label: 'Window'           }
            };

            Object.keys(typeMap).forEach(function(type) {
                typeMap[type].arr.forEach(function(item) {
                    if (item.roomId === shapeId) {
                        items.push({ type: type, item: item, typeLabel: typeMap[type].label });
                    }
                });
            });

            items.forEach(function(entry) {
                var displayName = entry.item.name || entry.item.label || entry.typeLabel;
                var opt = document.createElement('option');
                opt.value           = entry.item.id;
                opt.dataset.type    = entry.type;
                opt.dataset.name    = displayName;
                opt.textContent     = displayName + ' (' + entry.typeLabel + ')';
                itemSel.appendChild(opt);
            });
        })
        .catch(function(err) { console.error('fpExtTargetRoom items error:', err); });
});

// Item selected → auto-fill name field
document.getElementById('fpExtTargetItemSelect').addEventListener('change', function() {
    var itemId  = this.value;
    var nameInp = document.getElementById('fpExtTargetNameInput');
    var saveBtn = document.getElementById('fpExtTargetSaveBtn');
    var nameGroup = document.getElementById('fpExtTargetNameGroup');

    if (!itemId) {
        nameGroup.style.display = 'none';
        nameInp.value = '';
        saveBtn.disabled = true;
        return;
    }

    var selectedOpt = this.options[this.selectedIndex];
    nameInp.value = selectedOpt.dataset.name || '';
    nameGroup.style.display = '';
    saveBtn.disabled = !nameInp.value.trim();
});

document.getElementById('fpExtTargetNameInput').addEventListener('input', function() {
    document.getElementById('fpExtTargetSaveBtn').disabled = !this.value.trim();
});

// Save external target → push to slot row's dataset, re-render chips
document.getElementById('fpExtTargetSaveBtn').addEventListener('click', function() {
    if (!fpExtTargetCurrentRow) return;

    var floorSel  = document.getElementById('fpExtTargetFloorSelect');
    var roomSel   = document.getElementById('fpExtTargetRoomSelect');
    var itemSel   = document.getElementById('fpExtTargetItemSelect');
    var nameInp   = document.getElementById('fpExtTargetNameInput');

    var floorId   = floorSel.value;
    var floorName = floorSel.options[floorSel.selectedIndex]
                      ? floorSel.options[floorSel.selectedIndex].textContent : '';
    var roomId    = roomSel.value;
    var roomName  = roomSel.options[roomSel.selectedIndex]
                      ? roomSel.options[roomSel.selectedIndex].textContent : '';
    var fpItemId  = itemSel.value;
    var name      = nameInp.value.trim();

    if (!floorId || !roomId || !fpItemId || !name) return;

    var newTarget = {
        id:         fpGenId(),
        name:       name,
        floorId:    floorId,
        floorName:  floorName,
        roomId:     roomId,
        roomName:   roomName,
        planId:     floorId,   // planId === floorId per app convention
        fpItemId:   fpItemId
    };

    var arr = [];
    try { arr = JSON.parse(fpExtTargetCurrentRow.dataset.externalTargets || '[]'); } catch(e) {}
    arr.push(newTarget);
    fpExtTargetCurrentRow.dataset.externalTargets = JSON.stringify(arr);
    fpWallPlateRenderTargetChips(fpExtTargetCurrentRow);

    // Ensure external checkbox is checked
    var extCb = fpExtTargetCurrentRow.querySelector('.fp-slot-external-cb');
    if (extCb) extCb.checked = true;
    var extTargetsDiv = fpExtTargetCurrentRow.querySelector('.fp-slot-external-targets');
    if (extTargetsDiv) extTargetsDiv.style.display = '';

    closeModal('fpExternalTargetModal');
    fpExtTargetCurrentRow = null;
});

document.getElementById('fpExtTargetCancelBtn').addEventListener('click', function() {
    closeModal('fpExternalTargetModal');
    fpExtTargetCurrentRow = null;
});

/** Renumber slot rows after one is removed */
function fpWallPlateRenumberSlots() {
    var rows = document.querySelectorAll('#fpWallPlateSlots .fp-plate-slot-row');
    rows.forEach(function(row, i) { row.dataset.index = i; });
}

/** Show/hide Add Slot button based on count */
function fpWallPlateUpdateAddBtn() {
    var count = document.querySelectorAll('#fpWallPlateSlots .fp-plate-slot-row').length;
    document.getElementById('fpWallPlateAddSlotBtn').style.display = count >= 4 ? 'none' : '';
}

/** Async: populate all breaker selects in wall plate slots */
function fpWallPlateLoadBreakers() {
    var selects = document.querySelectorAll('#fpWallPlateSlots .fp-slot-breaker');
    if (!selects.length) return;
    userCol('breakerPanels').get()
        .then(function(snap) {
            selects.forEach(function(sel) {
                var saved = sel.dataset.breakerId || '';
                snap.forEach(function(panelDoc) {
                    var panel = panelDoc.data();
                    var grp   = document.createElement('optgroup');
                    grp.label = panel.name || 'Panel';
                    (panel.breakers || []).forEach(function(b) {
                        var opt = document.createElement('option');
                        opt.value = b.id || b.slot;
                        opt.dataset.panelId = panelDoc.id;
                        opt.textContent = (b.slot ? 'Slot ' + b.slot + ': ' : '') + (b.label || '');
                        if ((b.id || b.slot) === saved) opt.selected = true;
                        grp.appendChild(opt);
                    });
                    sel.appendChild(grp);
                });
            });
        })
        .catch(function(err) { console.error('fpWallPlateLoadBreakers error:', err); });
}

/** Read all slot rows from the modal and return a slots array */
function fpWallPlateReadSlots() {
    var slots = [];
    document.querySelectorAll('#fpWallPlateSlots .fp-plate-slot-row').forEach(function(row) {
        var bkrSel  = row.querySelector('.fp-slot-breaker');
        var bkrId   = bkrSel ? bkrSel.value : '';
        var panelId = bkrId && bkrSel && bkrSel.selectedIndex >= 0
            ? (bkrSel.options[bkrSel.selectedIndex].dataset.panelId || '') : '';
        var extCb   = row.querySelector('.fp-slot-external-cb');
        var extTargets = [];
        try { extTargets = JSON.parse(row.dataset.externalTargets || '[]'); } catch(e) {}
        slots.push({
            type:            row.querySelector('.fp-slot-type').value,
            subtype:         row.querySelector('.fp-slot-subtype').value,
            controls:        row.querySelector('.fp-slot-controls').value.trim(),
            breakerId:       bkrId,
            panelId:         panelId,
            external:        extCb ? extCb.checked : false,
            externalTargets: extTargets
        });
    });
    return slots;
}

document.getElementById('fpWallPlateAddSlotBtn').addEventListener('click', function() {
    var count = document.querySelectorAll('#fpWallPlateSlots .fp-plate-slot-row').length;
    if (count >= 4) return;
    fpWallPlateAddSlotRow({ type: 'switch', subtype: 'single-pole', controls: '', breakerId: '' }, count);
    fpWallPlateUpdateAddBtn();
    fpWallPlateLoadBreakers();
});

document.getElementById('fpWallPlateSaveBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpWallPlateModal');
    var editId = modal.dataset.editId;
    var slots  = fpWallPlateReadSlots();
    if (!slots.length) { alert('Add at least one slot.'); return; }

    var notes = document.getElementById('fpWallPlateNotesInput').value.trim();

    var newPlateId = null;
    if (editId) {
        var existing = (fpPlan.wallPlates || []).find(function(m) { return m.id === editId; });
        if (existing) {
            // Preserve per-slot targetIds (same-room wiring) from existing data — DOM doesn't store them
            slots.forEach(function(slot, i) {
                var oldSlot = (existing.slots || [])[i];
                slot.targetIds = (oldSlot && oldSlot.targetIds) ? oldSlot.targetIds : [];
                // externalTargets already read from DOM via fpWallPlateReadSlots
            });
            existing.slots = slots;
            existing.notes = notes;
            // Apply position override if typed
            var posRaw = fpParseFeetIn(document.getElementById('fpWallPlatePosInput').value);
            if (!isNaN(posRaw) && posRaw >= 0) {
                var segLen = parseFloat(modal.dataset.segLen) || 0;
                var ref    = document.getElementById('fpWallPlatePosRef').value;
                existing.position = ref === 'end' && segLen > 0
                    ? Math.max(0, segLen - posRaw)
                    : Math.max(0, posRaw);
            }
        }
    } else {
        // Initialize targetIds: [] on each slot for new plates; externalTargets already set from DOM
        slots.forEach(function(slot) {
            slot.targetIds = [];
            if (!slot.externalTargets) slot.externalTargets = [];
        });
        var plate = {
            id:           fpGenId(),
            roomId:       modal.dataset.roomId,
            segmentIndex: parseInt(modal.dataset.segIndex, 10),
            position:     parseFloat(modal.dataset.position),
            notes:        notes,
            slots:        slots,
            name:         fpAutoName(fpPlan.wallPlates, 'Plate')
        };
        if (!fpPlan.wallPlates) fpPlan.wallPlates = [];
        fpPlan.wallPlates.push(plate);
        newPlateId = plate.id;
    }

    fpDirty = true;
    closeModal('fpWallPlateModal');
    if (newPlateId) { fpSetTool('select'); fpSelectedId = newPlateId; fpSelectedType = 'wallplate'; }
    fpRender();
    fpSetStatus('Wall plate ' + (editId ? 'updated' : 'placed — drag to reposition or Edit Marker for details') + '.');
});

document.getElementById('fpWallPlateCancelBtn').addEventListener('click', function() {
    closeModal('fpWallPlateModal');
});

document.getElementById('fpWallPlateDeleteBtn').addEventListener('click', function() {
    var modal  = document.getElementById('fpWallPlateModal');
    var editId = modal.dataset.editId;
    if (!editId || !confirm('Delete this wall plate?')) return;
    fpPlan.wallPlates = (fpPlan.wallPlates || []).filter(function(m) { return m.id !== editId; });
    fpDirty = true;
    fpSelectedId = null; fpSelectedType = 'room';
    fpSilentSave();
    closeModal('fpWallPlateModal');
    fpRender();
    fpSetStatus('Wall plate deleted.');
});

document.getElementById('fpWallPlateAddProblemBtn').addEventListener('click', function() {
    var editId = document.getElementById('fpWallPlateModal').dataset.editId;
    if (!editId) return;
    if (typeof openAddProblemModal === 'function') {
        openAddProblemModal('wallplate', editId, function() {
            loadProblems('wallplate', editId, 'fpWallPlateProblemsContainer', 'fpWallPlateProblemsEmptyState');
        });
    }
});

// ============================================================
// PHASE H-ELEC: ELECTRICAL MODE, WIRING LINES, TARGET EDIT
// ============================================================

/**
 * Toggle electrical mode on/off.
 * Mode switching is now handled by fpSetMode() — see Mode Management section.
 * This stub kept in case any old call sites reference it; it defers to fpSetMode.
 */
function fpToggleElectricalMode() {
    fpSetMode(fpActiveMode === 'layout' ? 'electrical' : 'layout');
}

/**
 * Toggle the structural fade (Dim) in electrical mode.
 */
function fpToggleElecFade() {
    fpElecFade = !fpElecFade;
    var cb = document.getElementById('fpElecDimCheck');
    if (cb) cb.checked = fpElecFade;
    fpRender();
}

/**
 * Enter target-selection mode for the currently selected wall plate.
 * If the plate has >1 switch slot, shows a slot-picker first.
 * If only 1 switch slot, skips to fixture-picking immediately.
 */
function fpEnterTargetEditMode() {
    if (!fpSelectedId || fpSelectedType !== 'wallplate') return;
    fpTargetEditMode    = true;
    fpTargetEditPlateId = fpSelectedId;
    fpTargetEditSlotIdx = null;  // start at slot-picker step

    var plate = (fpPlan.wallPlates || []).find(function(p) { return p.id === fpSelectedId; });
    if (!plate) return;

    // Count switch slots
    var switchSlots = (plate.slots || []).filter(function(s) { return s.type === 'switch'; });

    if (switchSlots.length === 1) {
        // Skip slot picker — go directly to fixture picking for the only switch slot
        var idx = (plate.slots || []).indexOf(switchSlots[0]);
        fpTargetEditSlotIdx = idx;
    }
    // else: fpTargetEditSlotIdx stays null → slot picker shows

    fpRender();
    fpUpdateTargetEditPanel();
    fpSetStatus('Edit Targets: ' + (fpTargetEditSlotIdx !== null ? 'click fixtures to link/unlink.' : 'choose a switch slot.'));
}

/**
 * Exit target-selection mode and silent-save.
 */
function fpExitTargetEditMode() {
    fpTargetEditMode    = false;
    fpTargetEditPlateId = null;
    fpTargetEditSlotIdx = null;
    var panel = document.getElementById('fpTargetEditPanel');
    if (panel) panel.style.display = 'none';
    fpDirty = true;
    fpSilentSave();
    fpRender();
    fpSetStatus('Wall plate targets saved.');
}

/**
 * Build the slot-picker or fixture-picking UI inside fpTargetEditPanel.
 * - If fpTargetEditSlotIdx is null, shows slot-picker buttons (one per switch slot).
 * - If fpTargetEditSlotIdx is set, shows slot info + Done (and Back if multiple switch slots).
 * Called from fpEnterTargetEditMode, fpRender (when in mode), and slot button clicks.
 */
function fpUpdateTargetEditPanel() {
    var panel = document.getElementById('fpTargetEditPanel');
    if (!panel) return;

    if (!fpTargetEditMode) { panel.style.display = 'none'; return; }

    var plate = (fpPlan.wallPlates || []).find(function(p) { return p.id === fpTargetEditPlateId; });
    if (!plate) { panel.style.display = 'none'; return; }

    panel.style.display = '';
    panel.innerHTML = '';

    if (fpTargetEditSlotIdx === null) {
        // ---- Slot picker step ----
        var label = document.createElement('span');
        label.textContent = 'Which switch: ';
        label.style.cssText = 'font-size:0.85em;font-weight:bold;margin-right:6px';
        panel.appendChild(label);

        (plate.slots || []).forEach(function(slot, i) {
            if (slot.type !== 'switch') return;
            var btn = document.createElement('button');
            btn.className = 'btn btn-secondary btn-small';
            btn.style.marginRight = '4px';
            var subLabel = { 'single-pole': 'Single-pole', '3-way': '3-way', 'dimmer': 'Dimmer', 'smart': 'Smart' };
            btn.textContent = 'Slot ' + (i + 1) + ': ' + (subLabel[slot.subtype] || slot.subtype || slot.type) + (slot.controls ? ' (' + slot.controls + ')' : '');
            btn.addEventListener('click', function() {
                fpTargetEditSlotIdx = i;
                fpRender();
                fpUpdateTargetEditPanel();
                fpSetStatus('Click fixtures to link or unlink from this switch.');
            });
            panel.appendChild(btn);
        });

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary btn-small';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.marginLeft = '8px';
        cancelBtn.addEventListener('click', fpExitTargetEditMode);
        panel.appendChild(cancelBtn);

    } else {
        // ---- Fixture-picking step ----
        var slot = (plate.slots || [])[fpTargetEditSlotIdx];
        var slotDesc = slot ? (slot.controls || slot.subtype || 'Switch') : 'Switch';

        var infoSpan = document.createElement('span');
        infoSpan.textContent = 'Slot ' + (fpTargetEditSlotIdx + 1) + ' (' + slotDesc + '): click fixtures to link/unlink';
        infoSpan.style.cssText = 'font-size:0.85em;margin-right:8px';
        panel.appendChild(infoSpan);

        // Show Back button only if there are multiple switch slots
        var switchCount = (plate.slots || []).filter(function(s) { return s.type === 'switch'; }).length;
        if (switchCount > 1) {
            var backBtn = document.createElement('button');
            backBtn.className = 'btn btn-secondary btn-small';
            backBtn.textContent = '\u2190 Back';
            backBtn.style.marginRight = '4px';
            backBtn.addEventListener('click', function() {
                fpTargetEditSlotIdx = null;
                fpRender();
                fpUpdateTargetEditPanel();
            });
            panel.appendChild(backBtn);
        }

        var doneBtn2 = document.createElement('button');
        doneBtn2.className = 'btn btn-primary btn-small';
        doneBtn2.textContent = 'Done';
        doneBtn2.addEventListener('click', fpExitTargetEditMode);
        panel.appendChild(doneBtn2);
    }
}

/**
 * Toggle a fixture in/out of the current slot's targetIds[].
 * Called during target edit mode when a fixture is clicked.
 */
function fpToggleTarget(fixtureId) {
    if (!fpTargetEditPlateId || fpTargetEditSlotIdx === null) return;
    var plate = (fpPlan.wallPlates || []).find(function(p) { return p.id === fpTargetEditPlateId; });
    if (!plate) return;
    var slot = (plate.slots || [])[fpTargetEditSlotIdx];
    if (!slot) return;
    if (!slot.targetIds) slot.targetIds = [];
    var idx = slot.targetIds.indexOf(fixtureId);
    if (idx >= 0) {
        slot.targetIds.splice(idx, 1);
    } else {
        slot.targetIds.push(fixtureId);
    }
    fpDirty = true;
    fpRender();
}

/**
 * Draw dashed lines from the selected wall plate to each of its target fixtures.
 * Lines are drawn per slot with distinct colors so multi-gang plates show clearly.
 * Only called when fpElectricalMode and a wallplate is selected.
 */
function fpRenderWiringLines(svg) {
    var plate = (fpPlan.wallPlates || []).find(function(p) { return p.id === fpSelectedId; });
    if (!plate) return;

    // Get plate center
    var room = (fpPlan.rooms || []).find(function(r) { return r.id === plate.roomId; });
    if (!room) return;
    var seg  = fpGetSegment(room.points, plate.segmentIndex);
    if (!seg) return;
    var info = fpWallMetrics(seg, plate.position, 0);
    if (!info) return;
    var px = info.hinge.x, py = info.hinge.y;

    // Line colors per slot index — spread across color wheel for clear distinction
    var lineColors = ['#1d4ed8', '#dc2626', '#7c3aed', '#0891b2'];  // blue, red, purple, cyan

    (plate.slots || []).forEach(function(slot, i) {
        if (slot.type !== 'switch') return;
        var targets = slot.targetIds || [];
        if (!targets.length) return;
        var color = lineColors[i % lineColors.length];

        targets.forEach(function(tid) {
            var fx = null, fy = null;

            // Check recessed lights
            var rl = (fpPlan.recessedLights || []).find(function(m) { return m.id === tid; });
            if (rl) { fx = fp2px(rl.x); fy = fp2px(rl.y); }

            // Check ceiling fixtures
            if (fx === null) {
                var cf = (fpPlan.ceilingFixtures || []).find(function(m) { return m.id === tid; });
                if (cf) { fx = fp2px(cf.x); fy = fp2px(cf.y); }
            }

            if (fx === null) return;

            fpSvgEl(svg, 'line', {
                x1: px, y1: py, x2: fx, y2: fy,
                stroke: color, 'stroke-width': 1.5,
                'stroke-dasharray': '5,3',
                'pointer-events': 'none', opacity: 0.85
            });
        });
    });
}

/**
 * Overlay highlighting for target edit mode.
 * Only shows rings when a specific slot is selected (fpTargetEditSlotIdx !== null).
 * - Current slot targets → amber fill ring
 * - Other selectable fixtures → teal dashed ring
 */
function fpRenderTargetEditOverlay(svg) {
    // Slot picker step — no fixture rings yet
    if (fpTargetEditSlotIdx === null) return;

    var plate = (fpPlan.wallPlates || []).find(function(p) { return p.id === fpTargetEditPlateId; });
    if (!plate) return;
    var slot    = (plate.slots || [])[fpTargetEditSlotIdx];
    var targets = (slot && slot.targetIds) ? slot.targetIds : [];

    function drawRing(cx, cy, r, fixtureId) {
        var isLinked = targets.indexOf(fixtureId) >= 0;
        // Linked: solid amber ring + warm fill + checkmark
        // Unlinked: dashed teal ring, no fill — clearly "available, not yet chosen"
        fpSvgEl(svg, 'circle', {
            cx: cx, cy: cy, r: r,
            fill:   isLinked ? 'rgba(217,119,6,0.22)' : 'rgba(13,148,136,0.08)',
            stroke: isLinked ? '#b45309' : '#0d9488',
            'stroke-width': isLinked ? 3 : 1.75,
            'stroke-dasharray': isLinked ? 'none' : '5,3',
            'pointer-events': 'none'
        });
        // Linked indicator: small checkmark dot in center
        if (isLinked) {
            fpSvgEl(svg, 'circle', {
                cx: cx, cy: cy, r: 3.5,
                fill: '#b45309', 'pointer-events': 'none'
            });
        }
        // Invisible hit area on top for clicking
        var hit = fpSvgEl(svg, 'circle', {
            cx: cx, cy: cy, r: r,
            fill: 'transparent', stroke: 'transparent', cursor: 'pointer'
        });
        hit.addEventListener('click', function(e) {
            e.stopPropagation();
            fpToggleTarget(fixtureId);
        });
    }

    // Recessed lights
    (fpPlan.recessedLights || []).forEach(function(rl) {
        drawRing(fp2px(rl.x), fp2px(rl.y), 15, rl.id);
    });

    // Ceiling fixtures
    (fpPlan.ceilingFixtures || []).forEach(function(cf) {
        drawRing(fp2px(cf.x), fp2px(cf.y), 17, cf.id);
    });
}

// ---- Mode bar wiring (Row 1) ----

(function() {
    var btnLayout = document.getElementById('fpModeLayout');
    if (btnLayout) btnLayout.addEventListener('click', function() { fpSetMode('layout'); });

    var btnElec = document.getElementById('fpModeElectrical');
    if (btnElec) btnElec.addEventListener('click', function() { fpSetMode('electrical'); });

    var btnPlumb = document.getElementById('fpModePlumbing');
    if (btnPlumb) btnPlumb.addEventListener('click', function() { fpSetMode('plumbing'); });

    var dimCheck = document.getElementById('fpElecDimCheck');
    if (dimCheck) dimCheck.addEventListener('change', fpToggleElecFade);

    // Initialize Row 2 tool group visibility for starting mode (layout)
    document.querySelectorAll('.fp-elec-tool').forEach(function(el) { el.style.display = 'none'; });
    document.querySelectorAll('.fp-plumbing-tool').forEach(function(el) { el.style.display = 'none'; });
    document.querySelectorAll('.fp-overlay-tool').forEach(function(el) { el.style.display = 'none'; });
}());

// ============================================================
// MODE MANAGEMENT
// ============================================================

/**
 * Switch the active editing mode.
 * Clears selection, resets tool to Select, exits any special modes.
 * mode: 'layout' | 'electrical'
 */
function fpSetMode(mode) {
    if (fpActiveMode === mode) return;

    // Exit special states cleanly
    if (fpTargetEditMode) fpExitTargetEditMode();
    // fpSetTool('select') below will also cancel any active drawing

    // Clear selection before switching
    fpSelectedId   = null;
    fpSelectedType = 'room';

    // Apply the new mode
    fpActiveMode = mode;

    // Update Row 1 button active states
    var btnLayout = document.getElementById('fpModeLayout');
    var btnElec   = document.getElementById('fpModeElectrical');
    if (btnLayout) btnLayout.classList.toggle('active', mode === 'layout');
    if (btnElec)   btnElec.classList.toggle('active', mode === 'electrical');

    // Show/hide Row 2 tool groups
    document.querySelectorAll('.fp-layout-tool').forEach(function(el) {
        el.style.display = (mode === 'layout') ? '' : 'none';
    });
    document.querySelectorAll('.fp-elec-tool').forEach(function(el) {
        el.style.display = (mode === 'electrical') ? '' : 'none';
    });
    document.querySelectorAll('.fp-plumbing-tool').forEach(function(el) {
        el.style.display = (mode === 'plumbing') ? '' : 'none';
    });
    // Dim toggle visible in any overlay mode (Electrical or Plumbing)
    document.querySelectorAll('.fp-overlay-tool').forEach(function(el) {
        el.style.display = (mode !== 'layout') ? '' : 'none';
    });

    // Update Row 1 Plumbing button if present
    var btnPlumb = document.getElementById('fpModePlumbing');
    if (btnPlumb) btnPlumb.classList.toggle('active', mode === 'plumbing');

    // Reset to Select tool (this also cancels drawing, exits type/corner edit, calls fpRender)
    fpSetTool('select');
}

// ============================================================
// ROW 3 — PROPERTIES BAR
// ============================================================

/**
 * Rebuild the Row 3 properties bar based on what is currently selected.
 * Called at the end of every fpRender().
 * Phase 1: read-only type label + action buttons (Edit Marker, Edit Targets, Remove).
 */
function fpUpdatePropsBar() {
    var bar = document.getElementById('fpPropsBar');
    if (!bar) return;

    // Hide bar when nothing is selected or not in select mode
    if (!fpSelectedId || fpActiveTool !== 'select') {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = '';

    var type = fpSelectedType;

    // Human-readable type label
    var labelMap = {
        'room':             'Room',
        'door':             'Door',
        'window':           'Window',
        'plumbing':         'Plumbing',
        'ceiling':          'Ceiling Fixture',
        'recessedLight':    'Recessed Light',
        'wallplate':        'Wall Plate',
        'outlet':           'Outlet',
        'switch':           'Switch',
        'fixture':          'Fixture',
        'plumbingEndpoint': 'Plumbing EP'
    };

    // ── Wall-plate slot focus: override label + show controls text ──────────
    var slotControlsText = '';
    if (type === 'wallplate' && fpSelectedSlotIndex !== null) {
        var wpData  = (fpPlan.wallPlates || []).find(function(m) { return m.id === fpSelectedId; });
        var wpSlots = wpData ? (wpData.slots || []) : [];
        var slot    = wpSlots[fpSelectedSlotIndex];
        if (slot) {
            var slotNames = {
                'switch/single-pole': 'Switch',  'switch/3-way':  '3-Way Switch',
                'switch/dimmer':      'Dimmer',  'switch/timer':  'Timer Switch',
                'outlet/standard':    'Outlet',  'outlet/gfci':   'GFCI Outlet',
                'outlet/220v':        '240V Outlet', 'outlet/usb': 'USB Outlet'
            };
            var slotKey  = (slot.type || 'switch') + '/' + (slot.subtype || 'single-pole');
            var slotName = slotNames[slotKey] || (slot.type || 'Switch');
            labelMap['wallplate'] = 'Slot ' + (fpSelectedSlotIndex + 1) + '/' + wpSlots.length
                                  + '\u2009·\u2009' + slotName;  // thin-space · thin-space
            slotControlsText = (slot.controls || '').trim();
        }
    }

    var lbl = document.createElement('span');
    lbl.className   = 'fp-props-label';
    lbl.textContent = labelMap[type] || type;
    bar.appendChild(lbl);

    // Controls info for the focused slot (shown between label and action buttons)
    if (slotControlsText) {
        var infoSep = document.createElement('span');
        infoSep.className = 'fp-props-sep';
        bar.appendChild(infoSep);

        var infoSpan = document.createElement('span');
        infoSpan.className   = 'fp-props-info';
        infoSpan.textContent = 'Controls: ' + slotControlsText;
        bar.appendChild(infoSpan);
    }

    // Separator before action buttons
    var sep = document.createElement('span');
    sep.className = 'fp-props-sep';
    bar.appendChild(sep);

    // View/Edit button — label depends on mode; always opens the modal (disabled in view mode)
    var editBtn = document.createElement('button');
    editBtn.className   = 'btn btn-secondary btn-small';
    editBtn.textContent = fpViewMode
        ? ((type === 'room') ? 'View Room' : 'View Marker')
        : ((type === 'room') ? 'Edit Room' : 'Edit Marker');
    editBtn.addEventListener('click', function() {
        if (type === 'room') {
            fpOpenRoomEditModal();
        } else {
            fpOpenMarkerEditModal(type, fpSelectedId);
        }
    });
    bar.appendChild(editBtn);

    // Rotate button — fixtures only, edit mode only
    if (!fpViewMode && type === 'fixture') {
        var fix = (fpPlan.fixtures || []).find(function(f) { return f.id === fpSelectedId; });
        if (fix) {
            var rotBtn = document.createElement('button');
            rotBtn.className   = 'btn btn-secondary btn-small';
            rotBtn.textContent = '⟳';
            rotBtn.title = 'Click to rotate 90°';
            rotBtn.addEventListener('click', function() {
                fix.orientation = ((fix.orientation || 0) + 1) % 4;
                fpDirty = true;
                fpSilentSave();
                fpRender();   // re-renders symbol and rebuilds props bar with updated label
            });
            bar.appendChild(rotBtn);
        }
    }

    // Edit Targets button — wall plates in electrical mode only, not in view mode
    if (!fpViewMode && type === 'wallplate' && fpActiveMode === 'electrical' && !fpTargetEditMode) {
        var targBtn = document.createElement('button');
        targBtn.className   = 'btn btn-secondary btn-small';
        targBtn.textContent = 'Edit Targets';
        targBtn.addEventListener('click', fpEnterTargetEditMode);
        bar.appendChild(targBtn);
    }

    // Remove button — edit mode only, not shown for rooms (rooms use keyboard Delete)
    if (!fpViewMode && type !== 'room') {
        var removeBtn = document.createElement('button');
        removeBtn.className   = 'btn btn-danger btn-small';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', function() { fpDeleteSelected(); });
        bar.appendChild(removeBtn);
    }

    // Details → button — navigate to item detail page (all non-room types)
    if (type !== 'room' && fpFloorId) {
        var detailBtn = document.createElement('button');
        detailBtn.className   = 'btn btn-secondary btn-small';
        detailBtn.textContent = 'Details →';
        detailBtn.addEventListener('click', function() {
            // Auto-save any pending changes before leaving the floor plan
            if (fpDirty) fpSilentSave();
            window.location.hash = '#floorplanitem/' + fpFloorId + '/' + type + '/' + fpSelectedId;
        });
        bar.appendChild(detailBtn);
    }
}

// ============================================================
// ZOOM — mouse wheel, pinch gesture, slider
// ============================================================

(function() {
    var wrap = document.getElementById('fpCanvasWrapper');

    // Mouse wheel — zoom centred on cursor position
    wrap.addEventListener('wheel', function(e) {
        e.preventDefault();
        var factor = e.deltaY < 0 ? 1.12 : 0.89;
        fpZoomTo(fpZoom * factor, e.clientX, e.clientY);
    }, { passive: false });

    // Two-finger pinch — zoom centred on finger midpoint
    wrap.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            var t0 = e.touches[0], t1 = e.touches[1];
            fpPinchState = {
                startDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
                startZoom: fpZoom,
                midX: (t0.clientX + t1.clientX) / 2,
                midY: (t0.clientY + t1.clientY) / 2
            };
            e.preventDefault();
        } else {
            fpPinchState = null;
        }
    }, { passive: false });

    wrap.addEventListener('touchmove', function(e) {
        if (fpPinchState && e.touches.length === 2) {
            var t0 = e.touches[0], t1 = e.touches[1];
            var dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
            fpZoomTo(
                fpPinchState.startZoom * dist / fpPinchState.startDist,
                fpPinchState.midX, fpPinchState.midY
            );
            e.preventDefault();
        }
    }, { passive: false });

    wrap.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) fpPinchState = null;
    });

    // Zoom slider
    document.getElementById('fpZoomSlider').addEventListener('input', function() {
        var newZoom = parseFloat(this.value);
        var svg  = document.getElementById('fpSvg');
        var rect = svg.getBoundingClientRect();
        // Zoom towards the centre of the canvas
        fpZoomTo(newZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    // Double-click zoom label → reset to 100%
    document.getElementById('fpZoomLabel').addEventListener('dblclick', function() {
        var svg  = document.getElementById('fpSvg');
        var rect = svg.getBoundingClientRect();
        fpZoomTo(1.0, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
}());

// ============================================================
// PAN — drag on empty background, space+drag anywhere, one-finger
// touch drag. Lets you reach any part of the plan once zoomed in.
// ============================================================

var fpPanState  = null;   // active drag: {lastX, lastY, moved}
var fpSpaceDown = false;  // spacebar held — pans from anywhere, even over rooms

/** True if a mouse/touch target is empty canvas (background rect or grid line), not a room/handle/marker. */
function fpIsPanBackground(target) {
    if (!target) return false;
    if (target.id === 'fpBgRect') return true;
    return !!(target.closest && target.closest('.fp-grid'));
}

/** Shift the viewBox by a screen-pixel delta, clamped to stay inside the floor (mirrors fpZoomTo's clamp). */
function fpPanBy(dxClient, dyClient) {
    var svg  = document.getElementById('fpSvg');
    var rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var scaleX = fpViewW / rect.width;
    var scaleY = fpViewH / rect.height;
    fpViewX = Math.max(0, Math.min(fpSvgW - fpViewW, fpViewX - dxClient * scaleX));
    fpViewY = Math.max(0, Math.min(fpSvgH - fpViewH, fpViewY - dyClient * scaleY));
    fpApplyViewBox();
}

(function() {
    var svg  = document.getElementById('fpSvg');
    var wrap = document.getElementById('fpCanvasWrapper');

    // After a real drag, swallow the click that follows so it doesn't also
    // deselect or start drawing a room.
    function suppressNextClick() {
        svg.addEventListener('click', function suppressor(e) {
            e.stopImmediatePropagation();
            svg.removeEventListener('click', suppressor, true);
        }, true);
    }

    // Spacebar held → pan-drag works from anywhere, even on top of a room (Figma/Photoshop style)
    document.addEventListener('keydown', function(e) {
        if (e.code !== 'Space' || fpSpaceDown) return;
        var page = document.getElementById('page-floorplan');
        if (!page || page.classList.contains('hidden')) return;
        var activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' ||
            (document.activeElement && document.activeElement.isContentEditable)) return;
        fpSpaceDown = true;
        wrap.style.cursor = 'grab';
        e.preventDefault();
    });
    document.addEventListener('keyup', function(e) {
        if (e.code === 'Space') {
            fpSpaceDown = false;
            if (!fpPanState) wrap.style.cursor = '';
        }
    });

    // Mouse: drag on empty background pans; holding Space pans from anywhere.
    // Registered on capture so Space+drag pre-empts room/handle drag handlers.
    svg.addEventListener('mousedown', function(e) {
        if (e.button !== 0 || !fpPlan) return;
        var wantsPan = fpSpaceDown || (fpIsPanBackground(e.target) && !fpDrawing && !fpTypeMode);
        if (!wantsPan) return;
        if (fpSpaceDown) { e.preventDefault(); e.stopPropagation(); }

        fpPanState = { lastX: e.clientX, lastY: e.clientY, moved: false };
        wrap.style.cursor = 'grabbing';

        function onMove(eMove) {
            if (!fpPanState) return;
            var dx = eMove.clientX - fpPanState.lastX;
            var dy = eMove.clientY - fpPanState.lastY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) fpPanState.moved = true;
            fpPanBy(dx, dy);
            fpPanState.lastX = eMove.clientX;
            fpPanState.lastY = eMove.clientY;
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            wrap.style.cursor = fpSpaceDown ? 'grab' : '';
            if (fpPanState && fpPanState.moved) suppressNextClick();
            fpPanState = null;
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, true);

    // Touch: one-finger drag on empty background pans (two-finger pinch still zooms — see above).
    var touchPan = null;
    wrap.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1 || fpDrawing || fpTypeMode) { touchPan = null; return; }
        var t = e.touches[0];
        if (!fpIsPanBackground(document.elementFromPoint(t.clientX, t.clientY))) { touchPan = null; return; }
        touchPan = { lastX: t.clientX, lastY: t.clientY, moved: false };
    }, { passive: true });

    wrap.addEventListener('touchmove', function(e) {
        if (!touchPan || e.touches.length !== 1) return;
        var t = e.touches[0];
        var dx = t.clientX - touchPan.lastX;
        var dy = t.clientY - touchPan.lastY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) touchPan.moved = true;
        fpPanBy(dx, dy);
        touchPan.lastX = t.clientX;
        touchPan.lastY = t.clientY;
        e.preventDefault();
    }, { passive: false });

    wrap.addEventListener('touchend', function() {
        if (touchPan && touchPan.moved) suppressNextClick();
        touchPan = null;
    });
}());

// ============================================================
// TYPE NUMBERS MODE — toolbar toggle + panel events
// ============================================================

document.getElementById('fpToolTypeMode').addEventListener('click', function() {
    if (fpTypeMode) {
        // Toggle off
        fpTypeMode = false;
        fpCloseTypePanel();
        this.classList.remove('active');
        fpSetTool('room');
    } else {
        // Activate type mode
        fpSetTool('room');  // ensure room tool active (also clears type mode momentarily)
        fpTypeMode = true;
        this.classList.add('active');
        // Highlight Room button too
        var roomBtn = document.getElementById('fpToolRoom');
        if (roomBtn) roomBtn.classList.add('active');
        fpSetStatus('Click on the canvas to place the room\'s start corner.');
    }
});

document.getElementById('fpTypeSaveBtn').addEventListener('click', function() {
    if (!fpTypeAnchor) return;
    var cmd = document.getElementById('fpTypeCmd').value;
    var pts = fpParseTypeCommand(cmd, fpTypeAnchor);
    if (pts.length < 3) { alert('Need at least 3 corners.'); return; }
    // Remove duplicate closing point if shape closes
    var last = pts[pts.length - 1];
    if (Math.hypot(last.x - fpTypeAnchor.x, last.y - fpTypeAnchor.y) < 0.26) {
        pts = pts.slice(0, pts.length - 1);
    }
    var color = FP_ROOM_COLORS[(fpPlan.rooms || []).length % FP_ROOM_COLORS.length];
    fpCloseTypePanel();
    fpOpenRoomLinkModal(pts, color);
    fpRender();
});

document.getElementById('fpTypeCancelBtn').addEventListener('click', function() {
    fpCloseTypePanel();
    fpSetStatus('Click on the canvas to place a new start corner, or select another tool.');
});

document.getElementById('fpTypeCmd').addEventListener('input', fpUpdateTypePreview);
document.getElementById('fpTypeX').addEventListener('input', fpUpdateTypePreview);
document.getElementById('fpTypeY').addEventListener('input', fpUpdateTypePreview);
