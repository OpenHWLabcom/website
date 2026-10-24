# 科沃思八界机器人控制接口文档

> 版本：v1.0 · 2026-10-22
> 说明：文中 `<JETSON_IP>`、`<ROBOT_IP>`、`<LOWER_IP>`、`<LOWER_PW>` 为占位符，授权后由管理员提供。  
> 适用：八界（mvp03 六轴机械臂 + 升降立柱 + 头部俯仰 + 夹爪）  
> 用途：新主机 / 新上位机与机器人通讯、联调、二次开发

---

## 0. 先看这里：三种接入方式怎么选

| 方式 | 适用场景 | 入口 | 是否需要 Jetson |
|---|---|---|---|
| **A. HTTP API（推荐）** | 新主机只做任务层控制、不想碰 ROS/adb | `http://<Jetson>:8796`、`:8795`、`:8792` | 需要（Jetson 跑桥接） |
| **B. Mission WebSocket** | 新主机直接接机器人，做底盘/升降/头部/臂模式/任务 | `ws://<ROBOT_IP>:17890/robot-ws/` | 不需要 |
| **C. 下板 ROS2 / jogd** | 需要关节轨迹、闭环、底层调试 | adb → chroot → ssh 到下板 | 不需要，但需 adb + sshpass |

**当前环境**
- Jetson（上位机）：`<JETSON_IP>`
- 机器人上板（Android）：`<ROBOT_IP>`，adb `5555`
- 机器人下板（Ubuntu 22.04 / ROS2 Humble）：`<LOWER_IP>`，**只能从上板 chroot 内访问**
- 下板 SSH：`Agi@<LOWER_IP>`，密码 `<LOWER_PW>`（由管理员提供）
- 控制台：`http://<JETSON_IP>:8790/` · 导航页 `robot_home.html`

```
新主机 ──HTTP──> Jetson 桥接服务 :8796/:8795/:8792/:8790
   │                     │ adb <ROBOT_IP>:5555
   │                     ▼
   │               机器人上板 Android
   │                     │ chroot /linux → ssh Agi@<LOWER_IP>
   │                     ▼
   └──WebSocket 17890──> 上板 mission 服务
                         │
                         ▼
                   下板 ROS2 Humble
                   /joint_states · 控制器 · 相机
```

---

## 1. 端口一览

| 端口 | 所在主机 | 服务 | 说明 |
|---:|---|---|---|
| `5555` | 机器人上板 | adb | 调试/转发 |
| `17890` | 机器人上板 | Mission WebSocket | 机器人任务接口，**局域网可直接连** |
| `8790` | Jetson | 静态控制台 | HTTP 页面 |
| `8791` | Jetson | 语音/指挥 HTTPS | 自签证书 |
| `8792` | Jetson | 指挥 HTTP | 手机/新主机推荐 |
| `8794` | Jetson | 抓取日志代理 | `/log`、`/start` |
| `8795` | Jetson | 模式服务 | 真机 / 本地模式 |
| `8796` | Jetson | 关节桥 | **最常用的控制 API** |
| `8799` | Jetson | 头部相机流 | MJPEG / 快照 |
| `8800` | Jetson | 爪子相机流 | MJPEG / 快照 |
| `8788` | Jetson | 限位数据库 | 查询/导出 |
| `8789` | Jetson | 训练数据采集 | 采集服务 |

> 所有 HTTP 接口都开了 `Access-Control-Allow-Origin: *`，默认**没有鉴权**。请只在可信局域网使用，或加反向代理/防火墙；设备地址与密码不随文档公开。

---

## 2. 方式 A：Jetson HTTP API（推荐）

### 2.1 读取实时状态 `GET :8796/joints`

`GET http://<JETSON_IP>:8796/joints`（`/` 等价）

