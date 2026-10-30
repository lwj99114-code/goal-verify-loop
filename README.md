# goal-verify-loop

**目标驱动的验证循环**：给定一个目标，它先理解目标，写出/运行检测器，然后行动、验证、分析失败原因、重试——直到目标完成，检测程序退出。

```
目标 → 理解 → 检测器 → 行动 → 验证 → (失败: 分析原因 → 重试) → 完成 → 关闭
```

## 为什么做这个

很多任务失败不是因为做不了，而是因为**没有可验证的完成标准**：
- 说「做好了」但不知道真的好了
- 不知道差在哪，就盲目重试
- 没有明确的停止条件，永远循环

`goal-verify-loop` 把这件事变成可执行的结构：**目标 = 描述 + 检测规则 + 行动清单**。检测不过就分析原因、再行动，检测通过就停。

## 安装

```bash
git clone <repo-url>
cd goal-verify-loop
# 零依赖，Node >= 18 即可
```

## 用法

```bash
# 跑一个目标
node src/loop.mjs --goal goal.json

# 指定工作目录
node src/loop.mjs --goal my-goal.json --cwd /path/to/project

# 跑演示（会自动创建 demo/hello.txt 并验证）
npm run demo
```

## 目标文件格式 (`goal.json`)

```json
{
  "name": "my-goal",
  "description": "目标的一句话描述（先理解它）",
  "maxRounds": 5,
  "actions": [
    { "type": "command", "command": "npm run build" }
  ],
  "checks": [
    { "id": "dist-exists", "type": "file_exists", "path": "dist/index.js" },
    { "id": "tests-pass", "type": "command", "command": "npm test", "expectExit": 0 }
  ]
}
```

### 检测器类型 (`checks[].type`)

| 类型 | 参数 | 含义 |
|---|---|---|
| `file_exists` | `path` | 文件存在 |
| `file_contains` | `path`, `text` | 文件包含指定文本 |
| `command` | `command`, `expectExit` 或 `expectOutput` | 命令执行结果符合预期 |
| `port_open` | `port`, `host` | 端口可连接 |
| `process_running` | `name` | 进程在运行（tasklist） |

### 行动类型 (`actions[].type`)

| 类型 | 参数 | 含义 |
|---|---|---|
| `command` | `command`, `timeoutMs` | 执行命令 |
| `write_file` | `path`, `content` | 写文件 |
| `wait` | `ms` | 等待 |

## 运行流程

1. **理解**：打印目标名称、描述、检测项、行动项、最大轮次
2. **每轮循环**：
   - 跑全部检测 → 打印 PASS/FAIL 及原因
   - 全 PASS → 打印「目标完成 ✅ 检测程序关闭」→ **退出 0**
   - 有 FAIL → 打印失败项（**分析为什么**）→ 执行 actions → 下一轮
3. **达到最大轮次仍未完成** → 打印「目标未完成 ❌」→ **退出 1**

## 退出码

- `0` 目标达成
- `1` 目标未达成（轮次耗尽）
- `2` 目标文件不存在
- `3` 运行异常

## 设计原则

- **零依赖**（Node >= 18，仅标准库）
- **检测先行**：先定义「怎样算完成」，再行动
- **失败可见**：每项检测打印原因，不吞错
- **有界重试**：`maxRounds` 上限，不会无限循环

## License

MIT
