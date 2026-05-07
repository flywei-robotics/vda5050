# @flywei/vda5050

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VDA5050](https://img.shields.io/badge/VDA5050-v2.0.0-orange.svg)](https://github.com/VDA5050/VDA5050)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-brightgreen.svg)](https://nodejs.org)

> **Vendor-neutral VDA5050 v2.0.0 message validator and live MQTT inspector.** Catches the 95% of integration bugs that break robot-vendor handovers, in TypeScript with no Java/C++ runtime required.

Built and maintained by [FlyWei Robotics](https://flywei.co.uk) — a London-based supplier of CE-certified autonomous warehouse robots, deploying across the UK and the GCC. We open-sourced this because every fleet-manager team we've worked with has rebuilt their own validator. Stop doing that.

---

## What is VDA5050?

[VDA5050](https://github.com/VDA5050/VDA5050) is the [Verband der Automobilindustrie](https://www.vda.de/) (German Automotive Industry Association) standard for AGV / AMR fleet communication. It defines six MQTT-based JSON message topics:

| Topic | Direction | Purpose |
|---|---|---|
| `order` | Master → Vehicle | Mission with nodes + edges + actions |
| `state` | Vehicle → Master | Live position, battery, errors, action states |
| `connection` | Vehicle → Master (LWT) | ONLINE / OFFLINE / CONNECTIONBROKEN |
| `factsheet` | Vehicle → Master | Vehicle capabilities, kinematics, geometry |
| `visualization` | Vehicle → Master | High-frequency position-only updates for UIs |
| `instantActions` | Master → Vehicle | Out-of-band immediate commands (eStop, etc.) |

Adopted by Volkswagen, BMW, KION (Linde / STILL / Dematic), Toyota Material Handling, and the German automotive supply chain. **VDA5050 is the *only* open standard that lets you mix robot brands in one fleet without proprietary lock-in.**

---

## Why this package exists

Every fleet-manager integration we've seen ships with one or more of:

- **Missing `headerId` / `timestamp` / `version`** in vehicle-side messages → master rejects silently
- **`batteryCharge: 150`** because the vendor's percentage is 0–1 not 0–100 → state monitor logs garbage
- **`actionParameters` as object instead of array** of `{key, value}` → master can't parse the action
- **`connectionState` typos** ("BUSY", "STARTING") → connection state machine diverges
- **`nodes` / `edges` `sequenceId`** out of order → master rejects the order with no useful error

This package validates against compact, strict JSON schemas covering all six topics. **One `npm install`, one CLI command, you find the bug in 30 seconds instead of 3 days.**

---

## Install

```bash
npm install @flywei/vda5050
# or
pnpm add @flywei/vda5050
```

Or use the CLI globally:

```bash
npm install -g @flywei/vda5050
```

---

## Library usage

```typescript
import { validateMessage } from "@flywei/vda5050";

const stateMsg = JSON.parse(rawMqttPayload);
const result = validateMessage(stateMsg, "state");

if (!result.valid) {
  for (const err of result.errors) {
    console.error(`${err.path}: ${err.message}`);
  }
}
```

### Helper: build standard MQTT topic

```typescript
import { buildMqttTopic } from "@flywei/vda5050";

buildMqttTopic({ manufacturer: "flywei", serialNumber: "AGV-001", topic: "state" });
// → "uagv/v2/flywei/AGV-001/state"
```

### Helper: detect topic type from MQTT path

```typescript
import { topicFromMqttPath } from "@flywei/vda5050";

topicFromMqttPath("uagv/v2/flywei/AGV-001/state");  // → "state"
topicFromMqttPath("custom/v2/flywei/AGV-001/order"); // → "order"
```

---

## CLI usage

### Validate a JSON file

```bash
vda5050 validate examples/state.json --topic state
# ✓ examples/state.json is a valid VDA5050 v2.0.0 state message

vda5050 validate broken-state.json --topic state
# ✗ broken-state.json failed VDA5050 v2.0.0 state validation:
#     /batteryState/batteryCharge: maximum: must be <= 100 ({"comparison":"<=","limit":100})
#     /safetyState: required: must have required property 'fieldViolation' ({"missingProperty":"fieldViolation"})
```

Use it as a **CI gate** on robot-vendor message dumps:

```yaml
# .github/workflows/vendor-handover.yml
- run: npx -p @flywei/vda5050 vda5050 validate vendor-state-sample.json --topic state
```

### Live MQTT inspector

```bash
# Watch every VDA5050 topic on a broker, validate on the fly
vda5050 listen mqtt://localhost:1883 \
  --filter "uagv/v2/+/+/+" \
  --validate

# Output:
# → connecting to mqtt://localhost:1883…
# ✓ connected. subscribing to uagv/v2/+/+/+
# 
# [2026-05-07T12:00:00Z] uagv/v2/flywei/AGV-001/state  (detected: state)
#   ✓ valid
# 
# [2026-05-07T12:00:01Z] uagv/v2/flywei/AGV-001/connection  (detected: connection)
#   ✗ INVALID
#      /connectionState: enum: must be equal to one of the allowed values
```

Set `VDA5050_PRINT=full` to also log full message payloads.

---

## What the schemas validate

These are simplified-but-strict schemas — each catches the **required-field structure** of its topic. Specifically:

- ✅ All required top-level header fields (`headerId`, `timestamp`, `version`, `manufacturer`, `serialNumber`)
- ✅ Required topic-specific fields (`orderId`, `nodeStates`, `batteryState`, `connectionState`, etc.)
- ✅ Enum values (`operatingMode`, `actionStatus`, `errorLevel`, `eStop`, `connectionState`)
- ✅ Numeric ranges (`batteryCharge` 0–100, `localizationScore` 0–1, etc.)
- ✅ Action parameter array structure (`{ key, value }[]`)
- ✅ Node / edge required field set
- ✅ ISO-8601 `timestamp` format
- ✅ Semver `version` format

What they **don't** validate (yet — happy to merge PRs):

- ❌ Cross-message consistency (e.g. `state.lastNodeId` must match a previously-released order node)
- ❌ Map-coordinate sanity (no negative-distance check, no geofence)
- ❌ VDA5050 v1.x backwards-compatibility mode

---

## VDA5050 + FlyWei

We ship VDA5050-native autonomous forklifts, AMRs, and lifting robots into UK 3PLs and across the GCC, on our M4 fleet manager. M4 is the master that consumes these messages from any VDA5050-compliant vehicle — your existing fleet, ours, or a mix. **We don't lock our customers into proprietary protocols.** This package is part of that bet.

If you're evaluating warehouse robotics for a UK or Gulf site, we run [30-day fully-managed pilots](https://flywei.co.uk) at one live aisle with a KPI guarantee. Reach out: [sales@flywei.co.uk](mailto:sales@flywei.co.uk).

---

## Development

```bash
git clone https://github.com/flywei-robotics/vda5050.git
cd vda5050
npm install
npm test    # node --test
npm run build
```

---

## Contributing

Issues and pull requests welcome. Please:

1. Run `npm test` before submitting
2. Add a test case for any schema change
3. Keep schemas **strict** — false negatives are better than false positives in CI gates

---

## Licence

MIT © 2026 FlyWei Robotics.

VDA5050 schemas derive from the [official VDA5050 specification](https://github.com/VDA5050/VDA5050) (CC BY-SA 4.0).

---

## Citing

```bibtex
@software{flywei_vda5050_2026,
  author = {{FlyWei Robotics}},
  title  = {@flywei/vda5050: VDA5050 v2.0.0 message validator and MQTT inspector},
  year   = {2026},
  url    = {https://github.com/flywei-robotics/vda5050}
}
```
