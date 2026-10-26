export type ServiceStatus = "operational" | "degraded" | "disconnected" | "unauthorized"

export type SystemStatusResponse = {
  version: { app: string; commit: string; environment: string }
  services: { api: ServiceStatus; database: ServiceStatus; jobs: ServiceStatus }
  authorization: { status: "unauthorized"; gate: "AUTH-GATE-05" }
  dataSource: "postgresql" | "unavailable"
}
