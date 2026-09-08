// The model registry: every association in one place, plus the `_id` JSON contract
// installed on every model.
//
// Require models from HERE, not from their own files — a model file loaded on its own has
// no associations wired, so an `include` against it fails with "X is not associated with
// Y". The individual files stay one-model-per-file for readability; this is where they
// become a graph.
//
// ---- On association aliases ----
//
// Sequelize refuses to let an association alias equal an existing attribute name, and
// Mongoose used one name for both (`approvedBy` was the ObjectId, and the populated user
// after .populate('approvedBy')). So the foreign key keeps the Mongo name — filters and
// assignments read exactly as they did — and the association takes a `...User` alias.
// `jsonKey` tells toJSON which of the two to emit, and it always emits the Mongo name.
//
//   where:   { approvedBy: staff.id }        <- the foreign key attribute
//   include: [{ association: 'approvedByUser', attributes: [...] }]
//   JSON:    { approvedBy: { _id, name } }   <- or the raw id when not included

const { getSequelize } = require('../config/sequelize');
const { idContractToJSON } = require('./_shared');

const Hostel = require('./Hostel');
const User = require('./User');
const CloseContact = require('./CloseContact');
const WebauthnCredential = require('./WebauthnCredential');
const UserPhoto = require('./UserPhoto');
const UserSignature = require('./UserSignature');
const OutingRequest = require('./OutingRequest');
const LeaveApplication = require('./LeaveApplication');
const ScanLog = require('./ScanLog');
const SOSAlert = require('./SOSAlert');
const DelayNotice = require('./DelayNotice');
const PushSubscription = require('./PushSubscription');
const EmailOtp = require('./EmailOtp');

// ---------------------------------------------------------------------------
// The user cluster — the four things lifted out of the Mongo user document
// ---------------------------------------------------------------------------

// Ordered by slot so the two contacts always come back in the order they were entered;
// without it Postgres is free to return them in any order, and the profile form fills its
// two rows positionally.
User.hasMany(CloseContact, { as: 'closeContacts', foreignKey: 'userId', onDelete: 'CASCADE' });
CloseContact.belongsTo(User, { as: 'owner', foreignKey: 'userId' });

User.hasMany(WebauthnCredential, { as: 'webAuthnCredentials', foreignKey: 'userId', onDelete: 'CASCADE' });
WebauthnCredential.belongsTo(User, { as: 'owner', foreignKey: 'userId' });

// Backing rows for the `photo` / `signature` virtuals on User. Include them only on the
// paths that actually serve bytes — that separation is the whole point of the split.
User.hasOne(UserPhoto, { as: 'photoRow', foreignKey: 'userId', onDelete: 'CASCADE' });
UserPhoto.belongsTo(User, { as: 'owner', foreignKey: 'userId' });

User.hasOne(UserSignature, { as: 'signatureRow', foreignKey: 'userId', onDelete: 'CASCADE' });
UserSignature.belongsTo(User, { as: 'owner', foreignKey: 'userId' });

User.hasMany(PushSubscription, { as: 'pushSubscriptions', foreignKey: 'userId', onDelete: 'CASCADE' });
PushSubscription.belongsTo(User, { as: 'user', foreignKey: 'userId', jsonKey: 'user' });

// ---------------------------------------------------------------------------
// Passes
//
// The `student` association is the one that matters most. In MongoDB,
// hostelScope.scopedStudentFilter ran User.distinct('_id') for a whole hostel and shipped
// thousands of ids into every query, on every 30-second caretaker dashboard poll. Here
// that becomes a JOIN with a WHERE on the joined table — the pattern does not just get
// faster, it disappears.
// ---------------------------------------------------------------------------

const passStaffAssociations = (Model) => {
  Model.belongsTo(User, { as: 'student', foreignKey: 'studentId', jsonKey: 'student' });
  Model.belongsTo(User, { as: 'approvedByUser', foreignKey: 'approvedBy', jsonKey: 'approvedBy' });
  Model.belongsTo(User, { as: 'targetCaretakerUser', foreignKey: 'targetCaretaker', jsonKey: 'targetCaretaker' });
  Model.belongsTo(User, { as: 'forwardedToUser', foreignKey: 'forwardedTo', jsonKey: 'forwardedTo' });
  Model.belongsTo(User, { as: 'forwardedByUser', foreignKey: 'forwardedBy', jsonKey: 'forwardedBy' });
};

passStaffAssociations(OutingRequest);
passStaffAssociations(LeaveApplication);

// ---------------------------------------------------------------------------
// Gate movements, alerts, notices
// ---------------------------------------------------------------------------

ScanLog.belongsTo(User, { as: 'student', foreignKey: 'studentId', jsonKey: 'student' });
ScanLog.belongsTo(User, { as: 'guard', foreignKey: 'guardId', jsonKey: 'guard' });
ScanLog.belongsTo(OutingRequest, { as: 'outingPass', foreignKey: 'outingId', jsonKey: 'outing' });
ScanLog.belongsTo(LeaveApplication, { as: 'leavePass', foreignKey: 'leaveId', jsonKey: 'leave' });

SOSAlert.belongsTo(User, { as: 'student', foreignKey: 'studentId', jsonKey: 'student' });
SOSAlert.belongsTo(User, { as: 'handledByUser', foreignKey: 'handledBy', jsonKey: 'handledBy' });

DelayNotice.belongsTo(User, { as: 'student', foreignKey: 'studentId', jsonKey: 'student' });
DelayNotice.belongsTo(User, { as: 'acknowledgedByUser', foreignKey: 'acknowledgedBy', jsonKey: 'acknowledgedBy' });
// Declared for joining, but with NO jsonKey: a notice's response shape is `trip` +
// `tripType` (the virtuals on the model), which is what it was in Mongo, and
// DelayNotice.jsonHidden keeps the two raw foreign keys out of it. A caller that wants
// pass details includes these and builds the payload it wants.
DelayNotice.belongsTo(OutingRequest, { as: 'outingPass', foreignKey: 'outingId' });
DelayNotice.belongsTo(LeaveApplication, { as: 'leavePass', foreignKey: 'leaveId' });

// ---------------------------------------------------------------------------
// The `_id` contract, installed once for every model
// ---------------------------------------------------------------------------

const models = {
  Hostel,
  User,
  CloseContact,
  WebauthnCredential,
  UserPhoto,
  UserSignature,
  OutingRequest,
  LeaveApplication,
  ScanLog,
  SOSAlert,
  DelayNotice,
  PushSubscription,
  EmailOtp,
};

for (const model of Object.values(models)) {
  model.prototype.toJSON = idContractToJSON;
}

module.exports = { sequelize: getSequelize(), ...models };