```json
{
  "deg": [5.39, 147.65, 115.97, -20.23, -65.37, -2.46],
  "rad": [0.094, 2.577, 2.025, -0.353, -1.141, -0.043],
  "vel": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  "eff": [-0.09, -0.13, -1.21, 0.06, 0.32, -0.02],
  "lift": 0.4393,
  "finger": 0.0,
  "pitch": 0.0,
  "ts": 1792636644.12,
  "age": 0.18,
  "status": "ok",
  "jog_status": "connected",
  "jog_age": 0.4,
  "cmd": [0.186, 2.694, 2.15, -0.285, -1.065, 0.0],
  "cmd_age": 3.2,
  "cmd_src": "jog",
  "offline": false,
  "fresh": true,
  "robot_online": true
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `rad` / `deg` | 6 个数 | J1–J6，弧度 / 角度 |
| `vel` / `eff` | 6 个数 | 速度 / 力矩（可能为 0） |
| `lift` | m | 立柱高度 0–0.44 |
| `finger` | m | 夹爪开度 0–0.69 |
| `pitch` | rad | 头部俯仰 0–1.3 |
| `status` | string | `ok` / `starting` / `offline` / `no /joint_states ...` / `err: ...` |
| `age` | s | 距离上次关节数据的秒数 |
| `fresh` | bool | 数据是否在 5s 内（判断掉线用） |
| `robot_online` | bool | 桥在线且数据新鲜 |
| `offline` | bool | 是否处于本地模式（不连机器人） |
| `jog_status` | string | 流式 jog 会话状态：`connected` / `retry` / `offline` |
| `cmd` | 6 个数 | 最近一次下发目标（`/set` 或 `/jog`） |

**状态判断**：`robot_online == true` 才表示可以下发运动；`offline == true` 时所有运动接口会快速返回 `offline`。

### 2.2 健康检查 `GET :8796/health`

```json
{"ok": true, "service": "joints_bridge", "offline": false,
 "robot_online": true, "fresh": true, "status": "ok"}
```

### 2.3 一次性关节目标 `POST :8796/set`

把 6 个关节角下发成一条 `JointTrajectory`，桥内会做**路径防撞检查**（智能门控）：

- 路径离立柱 ≥ 2cm 且目标安全 → 直接走
- 路径会碰柱 → 先插「侧摆A」`[1.1, 1.2, 2.0, 0, -0.8, 0]`，到位后再去目标
- 速度上限 `0.8 rad/s`，运动时间按最大关节差自动计算

请求：

```bash
curl -s -X POST http://<JETSON_IP>:8796/set \
  -H 'Content-Type: application/json' \
  -d '{"rad":[0.186,2.694,2.150,-0.285,-1.065,0.0]}'
```

也接受 `{"joints":[ ... ]}`。响应：

```json
{"ok": true, "rc": 0, "sent": [0.186, 2.694, 2.15, -0.285, -1.065, 0.0],
 "out": "...", "err": ""}
```

> `/set` 是**阻塞式**：等 ROS 命令返回后才响应，可能 2–30s。大范围动作请优先用 `/jog` 或先切慢速模式。

### 2.4 流式关节目标 `POST :8796/jog`

适合拖动示教、连续跟踪、高频小幅更新。

```bash
# 下发目标（6 个弧度）
curl -s -X POST http://<JETSON_IP>:8796/jog \
  -H 'Content-Type: application/json' \
  -d '{"rad":[0.2,2.6,2.0,-0.3,-1.0,0.0]}'

# 停止/保持当前位置
curl -s -X POST http://<JETSON_IP>:8796/jog \
  -H 'Content-Type: application/json' -d '{"stop":true}'
