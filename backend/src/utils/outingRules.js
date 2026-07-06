// Business rules for outing requests, shared by the controller that creates
// them and (indirectly, via the request's persisted `status`) the gate scan
// flow that trusts that status.
//
// Rule: a request whose expected return time is on or before 5:30 PM is
// low-risk enough to skip warden review and be approved automatically.

const AUTO_APPROVE_CUTOFF_MINUTES = 17 * 60 + 30; // 5:30 PM

const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes();

// `inTime` is the student's expected return Date (as sent from the client / stored on the request).
const qualifiesForAutoApproval = (inTime) => {
  const returnDate = new Date(inTime);
  if (Number.isNaN(returnDate.getTime())) return false;
  return minutesOfDay(returnDate) <= AUTO_APPROVE_CUTOFF_MINUTES;
};

module.exports = { qualifiesForAutoApproval, AUTO_APPROVE_CUTOFF_MINUTES };
