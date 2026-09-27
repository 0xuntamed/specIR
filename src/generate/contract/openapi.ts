import { MARKER } from "../names";
import type { Contract, Operation, Prop, Response, Schema } from "./model";

type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

function propSchema(p: Prop): Json {
  if (p.type === "ref") return p.nullable ? { oneOf: [ref(p.ref!), { type: "null" }] } : ref(p.ref!);
  const s: Json = {
    uuid: { type: "string", format: "uuid" },
    string: { type: "string" },
    text: { type: "string" },
    email: { type: "string", format: "email" },
    int: { type: "integer", format: "int32" },
    money: { type: "integer", format: "int64", description: "Amount in minor units" },
    bool: { type: "boolean" },
    datetime: { type: "string", format: "date-time" },
    date: { type: "string", format: "date" },
    enum: { type: "string", enum: p.values },
  }[p.type];
  if (p.minLength !== undefined) s.minLength = p.minLength;
  if (p.nullable) {
    s.type = [s.type, "null"];
    if (s.enum) s.enum = [...p.values, null];
  }
  return s;
}

function objectSchema(props: Prop[], closed: boolean, minProperties?: number): Json {
  const required = props.filter((p) => !p.optional).map((p) => p.name);
  return {
    type: "object",
    properties: Object.fromEntries(props.map((p) => [p.name, propSchema(p)])),
    ...(required.length > 0 ? { required } : {}),
    ...(closed ? { additionalProperties: false } : {}),
    ...(minProperties !== undefined ? { minProperties } : {}),
  };
}

const ERRORS: Record<number, [string, string]> = {
  400: ["BadRequest", "Invalid request"],
  401: ["Unauthorized", "Missing or invalid bearer token"],
  403: ["Forbidden", "Authenticated, but lacking the required role"],
  404: ["NotFound", "Not found, or not owned by the current user"],
  409: ["Conflict", "Conflicts with existing or related records"],
  501: ["NotImplemented", "The slot behind this endpoint is not implemented yet"],
};

function responseContent(response: Response): Json | undefined {
  switch (response.kind) {
    case "schema":
      return { "application/json": { schema: ref(response.name) } };
    case "list": {
      const page = response.pagination
        ? { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } }
        : {};
      return {
        "application/json": {
          schema: {
            type: "object",
            properties: { items: { type: "array", items: ref(response.item) }, ...page },
            required: ["items", ...Object.keys(page)],
          },
        },
      };
    }
    case "binary":
      return { [response.contentType]: { schema: { type: "string", format: "binary" } } };
    case "empty":
      return undefined;
  }
}

function operation(op: Operation, schemas: Map<string, Schema>): Json {
  const parameters: Json[] = [
    ...op.pathParams.map((p) => ({ name: p.name, in: "path", required: true, schema: propSchema(p) })),
    ...op.query.map((p) => ({ name: p.name, in: "query", required: !p.optional, schema: propSchema(p) })),
  ];
  if (op.response.kind === "list" && op.response.pagination) {
    const { defaultLimit, maxLimit } = op.response.pagination;
    parameters.push(
      { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: maxLimit, default: defaultLimit } },
      { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0, default: 0 } },
    );
  }

  let requestSchema: Json | undefined;
  if (op.body?.kind === "schema") {
    const { name, omit } = op.body;
    const schema = schemas.get(name)!;
    requestSchema = omit.length === 0 ? ref(name) : objectSchema(schema.props.filter((p) => !omit.includes(p.name)), schema.closed, schema.minProperties);
  } else if (op.body?.kind === "inputs") {
    requestSchema = objectSchema(op.body.props, true);
  }

  const description = [op.description, typeof op.auth === "object" ? `Requires role ${op.auth.role}.` : undefined].filter(Boolean).join("\n\n");
  const content = responseContent(op.response);
  const statusText = { 200: "OK", 201: "Created", 204: "No content" }[op.status];

  return {
    operationId: op.id,
    tags: [op.id.split(".")[0]],
    ...(description ? { description } : {}),
    ...(op.auth !== "public" ? { security: [{ bearer: [] }] } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestSchema ? { requestBody: { required: true, content: { "application/json": { schema: requestSchema } } } } : {}),
    responses: {
      [op.status]: { description: statusText, ...(content ? { content } : {}) },
      ...Object.fromEntries(op.errors.map((code) => [code, { $ref: `#/components/responses/${ERRORS[code]![0]}` }])),
    },
  };
}

// contract/openapi.json (OpenAPI 3.1). JSON has no comments, so the generated
// marker is an x- extension on the first line the writer checks.
export function openapiJson(contract: Contract): string {
  const schemas = new Map(contract.schemas.map((s) => [s.name, s]));
  const paths: Record<string, Json> = {};
  for (const op of contract.operations) {
    const path = op.path.replace(/:([A-Za-z0-9]+)/g, "{$1}");
    paths[path] ??= {};
    paths[path][op.method.toLowerCase()] = operation(op, schemas);
  }
  const usedErrors = [...new Set(contract.operations.flatMap((op) => op.errors))].sort((a, b) => a - b);
  const secured = contract.operations.some((op) => op.auth !== "public");

  const doc = {
    "x-appspec": `${MARKER} — do not edit`,
    openapi: "3.1.0",
    info: { title: contract.title, version: "0.0.0" },
    paths,
    components: {
      schemas: {
        ...Object.fromEntries(contract.schemas.map((s) => [s.name, objectSchema(s.props, s.closed, s.minProperties)])),
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            issues: {
              type: "array",
              items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } }, required: ["path", "message"] },
            },
          },
          required: ["error"],
        },
      },
      responses: Object.fromEntries(
        usedErrors.map((code) => {
          const [name, description] = ERRORS[code]!;
          return [name, { description, content: { "application/json": { schema: ref("ErrorResponse") } } }];
        }),
      ),
      ...(secured ? { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } } : {}),
    },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
