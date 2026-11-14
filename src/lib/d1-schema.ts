/** Migration SQL bundled at build time (Vite `?raw` imports) for the D1 auto-migrator. */
export function migrationFiles(): Record<string, string> {
  const top = import.meta.glob("/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const auth = import.meta.glob("/migrations/auth/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  return { ...auth, ...top };
}
