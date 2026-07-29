const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCloseContacts,
  normalizeGuardianPhoneNumber,
} = require('../src/utils/closeContacts');

test('registration accepts and trims one or two close contacts', () => {
  const one = normalizeCloseContacts([
    { name: '  Asha Singh  ', mobileNumber: '9876543210', roomNumber: ' B-214 ' },
  ]);
  assert.deepEqual(one, {
    contacts: [{ name: 'Asha Singh', mobileNumber: '9876543210', roomNumber: 'B-214' }],
  });

  const two = normalizeCloseContacts([
    { name: 'Asha Singh', mobileNumber: '9876543210', roomNumber: 'B-214' },
    { name: 'Ravi Kumar', mobileNumber: '919876543210', roomNumber: 'C-108' },
  ]);
  assert.equal(two.contacts.length, 2);
});

test('registration requires at least one close contact and allows no more than two', () => {
  assert.match(normalizeCloseContacts([]).error, /one or two/i);
  assert.match(normalizeCloseContacts(undefined).error, /one or two/i);
  assert.match(normalizeCloseContacts([
    { name: 'One', mobileNumber: '9876543210', roomNumber: '1' },
    { name: 'Two', mobileNumber: '9876543211', roomNumber: '2' },
    { name: 'Three', mobileNumber: '9876543212', roomNumber: '3' },
  ]).error, /one or two/i);
});

test('registration rejects incomplete contacts and invalid mobile numbers', () => {
  assert.match(normalizeCloseContacts([
    { name: '', mobileNumber: '9876543210', roomNumber: 'B-214' },
  ]).error, /valid name/i);
  assert.match(normalizeCloseContacts([
    { name: 'Asha', mobileNumber: '12345', roomNumber: 'B-214' },
  ]).error, /10 to 15 digit/i);
  assert.match(normalizeCloseContacts([
    { name: 'Asha', mobileNumber: '9876543210', roomNumber: '' },
  ]).error, /valid room number/i);
});

test('registration normalizes and validates the parent/guardian phone number', () => {
  assert.deepEqual(normalizeGuardianPhoneNumber(' 9876543210 '), {
    phoneNumber: '9876543210',
  });
  assert.match(normalizeGuardianPhoneNumber('').error, /parent\/guardian/i);
  assert.match(normalizeGuardianPhoneNumber('12345').error, /10 to 15 digit/i);
  assert.match(normalizeGuardianPhoneNumber('98765abc10').error, /10 to 15 digit/i);
});