```

响应：

```json
{"ok": true, "jog": true}
{"ok": true, "stop": true}
```

特性：
- 桥会维持一个常驻 `adb → chroot → ssh → /home/Agi/jogd/run.sh` 会话
- 每个目标由 `smoothtrack.py` 生成平滑轨迹（默认 `vmax≈1.2`、`amax≈4.0`）
- 目标 20s 未更新会被丢弃，避免重连时重放旧目标
- `ping` 由桥每 3s 自动发送，调用方不需要自己保活

> `/set` 和 `/jog` 不要同时高频使用；同一时间只选一种执行通道。

### 2.5 运动模式 `POST :8796/mode`

```json
{"mode": {
  "id": "slow", "label": "慢速",
  "vmax": 0.8, "amax": 3.0, "vmin": 0.15, "dead": 0.02,
  "dance": 0, "wave": 0, "damp": 1.0, "dperiod": 7.0
}}
```

| 模式 | id | 关键参数 |
|---|---|---|
| 标准 | `std` | vmax 2.0 / amax 6.0 |
| 慢速 | `slow` | vmax 0.8 / amax 3.0 |
| 柔动 | `dance` | vmax 2.0 / amax 6.0，`dance:1` |
| 波浪 | `wave` | vmax 2.0 / amax 6.0，`dance:1,wave:1,damp:0.7,dperiod:7.0` |
| 定点头快速 | `headfast` | vmax 1.6 / amax 4.5（内部用） |

可选字段 `base:[6]`：波浪/柔动的基准姿态。`/mode` 不依赖机器人连接，本地模式也会保存。

### 2.6 夹爪 `POST :8796/grip`

```bash
curl -s -X POST http://<JETSON_IP>:8796/grip \
  -H 'Content-Type: application/json' -d '{"v":0.69}'
```

| v | 含义 |
|---:|---|
| `0.0` | 全闭 |
| `0.183` | 常用夹持开度 |
| `0.69` | 全开 |

响应：`{"ok":true,"v":0.69,"via":"stream"}`。如果流式会话未连，会退回 SSH 直接调用 `set_grip.py`（可能较慢）。

### 2.7 调试日志 `GET :8796/joglog`

```json
{"status":"connected","tgt":null,"mode":{...},"age":0.2,
 "lines":["08:16:20 grip → 0.000","08:16:20 MODE ..."]}
```

### 2.8 真机 / 本地模式 `:8795`

`GET /mode`：

```json
{"ok":true,"mode":"real","robot_online":true,"bridge_status":"ok",
 "since":1792636644.9,"reason":"startup","flag":false,"busy_until":0}
```

`POST /mode`：

```bash
# 切本地模式（不连机器人，8790/8796/8788/8789 照常）
curl -s -X POST http://<JETSON_IP>:8795/mode \
  -H 'Content-Type: application/json' -d '{"mode":"local"}'

# 切回真机
curl -s -X POST http://<JETSON_IP>:8795/mode \
  -H 'Content-Type: application/json' -d '{"mode":"real"}'
```

- `mode`：`real` / `local`
- 真机模式连续 **10s** 检测不到机器人（桥数据过期/桥离线）→ 自动切本地并亮黄色告警；启动/切换后有 30s 宽限
- 无 `robot_offline` 标记时默认真机模式；标记存在则启动为本地模式
- 切换期间返回 `{"ok":false,"err":"switching, retry later"}`，等 1–2s 重试
- 本地模式：`/joints` 返回 `status:"offline"`，`/set`、`/jog`、`/grip` 返回 `{"ok":false,"offline":true,...}`；`/mode` 仍可用

### 2.9 高层动作 HTTP `:8792`（手机/新主机均可）

`POST http://<JETSON_IP>:8792/cmd`，body 二选一：

```json
{"action":"height","value":0.3}
{"text":"升高一点"}
```

| action | 参数 | 说明 |
|---|---|---|
| `chassis` | `d` -1..1，`a` -1.2..1.2 | 底盘前后/转向（米 / 弧度级） |
| `stop` | — | `stop_all` + 停止播报 |
| `arm` | `mode`: `home`/`grip_open`/`grip_close`/`unbox`/`grip_maint` | 臂预设动作 |
| `head` | `value` 0–1.3 | 头部俯仰（rad） |
| `height` | `value` 0–0.44 | 立柱高度（m） |
| `recharge` | — | 回充 |
| `wave` | — | 挥手 |
| `photo` | — | 头部抓拍 |
| `speech` | `text` | 语音播报 |
| `pose` | `pose:{frame_id,position,orientation}` | 末端位姿控制 |
| `hof` | `x,y,z` | `hand_observe` 对点/示教 |
| `mission` | `name`,`data` | 透传任意 mission 指令 |

响应：`{"ok":true,"detail":"升降 0.30 m"}`。

