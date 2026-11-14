/**
 * Kysely dialect for Better Auth over Cloudflare D1 (SQLite). Queries are
 * compiled by Kysely's SQLite compiler and run through `d1Run`. D1 has no
 * interactive transactions, so begin/commit/rollback are no-ops.
 */
import {
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { d1Run } from "../d1";

export function d1Dialect(): Dialect {
  return {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new D1Driver(),
    createQueryCompiler: (): QueryCompiler => new SqliteQueryCompiler(),
    createIntrospector: (db: Kysely<unknown>): DatabaseIntrospector => new SqliteIntrospector(db),
  };
}

class D1Driver implements Driver {
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection();
  }
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

class D1Connection implements DatabaseConnection {
  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const { rows, affected } = await d1Run(query.sql, [...query.parameters]);
    return { rows: rows as R[], numAffectedRows: BigInt(affected) };
  }

  // eslint-disable-next-line require-yield
  async *streamQuery(): AsyncIterableIterator<never> {
    throw new Error("Streaming queries are not supported on D1.");
  }
}
