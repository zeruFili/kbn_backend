const SAFE_USER_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "role",
  "status",
  "is_active",
  "last_login_at",
  "created_at",
  "updated_at",
] as const;

export function safeUserColumns(alias: string): string[] {
  return SAFE_USER_COLUMNS.map((col) => `${alias}.${col}`);
}