`GET :8792/state` 返回电量/位置/任务状态；`GET :8792/cam.jpg` 返回当前头部抓拍 PNG。

### 2.10 相机流

| 端口 | 相机 | 快照 | MJPEG |
|---:|---|---|---|
| 8799 | 头部（含识别合成） | `/snap.jpg` | `/cam.mjpg` |
| 8800 | 爪子/手腕 | `/snap.jpg` | `/cam.mjpg` |

- 快照返回 `image/jpeg`，`503` 表示暂无画面
- MJPEG 是 `multipart/x-mixed-replace`，浏览器 `<img src>` 可直接显示

---

## 3. 方式 B：Mission WebSocket（机器人直连）

### 3.1 连接

```
ws://<ROBOT_IP>:17890/robot-ws/
```

局域网内可直接连，**不需要 adb**。无鉴权。

### 3.2 消息信封

```json
{
  "header": {
    "mode": "mission",
    "type": "request",
    "cmd": "start",
    "ts": 1792636644,
    "uuid": "host-001",
    "host": ""
  },
  "body": {
    "name": "robot_height_ctrl",
    "task_id": "task-001",
    "data": {"value": 0.3}
  }
}
```

- `mode`：
  - `mission`：任务/动作（`cmd:"start"`）
  - `event`：一次性查询（`cmd:"oneshot"`）
  - `app`：App 级能力（如语音 `speech`）
- `body.name`：指令名
- `body.task_id`：调用方生成，响应会带回
- `body.data`：参数

响应同样是 JSON，通常形如：

```json
{"header":{"type":"notify","cmd":"...","ts":...},
 "body":{"name":"robot_info","task_id":"...","data":{...}}}
```

匹配 `body.name` / `task_id` 即可。

### 3.3 指令表

| name | data | 说明 |
|---|---|---|
| `robot_height_ctrl` | `{"value":0.0~0.44}` | 立柱高度 |
| `robot_head_ctrl` | `{"value":0.0~1.3}` | 头部俯仰（部分固件用 `head` ROS action，见方式 C） |
| `robot_arm_ctrl` | `{"mode":2/6/7/9/40}` | 2 归位、6 夹爪开、7 夹爪关、9 开箱、40 夹爪维护 |
| `robot_pose_ctrl` | `{"object_pose":[{frame_id,position,orientation}]}` | 末端位姿控制 |
| `chassis_move` | `{"move_distance":m,"move_angle":rad}` | 底盘移动/转向 |
| `stop_all` | `{}` | 停止所有任务（建议断线/异常时必发） |
| `recharge` | `{}` | 回充 |
| `hand_observe` | `{frame_id,position,orientation,box_length}` | 对点/示教 |
| `image_query` | `{"camera_type":2}` | 头部抓拍 |
| `speech` | `{"text":"...","code":0}` | 语音播报（建议 `mode:"app"`） |

### 3.4 Python 示例

```python
import json, socket, base64, struct, time, os

HOST, PORT = "<ROBOT_IP>", 17890

s = socket.create_connection((HOST, PORT), 5)
key = base64.b64encode(b"0123456789abcdef").decode()
s.sendall((f"GET /robot-ws/ HTTP/1.1\r\nHost: {HOST}:{PORT}\r\n"
           "Upgrade: websocket\r\nConnection: Upgrade\r\n"
           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
buf = b""
while b"\r\n\r\n" not in buf:
    buf += s.recv(4096)

def send(obj):
    data = json.dumps(obj).encode()
    mask = os.urandom(4)
    hdr = bytearray([0x81])
    n = len(data)
    if n < 126: hdr.append(0x80 | n)
    elif n < 65536: hdr.append(0x80 | 126); hdr += struct.pack(">H", n)
    else: hdr.append(0x80 | 127); hdr += struct.pack(">Q", n)
    payload = bytes(data[i] ^ mask[i % 4] for i in range(n))
    s.sendall(bytes(hdr) + mask + payload)

send({"header":{"mode":"mission","type":"request","cmd":"start","ts":int(time.time()),
                "uuid":"demo","host":""},
      "body":{"name":"robot_height_ctrl","task_id":"t1","data":{"value":0.3}}})
```

