import { Bonjour, Service } from 'bonjour-service';
import { config } from '../config';
import { logger } from '../logger';
import { getLocalIPv4Addresses, getPreferredLANAddress, getServerFingerprint } from '../utils/networkUtils';
import { ServerDiscoveryPayload, INetworkDiscoveryService } from '@personal-cloud/shared';

export class NetworkDiscoveryService implements INetworkDiscoveryService {
  private bonjour: Bonjour | null = null;
  private service: Service | null = null;
  private isAdvertising = false;

  public getDiscoveryPayload(): ServerDiscoveryPayload {
    const addresses = getLocalIPv4Addresses();
    const primaryHost = getPreferredLANAddress();

    return {
      serviceName: 'personal-cloud',
      serverName: config.SERVER_NAME,
      host: primaryHost,
      port: config.PORT,
      addresses,
      protocol: 'http',
      apiPrefix: '/api/v1',
      serverVersion: '0.1.0',
      fingerprint: getServerFingerprint(),
      capabilities: ['browsing', 'streaming', 'pairing', 'management'],
    };
  }

  public async startAdvertising(): Promise<void> {
    if (this.isAdvertising) return;

    try {
      this.bonjour = new Bonjour();
      const payload = this.getDiscoveryPayload();

      this.service = this.bonjour.publish({
        name: `${config.SERVER_NAME} (${payload.host})`,
        type: 'personalcloud',
        protocol: 'tcp',
        port: config.PORT,
        txt: {
          version: payload.serverVersion,
          name: payload.serverName,
          caps: payload.capabilities.join(','),
          fp: payload.fingerprint,
        },
      });

      this.service.on('error', (err) => {
        logger.warn('Bonjour mDNS advertising warning:', { error: err.message });
      });

      this.isAdvertising = true;
      logger.info(
        `📡 mDNS service advertised: _personalcloud._tcp at ${payload.host}:${config.PORT}`
      );
    } catch (err) {
      logger.warn('Could not initialize mDNS broadcast service. Manual LAN IP connection remains available.', {
        error: (err as Error).message,
      });
    }
  }

  public async stopAdvertising(): Promise<void> {
    if (!this.isAdvertising) return;

    try {
      if (this.service) {
        await new Promise<void>((resolve) => {
          this.service?.stop?.(() => resolve());
          setTimeout(resolve, 1000);
        });
      }
      if (this.bonjour) {
        this.bonjour.destroy();
      }
      this.isAdvertising = false;
      logger.info('mDNS service advertising stopped.');
    } catch (err) {
      logger.warn('Error stopping mDNS advertising:', { error: (err as Error).message });
    }
  }
}

export const discoveryService = new NetworkDiscoveryService();
