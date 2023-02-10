import { JWK, PrivateJWK } from "./jwk.ts";

export type GridConfig =
  & CommonConfig
  & NetworkConfig
  & TelemetryConfig;

interface CommonConfig {
  verbosity?: number;
  public_address?: string;
  supervisor?: SupervisorConfig;
  authorization?: AuthorizationConfig;
  limit?: LimitConfig;
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
  version?: string;
}

interface AuthorizationConfig {
  keys?: Array<JWK | PrivateJWK>;
  allow_unsigned?: boolean;
  leeway?: number;
}

interface LimitConfig {
  max_clients?: number;
  max_rooms?: number;
  max_peers?: number;
  network?: {
    incoming_media_packets?: {
      rate: number;
      capacity: number;
    };
  };
  peer?: {
    medias?: number;
    incoming_messages?: {
      rate: number;
      capacity: number;
      overflow: number;
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
  webrtc_binding?: string;
  webrtc_candidates?: Array<string>;
}

interface MetricsConfig {
  binding?: string;
  allowed?: Array<string>;
  idle_timeout?: number;
  global_labels?: { deployment: string };
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

interface InternalConfig {
  log_hanging_api_calls?: number;
}
