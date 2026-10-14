/**
 * Network Discovery Interfaces
 * Defines contracts for LAN discovery broadcasts and responses (mDNS/Bonjour).
 */

export interface ServerDiscoveryPayload {
  serviceName: string;
  serverName: string;
  host: string;
  port: number;
  addresses: string[];
  protocol: 'http' | 'https';
  apiPrefix: string;
  serverVersion: string;
  fingerprint: string;
  capabilities: string[];
}

export interface DiscoveredServerInstance extends ServerDiscoveryPayload {
  ipAddress: string;
  lastDiscoveredAt: number;
  isReachable?: boolean;
}

export interface INetworkDiscoveryService {
  /** Start advertising the server service on the local network (mDNS) */
  startAdvertising(): Promise<void>;

  /** Stop advertising */
  stopAdvertising(): Promise<void>;

  /** Get discovery payload info */
  getDiscoveryPayload(): ServerDiscoveryPayload;
}
