// app/v2/emergencyContacts.ts
// The rider's emergency contacts, kept on the phone only. They are never uploaded: the SOS sheet
// reads them to draft a text, and nothing else does.

import Storage from '../services/storage';
import { parseContacts, type EmergencyContact } from './emergency';

const KEY = 'settings.emergencyContacts';

export async function loadEmergencyContacts(): Promise<EmergencyContact[]> {
  try {
    return parseContacts(await Storage.get(KEY));
  } catch {
    return [];
  }
}

export async function saveEmergencyContacts(contacts: EmergencyContact[]): Promise<void> {
  await Storage.set(KEY, JSON.stringify(contacts));
}
