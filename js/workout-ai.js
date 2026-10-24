// workout-ai.js — "Describe it" box on the New Exercise screen
//
// Type the exercise in plain words ("using the Nordic Stick, lay on stomach and lift my torso
// up 15 times"); the LLM turns it into the exercise fields. The form below is the preview:
// everything is editable, nothing is saved until Add Exercise. New equipment it wants to
// introduce shows up as a tick box (on by default) and is only added to the equipment list
// when the exercise is saved.
//
// The LLM is given your muscle list, equipment list (with descriptions) and exercise names, so
// it can only pick real muscles, reuse your equipment, and warn about duplicates.

var _woAi = { text: '', busy: false, status: '', notes: [], newEquip: [] };   // newEquip: [{name, description}]

/** Called each time a fresh exercise editor opens. */
function woAiReset() {
    _woAi = { text: '', busy: false, status: '', notes: [], newEquip: [] };
}

/** Draws the box (new exercises only — the editor leaves an empty #woeAiBox placeholder). */
function woAiRenderBox() {
    var box = document.getElementById('woeAiBox');
    if (!box) return;

    var newEquipHtml = _woAi.newEquip.map(function(q, i) {
        var on = _woEdit.equipment.indexOf(q.name) !== -1;
        return '<label class="wo-inline-check"><input type="checkbox" data-ai-equip="' + i + '"' + (on ? ' checked' : '') + '><span>➕ Add new equipment: <strong>' +
               _woEsc(q.name) + '</strong>' + (q.description ? ' — ' + _woEsc(q.description) : '') + '</span></label>';
    }).join('');

    box.innerHTML =
        '<div class="wo-ai">' +
            '<label class="ex-label" for="woAiText">✨ Describe it</label>' +
            '<textarea id="woAiText" rows="3" style="width:100%" placeholder="e.g. Using the Nordic Stick, lay on stomach and lift my torso up 15 times.">' + _woEsc(_woAi.text) + '</textarea>' +
            '<div class="wo-ai-actions"><button type="button" class="btn btn-secondary btn-small" id="woAiGo"' + (_woAi.busy ? ' disabled' : '') + '>' +
                (_woAi.busy ? 'Working…' : '✨ Fill in the form') + '</button>' +
                '<span class="wo-hint" id="woAiStatus">' + _woEsc(_woAi.status) + '</span></div>' +
            (_woAi.notes.length || newEquipHtml
                ? '<div class="wo-ai-notes"><div class="wo-hint">Filled in below — check it over and change anything before adding.</div>' +
                  newEquipHtml + _woAi.notes.map(function(n) { return '<div class="wo-ai-note">' + _woEsc(n) + '</div>'; }).join('') + '</div>'
                : '') +
        '</div>';

    document.getElementById('woAiText').addEventListener('input', function() { _woAi.text = this.value; });
    document.getElementById('woAiGo').addEventListener('click', woAiRun);
    box.querySelectorAll('[data-ai-equip]').forEach(function(cb) {
        cb.addEventListener('change', function() {
            var q = _woAi.newEquip[parseInt(this.getAttribute('data-ai-equip'), 10)];
            var i = _woEdit.equipment.indexOf(q.name);
            if (this.checked && i === -1) _woEdit.equipment.push(q.name);
            if (!this.checked && i !== -1) _woEdit.equipment.splice(i, 1);
            _woRebuildEquipChips();
        });
    });
}

async function woAiRun() {
    var text = (document.getElementById('woAiText').value || '').trim();
    _woAi.text = text;
    if (!text) { alert('Type what the exercise is first.'); return; }
    _woAi.busy = true; _woAi.status = 'Reading your description…'; _woAi.notes = [];
    woAiRenderBox();
    try {
        await woLoadExercises();
        var r = await _woAiAsk(text);
        _woAiApply(r);
        _woAi.status = '';
        _woAi.busy = false;
        _woRenderExerciseEditor();          // the form is the preview; it also redraws this box
    } catch (err) {
        console.error('Workouts: describe-it failed:', err);
        _woAi.busy = false;
        _woAi.status = err && err.message ? err.message : 'Something went wrong. Please try again.';
        woAiRenderBox();
    }
}