> 现成参考实现：`robot-viz/robot_state.py`（oneshot 查询）、`voice_server.py` 的 `WS` 类（请求/响应匹配）。

---

## 4. 方式 C：下板 ROS2 / jogd（底层）

### 4.1 进入下板

```bash
ADB=adb
$ADB connect <ROBOT_IP>:5555
$ADB -s <ROBOT_IP>:5555 root
$ADB -s <ROBOT_IP>:5555 shell \
  "chroot /linux /bin/bash -lc \"export PATH=/usr/bin:/bin:/usr/sbin:/sbin; \
   sshpass -p robot ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
   Agi@<LOWER_IP> 'echo OK'\""
```

复杂命令建议像 `robot-viz/rcmd.sh` 一样用 base64 传入，避免多层引号。

### 4.2 下板 ROS 环境

每条 SSH 命令里先设置：

```bash
export PATH=/usr/bin:/bin:$PATH
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
export CYCLONEDDS_URI=file:///home/Agi/jogd/dds_hi.xml
source /opt/ros/humble/setup.bash
source /home/Agi/install/setup.bash
```

> `dds_hi.xml` 只绑 `lo`（localhost）。**ROS2 DDS 不能从局域网直接加入**；新主机要么把 ROS 程序放到下板跑，要么走 Mission WS / HTTP 桥。

### 4.3 关键话题 / 动作

| 名称 | 类型 | 用途 |
|---|---|---|
| `/joint_states` | `sensor_msgs/msg/JointState` | 6 关节 + `arm_finger_joint1` + `lift_joint` + `pitch_joint` |
| `/arm_controller/joint_trajectory` | `trajectory_msgs/msg/JointTrajectory` | 发布关节轨迹 |
| `/arm_controller/follow_joint_trajectory` | `control_msgs/action/FollowJointTrajectory` | 平滑跟随（smoothtrack 用） |
| `/robot/control` | `common_msgs/action/RobotControl` | `task_type=2` 头部俯仰；`task_type=3` 升降 |
| `/centaur_body/task` | `common_msgs/action/CentaurBodyTask` | `task_type=6` 夹爪开 / `7` 夹爪关 |
| `/actuator/motor/joint/ctrl` | `sensor_msgs/msg/JointState` | 直接写夹爪（7 个 name，前 6 个保持当前） |

### 4.4 关节轨迹示例

```bash
ros2 topic pub --once /arm_controller/joint_trajectory \
  trajectory_msgs/msg/JointTrajectory \
  "{joint_names: [joint1,joint2,joint3,joint4,joint5,joint6],
    points: [{positions: [0.186,2.694,2.150,-0.285,-1.065,0.0],
              time_from_start: {sec: 3, nanosec: 0}}]}"
```

### 4.5 升降 / 头部（ROS action）

```python
from common_msgs.action import RobotControl
# 升降：task_type=3，lift_dis=0..0.44
# 头部：task_type=2，pitch_angle=0..1.3
```

参考：`/home/Agi/jogd/head_action.py`、`table_pick_v2.py` 的 `set_lift()`。

### 4.6 夹爪

- 官方任务通道：`/centaur_body/task`，`task_type=6` 开（0.690）/ `7` 关（0.000）
- 直接写关节：`/actuator/motor/joint/ctrl`，`JointState` 7 个 name：
  `joint1..joint6, arm_finger_joint1`，第 7 个位置 = 0–0.69
- 现成脚本：`python3 /home/Agi/jogd/set_grip.py 0.183`

### 4.7 jogd 流式协议

`/home/Agi/jogd/run.sh` 启动 `smoothtrack.py`，从 **stdin 逐行读 JSON**：

| 输入 | 说明 |
|---|---|
| `{"rad":[6 floats]}` | 目标关节角（rad），生成平滑轨迹 |
| `{"stop":true}` | 保持当前位置 |
| `{"ping":1}` | 保活 |
| `{"grip":0..0.69}` | 夹爪目标 |
| `{"mode":{...}}` | 速度/加速度/柔动/波浪参数 |

