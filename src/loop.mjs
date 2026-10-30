#!/usr/bin/env node
// 主循环：理解目标 → 检测 → 行动 → 验证 → 失败分析 → 重试 → 完成关闭
// 用法: node src/loop.mjs --goal goal.json [--cwd <dir>] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { verify } from './verify.mjs';
import { execSync } from 'node:child_process';

function parseArgs(argv) {
  const out = { goal: 'goal.json', cwd: process.cwd(), verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--goal') out.goal = argv[++i];
    else if (a === '--cwd') out.cwd = argv[++i];
    else if (a === '--verbose') out.verbose = true;
  }
  return out;
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runAction(action, baseDir) {
  if (action.type === 'command') {
    log(`  action: run ${action.command}`);
    try {
      const out = execSync(action.command, { cwd: action.cwd || baseDir, encoding: 'utf8', timeout: action.timeoutMs || 300_000, stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out: String(out).slice(0, 2000) };
    } catch (e) {
      return { ok: false, out: String(e.stdout || '').slice(0, 2000), err: String(e.stderr || e.message) };
    }
  }
  if (action.type === 'write_file') {
    const p = action.path;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, action.content || '', 'utf8');
    log(`  action: wrote ${p}`);
    return { ok: true };
  }
  if (action.type === 'wait') {
    log(`  action: wait ${action.ms}ms`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, action.ms || 1000);
    return { ok: true };
  }
  return { ok: false, err: `unknown action type: ${action.type}` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const goalPath = path.resolve(args.goal);
  if (!fs.existsSync(goalPath)) {
    console.error(`goal not found: ${goalPath}`);
    process.exit(2);
  }
  const goal = JSON.parse(fs.readFileSync(goalPath, 'utf8'));
  const baseDir = path.resolve(args.cwd);
  const maxRounds = Number(goal.maxRounds || 5);

  // 1) 理解目标
  log('===== 目标理解 =====');
  log(`目标: ${goal.name || '(unnamed)'}`);
  log(`描述: ${goal.description || '(no description)'}`);
  log(`检测项: ${(goal.checks || []).map((c) => `${c.id || c.type}(${c.type})`).join(', ') || '(none)'}`);
  log(`行动项: ${(goal.actions || []).length} 个，最大轮次: ${maxRounds}`);

  // 2) 循环
  for (let round = 1; round <= maxRounds; round++) {
    log(`----- 第 ${round}/${maxRounds} 轮 -----`);
    const result = await verify(goal, baseDir);
    for (const r of result.results) {
      log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.id}: ${r.detail}`);
    }

    if (result.pass) {
      log('===== 目标完成 ✅ 检测程序关闭 =====');
      process.exit(0);
    }

    // 3) 失败分析
    log(`失败 ${result.failed.length} 项，分析原因:`);
    for (const f of result.failed) {
      log(`  - ${f.id}: ${f.detail}`);
    }

    // 4) 行动
    if (round === maxRounds) {
      log('已达最大轮次，停止。');
      break;
    }
    for (const action of goal.actions || []) {
      const r = runAction(action, baseDir);
      if (!r.ok) log(`  action failed: ${r.err || ''}`);
    }
  }

  log('===== 目标未完成 ❌ 退出 =====');
  process.exit(1);
}

main().catch((e) => {
  console.error('loop crashed:', e);
  process.exit(3);
});
