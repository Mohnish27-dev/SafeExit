// In-memory pub/sub for Server-Sent Events. Lets warden/guard dashboards react
// to outing-request changes the instant they happen instead of only on their
// next manual refresh or page load.
const clients = new Set();

const addClient = (res) => {
  clients.add(res);
};

const removeClient = (res) => {
  clients.delete(res);
};

const broadcast = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
};

module.exports = { addClient, removeClient, broadcast };