输出：日志行（无结构化状态）；状态请读 `/joint_states` 或 `jtstream.py`：

```
D p1,p2,p3,p4,p5,p6,lift,v1..v6,e1..e6
F finger
L lift
P pitch
```

桥接参数（`joints_bridge.py` 默认）：
`--vmax 1.2 --amax 4.0 --tau 0.15 --win 1.2 --np 20 --rate 0.45 --lead 2.8 --dead 0.006`

---

## 5. 安全约束（必须遵守）

### 5.1 关节限位（rad）

| 关节 | 下限 | 上限 |
|---|---:|---:|
| J1 | -3.12 | 3.12 |
| J2 | -3.12 | 3.12 |
| J3 | -2.95 | 3.30 |
| J4 | -3.12 | 3.12 |
| J5 | -3.12 | 3.12 |
| J6 | -3.12 | 3.12 |

### 5.2 其他范围

| 量 | 范围 |
|---|---|
| 立柱 `lift` | 0 – 0.44 m |
| 头部 `pitch` | 0 – 1.3 rad（0–75°） |
| 夹爪 `finger` | 0 – 0.69 |
| `/set` 速度 | 0.8 rad/s（桥内限制） |
| `/jog` 默认 | vmax 1.2 / amax 4.0 |
| 标准模式 | vmax 2.0 / amax 6.0 |
| 慢速模式 | vmax 0.8 / amax 3.0 |

### 5.3 防撞规则

- **前伸/大范围动作前，大臂先远离立柱**：侧摆A `[1.1, 1.2, 2.0, 0, -0.8, 0]`，离柱 ≥ 6cm
- 桥内 `set_joints_safe()` 会自动做路径检查：离柱 ≥ 2cm 才直接走，否则插侧摆A
- 立柱和机械臂一起升降，路径检查会随 `lift` 平移
- 抓桌面物体：**先升立柱 → 夹爪高于桌面 → 头部相机 → 手腕相机 → 从上往下**；预抓取 ≥ 桌面+12cm，指尖离桌面 ≥ 1cm
- 不要把 `/set` 和 `/jog` 混用成两个同时执行的通道
- 运动前确认急停/停止按钮可用；断线时调用方应主动发 `stop_all` + `/jog stop`

### 5.4 停止语义

```bash
curl -s -X POST http://<Jetson>:8796/jog -H 'Content-Type: application/json' -d '{"stop":true}'
# 同时建议发 Mission WS:
{"header":{"mode":"mission","type":"request","cmd":"start","ts":...,"uuid":"...","host":""},
 "body":{"name":"stop_all","task_id":"stop-1","data":{}}}
```

---

## 6. 新主机部署清单

### 6.1 只做 HTTP 客户端（推荐）

1. 与 Jetson/机器人同网段，能访问 `<JETSON_IP>:8796`。
2. 用 `curl` 验证：
   ```bash
   curl -s http://<JETSON_IP>:8796/health
   curl -s http://<JETSON_IP>:8796/joints
   ```
3. 按第 2 节调用；不需要安装 ROS。
4. 如果 Jetson 不在，需要把 `robot-viz` 的 `joints_bridge.py`、`mode_svc.py`、`serve.sh` 复制到新主机，并安装 `adb`、`python3`（标准库即可；路径规划需要 `numpy`）。
5. 注意修改硬编码路径：`joints_bridge.py` 的 `ADB`、`serve.sh` 的 `DIR`、各脚本里的 `~/...`；新主机没有 `~` 时必须替换。
6. 纯 HTTP 控制只需跑 `joints_bridge.py`；`mode_svc` 和 `serve.sh` 是控制台/模式切换才需要。

### 6.2 直接 Mission WebSocket

1. `ping <ROBOT_IP>`，确认 `17890` 端口可达：
   ```bash
   nc -vz <ROBOT_IP> 17890
   ```
2. 用第 3 节信封发指令；建议实现 3s 心跳/断线重连，断线时发 `stop_all`。
3. 不需要 adb/ROS。

### 6.3 直接 ROS2