async function _woAiAsk(text) {
    var cfgDoc = await userCol('settings').doc('llm').get();
    var cfg = cfgDoc.exists ? cfgDoc.data() : null;
    if (!cfg || !cfg.provider || !cfg.apiKey) {
        throw new Error('No AI provider is set up. Add one in Settings → AI first.');
    }

    var muscles = _woMuscles.map(function(m) { return { id: m.id, name: m.name, area: m.area }; });
    var prompt =
        'You turn a plain-English description of one exercise into JSON for a workout app.\n\n' +
        'Description: """' + text + '"""\n\n' +
        'The person\'s MUSCLE list (use ONLY these ids): ' + JSON.stringify(muscles) + '\n' +
        'The person\'s EQUIPMENT list with descriptions: ' + JSON.stringify(woEquipmentForLLM()) + '\n' +
        'Exercises they already have: ' + JSON.stringify(_woExercises.map(function(e) { return e.name; })) + '\n\n' +
        'Return ONLY one JSON object with exactly these keys:\n' +
        '{ "name": string (short, title case),\n' +
        '  "measure": "reps" | "time",\n' +
        '  "amount": number (reps, or seconds if measure is time; use the number in the description if there is one),\n' +
        '  "usesWeight": boolean,\n' +
        '  "weight": number | null (pounds, only if the description gives one),\n' +
        '  "sideMode": "both" | "each" | "alternate" (both = both sides together; each = one side then the other; alternate = swapping sides every rep),\n' +
        '  "startSide": "left" | "right",\n' +
        '  "pushPull": "push" | "pull" | "both" | "neither" (REQUIRED, lowercase, always decide: push = pressing or extending away from the body such as push-ups, dips, presses, triceps work; pull = pulling toward the body such as rows, curls, pull-ups, back extensions; use "neither" only for legs-only, core-only or cardio moves),\n' +
        '  "equipment": [names taken exactly from the EQUIPMENT list that the exercise uses],\n' +
        '  "newEquipment": [{ "name": string, "description": string }] (ONLY equipment the description needs that is truly not in the EQUIPMENT list; match loosely first, e.g. "nordic pole" = "Nordic Stick"; "description" is one short sentence, and say you are guessing if you do not know what it is),\n' +
        '  "muscles": [{ "id": string from the MUSCLE list, "main": boolean }] (main = ONLY the 1 to 3 muscles that do most of the work; everything else that merely braces or assists is main:false. Think about which muscles actually move the body in this exact movement. Abs are main only for trunk curls or crunch-type moves; a sideways or side-lying torso lift is a side bend, so obliques and lower back are main and abs are a helper at most),\n' +
        '  "cues": [3 to 5 short spoken-style coaching cues, imperative, one per item],\n' +
        '  "guesses": [short plain sentences about anything you had to assume, such as push/pull choice or unclear equipment],\n' +
        '  "similarExercises": [names from the existing exercises list that are the same or nearly the same exercise] }\n\n' +
        'Rules: never invent a muscle id; leave equipment arrays empty if none; respond with ONLY the JSON, no markdown fences.';

    var endpoint = (cfg.provider === 'openai') ? 'https://api.openai.com/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions';
    var model = (cfg.provider === 'openai') ? (cfg.model || 'gpt-4o-mini') : 'grok-3-mini';

    var resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: 2000 })
    });
    if (!resp.ok) throw new Error('The AI request failed (' + resp.status + ').');
    var data = await resp.json();
    var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('The AI returned nothing.');
    content = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(content); }
    catch (e) { throw new Error('Could not read the AI answer. Please try again.'); }
}

/** Puts the LLM's answer into the working copy (_woEdit), checking every value against the real lists. */
function _woAiApply(r) {
    var ex = _woEdit, notes = [];
    ex.name = String(r.name || '').trim().slice(0, 80);
    ex.measure = r.measure === 'time' ? 'time' : 'reps';
    var amt = parseInt(r.amount, 10);
    ex.defaultAmount = amt > 0 ? amt : (ex.measure === 'time' ? 30 : 10);
    var w = parseFloat(r.weight);
    ex.usesWeight = !!r.usesWeight || w > 0;
    ex.defaultWeight = ex.usesWeight && w > 0 ? w : null;
    ex.sideMode = ['both', 'each', 'alternate'].indexOf(r.sideMode) !== -1 ? r.sideMode : 'both';
    ex.eachSide = ex.sideMode === 'each';
    ex.startSide = r.startSide === 'right' ? 'right' : 'left';
    var pp = String(r.pushPull || '').trim().toLowerCase();             // tolerate "Push", " pull " ...
    if (WO_PUSHPULL[pp]) ex.pushPull = pp;
    else { ex.pushPull = 'neither'; notes.push('The AI did not say push or pull - choose it below.'); console.warn('Describe-it: unusable pushPull value:', r.pushPull); }
    ex.instructions = (Array.isArray(r.cues) ? r.cues : String(r.cues || '').split('\n'))
        .map(function(c) { return String(c).trim(); }).filter(Boolean).join('\n');

    // Equipment: reuse the person's own names; anything not on the list becomes a "new equipment" tick box
    ex.equipment = [];
    _woAi.newEquip = [];
    var descByName = {};
    (r.newEquipment || []).forEach(function(q) { if (q && q.name) descByName[String(q.name).trim().toLowerCase()] = String(q.description || '').trim(); });
    var wanted = (r.equipment || []).concat((r.newEquipment || []).map(function(q) { return q && q.name; }));
    wanted.forEach(function(raw) {
        var n = String(raw || '').trim();
        if (!n) return;
        var have = _woFindEquipment(n);
        var name = have ? have.name : n;
        if (ex.equipment.indexOf(name) !== -1) return;
        ex.equipment.push(name);
        if (!have) _woAi.newEquip.push({ name: name, description: descByName[name.toLowerCase()] || '' });
    });

    // Muscles: only real ids, no repeats
    ex.targets = [];
    (r.muscles || []).forEach(function(m) {
        var id = m && m.id;
        if (!id || !_woMuscleMap[id] || ex.targets.some(function(t) { return t.muscleId === id; })) return;
        ex.targets.push({ muscleId: id, main: !!m.main });
    });
    if (!ex.targets.length) notes.push('No muscles were picked — choose them under “What it works”.');
    else if (!ex.targets.some(function(t) { return t.main; })) ex.targets[0].main = true;

    // Duplicates
    var lower = ex.name.toLowerCase();
    var dups = _woExercises.filter(function(e) {
        return e.name.toLowerCase() === lower || (r.similarExercises || []).some(function(s) { return String(s).toLowerCase() === e.name.toLowerCase(); });
    }).map(function(e) { return e.name; });
    if (dups.length) notes.push('You already have something similar: ' + dups.join(', ') + '.');

    (r.guesses || []).forEach(function(g) { if (g) notes.push('Guess: ' + String(g).trim()); });
    _woAi.notes = notes;
}

/** Before saving: any equipment name not yet on the list is added there (with the AI's description). */
async function woAiBeforeSave() {
    _woEdit.equipment.forEach(function(name) {
        if (_woFindEquipment(name)) return;
        var hit = _woAi.newEquip.filter(function(q) { return q.name === name; })[0];
        woAddEquipmentName(name, hit ? hit.description : '');
    });
}
