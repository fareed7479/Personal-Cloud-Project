import { Router } from 'express';
import {
  getActiveChallengeHandler,
  createNewChallengeHandler,
  requestPairingHandler,
  approvePairingHandler,
  getPairingStatusHandler,
} from '../controllers/pairingController';

export const pairingRouter = Router();

// GET /api/v1/pairing/challenge (Active or new pairing challenge with PIN & QR data)
pairingRouter.get('/pairing/challenge', getActiveChallengeHandler);

// POST /api/v1/pairing/challenge (Generate fresh challenge)
pairingRouter.post('/pairing/challenge', createNewChallengeHandler);

// POST /api/v1/pairing/request (Mobile client submits PIN)
pairingRouter.post('/pairing/request', requestPairingHandler);

// POST /api/v1/pairing/approve (Laptop owner confirms pairing)
pairingRouter.post('/pairing/approve', approvePairingHandler);

// GET /api/v1/pairing/status/:challengeId (Mobile client polls status, consumes token)
pairingRouter.get('/pairing/status/:challengeId', getPairingStatusHandler);
