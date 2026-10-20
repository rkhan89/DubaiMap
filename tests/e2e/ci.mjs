// The browser checks CI runs on every push: starts the dev server, runs each scenario in headless Chrome, and fails
// if any step printed FAIL, threw, or the page threw an error. Screenshots land in shots/ (kept by CI on failure).
//   node ci.mjs                 (EXE=<path to Chrome> if it isn't the default for this OS)
//   SCENARIOS="e2e search" node ci.mjs      (name@width runs a scenario at another width, e.g. spacing@360)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const SCENARIOS = (process.env.SCENARIOS || 'e2e search checkin tagged crews scrap taps landmarks theme a11y scrapbook decorate spacing@360 spacing@390 spacing@430').split(/\s+/).filter(Boolean);
const sleep = ms=>new Promise(r=>setTimeout(r, ms));

const server = spawn(process.execPath, ['dev/server.mjs', '--port', '5174', '--dev-no-auth'], { cwd:ROOT, stdio:['ignore', 'ignore', 'inherit'] });
let up = false;
for (let k=0; k<60 && !up; k++){ try{ up = (await fetch('http://localhost:5174/')).ok; }catch(_){ await sleep(500); } }
if (!up){ console.error('the dev server did not start'); server.kill(); process.exit(1); }

const failed = [];
for (const s of SCENARIOS){
  console.log(`\n=== ${s}`);
  const code = await new Promise(res=>{ const [name, width='390'] = s.split('@'); const p = spawn(process.execPath, ['shot.mjs', name, width, 'light'], { cwd:HERE, stdio:'inherit', env:process.env }); p.on('exit', res); });
  if (code !== 0) failed.push(s);
}
server.kill();
console.log(failed.length ? `\nFailed: ${failed.join(', ')}` : `\nAll ${SCENARIOS.length} browser suites passed`);
process.exit(failed.length ? 1 : 0);
