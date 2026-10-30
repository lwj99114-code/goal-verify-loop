// 检测器：把 goal.checks 里的每条规则跑一遍，返回 { pass, results, failed }
// 零依赖，Node >= 18
import fs from 'node:fs';
import net from 'node:net';
import { execSync } from 'node:child_process';

function runCommand(cmd, cwd, timeoutMs = 60_000) {
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: String(out) };
  } catch (e) {
    return { ok: false, out: String(e.stdout || ''), err: String(e.stderr || e.message || '') };
  }
}

function checkPort(port, host = '127.0.0.1', timeoutMs = 3000) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (ok) => { try { sock.destroy(); } catch {} resolve(ok); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.on('connect', () => done(true));
    sock.on('error', () => done(false));
  });
}

/**
 * @param {object} goal  解析后的 goal.json
 * @param {string} baseDir 工作目录（相对路径基准）
 * @returns {Promise<{pass:boolean, results:Array, failed:Array}>}
 */
export async function verify(goal, baseDir) {
  const checks = Array.isArray(goal.checks) ? goal.checks : [];
  const results = [];
  for (const c of checks) {
    const type = c.type;
    let ok = false;
    let detail = '';
    try {
      if (type === 'file_exists') {
        const p = c.path;
        ok = fs.existsSync(p);
        detail = `${p} ${ok ? 'exists' : 'missing'}`;
      } else if (type === 'file_contains') {
        const p = c.path;
        if (!fs.existsSync(p)) { ok = false; detail = `${p} missing`; }
        else {
          const text = fs.readFileSync(p, 'utf8');
          const needle = c.text || '';
          ok = text.includes(needle);
          detail = `${p} ${ok ? 'contains' : 'does not contain'} ${JSON.stringify(needle)}`;
        }
      } else if (type === 'command') {
        const r = runCommand(c.command, c.cwd || baseDir, c.timeoutMs);
        if (c.expectExit !== undefined) {
          ok = (r.ok ? 0 : 1) === c.expectExit || (r.ok && c.expectExit === 0);
          detail = `exit=${r.ok ? 0 : 1} expected=${c.expectExit}`;
        } else if (c.expectOutput) {
          const hay = (r.out + ' ' + (r.err || ''));
          ok = hay.includes(c.expectOutput);
          detail = `output ${ok ? 'matches' : 'lacks'} ${JSON.stringify(c.expectOutput)}`;
        } else {
          ok = r.ok;
          detail = `exit=${r.ok ? 0 : 1}`;
        }
        if (c.showOutput) detail += ` | ${(r.out || r.err || '').slice(0, 300)}`;
      } else if (type === 'port_open') {
        ok = await checkPort(c.port, c.host || '127.0.0.1');
        detail = `${c.host || '127.0.0.1'}:${c.port} ${ok ? 'open' : 'closed'}`;
      } else if (type === 'process_running') {
        const r = runCommand(`tasklist /FI "IMAGENAME eq ${c.name}" /NH`, baseDir, 15_000);
        ok = r.ok && r.out.toLowerCase().includes(String(c.name).toLowerCase());
        detail = `${c.name} ${ok ? 'running' : 'not found'}`;
      } else {
        ok = false;
        detail = `unknown check type: ${type}`;
      }
    } catch (e) {
      ok = false;
      detail = `check threw: ${e.message}`;
    }
    results.push({ id: c.id || type, type, ok, detail });
  }
  const failed = results.filter((r) => !r.ok);
  return { pass: failed.length === 0, results, failed };
}
