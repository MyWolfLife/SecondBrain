// Run with NODE_PATH pointing to a Playwright installation. Uses the gitignored test account.
// AI responses are deterministic fixtures; Firestore auth, reads and atomic saves are real.
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
    const credentials = fs.readFileSync('.test-credentials.md', 'utf8');
    const email = credentials.match(/Username:\*\*\s*(\S+)/)[1];
    const password = credentials.match(/Password:\*\*\s*(\S+)/)[1];
    const browser = await chromium.launch({headless:true,channel:'msedge'});
    const page = await browser.newPage({viewport:{width:1280,height:900},serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => console.log('Request failed:',new URL(request.url()).origin,request.failure().errorText));
    page.on('dialog', dialog => dialog.accept());
    let fixture;
    try {
        await page.goto('http://localhost:8080', {waitUntil:'domcontentloaded'});
        await page.locator('#loginEmail').fill(email);
        await page.locator('#loginPassword').fill(password);
        await page.locator('#loginSubmitBtn').click();
        try { await page.waitForFunction(() => typeof auth !== 'undefined' && auth.currentUser, null, {timeout:30000}); }
        catch (error) { console.log('Login diagnostics:',await page.locator('#loginError').innerText(),errors); throw error; }
        fixture = await page.evaluate(async () => {
            const project = userCol('lifeProjects').doc();
            const day = project.collection('days').doc();
            const global = lpLocationsCol().doc();
            const link = project.collection('projectLocations').doc();
            const batch = db.batch();
            batch.set(project,{title:'Day AI regression fixture',template:'vacation',mode:'planning',status:'active',archived:false});
            batch.set(global,{name:'Fixture Park',address:'Test address',lat:33,lng:-84});
            batch.set(link,{locationId:global.id,name:'Fixture Park',address:'Test address',lat:33,lng:-84});
            batch.set(day,{date:'2026-10-07',label:'Test Day',sortOrder:0,items:[{id:'original',title:'Park visit',type:'activity',status:'confirmed',locationId:link.id,time:'09:00',duration:'60 min',notes:'Keep this note',bookingRef:'retained-booking',itemDownloaded:true,sortOrder:0}]});
            batch.set(project.collection('itemPhotos').doc('fixture-photo'),{itemId:'original',name:'Test photo'});
            batch.set(project.collection('itemPhotoData').doc('fixture-photo'),{imageData:'test-fixture'});
            await batch.commit();
            return {projectId:project.id,dayId:day.id,globalId:global.id,linkId:link.id};
        });
        await page.evaluate(id => {location.hash = '#life-project/' + id;}, fixture.projectId);
        await page.waitForFunction(id => _lpCurrentProjectId === id && _lpDays.length === 1, fixture.projectId);
        await page.locator('#lpAcc_itinerary .lp-accordion-header').click();
        await page.locator('#lpDayList').waitFor();
        await page.evaluate(id => _lpToggleDayCollapse(id),fixture.dayId);
        await page.getByRole('button',{name:'✨ Import / Edit Day',exact:true}).click();
        await page.locator('#lpDayAiPrompt').waitFor();
        assert.equal(await page.locator('#lpDayAiClear').isChecked(),false);
        await page.evaluate(() => {
            window.dayAiTestUserCol = userCol;
            userCol = name => name === 'settings' ? {
                doc: id => id === 'llm' ? { get: async () => ({exists:true,data:()=>({provider:'openai',apiKey:'fixture-only',model:'gpt-4o-mini'})}) } : window.dayAiTestUserCol(name).doc(id)
            } : window.dayAiTestUserCol(name);
        });
        const prompts = [];
        let requestNumber = 0;
        let clearResponse = false;
        await page.route('https://api.openai.com/v1/responses',async route => {
            const request = route.request().postDataJSON();
            assert.equal(request.tools[0].type,'web_search');
            assert.equal(request.store,false);
            prompts.push(request.input[0].content);
            requestNumber++;
            const items = [
                {id:'original',title:'Park visit',type:'activity',locationId:fixture.linkId,time:'09:00'},
                {id:'drive',title:'Drive to dinner',type:'drive',locationId:fixture.linkId,toLocationId:'new:dinner'},
                {id:'dinner',title:'Dinner',type:'activity',activitySubType:'eat',locationId:'new:dinner',time:requestNumber>1?'17:00':'',duration:requestNumber>1?'90 min':''}
            ];
            const draft = {items,locations:[{key:'new:dinner',name:'Fixture Dinner '+fixture.projectId,address:'123 Test Street',phone:'555-0100',website:'https://example.com',lat:33.5,lng:-84.3,uncertain:true,reason:'Confirm the branch',sources:['https://example.com']}],warnings:['Check dinner location']};
            const content = requestNumber === 3 ? '{invalid' : JSON.stringify(clearResponse ? {items:[],locations:[],warnings:[]} : draft);
            await route.fulfill({json:{status:'completed',output:[{type:'web_search_call'},{type:'message',content:[{type:'output_text',text:content,annotations:[{type:'url_citation',url:'https://example.com'}]}]}]}});
        });
        await page.locator('#lpDayAiPrompt').fill('Keep the park and add dinner afterwards.');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(() => _lpDayAi?.draft && !_lpDayAi.busy);
        assert.ok(prompts[0].includes('MODE: CHANGE'));
        assert.ok(prompts[0].includes('retained-booking'));
        assert.equal(await page.locator('.lp-day-ai-items > li').count(),3);
        await page.locator('#lpDayAiPrompt').fill('Dinner reservations at 5pm for 90 min.');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(() => _lpDayAi?.history.length === 1 && !_lpDayAi.busy);
        assert.ok(prompts[1].includes('Keep the park and add dinner afterwards.'));
        assert.ok(prompts[1].includes('new:dinner'));
        assert.ok((await page.locator('#lpDayAiReview').innerText()).includes('17:00 · 90 min'));
        await page.locator('#lpDayAiPrompt').fill('An intentionally invalid response test');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(() => !_lpDayAi.busy);
        assert.equal(await page.evaluate(()=>_lpDayAi.history.length),1);
        assert.equal(await page.evaluate(()=>_lpDayAi.draft.items[2].time),'17:00');
        await page.locator('#lpDayAiPrompt').fill('');
        await page.locator('#lpDayAiUndo').click();
        assert.equal(await page.evaluate(()=>_lpDayAi.draft.items[2].time),'');
        await page.locator('#lpDayAiPrompt').fill('Dinner reservations at 5pm for 90 min.');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(() => _lpDayAi?.history.length === 1 && !_lpDayAi.busy);
        await page.locator('#lpDayAiApply').click();
        assert.equal(await page.evaluate(()=>!!_lpDayAi),true,'Warnings must be acknowledged');
        await page.locator('#lpDayAiAck').check();
        await page.screenshot({path:path.join(os.tmpdir(),'bishop-day-ai-desktop.png'),fullPage:true});
        await page.setViewportSize({width:375,height:812});
        await page.screenshot({path:path.join(os.tmpdir(),'bishop-day-ai-mobile.png'),fullPage:true});
        assert.ok(await page.evaluate(()=>document.querySelector('.lp-day-ai-modal').scrollWidth<=document.querySelector('.lp-day-ai-modal').clientWidth),'No horizontal overflow');
        await page.locator('#lpDayAiApply').click();
        await page.waitForFunction(()=>_lpDayAi===null || !_lpDayAi.busy, null, {timeout:30000});
        assert.equal(await page.evaluate(()=>_lpDayAi===null),true,await page.locator('#lpDayAiStatus').innerText());
        const saved = await page.evaluate(async f => {
            const day = (await lpSub(f.projectId,'days').doc(f.dayId).get()).data();
            const locations = await lpSub(f.projectId,'projectLocations').get();
            return {day,locations:locations.docs.map(doc=>({id:doc.id,...doc.data()}))};
        },fixture);
        assert.equal(saved.day.items.length,3);
        assert.equal(saved.day.items[0].bookingRef,'retained-booking');
        assert.equal(saved.day.items[0].itemDownloaded,true);
        assert.equal(saved.day.items[0].notes,'Keep this note');
        assert.equal(saved.day.items[2].time,'17:00');
        assert.equal(saved.day.items[2].duration,'90 min');
        assert.equal(saved.day.items[1].toLocationId,saved.day.items[2].locationId);
        assert.equal(saved.locations.length,2);
        assert.equal(saved.locations.find(loc=>loc.id===saved.day.items[2].locationId).researchUncertain,true);
        assert.equal(await page.evaluate(async f=>(await lpSub(f.projectId,'itemPhotoData').doc('fixture-photo').get()).exists,fixture),true);
        // Clear starts a create request and does not write until approved. Cancel leaves saved data alone.
        await page.evaluate(id=>_lpOpenDayAi(id),fixture.dayId);
        await page.locator('#lpDayAiClear').check();
        await page.locator('#lpDayAiPrompt').fill('Make a fresh day');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(()=>_lpDayAi?.draft && !_lpDayAi.busy);
        assert.ok(prompts.at(-1).includes('MODE: CREATE'));
        assert.ok(!prompts.at(-1).includes('retained-booking'));
        await page.locator('#lpDayAiClose').click();
        await page.waitForFunction(()=>_lpDayAi===null);
        // Concurrent changes cause a save rejection, leaving the draft available.
        await page.evaluate(id=>_lpOpenDayAi(id),fixture.dayId);
        await page.locator('#lpDayAiPrompt').fill('Keep my day');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(()=>_lpDayAi?.draft && !_lpDayAi.busy);
        await page.locator('#lpDayAiAck').check();
        await page.evaluate(async f=>lpSub(f.projectId,'days').doc(f.dayId).update({date:'2026-10-08'}),fixture);
        await page.locator('#lpDayAiApply').click();
        await page.waitForFunction(()=>!_lpDayAi.busy);
        assert.match(await page.locator('#lpDayAiStatus').innerText(),/changed since you opened/);
        await page.locator('#lpDayAiClose').click();
        await page.waitForFunction(()=>_lpDayAi===null);
        clearResponse = true;
        await page.evaluate(id=>_lpOpenDayAi(id),fixture.dayId);
        await page.locator('#lpDayAiClear').check();
        await page.locator('#lpDayAiPrompt').fill('Remove everything from this day.');
        await page.locator('#lpDayAiGenerate').click();
        await page.waitForFunction(()=>_lpDayAi?.draft && !_lpDayAi.busy);
        await page.locator('#lpDayAiAck').check();
        await page.evaluate(()=>{window.dayAiOriginalLock=isDataLocked;isDataLocked=()=>true;});
        await page.locator('#lpDayAiApply').click();
        await page.waitForFunction(()=>!_lpDayAi.busy);
        assert.match(await page.locator('#lpDayAiStatus').innerText(),/read-only/);
        await page.evaluate(()=>{isDataLocked=window.dayAiOriginalLock;});
        await page.locator('#lpDayAiApply').click();
        await page.waitForFunction(()=>_lpDayAi===null || !_lpDayAi.busy);
        assert.equal(await page.evaluate(()=>_lpDayAi===null),true);
        const cleared = await page.evaluate(async f=>({items:(await lpSub(f.projectId,'days').doc(f.dayId).get()).data().items,
            index:(await lpSub(f.projectId,'itemPhotos').doc('fixture-photo').get()).exists,
            photo:(await lpSub(f.projectId,'itemPhotoData').doc('fixture-photo').get()).exists}),fixture);
        assert.equal(cleared.items.length,0);
        assert.equal(cleared.index,false);
        assert.equal(cleared.photo,false);
        assert.deepEqual(errors,[]);
        console.log('Browser checks passed: authenticated desktop/mobile, revisions, undo, invalid response, clear/cancel, warning acknowledgement, real atomic save, preserved fields/photos, concurrent edit rejection, read-only lock, approved clear with photo cleanup.');
        console.log('Screenshots: '+path.join(os.tmpdir(),'bishop-day-ai-desktop.png')+' and '+path.join(os.tmpdir(),'bishop-day-ai-mobile.png'));
    } finally {
        if (fixture) await page.evaluate(async f=>{
            const batch = db.batch();
            for (const sub of ['days','projectLocations','itemPhotos','itemPhotoData']) {
                const snap = await lpSub(f.projectId,sub).get();
                snap.forEach(doc=>{
                    if (sub==='projectLocations') batch.delete(lpLocationsCol().doc(doc.data().locationId));
                    batch.delete(doc.ref);
                });
            }
            batch.delete(userCol('lifeProjects').doc(f.projectId));
            await batch.commit();
        },fixture);
        await browser.close();
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
