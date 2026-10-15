import type { Device } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      id: string;
      startTime: number;
      device?: Device;
    }
  }
}

export {};