1. 安装 `adb`，能 `adb connect <ROBOT_IP>:5555`。
2. 能通过上板 chroot 的 `sshpass` 登录 `Agi@<LOWER_IP>`（密码 `<LOWER_PW>`）。
3. 在下板执行 ROS 命令，或把程序 scp 到下板。
4. 不要尝试从新主机直接加入 DDS（`dds_hi.xml` 绑 `lo`）。

### 6.4 安全建议

- 这批 HTTP / WebSocket 接口**无鉴权**，只在可信内网使用
- 修改下板默认密码，限制 `adb 5555` 暴露范围
- 新主机做 deadman：超过 500ms 没收到状态或连接断开 → 发停止
- 首次联调先空载、慢速、小角度，确认方向和限位

---

## 7. 最小可用示例（Python，仅标准库）

```python
import json, time, urllib.request

BASE = "http://<JETSON_IP>:8796"

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=3) as r:
        return json.load(r)

def post(path, obj, timeout=30):
    data = json.dumps(obj).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

print(get("/health"))
print(get("/joints")["deg"])

# 小角度移动（示例：只动 J1 +0.05 rad）
j = get("/joints")
if j["robot_online"]:
    target = list(j["rad"]); target[0] += 0.05
    print(post("/jog", {"rad": target}))
    time.sleep(2)
    print(post("/jog", {"stop": True}))
```

---

## 8. 故障排查

| 现象 | 检查 |
|---|---|
| `adb devices` 空 | `adb connect <ROBOT_IP>:5555`；确认机器人上板开机 |
| `chroot: not permitted` | `adb root` 后重试 |
| `/joints` 的 `status` 不是 `ok` | 下板 ROS 栈/`jtstream` 是否在跑；看 `/tmp/robotviz-bridge.log` |
| `:8796` 无响应 | `joints_bridge.py` 是否运行；`/tmp/robotviz.off` 是否被误创建 |
| 模式自动变 `local` | 机器人掉线超过 10s；恢复后 `POST :8795/mode {"mode":"real"}` |
| `/grip` 超时 | `jog_status` 是否 `connected`；否则桥会走 SSH fallback，较慢 |
| 相机 503 | 8799/8800 进程、机器人相机/DDS 是否正常 |
| Mission WS 连不上 | `nc -vz <ROBOT_IP> 17890`；确认与机器人同网段 |

---

## 9. 相关文件

**Jetson（robot-viz）**
- `joints_bridge.py` — 关节读取 / `/set` / `/jog` / `/mode` / `/grip`（:8796）
- `mode_svc.py` — 真机/本地模式（:8795）
- `voice_server.py` — 高层 `/cmd`（:8791/:8792）
- `camfeed.py` — 相机 MJPEG/快照（:8799/:8800）
- `arm3d.html` / `index.html` / `robot_home.html` — 控制台
- `serve.sh` — 服务保活
- `offline.sh` / `online.sh` — 本地/真机模式
- `robot_state.py` — Mission WS oneshot 参考
- `rcmd.sh` — adb→chroot→ssh 命令封装

**机器人下板（/home/Agi/jogd）**
- `run.sh` / `smoothtrack.py` — 流式 jog 执行器
- `jtstream.py` — `/joint_states` → 行流
- `set_grip.py` — 夹爪直接控制
- `head_action.py` / `head_daemon.py` — 头部 `/robot/control`
- `table_pick_v2.py` — 抓取示例（升立柱、抓取顺序）
- `dds_hi.xml` — CycloneDDS 配置（lo）

---

## 10. 版本与兼容性

- 本文对应 2026-10-22 的 `robot-viz` 版本；`joints_bridge.py` 的 `fresh`/`robot_online`/`offline` 字段、`mode_svc.py` 的 :8795 是新增能力。
- 机器人固件/下板 ROS 包更新后，任务名（`robot_*_ctrl`）和 action 定义可能变化，联调前先用 `ros2 action list` / `ros2 topic list` 核对。
- 所有角度单位均为 **弧度**（文档注明 deg 的除外）；距离为 **米**；夹爪为 **0–0.69 的归一化开度**。
