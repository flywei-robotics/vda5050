// @flywei/vda5050 — VDA5050 v2.0.0 validator + helpers
// MIT licence. https://github.com/flywei-robotics/vda5050
//
// VDA5050 is the German Automotive Industry Association (Verband der
// Automobilindustrie) standard for AGV/AMR fleet communication. This package
// validates the six core message types against their JSON schemas without
// requiring a full Java/C++ runtime — useful for fleet-manager development,
// integration testing, and CI gates on robot-vendor handovers.

import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import {
  ORDER_SCHEMA,
  STATE_SCHEMA,
  CONNECTION_SCHEMA,
  FACTSHEET_SCHEMA,
  VISUALIZATION_SCHEMA,
  INSTANT_ACTIONS_SCHEMA,
} from "./schemas.js";

export type Vda5050Topic =
  | "order"
  | "state"
  | "connection"
  | "factsheet"
  | "visualization"
  | "instantActions";

export interface ValidationResult {
  valid: boolean;
  errors: { path: string; message: string }[];
  topic: Vda5050Topic;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validators: Record<Vda5050Topic, ValidateFunction> = {
  order:           ajv.compile(ORDER_SCHEMA),
  state:           ajv.compile(STATE_SCHEMA),
  connection:      ajv.compile(CONNECTION_SCHEMA),
  factsheet:       ajv.compile(FACTSHEET_SCHEMA),
  visualization:   ajv.compile(VISUALIZATION_SCHEMA),
  instantActions:  ajv.compile(INSTANT_ACTIONS_SCHEMA),
};

export function validateMessage(message: unknown, topic: Vda5050Topic): ValidationResult {
  const validator = validators[topic];
  if (!validator) {
    return { valid: false, topic, errors: [{ path: "", message: `Unknown topic: ${topic}` }] };
  }
  const valid = validator(message) as boolean;
  return {
    valid,
    topic,
    errors: valid ? [] : (validator.errors || []).map(e => ({
      path: e.instancePath || "/",
      message: `${e.keyword}: ${e.message ?? ""}${e.params ? " (" + JSON.stringify(e.params) + ")" : ""}`,
    })),
  };
}

// Detect the topic from an MQTT topic path like "uagv/v2/<manufacturer>/<serial>/state"
export function topicFromMqttPath(mqttPath: string): Vda5050Topic | null {
  const parts = mqttPath.split("/");
  const last = parts[parts.length - 1];
  const valid: Vda5050Topic[] = ["order", "state", "connection", "factsheet", "visualization", "instantActions"];
  return (valid as string[]).includes(last) ? (last as Vda5050Topic) : null;
}

// Helper: VDA5050 v2.0.0 default MQTT topic structure is
//   <interfaceName>/<majorVersion>/<manufacturer>/<serialNumber>/<topic>
// e.g. "uagv/v2/flywei/AGV-001/state"
export function buildMqttTopic(opts: {
  interfaceName?: string;
  majorVersion?: string;
  manufacturer: string;
  serialNumber: string;
  topic: Vda5050Topic;
}): string {
  const interfaceName = opts.interfaceName ?? "uagv";
  const majorVersion  = opts.majorVersion  ?? "v2";
  return `${interfaceName}/${majorVersion}/${opts.manufacturer}/${opts.serialNumber}/${opts.topic}`;
}

export { ORDER_SCHEMA, STATE_SCHEMA, CONNECTION_SCHEMA, FACTSHEET_SCHEMA, VISUALIZATION_SCHEMA, INSTANT_ACTIONS_SCHEMA };
