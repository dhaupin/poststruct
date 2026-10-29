// test/run.mjs - the negative test is permanent: the good fixture must be
// clean (0 fails) and the bad fixture must produce EXACTLY the expected
// FAIL ids. If a refactor deletes a check, this fails. The expected lists
// live in labs/battery.json (the committed refusal contract) so the family
// status emitter counts the same list this test reconciles against.
import fs from 'node:fs'
import { runAudit } from '../src/index.mjs'

const GOOD = 'test/fixtures/good'
const BAD = 'test/fixtures/bad'
const CONTRACT = JSON.parse(fs.readFileSync('labs/battery.json', 'utf8'))

const good = await runAudit(GOOD)
if (good.hasFails) {
  console.error('FAIL good fixture should be clean:'); console.error(JSON.stringify(good.findings.filter(x => x.level === 'fail'), null, 2))
  process.exit(1)
}

const bad = await runAudit(BAD)
const got = bad.findings.filter(x => x.level === 'fail').map(x => x.id)
const gotWarns = bad.findings.filter(x => x.level === 'warn').map(x => x.id)
const expected = CONTRACT.fail
const expectedWarns = CONTRACT.warn
const missing = expected.filter(id => !got.includes(id))
const unexpected = got.filter(id => !expected.includes(id))
const missingWarns = expectedWarns.filter(id => !gotWarns.includes(id))
if (missingWarns.length) { console.error(`FAIL bad fixture warn drift: missing ${missingWarns}`); process.exit(1) }
if (missing.length || unexpected.length) {
  console.error(`FAIL bad fixture findings drift.\nmissing: ${missing}\nunexpected: ${unexpected}\ngot: ${got}`)
  process.exit(1)
}
console.log(`poststruct self-test: good clean, bad hits ${expected.length}/${expected.length} expected FAIL ids - PASS`)
