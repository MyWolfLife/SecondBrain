// workout-bodymap.js — a simple front/back body drawing with the muscles an exercise works coloured in (Fitness → Workouts)
//
//   woBodyMapHtml(targets)   targets = [{ muscleId, main }]  →  HTML string (two small SVGs + a legend), or '' if
//                            none of the targets has a place on the drawing (e.g. only "Cardio" is set)
//
// The drawing is hand-made and stylised — each muscle is one simple shape, not an anatomy atlas. The shapes are
// keyed by the muscle ids in WO_DEFAULT_MUSCLES (js/workouts.js); a muscle you added yourself has no shape and is
// simply not drawn (it still shows as a chip). Colours: main target = strong teal, also-works = light teal,
// everything else = grey. All styling is in css/styles.css under ".wo-bodymap".
//
// Each shape is drawn for the LEFT side of the body in a 100 × 200 box; `mirror: true` draws it again flipped for the
// right side. A shape with `mirror: false` sits on the centre line.

var WO_BODY_FRONT = [
    { id: 'traps',           mirror: true,  svg: '<path d="M46 26 L34 33 L40 37 L47 31 Z"/>' },
    { id: 'front-shoulders', mirror: true,  svg: '<ellipse cx="29" cy="41" rx="6.5" ry="7.5"/>' },
    { id: 'shoulders',       mirror: true,  svg: '<ellipse cx="21.5" cy="44" rx="4.5" ry="7"/>' },
    { id: 'chest',           mirror: true,  svg: '<path d="M49 36 L49 57 Q40 61 32 54 Q30 44 37 38 Q43 35 49 36 Z"/>' },
    { id: 'biceps',          mirror: true,  svg: '<ellipse cx="20" cy="64" rx="4.8" ry="10"/>' },
    { id: 'forearms',        mirror: true,  svg: '<ellipse cx="16" cy="88" rx="4.2" ry="13"/>' },
    { id: 'abs',             mirror: false, svg: '<rect x="43" y="58" width="14" height="38" rx="5"/>' },
    { id: 'obliques',        mirror: true,  svg: '<path d="M41 60 L35 60 Q33 78 36 96 L41 96 Z"/>' },
    { id: 'hips',            mirror: true,  svg: '<ellipse cx="39" cy="103" rx="6" ry="5"/>' },
    { id: 'quads',           mirror: true,  svg: '<ellipse cx="38" cy="132" rx="9" ry="24"/>' },
    { id: 'calves',          mirror: true,  svg: '<ellipse cx="36" cy="173" rx="5.5" ry="17"/>' }
];

var WO_BODY_BACK = [
    { id: 'upper-back',      mirror: true,  svg: '<ellipse cx="43" cy="53" rx="7" ry="8"/>' },
    { id: 'traps',           mirror: false, svg: '<polygon points="50,26 37,33 44,44 50,50 56,44 63,33"/>' },
    { id: 'rear-shoulders',  mirror: true,  svg: '<ellipse cx="29" cy="41" rx="6.5" ry="7.5"/>' },
    { id: 'shoulders',       mirror: true,  svg: '<ellipse cx="21.5" cy="44" rx="4.5" ry="7"/>' },
    { id: 'lats',            mirror: true,  svg: '<path d="M37 50 L43 60 L43 84 Q37 86 34 74 Q32 60 37 50 Z"/>' },
    { id: 'triceps',         mirror: true,  svg: '<ellipse cx="20" cy="64" rx="4.8" ry="10"/>' },
    { id: 'forearms',        mirror: true,  svg: '<ellipse cx="16" cy="88" rx="4.2" ry="13"/>' },
    { id: 'lower-back',      mirror: false, svg: '<rect x="43" y="82" width="14" height="14" rx="4"/>' },
    { id: 'glutes',          mirror: true,  svg: '<ellipse cx="41.5" cy="106" rx="8.5" ry="9"/>' },
    { id: 'hamstrings',      mirror: true,  svg: '<ellipse cx="38" cy="135" rx="9" ry="22"/>' },
    { id: 'calves',          mirror: true,  svg: '<ellipse cx="36" cy="173" rx="5.5" ry="17"/>' }
];

/** One view (front or back) as an <svg>. state = { muscleId: 'main' | 'also' }. */
function _woBodySvg(shapes, state, label) {
    var flip = ' transform="translate(100 0) scale(-1 1)"';
    // The grey outline behind the muscles: head, neck, torso, then an arm and a leg drawn for the left and mirrored for the right
    var leftSide = '<path d="M31 34 Q17 38 15 62 L11 96 Q10 104 17 104 Q22 104 23 96 L27 68 Q30 52 34 42 Z"/>' +
                   '<path d="M39 108 L50 108 L49 150 L47 188 Q46 197 40 197 Q33 197 32 188 L31 150 Z"/>';
    var out = '<svg viewBox="0 0 100 200" class="wo-bodymap-svg" role="img" aria-label="' + label + ' view of the muscles worked">' +
              '<g class="bm-body">' +
                  '<circle cx="50" cy="14" r="9"/><rect x="45" y="22" width="10" height="7" rx="2"/>' +
                  '<path d="M31 32 Q50 24 69 32 L67 70 Q65 98 61 112 L39 112 Q35 98 33 70 Z"/>' +
                  leftSide + '<g' + flip + '>' + leftSide + '</g>' +
              '</g>';
    shapes.forEach(function(sh) {
        var cls = 'bm-m' + (state[sh.id] === 'main' ? ' bm-main' : (state[sh.id] === 'also' ? ' bm-also' : ''));
        var m = (typeof _woMuscleMap !== 'undefined' && _woMuscleMap[sh.id]) ? _woMuscleMap[sh.id].name : sh.id;
        var title = '<title>' + m + '</title>';
        out += '<g class="' + cls + '">' + title + sh.svg + '</g>';
        if (sh.mirror) out += '<g class="' + cls + '"' + flip + '>' + title + sh.svg + '</g>';
    });
    return out + '</svg>';
}

function woBodyMapHtml(targets) {
    var state = {};
    (targets || []).forEach(function(t) {
        if (!t || !t.muscleId) return;
        if (t.main) state[t.muscleId] = 'main';
        else if (state[t.muscleId] !== 'main') state[t.muscleId] = 'also';
    });
    var drawable = WO_BODY_FRONT.concat(WO_BODY_BACK).some(function(sh) { return state[sh.id]; });
    if (!drawable) return '';
    return '<div class="wo-bodymap">' +
               '<div class="wo-bodymap-view">' + _woBodySvg(WO_BODY_FRONT, state, 'Front') + '<span class="wo-hint">Front</span></div>' +
               '<div class="wo-bodymap-view">' + _woBodySvg(WO_BODY_BACK, state, 'Back') + '<span class="wo-hint">Back</span></div>' +
           '</div>' +
           '<div class="wo-bodymap-legend"><span><i class="bm-key bm-key--main"></i> Main</span> <span><i class="bm-key bm-key--also"></i> Also works</span></div>';
}
