import "server-only";
import { getDb } from "./db";
import { createRuntimeAuth } from "../modules/auth/core";
let instance: ReturnType<typeof createRuntimeAuth> | undefined;
export function getAuth() { return instance ??= createRuntimeAuth(getDb()); }
