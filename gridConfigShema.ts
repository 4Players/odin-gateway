import { JWK, PrivateJWK } from "./jwk.ts";

export type GridConfig =
  & CommonConfig
  & NetworkConfig
  & TelemetryConfig;

interface CommonConfig {
  public_address?: string;
  log?: LogConfig;
  supervisor?: SupervisorConfig;
  authorization?: AuthorizationConfig;
  limit?: LimitConfig;
  http_client?: HttpClientConfig;
  internal?: InternalConfig;
}

interface NetworkConfig {
  quic?: QuicConfig;
  http?: HttpConfig;
  metrics?: MetricsConfig;
}

interface SupervisorConfig {
  report_interval?: number;
  no_warmup?: boolean;
}

interface AuthorizationConfig {
  keys?: Array<JWK | PrivateJWK>;
  allow_unsigned?: boolean;
  leeway?: number;
}

interface LogConfig {
  verbosity?: number;
  filters?: Array<string>;
  terminal?: {
    format?: "json" | "text";
    colors?: boolean;
  };
  loki?: {
    url?: string;
    labels?: Record<string, string>;
  };
}

interface LimitConfig {
  max_clients?: number;
  max_rooms?: number;
  max_peers?: number;
  peer?: {
    medias?: number;
    concurrent_streams?: number;
    incoming_messages?: {
      rate?: number;
      capacity?: number;
      overflow?: number;
    };
  };
}

interface QuicConfig {
  binding?: string;
  certificate_file?: string;
  privatekey_file?: string;
  keep_alive_interval?: number;
  connect_timeout?: number;
  idle_timeout?: number;
  no_peers_timeout?: number;
  pre_send_timeout?: number;
  migration?: boolean;
}

interface HttpConfig {
  binding?: string;
  certificate_file?: string;
  privatekey_file?: string;
  timeout?: number;
  ping_interval?: number;
  no_peers_timeout?: number;
  webrtc_binding?: string;
  webrtc_candidates?: Array<string>;
}

interface MetricsConfig {
  binding?: string;
  allowed?: Array<string>;
  idle_timeout?: number;
  global_labels?: Record<string, string>;
}

interface TelemetryConfig {
  telemetry?: {
    address?: string;
    interval?: number;
    max_consecutive_failures?: number;
    data?: Array<string>;
  };
  license?: {
    issuer?: string;
    licensee?: string;
    serial_number?: string;
  };
}

interface HttpClientConfig {
  proxy?: string;
  accept_invalid_certificates?: boolean;
}

interface InternalConfig {
  log_hanging_api_calls?: number;
  log_rejected_api_calls?: boolean;
}
