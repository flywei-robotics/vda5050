#!/usr/bin/env node
// vda5050 CLI — validate JSON files or sniff a live MQTT broker
// Usage:
//   vda5050 validate state.json --topic state
//   vda5050 listen mqtt://localhost:1883 --filter "uagv/v2/+/+/state"

import { readFileSync } from "node:fs";
import { validateMessage, topicFromMqttPath, type Vda5050Topic } from "./index.js";
import mqtt from "mqtt";

const VALID_TOPICS: Vda5050Topic[] = ["order", "state", "connection", "factsheet", "visualization", "instantActions"];

function usage(): never {
  console.error(`vda5050 — VDA5050 v2.0.0 message validator + MQTT inspector

USAGE
  vda5050 validate <json-file> --topic <${VALID_TOPICS.join("|")}>
  vda5050 listen <mqtt-url> [--filter <topic-pattern>] [--validate]

EXAMPLES
  vda5050 validate examples/state.json --topic state
  vda5050 listen mqtt://localhost:1883 --filter "uagv/v2/+/+/state" --validate
  vda5050 listen mqtts://broker.example.com:8883 --filter "uagv/v2/+/+/+" --validate

EXIT
  0 = valid / clean run
  1 = invalid message / runtime error
`);
  process.exit(1);
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { flags[key] = next; i++; }
      else { flags[key] = true; }
    }
  }
  return flags;
}

async function cmdValidate(file: string, topic: Vda5050Topic) {
  let raw: string;
  try { raw = readFileSync(file, "utf8"); }
  catch (e) { console.error(`✗ cannot read ${file}: ${(e as Error).message}`); process.exit(1); }
  let msg: unknown;
  try { msg = JSON.parse(raw); }
  catch (e) { console.error(`✗ ${file} is not valid JSON: ${(e as Error).message}`); process.exit(1); }

  const result = validateMessage(msg, topic);
  if (result.valid) {
    console.log(`✓ ${file} is a valid VDA5050 v2.0.0 ${topic} message`);
    process.exit(0);
  }
  console.error(`✗ ${file} failed VDA5050 v2.0.0 ${topic} validation:`);
  for (const err of result.errors) console.error(`    ${err.path || "/"}: ${err.message}`);
  process.exit(1);
}

async function cmdListen(brokerUrl: string, filter: string, validate: boolean) {
  console.log(`→ connecting to ${brokerUrl}…`);
  const client = mqtt.connect(brokerUrl, { connectTimeout: 5_000 });

  client.on("connect", () => {
    console.log(`✓ connected. subscribing to ${filter || "+/+/+/+/+"}`);
    client.subscribe(filter || "+/+/+/+/+", { qos: 0 }, (err) => {
      if (err) { console.error(`✗ subscribe failed: ${err.message}`); process.exit(1); }
    });
  });

  client.on("error", (e) => { console.error(`✗ mqtt error: ${e.message}`); process.exit(1); });

  client.on("message", (topicPath, payload) => {
    const t = new Date().toISOString();
    let parsed: unknown;
    try { parsed = JSON.parse(payload.toString()); } catch { parsed = payload.toString(); }
    const detected = topicFromMqttPath(topicPath);
    process.stdout.write(`\n[${t}] ${topicPath}`);
    if (detected) process.stdout.write(`  (detected: ${detected})`);
    process.stdout.write("\n");
    if (validate && detected && typeof parsed === "object" && parsed !== null) {
      const r = validateMessage(parsed, detected);
      if (r.valid) console.log(`  ✓ valid`);
      else {
        console.log(`  ✗ INVALID`);
        for (const e of r.errors) console.log(`     ${e.path}: ${e.message}`);
      }
    }
    if (process.env.VDA5050_PRINT === "full" && parsed) {
      console.log(`  ${JSON.stringify(parsed, null, 2).split("\n").join("\n  ")}`);
    }
  });
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd) usage();

  if (cmd === "validate") {
    const flags = parseFlags(rest);
    const file = rest.find(a => !a.startsWith("--") && a !== flags.topic) ?? "";
    const topic = (flags.topic as string) || "";
    if (!file || !VALID_TOPICS.includes(topic as Vda5050Topic)) usage();
    await cmdValidate(file, topic as Vda5050Topic);
    return;
  }

  if (cmd === "listen") {
    const flags = parseFlags(rest);
    const url = rest.find(a => a.startsWith("mqtt://") || a.startsWith("mqtts://")) ?? "";
    if (!url) usage();
    await cmdListen(url, (flags.filter as string) || "+/+/+/+/+", flags.validate === true);
    return;
  }

  usage();
}

main().catch((e) => { console.error(e); process.exit(1); });
