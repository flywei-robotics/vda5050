// Run with: node --import tsx --test test/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMessage, topicFromMqttPath, buildMqttTopic } from "../src/index.js";

const validHeader = {
  headerId: 1,
  timestamp: "2026-05-07T12:00:00.000Z",
  version: "2.0.0",
  manufacturer: "FlyWei",
  serialNumber: "AGV-001",
};

test("validateMessage: valid order passes", () => {
  const order = {
    ...validHeader,
    orderId: "order-1",
    orderUpdateId: 0,
    nodes: [{ nodeId: "n1", sequenceId: 0, released: true, actions: [] }],
    edges: [],
  };
  const r = validateMessage(order, "order");
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test("validateMessage: order missing orderId fails", () => {
  const order = { ...validHeader, orderUpdateId: 0, nodes: [], edges: [] };
  const r = validateMessage(order, "order");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.message.includes("orderId")));
});

test("validateMessage: connection ONLINE passes", () => {
  const r = validateMessage({ ...validHeader, connectionState: "ONLINE" }, "connection");
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test("validateMessage: connection invalid state fails", () => {
  const r = validateMessage({ ...validHeader, connectionState: "BUSY" }, "connection");
  assert.equal(r.valid, false);
});

test("validateMessage: state with bad battery charge fails", () => {
  const state = {
    ...validHeader,
    orderId: "", orderUpdateId: 0, lastNodeId: "", lastNodeSequenceId: 0,
    nodeStates: [], edgeStates: [], driving: false, actionStates: [],
    operatingMode: "AUTOMATIC",
    batteryState: { batteryCharge: 150, charging: false },  // invalid: >100
    errors: [],
    safetyState: { eStop: "NONE", fieldViolation: false },
  };
  const r = validateMessage(state, "state");
  assert.equal(r.valid, false);
  assert.ok(r.errors.some(e => e.path.includes("batteryCharge")));
});

test("validateMessage: instantActions requires at least one action", () => {
  const ia = { ...validHeader, actions: [] };
  const r = validateMessage(ia, "instantActions");
  assert.equal(r.valid, false);
});

test("topicFromMqttPath: detects state topic", () => {
  assert.equal(topicFromMqttPath("uagv/v2/flywei/AGV-001/state"), "state");
  assert.equal(topicFromMqttPath("uagv/v2/flywei/AGV-001/order"), "order");
  assert.equal(topicFromMqttPath("uagv/v2/flywei/AGV-001/random"), null);
});

test("buildMqttTopic: builds standard VDA5050 topic", () => {
  const t = buildMqttTopic({ manufacturer: "flywei", serialNumber: "AGV-001", topic: "state" });
  assert.equal(t, "uagv/v2/flywei/AGV-001/state");
});
