// Interaction tests for the A v2 artboard logic. Usage: node interaction_tests.js <path to A2.dc.html>
const fs = require('fs'); const assert = require('assert');
const s = fs.readFileSync(process.argv[2], 'utf8');
const js = s.match(/data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(o) { Object.assign(this.state, o); } }
const C = eval('(function(DCLogic){' + js + ';return Component})')(DCLogic);
const mk = (props) => new C(props || {});
const ev = { preventDefault() {} };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('form: empty email shows error', () => { const c = mk(); c.renderVals().onSubmit(ev); assert.match(c.state.error, /Enter an email/); assert.equal(c.state.submitted, false); });
t('form: malformed email shows error', () => { const c = mk(); c.renderVals().onEmail({ target: { value: 'alex@' } }); c.renderVals().onSubmit(ev); assert.match(c.state.error, /Enter an email/); });
t('form: valid email submits and clears error', () => { const c = mk(); c.renderVals().onEmail({ target: { value: 'alex@example.com' } }); c.renderVals().onSubmit(ev); assert.equal(c.state.submitted, true); assert.equal(c.state.error, ''); const v = c.renderVals(); assert.equal(v.showForm, false); });
t('coach: approve swaps buttons for confirmation', () => { const c = mk(); c.renderVals().approve(); const v = c.renderVals(); assert.equal(v.approved, true); assert.equal(v.notApproved, false); });
t('coach: blank name falls back', () => { const c = mk(); c.renderVals().onName({ target: { value: '   ' } }); const v = c.renderVals(); assert.equal(v.coachName, 'Your coach'); assert.equal(v.coachInitial, 'Y'); });
t('coach: traits toggle and summarize', () => { const c = mk(); const v0 = c.renderVals(); assert.equal(v0.traitSummary, 'Warm, Direct.'); v0.traits[0].pick(); assert.equal(c.renderVals().traitSummary, 'Funny, Warm, Direct.'); });
t('coach: no traits prompts to pick', () => { const c = mk(); c.setState({ traits: {} }); assert.equal(c.renderVals().traitSummary, 'Pick a personality below.'); });
t('tabs: four athletes in order', () => { const v = mk().renderVals(); assert.deepEqual(v.sports.map((x) => x.label), ['Running', 'Trail', 'HYROX', 'Fitness']); assert.equal(v.sports[0].on, 'true'); });
t('tabs: each athlete has distinct planned/adjusted copy', () => { const c = mk(); const seen = new Set(); c.renderVals().sports.forEach((sp, i) => { c.renderVals().sports[i].pick(); const ex = c.renderVals().ex; assert.ok(ex.planned && ex.adjusted && ex.why && ex.who); seen.add(ex.adjusted); }); assert.equal(seen.size, 4); });
t('tabs: Fitness switches chart to No race', () => { const c = mk(); c.renderVals().sports[3].pick(); const v = c.renderVals(); assert.equal(v.chartTabs[1].on, 'true'); assert.match(v.chart.intro, /No race/); });
t('tabs: HYROX keeps Racing chart', () => { const c = mk(); c.renderVals().sports[2].pick(); const v = c.renderVals(); assert.equal(v.chartTabs[0].on, 'true'); assert.match(v.ex.who, /HYROX/); });
t('chart: No race toggle moves hero to Fitness', () => { const c = mk(); c.renderVals().chartTabs[1].pick(); const v = c.renderVals(); assert.equal(c.state.sport, 'fit'); assert.equal(v.sports[3].on, 'true'); });
t('chart: Racing toggle from Fitness returns to Running', () => { const c = mk(); c.renderVals().sports[3].pick(); c.renderVals().chartTabs[0].pick(); assert.equal(c.state.sport, 'run'); });
t('chart: Racing toggle keeps current race sport', () => { const c = mk(); c.renderVals().sports[1].pick(); c.renderVals().chartTabs[0].pick(); assert.equal(c.state.sport, 'trail'); });
t('chart: 16 bars, only week 9 is today and lower than planned', () => { const v = mk().renderVals(); assert.equal(v.bars.length, 16); const td = v.bars.filter((b) => b.today); assert.equal(td.length, 1); assert.equal(v.bars.indexOf(td[0]), 8); assert.ok(td[0].h < td[0].ghostH); assert.ok(td[0].labelBottom > td[0].ghostH); });
t('chart: fitness plan has an easier week every 4th week', () => { const c = mk(); c.setState({ sport: 'fit', plan: 'fit' }); const h = c.renderVals().bars.map((b) => b.ghostH); [3, 7, 11, 15].forEach((i) => assert.ok(h[i] < h[i - 1], 'week ' + (i + 1))); });
t('chart: race plan tapers over the last 3 weeks', () => { const h = mk().renderVals().bars.map((b) => b.ghostH); assert.ok(h[13] < h[12] && h[14] < h[13] && h[15] < h[14]); });
t('chart: bar heights fit the 236px plot with room for the label', () => { const v = mk().renderVals(); v.bars.forEach((b) => { assert.ok(b.ghostH <= 200); assert.ok(b.labelBottom <= 236 - 16 || !b.today); }); });
t('palette: switch and unknown fallback', () => { assert.equal(mk({ palette: 'Slate' }).renderVals().p.deep, '#0F172A'); assert.equal(mk({ palette: 'Nope' }).renderVals().p.deep, '#12322E'); });
console.log(n + ' tests passed');
