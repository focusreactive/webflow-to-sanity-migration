type EnvName = "SANITY_API_WRITE_TOKEN";

export function requireEnv(name: EnvName): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Add it to the tool's .env file.`);
  }
  return value;
}
