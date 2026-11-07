# 排行榜服务器接口（给自建服务器用）

游戏支持两种排行榜后端：Supabase 式数据库（见 [leaderboard.md](leaderboard.md)），或者一个按本文接口写的小服务器。`src/leaderboard.config.ts` 里 `kind: 'simple'` 加上服务器地址就能用。

## 硬性要求

- **HTTPS**，有正式域名和有效证书（游戏页面是 `https://nullptrsoul.github.io`，浏览器不允许它访问 http 地址）。
- **一直在线**，进程挂了能自动重启。
- **国内能访问**（玩家大多在国内）。
- **CORS**：允许来源 `https://nullptrsoul.github.io` 和 `http://localhost:5173`，允许 `GET, POST, OPTIONS`，允许请求头 `Content-Type`。
- 所有返回都是 JSON，UTF-8。

## 数据

一张成绩表，每局一行：

| 字段 | 类型 | 说明 |
|---|---|---|
| player_id | 文本 | 32 位小写十六进制，每台设备一个 |
| name | 文本 | 昵称，去掉首尾空格后 1～10 个字 |
| character | 文本 | `bailan` `ziling` `jinti` `juyan` `qinglan` `shenxi` 之一 |
| wave | 整数 | 打到第几波 |
| kills | 整数 | 击败数 |
| play_time | 整数 | 战斗用时，秒 |
| version | 文本 | 游戏版本，最多 20 字 |
| created_at | 时间 | 服务器写入时间 |

## 接口

### `POST /api/scores`

请求体：

```json
{ "player_id": "0123456789abcdef0123456789abcdef", "name": "星屑", "character": "shenxi", "wave": 23, "kills": 1800, "play_time": 700, "version": "web-0.2" }
```

成功返回 `201 {"ok": true}`。不合理的成绩返回 `400 {"error": "原因"}`，不入库。

**校验规则**（全部满足才收）：

- `player_id` 符合 `^[0-9a-f]{32}$`；`name` 去空格后 1～10 个字；`character` 在上面 6 个之内；`version` 不超过 20 字。
- `wave` 在 2～200；`kills` 在 0～`wave × 400`；`play_time` 在 0～7200。
- `play_time ≥ min_play_time(wave) × 0.9`，其中 `min_play_time(w)` = 第 1 到第 w−1 波的固定时长之和：
  - 第 1～10 波依次是 `20, 25, 25, 30, 0, 35, 40, 0, 45, 0` 秒；
  - 第 11 波起：波数是 5 的倍数为 0（Boss 波），第 11～30 波其余为 30，第 31 波起其余为 25。
  - 例子：`min_play_time(11) = 220`，`min_play_time(16) = 340`，`min_play_time(31) = 700`。
- 同一 IP 每分钟最多 10 次提交，超了返回 `429`。

### `GET /api/top?board=all&limit=15`

`board` 是 `all`（总榜）或 `week`（本周：北京时间周一 0 点起）。`limit` 1～50，默认 15。

每个 `player_id` 只取最好的一局（先比 `wave` 大，再比 `kills` 大，再比更早提交），按同样规则排序返回：

```json
[{ "player_id": "…", "name": "星屑", "character": "shenxi", "wave": 23, "kills": 1800, "play_time": 700 }]
```

### `GET /api/rank?board=all&wave=23&kills=1800&player_id=…`

返回这个成绩在榜上的名次：`{"rank": 6}`。算法：在该榜「每人最好一局」里，数 **其他玩家**（`player_id` 不同）中 `wave` 更大、或 `wave` 相同且 `kills` 更大的人数，再加 1。

### `GET /api/health`

返回 `{"ok": true}`，用来检查服务器活着。

## 维护

- 数据每天备份一次，留最近 7 天。
- 发现刷榜：能按 `player_id` 或 IP 删掉成绩。
- 不需要登录、不存密码、不收集其他个人信息。
