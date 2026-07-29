const normalizeCloseContacts = (contacts) => {
  if (!Array.isArray(contacts) || contacts.length < 1 || contacts.length > 2) {
    return { error: 'Please add one or two roommate/close-friend contacts.' };
  }

  const normalized = [];
  for (const contact of contacts) {
    const name = typeof contact?.name === 'string' ? contact.name.trim() : '';
    const mobileNumber = typeof contact?.mobileNumber === 'string'
      ? contact.mobileNumber.trim()
      : '';
    const roomNumber = typeof contact?.roomNumber === 'string'
      ? contact.roomNumber.trim()
      : '';

    if (!name || name.length > 100) {
      return { error: 'Each roommate/close friend must have a valid name.' };
    }
    if (!/^\d{10,15}$/.test(mobileNumber)) {
      return { error: 'Each roommate/close friend must have a valid 10 to 15 digit mobile number.' };
    }
    if (!roomNumber || roomNumber.length > 30) {
      return { error: 'Each roommate/close friend must have a valid room number.' };
    }

    normalized.push({ name, mobileNumber, roomNumber });
  }

  return { contacts: normalized };
};

const normalizeGuardianPhoneNumber = (value) => {
  const phoneNumber = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{10,15}$/.test(phoneNumber)) {
    return { error: 'Please enter a valid 10 to 15 digit parent/guardian phone number.' };
  }
  return { phoneNumber };
};

module.exports = { normalizeCloseContacts, normalizeGuardianPhoneNumber };
